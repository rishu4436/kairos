import { describe, expect, it } from "vitest";
import { writeIntelligenceEvidence } from "@/runtime/intelligence-evidence";
import { BinanceWeb3Client } from "@/services/binance/client";
import { readBinanceConfig } from "@/services/binance/config";
import { searchRwaTokens, RWA_ENDPOINTS } from "@/services/binance/rwa-data";
import { KairosApiError } from "@/services/binance/errors";

const enabled = process.env.BINANCE_WEB3_LIVE_TEST === "1";

describe.skipIf(!enabled)("real Binance intelligence evidence", () => {
  it("records an authenticated read without fallback or execution", async () => {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const client = new BinanceWeb3Client({ config: readBinanceConfig(), attempts: 1 });
    let evidence: object;
    let succeeded = false;
    try {
      const hits = await searchRwaTokens(client, "TSLA");
      succeeded = true;
      evidence = {
        label: "RECORDED REAL PROVIDER EVIDENCE",
        startedAt,
        latencyMs: Date.now() - started,
        endpoint: RWA_ENDPOINTS.SEARCH,
        result: "SUCCESS",
        ticker: "TSLA",
        representations: hits.filter(hit => hit.ticker === "TSLA").flatMap(hit => hit.assets ?? []).map(asset => ({
          chainId: asset.binanceChainId ?? null,
          contractAddress: asset.tokenContractAddress ?? null,
          tokenSymbol: asset.tokenSymbol ?? null,
          platformId: asset.platformId ?? null,
        })),
      };
    } catch (error) {
      evidence = {
        label: "RECORDED REAL PROVIDER EVIDENCE",
        startedAt,
        latencyMs: Date.now() - started,
        endpoint: RWA_ENDPOINTS.SEARCH,
        result: "FAILURE",
        category: error instanceof KairosApiError ? error.category : "UNKNOWN_ERROR",
        httpStatus: error instanceof KairosApiError ? error.httpStatus : null,
        upstreamCode: error instanceof KairosApiError ? error.upstreamCode : null,
      };
    }
    writeIntelligenceEvidence("phase-17i-auth", evidence);
    console.log(JSON.stringify(evidence));
    expect(succeeded).toBe(true);
  }, 30_000);
});
