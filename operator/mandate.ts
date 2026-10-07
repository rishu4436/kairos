import type { AgentControlState } from "@/runtime/types";
import { parseDecimal, type Scaled } from "@/domain/money";
import { CONFIGURED_WATCHLIST_TICKERS } from "@/domain/watchlist";
import { isEvmAddress, PRODUCTION_CHAIN_ID } from "@/domain/network";

export type OperatorMandate = "UNCONFIGURED" | "AUTO" | "MANUAL";
export type AutoProfile = "LOW" | "MEDIUM" | "HIGH";
export type ExecutionReadiness = "PREVIEW" | "LIVE";
export type ControlFace = "STOPPED" | "RUNNING" | "CYCLE";

export interface PercentCapital {
  /** Share of eligible stablecoin capital that may be deployed. Denominator: eligible balance. */
  deployableCapitalBps: number;
  /** Share of max deployable capital for one trade. Denominator: max deployable capital. */
  perTradeBpsOfDeployable: number;
  /** Share of max deployable capital for one strategy. Denominator: max deployable capital. */
  strategyBudgetBpsOfDeployable: number;
  /** Share of max deployable capital for one position. Denominator: max deployable capital. */
  maxPositionBpsOfDeployable: number;
  /** Share of max deployable capital for one DCA order. Denominator: max deployable capital. */
  dcaOrderBpsOfDeployable: number;
  /** Share of max deployable capital for the whole DCA book. Denominator: max deployable capital. */
  dcaMaxBudgetBpsOfDeployable: number;
  /** Share of max deployable capital allowed as daily loss. Denominator: max deployable capital. */
  dailyLossBpsOfDeployable: number;
}

export interface ButtonAvailability {
  run: boolean;
  stop: boolean;
  oneCycle: boolean;
}

export const AUTO_PROFILES: Record<AutoProfile, PercentCapital & { momentumMinReturnBps: number; meanEntryBps: number; dcaEnabled: boolean; dcaDipBps: number }> = {
  LOW: { deployableCapitalBps: 3000, perTradeBpsOfDeployable: 800, strategyBudgetBpsOfDeployable: 2000, maxPositionBpsOfDeployable: 2000, dcaOrderBpsOfDeployable: 500, dcaMaxBudgetBpsOfDeployable: 1500, dailyLossBpsOfDeployable: 500, momentumMinReturnBps: 80, meanEntryBps: 180, dcaEnabled: false, dcaDipBps: 1000 },
  MEDIUM: { deployableCapitalBps: 5000, perTradeBpsOfDeployable: 1000, strategyBudgetBpsOfDeployable: 3000, maxPositionBpsOfDeployable: 3000, dcaOrderBpsOfDeployable: 500, dcaMaxBudgetBpsOfDeployable: 2500, dailyLossBpsOfDeployable: 800, momentumMinReturnBps: 50, meanEntryBps: 120, dcaEnabled: false, dcaDipBps: 500 },
  HIGH: { deployableCapitalBps: 7000, perTradeBpsOfDeployable: 1500, strategyBudgetBpsOfDeployable: 4000, maxPositionBpsOfDeployable: 4000, dcaOrderBpsOfDeployable: 800, dcaMaxBudgetBpsOfDeployable: 3500, dailyLossBpsOfDeployable: 1200, momentumMinReturnBps: 30, meanEntryBps: 80, dcaEnabled: true, dcaDipBps: 300 },
};

export const PROFILE_VERSION = "2026-10-07";

export function controlFace(control: AgentControlState, inFlight: boolean): ControlFace {
  if (inFlight) {
    return "CYCLE";
  }
  return control === "RUNNING" ? "RUNNING" : "STOPPED";
}

export function buttonAvailability(face: ControlFace, mandateReady: boolean): ButtonAvailability {
  if (face === "RUNNING" || face === "CYCLE") {
    return { run: false, stop: face === "RUNNING", oneCycle: false };
  }
  return { run: true, stop: false, oneCycle: mandateReady };
}

export function admitOperatorAction(
  action: "RUN" | "STOP" | "ONE_CYCLE",
  face: ControlFace,
  mandateReady: boolean,
): { ok: true } | { ok: false; reason: string } {
  const buttons = buttonAvailability(face, mandateReady);
  if (action === "RUN" && !buttons.run) {
    return { ok: false, reason: "RUN_WHILE_ACTIVE" };
  }
  if (action === "STOP" && !buttons.stop) {
    return { ok: false, reason: "ALREADY_STOPPED" };
  }
  if (action === "ONE_CYCLE" && !buttons.oneCycle) {
    return { ok: false, reason: face === "STOPPED" ? "MANDATE_REQUIRED" : "ONE_CYCLE_WHILE_ACTIVE" };
  }
  return { ok: true };
}

/** eligible = stablecoin balance minus reserve. All later percents use basis points. */
export function sizeByPercentage(input: {
  stablecoinBalance: Scaled;
  reserve: Scaled;
  capital: PercentCapital;
  absoluteCap?: Scaled | null;
}): { ok: true; eligible: Scaled; deployable: Scaled; raw: Scaled; notional: Scaled; binding: string } | { ok: false; reason: string } {
  const eligible = input.stablecoinBalance - input.reserve;
  if (eligible <= 0n) {
    return { ok: false, reason: "INSUFFICIENT_BALANCE" };
  }
  const deployable = bpsOf(eligible, input.capital.deployableCapitalBps);
  const raw = bpsOf(deployable, input.capital.perTradeBpsOfDeployable);
  const position = bpsOf(deployable, input.capital.maxPositionBpsOfDeployable);
  const strategy = bpsOf(deployable, input.capital.strategyBudgetBpsOfDeployable);
  const parts: { name: string; value: Scaled }[] = [
    { name: "PER_TRADE_PCT", value: raw },
    { name: "MAX_POSITION", value: position },
    { name: "STRATEGY_BUDGET", value: strategy },
    { name: "AVAILABLE_BALANCE", value: eligible },
  ];
  if (input.absoluteCap != null && input.absoluteCap > 0n) {
    parts.push({ name: "ABSOLUTE_CAP", value: input.absoluteCap });
  }
  let winner = parts[0]!;
  for (const part of parts) {
    if (part.value < winner.value) {
      winner = part;
    }
  }
  if (winner.value <= 0n) {
    return { ok: false, reason: "BELOW_MINIMUM" };
  }
  return { ok: true, eligible, deployable, raw, notional: winner.value, binding: winner.name };
}

export function bpsOf(amount: Scaled, bps: number): Scaled {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error("bps out of range");
  }
  return (amount * BigInt(bps)) / 10_000n;
}

export function percentLabel(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export interface UniverseAsset {
  ticker: string;
  tokenSymbol: string;
  chainId: string;
  contractAddress: string | null;
  platform: string;
}

export interface WatchEntry {
  ticker: string;
  representationId: string;
  source: "USER" | "AUTO";
  pinned: boolean;
  chainId: string;
  contractAddress: string | null;
}

const SUPPORTED: readonly UniverseAsset[] = [
  { ticker: "NVDA", tokenSymbol: "NVDAB", chainId: "56", contractAddress: null, platform: "bStock" },
  { ticker: "TSLA", tokenSymbol: "TSLAB", chainId: "56", contractAddress: "0x5b1910eaad6450e50f816082aa078c41f10c292f", platform: "bStock" },
  { ticker: "AAPL", tokenSymbol: "AAPLB", chainId: "56", contractAddress: null, platform: "bStock" },
  { ticker: "MSFT", tokenSymbol: "MSFTB", chainId: "56", contractAddress: null, platform: "bStock" },
  { ticker: "AMD", tokenSymbol: "AMDB", chainId: "56", contractAddress: null, platform: "bStock" },
  { ticker: "SPY", tokenSymbol: "SPYB", chainId: "56", contractAddress: null, platform: "bStock" },
];

export function supportedUniverse(): readonly UniverseAsset[] {
  return SUPPORTED.filter((item) => (CONFIGURED_WATCHLIST_TICKERS as readonly string[]).includes(item.ticker));
}

export function searchUniverse(query: string): readonly UniverseAsset[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return supportedUniverse();
  }
  return supportedUniverse().filter((item) =>
    [item.ticker, item.tokenSymbol, item.platform, item.contractAddress ?? ""].some((field) => field.toLowerCase().includes(needle)),
  );
}

export function admitWatchEntry(entry: WatchEntry): { ok: true; entry: WatchEntry } | { ok: false; reason: string } {
  const known = supportedUniverse().find((item) => item.ticker === entry.ticker);
  if (!known) {
    return { ok: false, reason: "UNLISTED" };
  }
  if (entry.chainId !== PRODUCTION_CHAIN_ID) {
    return { ok: false, reason: "WRONG_CHAIN" };
  }
  if (entry.contractAddress && !isEvmAddress(entry.contractAddress)) {
    return { ok: false, reason: "INVALID_CONTRACT" };
  }
  return { ok: true, entry: { ...entry, representationId: `${entry.chainId}:${entry.ticker}` } };
}

export function addWatch(book: readonly WatchEntry[], entry: WatchEntry): { ok: true; book: WatchEntry[] } | { ok: false; reason: string } {
  const admitted = admitWatchEntry(entry);
  if (!admitted.ok) {
    return admitted;
  }
  if (book.some((item) => item.ticker === admitted.entry.ticker)) {
    return { ok: false, reason: "DUPLICATE" };
  }
  return { ok: true, book: [...book, admitted.entry] };
}

export function removeWatch(book: readonly WatchEntry[], ticker: string): WatchEntry[] {
  return book.filter((item) => item.ticker !== ticker || item.pinned);
}

export function pinWatch(book: readonly WatchEntry[], ticker: string, pinned: boolean): WatchEntry[] {
  return book.map((item) => (item.ticker === ticker ? { ...item, pinned, source: pinned ? "USER" : item.source } : item));
}

export function refreshAutoWatch(input: {
  current: readonly WatchEntry[];
  ranked: readonly string[];
  maxAssets: number;
}): WatchEntry[] {
  const pins = input.current.filter((item) => item.pinned);
  const chosen = input.ranked.filter((ticker) => supportedUniverse().some((item) => item.ticker === ticker) && !pins.some((item) => item.ticker === ticker));
  const room = Math.max(0, input.maxAssets - pins.length);
  const auto = chosen.slice(0, room).map((ticker) => ({
    ticker,
    representationId: `56:${ticker}`,
    source: "AUTO" as const,
    pinned: false,
    chainId: "56",
    contractAddress: supportedUniverse().find((item) => item.ticker === ticker)?.contractAddress ?? null,
  }));
  return [...pins, ...auto];
}

export function assetsForMandate(mode: OperatorMandate, manual: readonly string[], auto: readonly string[]): readonly string[] {
  if (mode === "MANUAL") {
    return manual;
  }
  if (mode === "AUTO") {
    return auto;
  }
  return [];
}

export function parseUsdt(raw: string): Scaled {
  return parseDecimal(raw);
}
