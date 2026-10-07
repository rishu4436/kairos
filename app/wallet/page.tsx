import { WalletPanel } from "@/components/wallet/wallet-panel";
import { PageHeader } from "@/components/ui/page-header";
import { readWalletSnapshot } from "@/operator/snapshots";
import { disconnectedAccount } from "@/wallet/agentic/parse";
import type { HighRiskHandling } from "@/domain/agentic-wallet";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default function WalletPage() {
  const snap = readWalletSnapshot();
  const highRisk: HighRiskHandling | null =
    snap.highRiskHandling === "NeedConfirmation" || snap.highRiskHandling === "AutoReject" ? snap.highRiskHandling : null;
  const account = snap.connectionStatus === "CONNECTED"
    ? {
        ...disconnectedAccount(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID, snap.observedAt),
        walletAddress: snap.address,
        connectionStatus: "CONNECTED" as const,
        supportedChains: [{ binanceChainId: snap.chainId, name: "BSC" }],
        securityPolicy: {
          dailyLimit: null,
          quotaUsed: snap.quotaUsed == null ? null : Number(snap.quotaUsed),
          quotaLeft: snap.quotaRemaining == null ? null : Number(snap.quotaRemaining),
          quotaDate: null,
          tradeAllTokens: false,
          highRiskHandling: highRisk,
        },
      }
    : disconnectedAccount(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID, snap.observedAt);
  const balances = [
    ...(snap.usdt ? [{ symbol: "USDT", contractAddress: null, chainId: "56", amount: snap.usdt, valueUsd: null }] : []),
    ...(snap.bnb ? [{ symbol: "BNB", contractAddress: null, chainId: "56", amount: snap.bnb, valueUsd: null }] : []),
    ...snap.tokens
      .filter((item) => {
        const symbol = (item.symbol ?? "").toUpperCase();
        return symbol !== "USDT" && symbol !== "BNB";
      })
      .map((item) => ({ symbol: item.symbol, contractAddress: null, chainId: "56", amount: item.amount, valueUsd: null })),
  ];
  return (
    <>
      <PageHeader
        kicker="Published snapshot"
        title="Wallet"
        description="This page reads the last sanitized wallet snapshot. It does not call the wallet CLI."
      />
      <p className="mb-4 text-sm text-muted">
        Status {snap.connectionStatus}. Observed {snap.observedAt}. Token-scope {snap.tokenScope}.
        {snap.stale ? " This snapshot is stale." : ""}
      </p>
      <WalletPanel account={account} balances={balances} />
    </>
  );
}
