import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";
import { persistWalletSnapshot } from "@/operator/snapshots";
import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { readOperatorTokenScope } from "@/wallet/agentic/token-scope";

/** Read-only wallet refresh. The public dashboard never calls this. */
export async function publishWalletSnapshot(): Promise<void> {
  const gateway = new CliAgenticWalletGateway();
  const account = await gateway.getStatus(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID);
  const balances = account.connectionStatus === "CONNECTED" ? await gateway.getBalances(LOCAL_RUNTIME_USER_ID, "56") : [];
  persistWalletSnapshot({
    connectionStatus: account.connectionStatus === "CONNECTED" ? "CONNECTED" : "UNCONNECTED",
    address: account.walletAddress,
    chainId: "56",
    bnb: balances.find((item) => (item.symbol ?? "").toUpperCase() === "BNB")?.amount ?? null,
    usdt: balances.find((item) => item.symbol === "USDT")?.amount ?? null,
    tokens: balances
      .filter((item) => {
        const symbol = (item.symbol ?? "").toUpperCase();
        return Boolean(item.amount) && symbol !== "USDT" && symbol !== "BNB";
      })
      .map((item) => ({ symbol: item.symbol ?? "Token", amount: item.amount ?? "—" })),
    quotaUsed: account.securityPolicy?.quotaUsed == null ? null : String(account.securityPolicy.quotaUsed),
    quotaRemaining: account.securityPolicy?.quotaLeft == null ? null : String(account.securityPolicy.quotaLeft),
    highRiskHandling: account.securityPolicy?.highRiskHandling ?? null,
    tokenScope: readOperatorTokenScope() ? "OPERATOR_ATTESTED" : "TOKEN_SCOPE_UNVERIFIED",
    observedAt: new Date().toISOString(),
    stale: false,
  });
}
