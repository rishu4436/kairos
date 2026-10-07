import { listStrategyCandidates } from "@/lifecycle/candidates";
import { evaluateShadow } from "@/lifecycle/shadow";
import type { AgentCycleResult } from "@/paper/cycle";
import { runPreparedAgentCycle } from "@/paper/cycle";
import { asAgentId, asUserId } from "@/domain/ids";
import type { PaperAccountState, RiskPolicy } from "@/domain/models";
import { parseDecimal } from "@/domain/money";
import { PRODUCTION_CHAIN_ID } from "@/domain/network";
import type { PreparationRecord } from "@/domain/execution-prep";
import { issuePaperExecutionContext, type LiveExecutionCapability } from "@/domain/execution-authority";
import { planAssetIntent } from "@/execution/plan";
import { prepareLiveExecution } from "@/execution/live-preparation";
import { exportPaperBook, importPaperBook, type PaperBookSnapshot } from "@/paper/snapshot";
import { DEFAULT_PAPER_POLICY } from "@/paper/policy";
import { paperAccountId, readPaperBook } from "@/paper/store";
import { runAgentCycle } from "@/paper/run-cycle";
import type { ObserveMarket } from "@/runtime/observe";
import { hydrateDomain, lastResearchAt, persistDomain, rememberResearchAt } from "@/runtime/domain-state";
import { autonomousStore, commitRecord, stateKey, terminalCycle, type KairosStateStore } from "@/runtime/store";
import { researchDue } from "@/runtime/research-schedule";
import { FAILURE_POLICY, type AgentControlState, type AssetCycleResult, type AutonomousExecutionMode, type CycleTrigger, type KairosCycleResult, type KairosCycleState, type RuntimeFailure, type RuntimeMode } from "@/runtime/types";
import type { StrategyContext } from "@/strategies/context";
import type { QuoteGateway } from "@/services/binance/trading/gateway";
import type { TransactionSimulationGateway } from "@/services/binance/transaction/gateway";
import { readOperatorConfig } from "@/operator/store";
import { persistObservationSnapshot, persistRuntimeSnapshot } from "@/operator/snapshots";
import type { OperatorConfig } from "@/operator/config";
import { riskPolicyFromOperator } from "@/operator/config";

const LEASE_TTL_MS = 60_000;
const assetLocks = new Set<string>();

export interface LivePreparationAdapters {
  capability: LiveExecutionCapability;
  quote: QuoteGateway;
  simulation: TransactionSimulationGateway;
  walletAddress: string | null;
  chainId?: string;
  stockDecimals?: number | null;
  usdtDecimals?: number | null;
}

export interface AutonomousCycleInput {
  userId: string;
  agentId: string;
  runtimeMode: RuntimeMode;
  executionMode: AutonomousExecutionMode;
  cycleTrigger: CycleTrigger;
  startedAtMs: number;
  ownerId: string;
  marketAvailable?: boolean;
  researchAvailable?: boolean;
  /** Injected paper cycle used when observeMarket is omitted in PAPER mode. */
  runPaper?: (userId: string, now: Date) => AgentCycleResult | Promise<AgentCycleResult>;
  observeMarket?: ObserveMarket;
  riskPolicy?: RiskPolicy;
  account?: PaperAccountState;
  livePreparation?: LivePreparationAdapters;
  operatorConfig?: OperatorConfig;
  /** Optional research work. A throw is non-blocking. */
  researchStep?: () => void;
  shadowContext?: StrategyContext | null;
  store?: KairosStateStore;
  control?: AgentControlState;
}

export interface AutonomousCycleOutcome extends KairosCycleResult {
  marketBlocked: boolean;
  liveBlocked: boolean;
  paper: AgentCycleResult | null;
  signed: false;
  broadcast: false;
  walletOrderId: null;
  walletSubmitted: false;
  preparations: readonly PreparationRecord[];
  liveGate: "TRANSACTION_SIMULATED" | "READY_FOR_WALLET" | "WALLET_DISABLED" | null;
}

export async function runKairosAutonomousCycle(raw: AutonomousCycleInput): Promise<AutonomousCycleOutcome> {
  const store = raw.store ?? autonomousStore();
  const frozenConfig = raw.operatorConfig ?? readOperatorConfig(store);
  const input: AutonomousCycleInput = {
    ...raw,
    operatorConfig: frozenConfig,
    riskPolicy: raw.riskPolicy ?? riskPolicyFromOperator(frozenConfig, raw.account?.cash),
  };
  const startedAt = new Date(input.startedAtMs).toISOString();
  const cycleId = `cycle_${input.userId}_${input.agentId}_${input.startedAtMs}`;
  const transitions: { state: KairosCycleState; at: string }[] = [{ state: "CREATED", at: startedAt }];
  const errors: RuntimeFailure[] = [];
  const warnings: string[] = [];
  const push = (state: KairosCycleState) => transitions.push({ state, at: new Date(input.startedAtMs).toISOString() });

  recoverInterrupted(store, input.userId, input.agentId, startedAt);
  hydratePaperBook(store, input.userId, input.agentId);
  hydrateDomain(store, input.userId, input.agentId);
  const control = input.control ?? store.readControl(input.userId, input.agentId);
  if (control === "STOPPED" || control === "PAUSED") {
    const status: KairosCycleState = control === "STOPPED" ? "FAILED" : "COMPLETED";
    warnings.push(control === "STOPPED" ? "Runtime is stopped." : "Runtime is paused. No new execution intent was created.");
    return finish(input, store, cycleId, startedAt, status, [], [], errors, warnings, [], false, false, null, transitions, [], null);
  }

  push("ACQUIRING_LOCK");
  const lease = store.acquireLease({
    userId: input.userId,
    agentId: input.agentId,
    ownerId: input.ownerId,
    nowMs: input.startedAtMs,
    ttlMs: LEASE_TTL_MS,
  });
  if (!lease.ok) {
    errors.push(failure("LEASE_UNAVAILABLE", "Another runtime owns this agent."));
    return finish(input, store, cycleId, startedAt, "FAILED", [], [], errors, warnings, [], false, false, null, transitions, [], null);
  }

  const keepLease = (): boolean => {
    const renewed = store.renewLease(input.userId, input.agentId, input.ownerId, LEASE_TTL_MS, input.startedAtMs);
    if (renewed.ok) {
      return true;
    }
    errors.push(failure("LEASE_UNAVAILABLE", "Lease renewal failed. No new execution work was started."));
    return false;
  };

  try {
    if (input.marketAvailable === false) {
      errors.push(failure("MARKET_DATA_ERROR", "Market data is unavailable. Trading decisions are blocked."));
      return finish(input, store, cycleId, startedAt, "DEGRADED", [], [], errors, warnings, [], true, false, null, transitions, [], null);
    }

    if (input.executionMode === "PAPER" && !input.observeMarket) {
      push("OBSERVING");
      push("REVIEWING_POSITIONS");
      push("EXECUTING_PAPER");
      let paper: AgentCycleResult;
      try {
        paper = await (input.runPaper ?? ((userId: string, now: Date) => runAgentCycle(userId, now, { safetyMode: control === "RISK_REDUCTION_ONLY" ? "RISK_REDUCTION_ONLY" : "NORMAL" })))(input.userId, new Date(input.startedAtMs));
      } catch (error) {
        errors.push(failure("UNKNOWN_RUNTIME_ERROR", error instanceof Error ? error.message : "Cycle failed."));
        return finish(input, store, cycleId, startedAt, "FAILED", [], [], errors, warnings, [], false, false, null, transitions, [], null);
      }
      const research = reviewResearch(input, warnings, errors);
      push("RESEARCHING");
      push("RECONCILING");
      const assets = assetResultsFrom(paper);
      return conclude(input, store, cycleId, startedAt, assets, research, errors, warnings, paper.createdIntentIds, false, false, paper, transitions, [], null, paper);
    }

    if (!input.observeMarket) {
      errors.push(failure("MARKET_DATA_ERROR", "No observation adapter was provided. Live modes do not invent market data."));
      return finish(input, store, cycleId, startedAt, "DEGRADED", [], [], errors, warnings, [], true, input.executionMode !== "PAPER", null, transitions, [], "WALLET_DISABLED");
    }

    push("OBSERVING");
    let snapshot;
    try {
      snapshot = await input.observeMarket({ userId: input.userId, now: new Date(input.startedAtMs), operator: frozenConfig });
    } catch (error) {
      errors.push(failure("MARKET_DATA_ERROR", error instanceof Error ? error.message : "Observation failed."));
      return finish(input, store, cycleId, startedAt, "DEGRADED", [], [], errors, warnings, [], true, input.executionMode !== "PAPER", null, transitions, [], null);
    }
    persistObservationSnapshot(snapshot.board, store);
    if (!snapshot.board.ok) {
      errors.push(failure("MARKET_DATA_ERROR", snapshot.board.error?.message ?? "Observation board is not usable."));
      return finish(input, store, cycleId, startedAt, "DEGRADED", [], [], errors, warnings, [], true, input.executionMode !== "PAPER", null, transitions, [], null);
    }
    if (!keepLease()) {
      return finish(input, store, cycleId, startedAt, "FAILED", [], [], errors, warnings, [], false, input.executionMode !== "PAPER", null, transitions, [], "WALLET_DISABLED");
    }

    push("BUILDING_CONTEXT");
    push("EVALUATING");
    push("ARBITRATING");
    push("REVIEWING_POSITIONS");
    push("RISK_CHECKING");

    if (input.executionMode === "PAPER") {
      if (!input.riskPolicy) {
        errors.push(failure("RISK_ERROR", "A risk policy is required for the paper observation path."));
        return finish(input, store, cycleId, startedAt, "FAILED", [], [], errors, warnings, [], false, false, null, transitions, [], null);
      }
      const authority = issuePaperExecutionContext({
        userId: asUserId(input.userId),
        agentId: asAgentId(input.agentId),
        nowMs: input.startedAtMs,
      });
      push("EXECUTING_PAPER");
      const paper = runPreparedAgentCycle({
        authority,
        userId: asUserId(input.userId),
        agentId: asAgentId(input.agentId),
        board: snapshot.board,
        candles: snapshot.candles,
        riskPolicy: input.riskPolicy,
        nowMs: input.startedAtMs,
        safetyMode: control === "RISK_REDUCTION_ONLY" ? "RISK_REDUCTION_ONLY" : "NORMAL",
      });
      const research = reviewResearch(input, warnings, errors);
      push("RESEARCHING");
      push("RECONCILING");
      return conclude(input, store, cycleId, startedAt, assetResultsFrom(paper), research, errors, warnings, paper.createdIntentIds, false, false, paper, transitions, [], null, paper);
    }

    const policy = input.riskPolicy;
    if (!policy) {
      errors.push(failure("RISK_ERROR", "A risk policy is required for live planning."));
      return finish(input, store, cycleId, startedAt, "FAILED", [], [], errors, warnings, [], false, true, null, transitions, [], "WALLET_DISABLED");
    }
    const account =
      input.account ??
      readPaperBook(asUserId(input.userId), asAgentId(input.agentId))?.account ??
      emptyAccount(asUserId(input.userId), asAgentId(input.agentId));

    push("EXECUTION_PREPARATION");
    const createdIntentIds: string[] = [];
    const assets: AssetCycleResult[] = [];
    const preparations: PreparationRecord[] = [];
    let liveGate: AutonomousCycleOutcome["liveGate"] = input.executionMode === "LIVE" ? "WALLET_DISABLED" : null;

    for (const row of [...snapshot.board.rows].sort((left, right) => left.ticker.localeCompare(right.ticker))) {
      const plan = planAssetIntent({
        userId: asUserId(input.userId),
        agentId: asAgentId(input.agentId),
        row,
        account,
        riskPolicy: policy,
        paperPolicy: DEFAULT_PAPER_POLICY,
        nowMs: input.startedAtMs,
        safetyMode: control === "RISK_REDUCTION_ONLY" ? "RISK_REDUCTION_ONLY" : "NORMAL",
        venue: "live",
        candles: snapshot.candles,
        operatorConfig: frozenConfig,
      });
      if (plan.kind === "NO_TRADE") {
        assets.push({
          assetId: plan.assetId,
          ticker: plan.ticker,
          contextId: row.kairos?.contextId ?? null,
          positionState: null,
          strategyDecision: null,
          arbitrationDecision: plan.arbitration?.decision ?? null,
          positionDecision: plan.positionDecision?.action ?? null,
          riskDecision: plan.reason === "MARKET_DATA_SUSPICIOUS" ? "MARKET_DATA_SUSPICIOUS" : null,
          executionState: plan.reason === "MARKET_DATA_SUSPICIOUS" ? "MARKET_DATA_SUSPICIOUS" : "ABSTAINED",
          status: plan.reason === "MARKET_DATA_SUSPICIOUS" ? "BLOCKED" : "OK",
        });
        continue;
      }
      createdIntentIds.push(plan.intent.intentId);
      if (!plan.risk.allowed) {
        assets.push({
          assetId: plan.assetId,
          ticker: plan.ticker,
          contextId: row.kairos?.contextId ?? null,
          positionState: null,
          strategyDecision: plan.strategyId,
          arbitrationDecision: plan.arbitration.decision,
          positionDecision: plan.positionDecision?.action ?? null,
          riskDecision: plan.risk.reasonCodes.join(","),
          executionState: "RISK_REJECTED",
          status: "BLOCKED",
        });
        continue;
      }
      if (!keepLease()) {
        assets.push({
          assetId: plan.assetId,
          ticker: plan.ticker,
          contextId: row.kairos?.contextId ?? null,
          positionState: null,
          strategyDecision: plan.strategyId,
          arbitrationDecision: plan.arbitration.decision,
          positionDecision: plan.positionDecision?.action ?? null,
          riskDecision: "PASSED",
          executionState: "LEASE_UNAVAILABLE",
          status: "BLOCKED",
        });
        break;
      }
      if (!input.livePreparation) {
        assets.push({
          assetId: plan.assetId,
          ticker: plan.ticker,
          contextId: row.kairos?.contextId ?? null,
          positionState: null,
          strategyDecision: plan.strategyId,
          arbitrationDecision: plan.arbitration.decision,
          positionDecision: plan.positionDecision?.action ?? null,
          riskDecision: "PASSED",
          executionState: "PREPARATION_UNAVAILABLE",
          status: "BLOCKED",
        });
        warnings.push("Live preparation adapters were not provided. Wallet execution was not started.");
        liveGate = "WALLET_DISABLED";
        continue;
      }
      const prepared = await prepareLiveExecution({
        capability: input.livePreparation.capability,
        userId: input.userId,
        agentId: input.agentId,
        nowMs: input.startedAtMs,
        riskPassed: true,
        side: plan.action,
        amount: plan.intent.requestedNotional,
        stockContract: row.contractAddress,
        stockDecimals: input.livePreparation.stockDecimals ?? null,
        usdtDecimals: input.livePreparation.usdtDecimals ?? null,
        accountUserId: input.userId,
        chainId: input.livePreparation.chainId ?? row.chainId ?? PRODUCTION_CHAIN_ID,
        walletAddress: input.livePreparation.walletAddress,
        maxSlippageBps: policy.maxSlippageBps,
        quote: input.livePreparation.quote,
        simulation: input.livePreparation.simulation,
      });
      preparations.push(prepared);
      if (prepared.state !== "TRANSACTION_SIMULATED") {
        assets.push({
          assetId: plan.assetId,
          ticker: plan.ticker,
          contextId: row.kairos?.contextId ?? null,
          positionState: null,
          strategyDecision: plan.strategyId,
          arbitrationDecision: plan.arbitration.decision,
          positionDecision: plan.positionDecision?.action ?? null,
          riskDecision: "PASSED",
          executionState: prepared.state,
          status: "BLOCKED",
        });
        continue;
      }
      if (input.executionMode === "LIVE_PREVIEW") {
        liveGate = "TRANSACTION_SIMULATED";
        assets.push({
          assetId: plan.assetId,
          ticker: plan.ticker,
          contextId: row.kairos?.contextId ?? null,
          positionState: null,
          strategyDecision: plan.strategyId,
          arbitrationDecision: plan.arbitration.decision,
          positionDecision: plan.positionDecision?.action ?? null,
          riskDecision: "PASSED",
          executionState: "TRANSACTION_SIMULATED",
          status: "OK",
        });
        continue;
      }
      liveGate = "READY_FOR_WALLET";
      assets.push({
        assetId: plan.assetId,
        ticker: plan.ticker,
        contextId: row.kairos?.contextId ?? null,
        positionState: null,
        strategyDecision: plan.strategyId,
        arbitrationDecision: plan.arbitration.decision,
        positionDecision: plan.positionDecision?.action ?? null,
        riskDecision: "PASSED",
        executionState: "READY_FOR_WALLET",
        status: "OK",
      });
    }

    const research = reviewResearch(input, warnings, errors);
    push("RESEARCHING");
    push("RECONCILING");
    warnings.push("Agentic Wallet submission is disabled. No order was sent.");
    return conclude(
      input,
      store,
      cycleId,
      startedAt,
      assets,
      research,
      errors,
      warnings,
      createdIntentIds,
      false,
      true,
      null,
      transitions,
      preparations,
      liveGate,
      null,
    );
  } finally {
    store.releaseLease(input.userId, input.agentId, input.ownerId);
  }
}

export function acquireAssetMutation(userId: string, representationId: string): boolean {
  const key = `${userId}\n${representationId}`;
  if (assetLocks.has(key)) {
    return false;
  }
  assetLocks.add(key);
  return true;
}

export function releaseAssetMutation(userId: string, representationId: string): void {
  assetLocks.delete(`${userId}\n${representationId}`);
}

function reviewResearch(input: AutonomousCycleInput, warnings: string[], errors: RuntimeFailure[]): KairosCycleResult["researchResults"] {
  const results: { candidateId: string; status: string; intentCreated: false }[] = [];
  for (const candidate of listStrategyCandidates(input.userId)) {
    if (candidate.status === "SHADOW" && input.shadowContext) {
      try {
        const reviewed = evaluateShadow(candidate, input.shadowContext, input.startedAtMs);
        if (reviewed.tradeIntent !== null || reviewed.executable !== false) {
          throw new Error("SHADOW_CREATED_INTENT");
        }
        results.push({ candidateId: candidate.candidateId, status: "SHADOW", intentCreated: false });
      } catch (error) {
        errors.push(failure("RESEARCH_ERROR", error instanceof Error ? error.message : "Shadow review failed."));
      }
    }
    if (candidate.status === "PAPER_ACTIVE" && input.executionMode !== "PAPER") {
      warnings.push(`Research candidate ${candidate.candidateId} is excluded from ${input.executionMode}.`);
    }
  }
  const schedule = researchDue({
    nowMs: input.startedAtMs,
    lastResearchAtMs: lastResearchAt(input.userId, input.agentId),
    hasThesis: true,
    regimeChanged: false,
    majorEventChanged: false,
    healthDegraded: false,
  });
  if (input.researchAvailable === false) {
    warnings.push("Research provider is unavailable. Strategies are unaffected.");
    return results;
  }
  if (!schedule.due || !input.researchStep) {
    return results;
  }
  try {
    input.researchStep();
    rememberResearchAt(input.userId, input.agentId, input.startedAtMs);
  } catch (error) {
    errors.push(failure("RESEARCH_ERROR", error instanceof Error ? error.message : "Research failed."));
    warnings.push("Research failed. The trading cycle continued.");
  }
  return results;
}

function conclude(
  input: AutonomousCycleInput,
  store: KairosStateStore,
  cycleId: string,
  startedAt: string,
  assets: KairosCycleResult["assetResults"],
  research: KairosCycleResult["researchResults"],
  errors: RuntimeFailure[],
  warnings: string[],
  createdIntentIds: readonly string[],
  marketBlocked: boolean,
  liveBlocked: boolean,
  paper: AgentCycleResult | null,
  transitions: { state: KairosCycleState; at: string }[],
  preparations: readonly PreparationRecord[],
  liveGate: AutonomousCycleOutcome["liveGate"],
  paperForStatus: AgentCycleResult | null,
): AutonomousCycleOutcome {
  const blocking = errors.some((item) => FAILURE_POLICY[item.code] === "BLOCKING");
  const degraded =
    assets.some((asset) => asset.status === "BLOCKED" || asset.status === "FAILED") ||
    errors.some((item) => item.code === "RESEARCH_ERROR" || FAILURE_POLICY[item.code] === "DEGRADING");
  const paperFailed = paperForStatus !== null && !paperForStatus.ran;
  const status: KairosCycleState = blocking ? "FAILED" : degraded || paperFailed ? "DEGRADED" : "COMPLETED";
  if (paperFailed && paperForStatus?.reason) {
    warnings.push(paperForStatus.reason);
  }
  return finish(input, store, cycleId, startedAt, status, assets, research, errors, warnings, createdIntentIds, marketBlocked, liveBlocked, paper, transitions, preparations, liveGate);
}

function finish(
  input: AutonomousCycleInput,
  store: KairosStateStore,
  cycleId: string,
  startedAt: string,
  status: KairosCycleResult["status"],
  assetResults: KairosCycleResult["assetResults"],
  researchResults: KairosCycleResult["researchResults"],
  errors: RuntimeFailure[],
  warnings: string[],
  createdIntentIds: readonly string[],
  marketBlocked: boolean,
  liveBlocked: boolean,
  paper: AgentCycleResult | null,
  transitions: { state: KairosCycleState; at: string }[],
  preparations: readonly PreparationRecord[],
  liveGate: AutonomousCycleOutcome["liveGate"],
): AutonomousCycleOutcome {
  const completedAt = new Date(input.startedAtMs).toISOString();
  const interval = positiveInterval(process.env.KAIROS_CYCLE_INTERVAL_MS);
  const result: AutonomousCycleOutcome = {
    cycleId,
    userId: input.userId,
    agentId: input.agentId,
    startedAt,
    completedAt,
    runtimeMode: input.runtimeMode,
    executionMode: input.executionMode,
    status,
    assetResults,
    researchResults,
    errors,
    warnings,
    nextSuggestedRunAt: new Date(input.startedAtMs + interval).toISOString(),
    createdIntentIds,
    transitions,
    marketBlocked,
    liveBlocked,
    paper,
    signed: false,
    broadcast: false,
    walletOrderId: null,
    walletSubmitted: false,
    preparations,
    liveGate,
    configVersion: input.operatorConfig?.version,
  };
  store.saveCycle(result);
  persistRuntimeSnapshot(
    {
      status: status === "FAILED" ? "DEGRADED" : status === "DEGRADED" ? "DEGRADED" : input.control === "PAUSED" ? "PAUSED" : input.control === "STOPPED" ? "STOPPED" : "RUNNING",
      executionMode: input.executionMode,
      configVersion: input.operatorConfig?.version ?? null,
      lastHeartbeat: completedAt,
      lastCompletedCycle: completedAt,
      nextScheduledCycle: result.nextSuggestedRunAt,
      lastCycleStatus: status,
      reason: errors[0]?.message ?? warnings[0] ?? null,
      observedAt: completedAt,
    },
    store,
  );
  store.appendAudit({
    id: `${cycleId}:${status}`,
    at: completedAt,
    userId: input.userId,
    agentId: input.agentId,
    cycleId,
    type: status === "FAILED" ? "CYCLE_FAILED" : status === "DEGRADED" ? "CYCLE_DEGRADED" : "CYCLE_COMPLETED",
    message: warnings[0] ?? status,
  });
  const snapshot = exportPaperBook(asUserId(input.userId), asAgentId(input.agentId));
  if (snapshot) {
    commitRecord(store, stateKey(["paper", input.userId, input.agentId]), snapshot, completedAt);
  }
  persistDomain(store, input.userId, input.agentId, completedAt, cycleId);
  store.writeHeartbeat(input.userId, input.agentId, {
    lastCycleStarted: startedAt,
    lastCycleCompleted: completedAt,
    lastSuccessfulCycle: status === "FAILED" ? store.readHeartbeat(input.userId, input.agentId).lastSuccessfulCycle : completedAt,
    lastError: errors[0]?.message ?? null,
    nextCycleAt: result.nextSuggestedRunAt,
    runtimeStatus: input.control ?? "RUNNING",
  });
  return result;
}

function hydratePaperBook(store: KairosStateStore, userId: string, agentId: string): void {
  if (readPaperBook(asUserId(userId), asAgentId(agentId))) {
    return;
  }
  const saved = store.get<PaperBookSnapshot>(stateKey(["paper", userId, agentId]));
  if (!saved || saved.schemaVersion !== 1) {
    return;
  }
  importPaperBook(saved.value);
}

function recoverInterrupted(store: KairosStateStore, userId: string, agentId: string, at: string): void {
  const cycles = store.listCycles(userId, agentId);
  const last = cycles.at(-1);
  if (!last || terminalCycle(last.status)) {
    return;
  }
  store.saveCycle({ ...last, status: "INTERRUPTED", completedAt: at });
  store.appendAudit({
    id: `${last.cycleId}:INTERRUPTED`,
    at,
    userId,
    agentId,
    cycleId: last.cycleId,
    type: "CYCLE_INTERRUPTED",
    message: "Recovered an unfinished cycle. Completed intents were not filled again.",
  });
}

function assetResultsFrom(paper: AgentCycleResult): KairosCycleResult["assetResults"] {
  const assets = paper.view?.assets ?? [];
  return assets.map((asset) => ({
    assetId: asset.assetId,
    ticker: asset.ticker,
    contextId: null,
    positionState: asset.steps.some((step) => step.detail?.includes("HOLD")) ? "OPEN" : null,
    strategyDecision: null,
    arbitrationDecision: null,
    positionDecision: asset.steps.find((step) => step.label === "Position decision")?.detail ?? null,
    riskDecision: asset.steps.find((step) => step.label === "Risk")?.detail ?? null,
    executionState: asset.steps.find((step) => step.label === "Paper execution")?.detail ?? null,
    status: asset.steps.some((step) => step.state === "failed") ? "FAILED" : "OK",
  }));
}

function emptyAccount(userId: ReturnType<typeof asUserId>, agentId: ReturnType<typeof asAgentId>): PaperAccountState {
  const cash = parseDecimal("100000");
  return {
    accountId: paperAccountId(userId),
    userId,
    agentId,
    cash,
    positions: [],
    realizedPnl: 0n,
    sessionStartEquity: cash,
    trades: [],
  };
}

function failure(code: RuntimeFailure["code"], message: string): RuntimeFailure {
  return { code, class: FAILURE_POLICY[code], message, assetId: null };
}

function positiveInterval(raw: string | undefined): number {
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : 60_000;
}
