import type { AgentId, UserId } from "@/domain/ids";
import type {
  Asset,
  EventObservation,
  LiquidityState,
  MarketObservation,
  MarketSession,
  VolatilityState,
} from "@/domain/models";
import type { Scaled } from "@/domain/money";

export interface MockObservationInput {
  userId: UserId;
  agentId: AgentId;
  asset: Asset;
  price: Scaled;
  change24hBps: number;
  liquidity?: LiquidityState;
  session?: MarketSession;
  volatility?: VolatilityState;
  events?: EventObservation[];
  asOf?: string;
}

/** Builds a labeled mock observation. It does not call a market-data service. */
export function createMockObservation(input: MockObservationInput): MarketObservation {
  const asOf = input.asOf ?? "2026-10-02T22:31:04.000Z";
  const liquidity = input.liquidity ?? "healthy";
  return {
    id: `obs_${input.asset.ticker.toLowerCase()}`,
    userId: input.userId,
    agentId: input.agentId,
    asset: input.asset,
    price: {
      assetSymbol: input.asset.ticker,
      price: input.price,
      change24hBps: input.change24hBps,
      asOf,
      fidelity: "mock",
    },
    liquidity: {
      assetSymbol: input.asset.ticker,
      state: liquidity,
      note: "Mock liquidity mark. Depth is not connected.",
      fidelity: "mock",
    },
    session: {
      session: input.session ?? "open",
      label: "Sample session mark",
      asOf,
      fidelity: "mock",
    },
    events: input.events ?? [],
    volatility: input.volatility ?? "normal",
    fidelity: "mock",
  };
}
