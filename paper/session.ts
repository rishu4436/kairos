import { asAgentId, asPolicyId, asUserId } from "@/domain/ids";
import type { RiskPolicy } from "@/domain/models";
import { parseDecimal } from "@/domain/money";
import { CONFIGURED_WATCHLIST_TICKERS, DEFAULT_AGENT_ID, DEFAULT_POLICY_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";

/** Existing local account scope and paper risk configuration, without seeded activity.
 * The legacy ids remain stable for persisted books. They are not sample portfolio data. */
export function localPaperSession(userId = LOCAL_RUNTIME_USER_ID) {
  if (userId !== LOCAL_RUNTIME_USER_ID) return null;
  const user = asUserId(userId);
  const agent = asAgentId(DEFAULT_AGENT_ID);
  const policy: RiskPolicy = {
    id: asPolicyId(DEFAULT_POLICY_ID), userId: user, agentId: agent,
    liveTradingEnabled: false, paperTradingEnabled: true,
    maxPositionNotional: parseDecimal("5000"), maxAllocationBps: 2500,
    maxDailyLoss: parseDecimal("500"), maxSlippageBps: 50,
    allowedAssets: [...CONFIGURED_WATCHLIST_TICKERS],
  };
  return { user: { id: user, displayName: "Local user" }, agent: { id: agent, userId: user, name: "KAIROS" }, policy };
}
