import { describe, expect, it } from "vitest";
import { buildPrehash, encodeQuery, signPrehash } from "@/services/binance/auth";

describe("Binance Web3 request signing", () => {
  it("matches the documented GET pre-hash, including the /build prefix", () => {
    const prehash = buildPrehash({
      timestamp: "2026-05-11T10:08:57.715Z",
      method: "get",
      requestPath: "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT",
      body: "",
    });
    expect(prehash).toBe(
      "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT",
    );
    expect(signPrehash(prehash, "test-secret")).toBe("+e4H3erFq96IQ1yTqE+vjaHHmLdSy+rOmPqIo2kR5OA=");
  });

  it("encodes spaces as %20 and keeps parameter order", () => {
    expect(encodeQuery({ symbol: "ETH USDT", chainId: "1" })).toBe("?symbol=ETH%20USDT&chainId=1");
  });
});
