import { asAgentId, asPolicyId, asUserId } from "@/domain/ids";
import type { RiskPolicy } from "@/domain/models";
import { parseDecimal, type Scaled } from "@/domain/money";
import { PRODUCTION_CHAIN_ID } from "@/domain/network";
import {
  CONFIGURED_WATCHLIST_TICKERS,
  DEFAULT_AGENT_ID,
  DEFAULT_POLICY_ID,
  LOCAL_RUNTIME_USER_ID,
} from "@/domain/watchlist";
import { MEAN_REVERSION_PARAMS, MOMENTUM_PARAMS, WEEKEND_PARAMS } from "@/strategies/parameters";
type AutonomousExecutionMode = "PAPER" | "LIVE_PREVIEW" | "LIVE";

export const OPERATOR_SCHEMA_VERSION = 2 as const;
export const MIN_CYCLE_INTERVAL_MS = 5_000;
export const MAX_CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const IMPLEMENTED_STRATEGY_IDS = ["momentum", "mean-reversion", "weekend", "dca"] as const;
export type ImplementedStrategyId = (typeof IMPLEMENTED_STRATEGY_IDS)[number];

export interface MomentumOperatorParams {
  enabled: boolean;
  interval: "15m";
  momentumBars: number;
  trendPeriod: number;
  minReturnBps: number;
  maxVolatilityBps: number;
  minCandles: number;
  maxTradeNotional: string;
}

export interface MeanReversionOperatorParams {
  enabled: boolean;
  period: number;
  entryBps: number;
  minCandles: number;
  maxTradeNotional: string;
}

export interface WeekendOperatorParams {
  enabled: boolean;
  minDeviationBps: number;
  allowedSessions: readonly ("CLOSED" | "PRE_OPEN" | "POST_CLOSE")[];
  maxTradeNotional: string;
}

export type DcaMode = "TIME_BASED" | "DIP_BASED";
export type DcaReference = "LAST_DCA_FILL" | "INITIAL_REFERENCE";

export interface DcaOperatorParams {
  enabled: boolean;
  mode: DcaMode;
  baseOrderNotional: string;
  maxBudgetNotional: string;
  maxTranches: number;
  intervalMs: number;
  dipThresholdBps: number;
  reference: DcaReference;
  maxTradeNotional: string;
}

export interface OperatorConfig {
  schemaVersion: typeof OPERATOR_SCHEMA_VERSION;
  version: number;
  createdAt: string;
  updatedAt: string;
  source: "OPERATOR";
  previousVersion: number | null;
  identity: { userId: string; agentId: string };
  runtime: {
    enabled: boolean;
    cycleIntervalMs: number;
    executionMode: AutonomousExecutionMode;
  };
  capital: {
    maxCapitalNotional: string;
    maxPerTradeNotional: string;
    reserveCapitalNotional: string;
    strategyMaxTradeNotional: Partial<Record<ImplementedStrategyId, string>>;
  };
  risk: {
    maxPositionNotional: string;
    maxAllocationBps: number;
    maxDailyLoss: string;
    maxSlippageBps: number;
    allowedAssets: readonly string[];
    allowedChainIds: readonly string[];
    liveTradingEnabled: boolean;
    paperTradingEnabled: boolean;
  };
  strategies: {
    momentum: MomentumOperatorParams;
    "mean-reversion": MeanReversionOperatorParams;
    weekend: WeekendOperatorParams;
    dca: DcaOperatorParams;
  };
  research: {
    llmResearchEnabled: boolean;
    paperThesisGenerationEnabled: boolean;
  };
  executionAdmissionDisabled: boolean;
}

export type ConfigUpdateError = { ok: false; reason: string };
export type ConfigUpdateOk = { ok: true; config: OperatorConfig };

export function defaultOperatorConfig(nowIso = new Date().toISOString()): OperatorConfig {
  return {
    schemaVersion: OPERATOR_SCHEMA_VERSION,
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    source: "OPERATOR",
    previousVersion: null,
    identity: { userId: LOCAL_RUNTIME_USER_ID, agentId: DEFAULT_AGENT_ID },
    runtime: {
      enabled: true,
      cycleIntervalMs: 60_000,
      executionMode: "PAPER",
    },
    capital: {
      maxCapitalNotional: "10000",
      maxPerTradeNotional: "500",
      reserveCapitalNotional: "0",
      strategyMaxTradeNotional: {},
    },
    risk: {
      maxPositionNotional: "5000",
      maxAllocationBps: 2500,
      maxDailyLoss: "500",
      maxSlippageBps: 50,
      allowedAssets: [...CONFIGURED_WATCHLIST_TICKERS],
      allowedChainIds: [PRODUCTION_CHAIN_ID],
      liveTradingEnabled: false,
      paperTradingEnabled: true,
    },
    strategies: {
      momentum: {
        enabled: true,
        interval: MOMENTUM_PARAMS.interval,
        momentumBars: MOMENTUM_PARAMS.momentumBars,
        trendPeriod: MOMENTUM_PARAMS.trendPeriod,
        minReturnBps: MOMENTUM_PARAMS.minReturnBps,
        maxVolatilityBps: MOMENTUM_PARAMS.maxVolatilityBps,
        minCandles: MOMENTUM_PARAMS.minCandles,
        maxTradeNotional: "",
      },
      "mean-reversion": {
        enabled: true,
        period: MEAN_REVERSION_PARAMS.period,
        entryBps: MEAN_REVERSION_PARAMS.entryBps,
        minCandles: MEAN_REVERSION_PARAMS.minCandles,
        maxTradeNotional: "",
      },
      weekend: {
        enabled: true,
        minDeviationBps: WEEKEND_PARAMS.minDeviationBps,
        allowedSessions: [...WEEKEND_PARAMS.offHours] as WeekendOperatorParams["allowedSessions"],
        maxTradeNotional: "",
      },
      dca: {
        enabled: false,
        mode: "DIP_BASED",
        baseOrderNotional: "5",
        maxBudgetNotional: "50",
        maxTranches: 10,
        intervalMs: 24 * 60 * 60 * 1000,
        dipThresholdBps: 500,
        reference: "LAST_DCA_FILL",
        maxTradeNotional: "",
      },
    },
    research: {
      llmResearchEnabled: true,
      paperThesisGenerationEnabled: true,
    },
    executionAdmissionDisabled: false,
  };
}

export function validateOperatorConfig(input: unknown): ConfigUpdateOk | ConfigUpdateError {
  if (input == null || typeof input !== "object") {
    return { ok: false, reason: "CONFIG_INVALID" };
  }
  const value = input as OperatorConfig;
  try {
    assertInt(Number(value.schemaVersion) === 1 || Number(value.schemaVersion) === 2, "unsupported schema");
    assertInt(Number.isInteger(value.version) && value.version >= 1, "version");
    assertInt(value.source === "OPERATOR", "source");
    assertInt(value.identity?.userId === LOCAL_RUNTIME_USER_ID, "identity");
    assertInt(value.identity?.agentId === DEFAULT_AGENT_ID, "identity");
    const interval = value.runtime?.cycleIntervalMs;
    assertInt(Number.isInteger(interval) && interval >= MIN_CYCLE_INTERVAL_MS && interval <= MAX_CYCLE_INTERVAL_MS, "cycle interval");
    assertInt(value.runtime.executionMode === "PAPER" || value.runtime.executionMode === "LIVE_PREVIEW" || value.runtime.executionMode === "LIVE", "execution mode");
    money(value.capital.maxCapitalNotional, true);
    money(value.capital.maxPerTradeNotional, true);
    money(value.capital.reserveCapitalNotional, false);
    money(value.risk.maxPositionNotional, true);
    money(value.risk.maxDailyLoss, true);
    bps(value.risk.maxAllocationBps, 1, 10_000);
    bps(value.risk.maxSlippageBps, 0, 1_000);
    assertInt(Array.isArray(value.risk.allowedAssets) && value.risk.allowedAssets.length > 0, "allowed assets");
    assertInt(value.risk.allowedChainIds?.includes(PRODUCTION_CHAIN_ID), "chain");
    const m = value.strategies.momentum;
    assertInt(m.interval === "15m", "momentum interval");
    assertInt(m.momentumBars >= 1 && m.momentumBars <= 20, "momentum bars");
    assertInt(m.trendPeriod >= 5 && m.trendPeriod <= 50, "trend period");
    bps(m.minReturnBps, 10, 2_000);
    bps(m.maxVolatilityBps, 10, 5_000);
    assertInt(m.minCandles >= 5 && m.minCandles <= 100, "momentum candles");
    optionalMoney(m.maxTradeNotional);
    const r = value.strategies["mean-reversion"];
    assertInt(r.period >= 5 && r.period <= 50, "mean period");
    bps(r.entryBps, 20, 1_000);
    assertInt(r.minCandles >= 5 && r.minCandles <= 100, "mean candles");
    optionalMoney(r.maxTradeNotional);
    const w = value.strategies.weekend;
    bps(w.minDeviationBps, 10, 2_000);
    assertInt(w.allowedSessions.length > 0, "weekend sessions");
    const d = value.strategies.dca;
    assertInt(d.mode === "TIME_BASED" || d.mode === "DIP_BASED", "dca mode");
    money(d.baseOrderNotional, true);
    money(d.maxBudgetNotional, true);
    assertInt(Number.isInteger(d.maxTranches) && d.maxTranches >= 1 && d.maxTranches <= 50, "dca tranches");
    assertInt(Number.isInteger(d.intervalMs) && d.intervalMs >= 60_000, "dca interval");
    bps(d.dipThresholdBps, 50, 5_000);
    assertInt(d.reference === "LAST_DCA_FILL" || d.reference === "INITIAL_REFERENCE", "dca reference");
    optionalMoney(d.maxTradeNotional);
    assertNoSecrets(value);
    return { ok: true, config: value };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "CONFIG_INVALID" };
  }
}

export function applyOperatorPatch(
  current: OperatorConfig,
  patch: Partial<OperatorConfig> & Record<string, unknown>,
  nowIso: string,
): ConfigUpdateOk | ConfigUpdateError {
  const next: OperatorConfig = {
    ...current,
    ...("runtime" in patch && patch.runtime ? { runtime: { ...current.runtime, ...patch.runtime } } : {}),
    ...("capital" in patch && patch.capital ? { capital: { ...current.capital, ...patch.capital } } : {}),
    ...("risk" in patch && patch.risk ? { risk: { ...current.risk, ...patch.risk } } : {}),
    ...("research" in patch && patch.research ? { research: { ...current.research, ...patch.research } } : {}),
    strategies: {
      momentum: { ...current.strategies.momentum, ...(patch.strategies?.momentum ?? {}) },
      "mean-reversion": { ...current.strategies["mean-reversion"], ...(patch.strategies?.["mean-reversion"] ?? {}) },
      weekend: { ...current.strategies.weekend, ...(patch.strategies?.weekend ?? {}) },
      dca: { ...current.strategies.dca, ...(patch.strategies?.dca ?? {}) },
    },
    executionAdmissionDisabled:
      typeof patch.executionAdmissionDisabled === "boolean" ? patch.executionAdmissionDisabled : current.executionAdmissionDisabled,
    version: current.version + 1,
    previousVersion: current.version,
    updatedAt: nowIso,
    source: "OPERATOR",
    schemaVersion: OPERATOR_SCHEMA_VERSION,
    identity: current.identity,
    createdAt: current.createdAt,
  };
  return validateOperatorConfig(next);
}

export function riskPolicyFromOperator(config: OperatorConfig): RiskPolicy {
  return {
    id: asPolicyId(DEFAULT_POLICY_ID),
    userId: asUserId(config.identity.userId),
    agentId: asAgentId(config.identity.agentId),
    liveTradingEnabled: config.risk.liveTradingEnabled,
    paperTradingEnabled: config.risk.paperTradingEnabled,
    maxPositionNotional: parseDecimal(config.risk.maxPositionNotional),
    maxAllocationBps: config.risk.maxAllocationBps,
    maxDailyLoss: parseDecimal(config.risk.maxDailyLoss),
    maxSlippageBps: config.risk.maxSlippageBps,
    allowedAssets: [...config.risk.allowedAssets],
  };
}

export function strategyEnabled(config: OperatorConfig, id: ImplementedStrategyId): boolean {
  return config.strategies[id].enabled;
}

function money(raw: string, positive: boolean): Scaled {
  const value = parseDecimal(raw);
  if (positive && value <= 0n) {
    throw new Error("amount must be positive");
  }
  if (value < 0n) {
    throw new Error("amount cannot be negative");
  }
  return value;
}

function optionalMoney(raw: string): void {
  if (raw.trim() === "") {
    return;
  }
  money(raw, true);
}

function bps(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error("bps out of range");
  }
}

function assertInt(ok: boolean, reason: string): void {
  if (!ok) {
    throw new Error(reason);
  }
}

function assertNoSecrets(value: unknown): void {
  const text = JSON.stringify(value);
  if (/api[_-]?key|private[_-]?key|password|seed phrase|authorization|secret/i.test(text)) {
    throw new Error("secrets cannot be stored in operator config");
  }
}
