import type { AccountId, AgentId, AssetId, PolicyId, UserId } from "@/domain/ids";
import type { Scaled } from "@/domain/money";

export type AgentRuntimeState =
  | "OFFLINE"
  | "STARTING"
  | "OBSERVING"
  | "ANALYZING"
  | "EVALUATING_STRATEGIES"
  | "ARBITRATING"
  | "DECISION_READY"
  | "WAITING_FOR_RISK"
  | "RISK_CHECK"
  | "SIMULATING"
  | "PAPER_EXECUTING"
  | "EXECUTING"
  | "MONITORING_POSITION"
  | "PAUSED"
  | "ERROR";

export type TradeSide = "buy" | "sell";
export type TradeVenue = "paper" | "live";
export type MarketSession = "open" | "pre" | "post" | "closed" | "weekend" | "unknown";
export type LiquidityState = "healthy" | "thin" | "unknown";
export type VolatilityState = "low" | "normal" | "elevated" | "unknown";
export type EventRisk = "low" | "medium" | "high" | "unknown";
export type StrategyRiskLevel = "low" | "medium" | "high";
export type StrategyStatus = "implemented" | "coming_soon" | "research_candidate";
export type StrategyCategory =
  | "trend"
  | "mean_reversion"
  | "session"
  | "relative_value"
  | "event"
  | "execution"
  | "research";
export type StrategyDataNeed =
  | "price"
  | "liquidity"
  | "session"
  | "event"
  | "volatility"
  | "candles"
  | "reference"
  | "history";
export type WatchStatus =
  | "WATCHING"
  | "OPPORTUNITY"
  | "NO_ACTION"
  | "RISK_BLOCKED"
  | "PAPER_TEST";

export interface User {
  id: UserId;
  displayName: string;
}

export interface Agent {
  id: AgentId;
  userId: UserId;
  name: string;
  runtimeState: AgentRuntimeState;
  /** Product posture. Independent of the runtime state machine. */
  mode: "monitoring" | "paused";
}

export interface Asset {
  id: AssetId;
  ticker: string;
  name: string;
  /**
   * Display placeholder. Not an on-chain identifier.
   * Official tokenized-equity symbols are not wired in this build.
   */
  tokenizedSymbol: string;
  kind: "tokenized_equity" | "tokenized_etf";
  chain: "bnb";
}

export interface WatchlistItem {
  id: string;
  userId: UserId;
  agentId: AgentId;
  asset: Asset;
  price: Scaled;
  change24hBps: number;
  status: WatchStatus;
  signal: string;
  fidelity: "mock";
}

export interface PriceObservation {
  assetSymbol: string;
  price: Scaled;
  change24hBps: number;
  asOf: string;
  fidelity: "mock";
}

export interface LiquidityObservation {
  assetSymbol: string;
  state: LiquidityState;
  note: string;
  fidelity: "mock";
}

export interface SessionObservation {
  session: MarketSession;
  label: string;
  asOf: string;
  fidelity: "mock";
}

export interface EventObservation {
  id: string;
  assetSymbol: string | null;
  headline: string;
  risk: EventRisk;
  fidelity: "mock";
}

export interface MarketObservation {
  id: string;
  userId: UserId;
  agentId: AgentId;
  asset: Asset;
  price: PriceObservation;
  liquidity: LiquidityObservation;
  session: SessionObservation;
  events: EventObservation[];
  volatility: VolatilityState;
  fidelity: "mock";
}

export interface StrategyMetadata {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  supportedAssets: readonly string[];
  riskLevel: StrategyRiskLevel;
  requiredData: readonly StrategyDataNeed[];
  status: StrategyStatus;
  category: StrategyCategory;
  supportedSessions: readonly string[];
  version: string;
}

export interface StrategySignal {
  strategyId: string;
  assetSymbol: string;
  stance: "buy" | "sell" | "flat";
  /** -1 to 1. Placeholder score, not a forecast. */
  strength: number;
  /** 0 to 1. Informational. Risk does not trust this value. */
  confidence: number;
  evidence: readonly string[];
  fidelity: "mock";
}

export interface Strategy {
  metadata: StrategyMetadata;
  evaluate(observation: MarketObservation): StrategySignal;
}

export interface AgentDecision {
  id: string;
  userId: UserId;
  agentId: AgentId;
  assetSymbol: string;
  posture: "WATCH";
  action: "BUY" | "SELL" | "WAIT" | "NO_ACTION";
  /** Strategy that was evaluated. Null when none was evaluated. */
  strategyId: string | null;
  confidence: number;
  momentum: number | null;
  liquidity: LiquidityState;
  volatility: VolatilityState;
  eventRisk: EventRisk;
  riskCheck: "pass" | "fail" | "not_run";
  /** True only when an order was committed. WAIT is not a commitment. */
  committed: boolean;
  fidelity: "mock";
  note: string;
}

export interface TradeIntent {
  id: string;
  userId: UserId;
  agentId: AgentId;
  accountId: AccountId;
  assetSymbol: string;
  side: TradeSide;
  quantity: Scaled;
  limitPrice: Scaled;
  slippageBps: number;
  strategyId: string;
  venue: TradeVenue;
  /** 0 to 1. Informational. A high value cannot override risk. */
  confidence: number;
  asOf: string;
}

export interface RiskPolicy {
  id: PolicyId;
  userId: UserId;
  agentId: AgentId;
  /** Hard user switch. The agent cannot set this. */
  liveTradingEnabled: boolean;
  paperTradingEnabled: boolean;
  maxPositionNotional: Scaled;
  /** Share of equity, in basis points. 10_000 = 100%. */
  maxAllocationBps: number;
  maxDailyLoss: Scaled;
  maxSlippageBps: number;
  allowedAssets: readonly string[];
}

export type QuoteSource = "mock";

export interface Quote {
  assetSymbol: string;
  side: TradeSide;
  price: Scaled;
  liquidity: LiquidityState;
  quotedAt: string;
  source: QuoteSource;
}

export interface ExecutionPlan {
  id: string;
  intentId: string;
  userId: UserId;
  agentId: AgentId;
  accountId: AccountId;
  assetSymbol: string;
  side: TradeSide;
  quantity: Scaled;
  limitPrice: Scaled;
  maxSlippageBps: number;
  venue: TradeVenue;
  quote: Quote;
}

export interface SimulationResult {
  planId: string;
  accepted: boolean;
  reasons: readonly string[];
  estimatedAveragePrice: Scaled | null;
  estimatedFee: Scaled | null;
  priceImpactBps: number | null;
  source: "mock_simulator";
  /** This build never broadcasts. The type forbids any other value. */
  broadcast: false;
}

export interface TradeExecution {
  id: string;
  planId: string;
  userId: UserId;
  agentId: AgentId;
  status: "not_submitted" | "rejected";
  venue: TradeVenue;
  /** Chain transaction ids are never assigned in this build. */
  chainTransactionId: null;
  message: string;
}

export interface Position {
  id: string;
  accountId: AccountId;
  userId: UserId;
  assetSymbol: string;
  quantity: Scaled;
  entryPrice: Scaled;
  currentPrice: Scaled;
  strategyId: string | null;
}

export interface ValuedPosition extends Position {
  marketValue: Scaled;
  unrealizedPnl: Scaled;
}

export interface Portfolio {
  accountId: AccountId;
  userId: UserId;
  agentId: AgentId;
  cash: Scaled;
  invested: Scaled;
  equity: Scaled;
  unrealizedPnl: Scaled;
  realizedPnl: Scaled;
  totalPnl: Scaled;
  todayPnl: Scaled;
  positions: ValuedPosition[];
}

export interface PaperTrade {
  id: string;
  accountId: AccountId;
  userId: UserId;
  agentId: AgentId;
  assetSymbol: string;
  side: TradeSide;
  quantity: Scaled;
  price: Scaled;
  fee: Scaled;
  realizedPnl: Scaled;
  strategyId: string | null;
  at: string;
  status: "paper_filled";
  venue: "paper";
  fidelity: "paper";
}

/** Ledger for one user, one agent, one paper account. */
export interface PaperAccountState {
  accountId: AccountId;
  userId: UserId;
  agentId: AgentId;
  cash: Scaled;
  positions: Position[];
  realizedPnl: Scaled;
  sessionStartEquity: Scaled;
  trades: PaperTrade[];
}

export interface WalletAccount {
  id: AccountId;
  userId: UserId;
  agentId: AgentId;
  kind: "paper" | "external_agentic_wallet";
  label: string;
  /** Null until a verified wallet provider supplies an address. */
  address: string | null;
}

export interface WalletAuthorization {
  accountId: AccountId;
  planId: string;
  granted: boolean;
  reasons: readonly string[];
  /** This build never produces a signature. */
  signature: null;
}

export type AgentEventKind =
  | "observation"
  | "analysis"
  | "strategy"
  | "risk"
  | "simulation"
  | "execution"
  | "system";

export interface AgentEvent {
  id: string;
  userId: UserId;
  agentId: AgentId;
  at: string;
  kind: AgentEventKind;
  message: string;
  fidelity: "sample" | "runtime";
}

export interface StrategyExperiment {
  id: string;
  userId: UserId;
  name: string;
  strategyId: string;
  status: "draft" | "paper" | "archived";
  paperCapital: Scaled;
  fidelity: "preview";
}
