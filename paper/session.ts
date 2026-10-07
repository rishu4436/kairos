import { asAgentId, asPolicyId, asUserId } from "@/domain/ids";
import type { RiskPolicy } from "@/domain/models";
import { parseDecimal } from "@/domain/money";
import { DEMO_USER_ID, DEMO_WATCH_TICKERS } from "@/domain/watchlist";

/** Existing local account scope and paper risk configuration, without seeded activity.
 * The legacy ids remain stable for persisted books. They are not sample portfolio data. */
export function localPaperSession(userId = DEMO_USER_ID) {
  if (userId !== DEMO_USER_ID) return null;
  const user = asUserId(userId);
  const agent = asAgentId("agent_demo");
  const policy: RiskPolicy = {
    id: asPolicyId("policy_demo"), userId: user, agentId: agent,
    liveTradingEnabled: false, paperTradingEnabled: true,
    maxPositionNotional: parseDecimal("5000"), maxAllocationBps: 2500,
    maxDailyLoss: parseDecimal("500"), maxSlippageBps: 50,
    allowedAssets: [...DEMO_WATCH_TICKERS],
  };
  return { user: { id: user, displayName: "Local user" }, agent: { id: agent, userId: user, name: "KAIROS" }, policy };
}
