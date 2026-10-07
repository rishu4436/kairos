import type { WalletBalance, WalletPortfolio, WalletPosition } from "@/domain/execution-prep";
import { BinanceWeb3Client } from "@/services/binance/client";

const BALANCE_PATH = "/api/v1/dex/balance/all-token-balances-by-address";

interface BalanceEntry {
  binanceChainId?: unknown;
  tokenContractAddress?: unknown;
  symbol?: unknown;
  balance?: unknown;
  isRiskToken?: unknown;
}

interface BalancePage {
  tokenAssets?: unknown;
}

export class BinanceWalletReadGateway {
  constructor(private readonly client: BinanceWeb3Client) {}

  async portfolio(address: string): Promise<WalletPortfolio> {
    const result = await this.client.get<BalancePage | BalanceEntry[]>(BALANCE_PATH, {
      address,
      excludeRiskToken: "true",
    });
    const rows = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.data?.tokenAssets)
        ? (result.data.tokenAssets as BalanceEntry[])
        : [];
    const balances = rows.map(mapBalance);
    const positions = balances
      .filter((item) => item.amount !== null && item.amount !== "0")
      .map((item): WalletPosition => ({
        chainId: item.chainId,
        contractAddress: item.contractAddress,
        symbol: item.symbol,
        amount: item.amount,
      }));
    return { address, balances, positions, exposureUsd: null };
  }
}

function mapBalance(entry: BalanceEntry): WalletBalance {
  return {
    chainId: typeof entry.binanceChainId === "string" ? entry.binanceChainId : null,
    contractAddress: typeof entry.tokenContractAddress === "string" ? entry.tokenContractAddress : null,
    symbol: typeof entry.symbol === "string" ? entry.symbol : null,
    amount: typeof entry.balance === "string" ? entry.balance : null,
    riskFlagged: typeof entry.isRiskToken === "boolean" ? entry.isRiskToken : null,
  };
}
