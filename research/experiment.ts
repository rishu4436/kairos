import { CANDLE_INTERVAL_MS } from "@/domain/candle";
import { formatDecimal, divRound, type Scaled } from "@/domain/money";
import { DEFAULT_PAPER_POLICY } from "@/paper/policy";
import { conditionsPass, snapshotAt, type ResearchBar } from "@/research/snapshot";
import type { ExperimentMetrics, ExperimentTradeRecord, ExperimentWindow, StrategyProposal } from "@/research/types";

export const MIN_EXPERIMENT_BARS = 30;
export const MIN_OUT_OF_SAMPLE_BARS = 8;
export const EXPERIMENT_FEE_BPS = DEFAULT_PAPER_POLICY.baseFeeBps;

export interface ExperimentRun {
  status: "COMPLETED" | "INVALID";
  reason: string | null;
  metrics: ExperimentMetrics | null;
  startTime: string | null;
  endTime: string | null;
}

interface OpenPosition {
  asset: string;
  side: "BUY" | "SELL";
  entryIndex: number;
  entryPrice: Scaled;
  entryFee: Scaled;
}

export function runExperiment(proposal: StrategyProposal, bars: readonly ResearchBar[], initialCapital: Scaled): ExperimentRun {
  if (bars.length < MIN_EXPERIMENT_BARS) {
    return { status: "INVALID", reason: "INSUFFICIENT_HISTORY", metrics: null, startTime: null, endTime: null };
  }
  const windows = splitWindows(bars.length);
  const trades: InternalTrade[] = [];
  let cash = initialCapital;
  let open: OpenPosition | null = null;
  let peak = initialCapital;
  let maxDrawdown = 0n;
  const equityAt: Scaled[] = [];

  for (let index = 0; index < bars.length; index += 1) {
    const current = snapshotAt(bars, index);
    const previous = index === 0 ? null : snapshotAt(bars, index - 1);
    const price = bars[index].candle.close;
    if (open && (index >= open.entryIndex + proposal.holdingPeriod || conditionsPass(proposal.exitConditions, current, previous))) {
      const exitFee = feeOn(price);
      cash += open.side === "BUY" ? price - exitFee : -(price + exitFee);
      trades.push(closeTrade(open, index, price, exitFee));
      open = null;
    }
    if (!open && proposal.action !== "OBSERVE" && conditionsPass(proposal.entryConditions, current, previous)) {
      const entryFee = feeOn(price);
      const debit = proposal.action === "BUY" ? price + entryFee : entryFee;
      if (cash >= debit) {
        cash += proposal.action === "BUY" ? -(price + entryFee) : price - entryFee;
        open = {
          asset: proposal.assetScope[0] ?? "UNKNOWN",
          side: proposal.action,
          entryIndex: index,
          entryPrice: price,
          entryFee,
        };
      }
    }
    const equity = cash + (open === null ? 0n : open.side === "BUY" ? price : -price);
    equityAt.push(equity);
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  if (open) {
    const last = bars.length - 1;
    const price = bars[last].candle.close;
    const exitFee = feeOn(price);
    cash += open.side === "BUY" ? price - exitFee : -(price + exitFee);
    trades.push(closeTrade(open, last, price, exitFee));
    open = null;
  }

  const mapped = trades.map(toRecord);
  const gross = trades.reduce((sum, trade) => sum + trade.gross, 0n);
  const net = trades.reduce((sum, trade) => sum + trade.net, 0n);
  const baseline = buyAndHold(bars, initialCapital);
  const metrics: ExperimentMetrics = {
    numberOfTrades: trades.length,
    winRate: trades.length === 0 ? null : ratio(trades.filter((trade) => trade.net > 0n).length, trades.length),
    grossPnl: formatDecimal(gross),
    netPnl: formatDecimal(net),
    averageTradeReturnBps: averageReturn(trades),
    maxDrawdownBps: peak === 0n ? null : bps(maxDrawdown, peak),
    profitFactor: profitFactor(trades),
    averageHoldingPeriodBars: trades.length === 0 ? null : (trades.reduce((sum, trade) => sum + (trade.exitIndex - trade.entryIndex), 0) / trades.length).toFixed(2),
    largestWin: extreme(trades, true),
    largestLoss: extreme(trades, false),
    dataPoints: bars.length,
    researchWindow: windowReport("RESEARCH", windows.research, trades),
    validationWindow: windowReport("VALIDATION", windows.validation, trades),
    outOfSampleWindow: windowReport("OUT_OF_SAMPLE", windows.oos, trades),
    outOfSampleClaim: windows.oos[1] - windows.oos[0] >= MIN_OUT_OF_SAMPLE_BARS,
    baselineName: "BUY_AND_HOLD",
    baselineNetPnl: formatDecimal(baseline),
    strategyNetPnl: formatDecimal(net),
    differenceNetPnl: formatDecimal(net - baseline),
    warnings: warningsFor(proposal, trades, windows, initialCapital),
    trades: mapped,
  };
  return {
    status: "COMPLETED",
    reason: null,
    metrics,
    startTime: new Date(bars[0].candle.timestampMs).toISOString(),
    endTime: new Date(bars[bars.length - 1].candle.timestampMs + CANDLE_INTERVAL_MS).toISOString(),
  };
}

interface InternalTrade {
  asset: string;
  entryIndex: number;
  exitIndex: number;
  entryPrice: Scaled;
  exitPrice: Scaled;
  gross: Scaled;
  fees: Scaled;
  net: Scaled;
}

function closeTrade(open: OpenPosition, exitIndex: number, exitPrice: Scaled, exitFee: Scaled): InternalTrade {
  const gross = open.side === "BUY" ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
  const fees = open.entryFee + exitFee;
  return {
    asset: open.asset,
    entryIndex: open.entryIndex,
    exitIndex,
    entryPrice: open.entryPrice,
    exitPrice,
    gross,
    fees,
    net: gross - fees,
  };
}

function feeOn(notional: Scaled): Scaled {
  return divRound(notional * BigInt(EXPERIMENT_FEE_BPS), 10_000n);
}

function buyAndHold(bars: readonly ResearchBar[], capital: Scaled): Scaled {
  const entry = bars[0].candle.close;
  const exit = bars[bars.length - 1].candle.close;
  const entryFee = feeOn(entry);
  const exitFee = feeOn(exit);
  if (capital < entry + entryFee) {
    return 0n;
  }
  return exit - entry - entryFee - exitFee;
}

function splitWindows(length: number): { research: [number, number]; validation: [number, number]; oos: [number, number] } {
  const researchEnd = Math.floor(length * 0.5);
  const validationEnd = Math.floor(length * 0.75);
  return {
    research: [0, researchEnd],
    validation: [researchEnd, validationEnd],
    oos: [validationEnd, length],
  };
}

function windowReport(name: ExperimentWindow["name"], range: [number, number], trades: readonly InternalTrade[]): ExperimentWindow {
  const inside = trades.filter((trade) => trade.entryIndex >= range[0] && trade.entryIndex < range[1]);
  const net = inside.reduce((sum, trade) => sum + trade.net, 0n);
  return {
    name,
    fromIndex: range[0],
    toIndex: range[1],
    bars: range[1] - range[0],
    trades: inside.length,
    netPnl: formatDecimal(net),
    used: range[1] > range[0],
  };
}

function warningsFor(
  proposal: StrategyProposal,
  trades: readonly InternalTrade[],
  windows: { research: [number, number]; validation: [number, number] },
  capital: Scaled,
): string[] {
  const warnings: string[] = [];
  const conditions = proposal.entryConditions.length + proposal.exitConditions.length;
  if (conditions > 6) {
    warnings.push(`Potential overfitting. ${conditions} conditions across ${trades.length} trades.`);
  }
  if (trades.length < 8) {
    warnings.push(`Tiny sample. ${trades.length} trades.`);
  }
  if (proposal.holdingPeriod <= 1) {
    warnings.push("Very short holding period.");
  }
  if (proposal.assetScope.length === 1) {
    warnings.push("Single-asset-only experiment.");
  }
  for (const condition of [...proposal.entryConditions, ...proposal.exitConditions]) {
    if (typeof condition.threshold === "number" && Math.abs(condition.threshold) >= 500) {
      warnings.push(`Extreme threshold ${condition.threshold} on ${condition.feature}.`);
    }
  }
  const researchNet = trades
    .filter((trade) => trade.entryIndex >= windows.research[0] && trade.entryIndex < windows.research[1])
    .reduce((sum, trade) => sum + trade.net, 0n);
  const validationNet = trades
    .filter((trade) => trade.entryIndex >= windows.validation[0] && trade.entryIndex < windows.validation[1])
    .reduce((sum, trade) => sum + trade.net, 0n);
  const gap = researchNet > validationNet ? researchNet - validationNet : validationNet - researchNet;
  if (trades.length > 0 && capital > 0n && gap * 10_000n / capital >= 100n) {
    warnings.push("Large performance difference between the research and validation windows.");
  }
  return warnings;
}

function toRecord(trade: InternalTrade): ExperimentTradeRecord {
  return {
    asset: trade.asset,
    entryIndex: trade.entryIndex,
    exitIndex: trade.exitIndex,
    entryPrice: formatDecimal(trade.entryPrice),
    exitPrice: formatDecimal(trade.exitPrice),
    grossPnl: formatDecimal(trade.gross),
    fees: formatDecimal(trade.fees),
    netPnl: formatDecimal(trade.net),
    holdingBars: trade.exitIndex - trade.entryIndex,
  };
}

function ratio(part: number, whole: number): string {
  return (part / whole).toFixed(4);
}

function averageReturn(trades: readonly InternalTrade[]): string | null {
  if (trades.length === 0) {
    return null;
  }
  const total = trades.reduce((sum, trade) => {
    if (trade.entryPrice === 0n) {
      return sum;
    }
    return sum + Number((trade.net * 10_000n) / trade.entryPrice);
  }, 0);
  return (total / trades.length).toFixed(2);
}

function profitFactor(trades: readonly InternalTrade[]): string | null {
  const wins = trades.filter((trade) => trade.net > 0n).reduce((sum, trade) => sum + trade.net, 0n);
  const losses = trades.filter((trade) => trade.net < 0n).reduce((sum, trade) => sum + -trade.net, 0n);
  if (losses === 0n) {
    return wins === 0n ? null : "unbounded";
  }
  return (Number(wins) / Number(losses)).toFixed(4);
}

function extreme(trades: readonly InternalTrade[], win: boolean): string | null {
  const pool = trades.filter((trade) => (win ? trade.net > 0n : trade.net < 0n));
  if (pool.length === 0) {
    return null;
  }
  const value = pool.reduce((best, trade) => (win ? (trade.net > best ? trade.net : best) : trade.net < best ? trade.net : best), pool[0].net);
  return formatDecimal(value);
}

function bps(part: Scaled, whole: Scaled): string {
  return (Number((part * 10_000n) / whole)).toFixed(2);
}
