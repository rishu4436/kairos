import type { KAIROSContext } from "@/context/types";
import type { ArbitrationDecision } from "@/domain/arbitration";
import type { BinanceIntelligenceView } from "@/skills/view";
import type { AgentEventType } from "@/domain/events";
import type { PaperCycleView } from "@/domain/paper-cycle-view";
import type { DataFreshness, FreshnessStatus } from "@/domain/freshness";
import type { DataQualityStatus } from "@/domain/quality";
import type { EvaluationStatus, SignalAction } from "@/domain/signal";
import type { MarketSessionState } from "@/domain/session-state";
import type { UnderlyingKind } from "@/domain/watchlist";

export interface UnderlyingAsset {
  ticker: string;
  name: string;
  kind: UnderlyingKind;
}

/** One token that represents an underlying. A ticker may have several, or none. */
export interface TokenizedRepresentation {
  id: string;
  underlyingTicker: string;
  tokenSymbol: string;
  tokenName: string;
  platformId: string;
  platformLabel: string;
  chainId: string;
  chainLabel: string;
  contractAddress: string;
  decimals: string | null;
  tokenToShareRatio: string | null;
  logoUrl: string | null;
  website: string | null;
}

export interface ReferenceDeviation {
  percent: number;
  label: "reference_deviation";
}

export interface LiquiditySnapshot {
  volume24hUsd: string | null;
  marketCapUsd: string | null;
}

export interface MarketObservationRecord {
  id: string;
  timestamp: string;
  userId: string;
  underlying: UnderlyingAsset;
  representation: TokenizedRepresentation;
  price: string | null;
  referencePrice: string | null;
  priceDeviation: ReferenceDeviation | null;
  /** The RWA endpoints used here do not return a 24h percent change. */
  change24hPct: null;
  marketSession: MarketSessionState;
  rawMarketStatus: string | null;
  openState: boolean | null;
  reasonCode: string | null;
  reasonMessage: string | null;
  nextOpenAt: string | null;
  nextCloseAt: string | null;
  freshness: DataFreshness;
  liquidity: LiquiditySnapshot;
  source: {
    provider: "binance_web3";
    endpoints: readonly string[];
    fidelity: "live";
  };
  metadata: {
    priceUpdatedAt: string | null;
    responseTimestamp: string | null;
    referencePriceNote: string;
  };
}

export const REFERENCE_PRICE_NOTE =
  "Binance describes referencePrice as a per-share conversion of the on-chain token price, not an official quote from the traditional stock market.";

export interface ObservationRow {
  id: string;
  ticker: string;
  companyName: string;
  tokenSymbol: string;
  platformLabel: string;
  chainLabel: string;
  contractAddress: string | null;
  /** Chain id of this representation. Null when the row is a paper sample. */
  chainId?: string | null;
  reasonCode?: string | null;
  openState?: boolean | null;
  /** Set when the reference quote has its own source time. Otherwise the price time is used. */
  referenceObservedAt?: string | null;
  price: string | null;
  referencePrice: string | null;
  deviationPct: number | null;
  change24hPct: number | null;
  session: MarketSessionState;
  sessionLabel: string;
  rawMarketStatus: string | null;
  freshness: FreshnessStatus | "SAMPLE";
  freshnessLabel: string;
  ageMs: number | null;
  sourceTimestamp: string | null;
  receivedAt: string;
  volume24hUsd: string | null;
  nextOpenAt: string | null;
  reasonMessage: string | null;
  fidelity: "live" | "paper";
  representationId: string;
  regime: string;
  regimeDetail: string | null;
  dataQuality: DataQualityStatus | null;
  historyPoints: number;
  features: FeatureView[];
  signals: SignalView[];
  candles: ChartBar[];
  arbitration: ArbitrationDecision | null;
  binanceIntelligence?: BinanceIntelligenceView;
  /** Canonical context for this row's cycle. Absent only on a partial fixture. */
  kairos?: KAIROSContext;
}

export interface FeatureView {
  id: string;
  label: string;
  value: string | null;
  lookback: string;
  sufficient: boolean;
  note: string | null;
}

export interface ChartBar {
  timeMs: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface SignalView {
  id: string;
  strategyId: string;
  strategyName: string;
  ticker: string;
  tokenSymbol: string;
  representationId: string;
  timestamp: string;
  action: SignalAction;
  evaluation: EvaluationStatus;
  confidence: number;
  reasons: string[];
  evidence: string[];
  featuresUsed: string[];
  riskHints: string[];
  validUntil: string;
  dataQuality: DataQualityStatus;
  historyPoints: number;
  tags: string[];
  executable: false;
}

export interface ApiHealthView {
  connection: "connected" | "offline";
  reason: string | null;
  httpStatus: number | null;
  lastSuccessAt: string | null;
  rwa: "ok" | "error" | "skipped";
  market: "ok" | "error" | "skipped";
  history: "ok" | "error" | "skipped";
}

export interface ObservationEventView {
  id: string;
  at: string;
  clock: string;
  message: string;
  type: AgentEventType | "NOTE";
  userId?: string;
  agentId?: string;
  assetId?: string;
  correlationId?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ObservationBoard {
  ok: boolean;
  dataMode: "live" | "paper";
  refreshIntervalMs: number;
  freshMaxMs: number;
  agingMaxMs: number;
  generatedAt: string;
  userId: string;
  watchlistId: string;
  health: ApiHealthView;
  rows: ObservationRow[];
  unresolved: { ticker: string; reason: string }[];
  events: ObservationEventView[];
  recentEvaluations: SignalView[];
  error: { category: string; message: string; httpStatus: number | null } | null;
  /** Present only after a paper-mode cycle. Live boards omit it. */
  paperCycle?: PaperCycleView | null;
}
