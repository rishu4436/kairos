import { describe, expect, it } from "vitest";
import { BinanceWeb3Client } from "@/services/binance/client";
import { readBinanceConfig } from "@/services/binance/config";
import { searchRwaTokens } from "@/services/binance/rwa-data";

const enabled = Boolean(process.env.BINANCE_WEB3_API_KEY);

describe.skipIf(!enabled)("Binance Web3 integration", () => {
  it("resolves NVDA through the official search endpoint", async () => {
    const client = new BinanceWeb3Client({ config: readBinanceConfig() });
    const hits = await searchRwaTokens(client, "NVDA");
    const match = hits.find((hit) => hit.ticker?.toUpperCase() === "NVDA");
    expect(match?.assets?.length).toBeGreaterThan(0);
    expect(match?.assets?.[0]?.tokenContractAddress).toEqual(expect.any(String));
  }, 20_000);
});
