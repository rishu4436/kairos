import { describe, expect, it } from "vitest";
import { BinanceWeb3Client } from "@/services/binance/client";
import { readBinanceConfig } from "@/services/binance/config";
import { searchRwaTokens } from "@/services/binance/rwa-data";
import { BinanceQuoteGateway } from "@/services/binance/trading/gateway";
import { BinanceSimulationGateway } from "@/services/binance/transaction/gateway";
import { BSC_CHAIN_ID, BSC_USDT_CONTRACT } from "@/domain/execution-prep";

const enabled = process.env.KAIROS_EXECUTION_LIVE_TEST === "1"
  && Boolean(process.env.BINANCE_WEB3_API_KEY)
  && Boolean(process.env.BINANCE_WEB3_SECRET_KEY)
  && Boolean(process.env.KAIROS_WALLET_ADDRESS);

describe.skipIf(!enabled)("credentialed execution preparation", () => {
  it("quotes, builds, and simulates without broadcasting", async () => {
    const client = new BinanceWeb3Client({ config: readBinanceConfig() });
    const hits = await searchRwaTokens(client, "NVDA");
    const asset = hits.find((hit) => hit.ticker?.toUpperCase() === "NVDA")?.assets?.[0];
    expect(asset?.tokenContractAddress).toEqual(expect.any(String));
    const quoteGateway = new BinanceQuoteGateway(client);
    const wallet = process.env.KAIROS_WALLET_ADDRESS ?? "";
    const request = {
      binanceChainId: asset?.binanceChainId ?? BSC_CHAIN_ID,
      fromTokenAddress: BSC_USDT_CONTRACT,
      toTokenAddress: asset?.tokenContractAddress ?? "",
      amount: "1000000",
      userWalletAddress: wallet,
      slippagePercent: "0.5",
    };
    const quote = await quoteGateway.quote(request, Date.now());
    if (quote.status !== "VALID" || quote.quoteId === null) {
      throw new Error(`QUOTE FAILURE ${quote.reason ?? quote.status}`);
    }
    const build = await quoteGateway.build(request, quote.quoteId);
    if (build.to === null || build.data === null) {
      throw new Error("TRANSACTION BUILD FAILURE");
    }
    const simulation = await new BinanceSimulationGateway(client).simulate(build, request.binanceChainId);
    if (simulation.outcome !== "PASS") {
      throw new Error(`SIMULATION FAILURE ${simulation.failureReason ?? simulation.outcome}`);
    }
    expect(simulation.outcome).toBe("PASS");
  }, 30_000);
});
