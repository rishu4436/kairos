import { WalletPanel } from "@/components/wallet/wallet-panel";
import { PageHeader } from "@/components/ui/page-header";
import { disconnectedAccount } from "@/wallet/agentic/parse";
import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { DEMO_USER_ID } from "@/domain/watchlist";

const DEMO_AGENT_ID = "agent_demo";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const gateway = new CliAgenticWalletGateway();
  const account = await gateway.getStatus(DEMO_USER_ID, DEMO_AGENT_ID).catch(() => disconnectedAccount(DEMO_USER_ID, DEMO_AGENT_ID, new Date().toISOString()));
  const balances = account.connectionStatus === "CONNECTED" ? await gateway.getBalances(DEMO_USER_ID, "56").catch(() => []) : [];
  return (
    <>
      <PageHeader
        kicker="Binance Agentic Wallet"
        title="Wallet"
        description="KAIROS can read the wallet status. It does not hold a private key, and it does not change Binance safety limits."
      />
      <WalletPanel account={account} balances={balances} />
    </>
  );
}
