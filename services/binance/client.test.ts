import { describe, expect, it, vi } from "vitest";
import { signPrehash } from "@/services/binance/auth";
import { BinanceWeb3Client } from "@/services/binance/client";
import type { BinanceWeb3Config } from "@/services/binance/config";
import { KairosApiError } from "@/services/binance/errors";

const config: BinanceWeb3Config = {
  apiKey: "test-key",
  secretKey: "test-secret",
  baseUrl: "https://web3.binance.com/build",
  recvWindowMs: 5000,
  timeoutMs: 1000,
  freshMaxMs: 30_000,
  agingMaxMs: 120_000,
  refreshIntervalMs: 15_000,
};

function client(fetchImpl: typeof fetch, attempts = 1) {
  return new BinanceWeb3Client({
    config,
    fetchImpl,
    attempts,
    now: () => new Date("2026-05-11T10:08:57.715Z"),
    sleep: async () => undefined,
  });
}

describe("Binance Web3 client", () => {
  it("signs the /build path that it requests", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 0, msg: "success", data: [], success: true, timestamp: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    await client(fetchImpl).get("/api/v1/dex/market/rwa/search", { keyword: "NVDA" });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("https://web3.binance.com/build/api/v1/dex/market/rwa/search?keyword=NVDA");
    const headers = new Headers(init?.headers);
    expect(headers.get("X-OC-APIKEY")).toBe("test-key");
    expect(headers.get("X-OC-SIGN")).toBe(
      signPrehash(
        "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/rwa/search?keyword=NVDA",
        "test-secret",
      ),
    );
    expect(headers.get("X-OC-SECRET")).toBeNull();
  });

  it("signs a POST body and does not send the secret", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 0, msg: "success", data: { status: "SUCCESS", failReason: null }, success: true }), {
        status: 200,
      });
    }) as typeof fetch;
    const body = { binanceChainId: "56", evmTx: { from: "0x1", to: "0x2", value: "0", data: "0x" } };
    await client(fetchImpl).post("/api/v1/dex/pre-transaction/simulate", body);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("https://web3.binance.com/build/api/v1/dex/pre-transaction/simulate");
    expect(init?.method).toBe("POST");
    const payload = JSON.stringify(body);
    expect(init?.body).toBe(payload);
    const headers = new Headers(init?.headers);
    expect(headers.get("X-OC-SIGN")).toBe(
      signPrehash(`2026-05-11T10:08:57.715ZPOST/build/api/v1/dex/pre-transaction/simulate${payload}`, "test-secret"),
    );
    expect(headers.get("X-OC-SECRET")).toBeNull();
  });

  it("maps an upstream 429 and a malformed body", async () => {
    const limited = vi.fn(async () => new Response(JSON.stringify({ code: 42900, msg: "slow down" }), {
      status: 429,
      headers: { "retry-after": "2" },
    })) as typeof fetch;
    await expect(client(limited).get("/api/v1/dex/market/rwa/platforms", {})).rejects.toMatchObject({
      category: "RATE_LIMITED",
      httpStatus: 429,
      retryAfterMs: 2000,
    });

    const broken = vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch;
    await expect(client(broken).get("/api/v1/dex/market/rwa/platforms", {})).rejects.toBeInstanceOf(KairosApiError);
    await expect(client(broken).get("/api/v1/dex/market/rwa/platforms", {})).rejects.toMatchObject({
      category: "MALFORMED_RESPONSE",
    });
  });
});
