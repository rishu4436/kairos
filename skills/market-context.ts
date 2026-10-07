import type { DataQualityStatus } from "@/domain/quality";
import type { MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";
import type { ExternalSignal, SecurityEvent, TokenSecurityAssessment } from "@/skills/types";
import type { TokenizedSecurityStatus } from "@/skills/security";

export interface MarketContext {
  marketObservations: readonly { assetId: string; ticker: string; price: string | null }[];
  features: readonly { id: string; value: string | null }[];
  regime: MarketRegime | string | null;
  session: MarketSessionState | string | null;
  strategySignals: readonly { strategyId: string; action: string }[];
  externalSignals: readonly ExternalSignal[];
  tokenSecurity: TokenSecurityAssessment | null;
  tokenizedSecurityStatus: TokenizedSecurityStatus | null;
  securityEvents: readonly SecurityEvent[];
  dataQuality: DataQualityStatus | null;
}

export function buildMarketContext(input: Omit<MarketContext, "securityEvents"> & { securityEvents?: readonly SecurityEvent[] }): MarketContext {
  return {
    ...input,
    securityEvents: input.securityEvents ?? [],
    externalSignals: input.externalSignals,
    tokenSecurity: input.tokenSecurity,
    tokenizedSecurityStatus: input.tokenizedSecurityStatus,
  };
}
