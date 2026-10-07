import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BinanceWeb3Client } from "@/services/binance/client";
import { readBinanceConfig } from "@/services/binance/config";
import { createBinanceGateway } from "@/services/binance/gateway";
import { createMarketCandleGateway } from "@/services/binance/market/gateway";
import { observeWatchlist } from "@/observation/engine";
import { createUserWatchlist } from "@/domain/watchlist";
import { rowFromLive, emptyHealth } from "@/observation/board";
import { enrichBoard } from "@/observation/analyze";
import { buildResearchContext } from "@/research/context";
import { LazyRedisTransport } from "@/runtime/redis";
import { RedisKairosStateStore, commitRecord, stateKey } from "@/runtime/store";
import { serializeContext } from "@/context/snapshot";

const enabled = process.env.BINANCE_MARKET_LIVE_TEST === "1" && process.env.KAIROS_REDIS_LIVE_TEST === "1" && process.env.KAIROS_STATE_BACKEND === "redis" && Boolean(process.env.BINANCE_WEB3_API_KEY) && Boolean(process.env.BINANCE_WEB3_SECRET_KEY) && Boolean(process.env.REDIS_URL);

describe.skipIf(!enabled)("real market decision snapshot", () => {
  it("evaluates one BSC equity context and replays it from remote Redis", async () => {

    const config = readBinanceConfig();
    const client = new BinanceWeb3Client({ config, attempts: 1, fetchImpl: async (url, init) => {
      const parsed = new URL(String(url));
      if (!parsed.pathname.startsWith("/build/api/v1/dex/market/")) throw new Error("READ_ONLY_BOUNDARY");

      const response = await fetch(url, init);
      return response;
    } });
    const gateway = createBinanceGateway(client);
    const watchlist = createUserWatchlist("user_integration", ["TSLA"], "Read-only market integration");
    const hits = await gateway.search("TSLA");
    const filtered = hits.filter(hit => hit.ticker === "TSLA").map(hit => ({ ...hit,
      assets: hit.assets?.filter(asset => asset.binanceChainId === "56" && asset.platformId === "ondo"),
    }));
    expect(filtered.some(hit => (hit.assets?.length ?? 0) > 0)).toBe(true);
    const run = await observeWatchlist({
      watchlist, gateway: { ...gateway, search: async () => filtered }, receivedAtMs: Date.now(),
      policy: { freshMaxMs: config.freshMaxMs, agingMaxMs: config.agingMaxMs },
    });
    expect(run.observations).toHaveLength(1);
    const observation = run.observations[0];
    const candles = await createMarketCandleGateway(client).getCandles({
      binanceChainId: observation.representation.chainId,
      tokenContractAddress: observation.representation.contractAddress,
      bar: "15m", limit: 100,
    });
    expect(candles.length).toBeGreaterThan(0);
    expect(candles.every((candle, index) => index === 0 || candle.timestampMs > candles[index - 1].timestampMs)).toBe(true);
    expect(candles.every(candle => candle.high >= candle.low && candle.open > 0n && candle.close > 0n
      && candle.high >= candle.open && candle.high >= candle.close && candle.low <= candle.open && candle.low <= candle.close)).toBe(true);
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    const board = enrichBoard({
      ok: true, dataMode: "live", userId: watchlist.userId, watchlistId: watchlist.id,
      generatedAt: timestamp, refreshIntervalMs: config.refreshIntervalMs,
      freshMaxMs: config.freshMaxMs, agingMaxMs: config.agingMaxMs,
      health: { ...emptyHealth(timestamp), connection: "connected", rwa: "ok", market: "ok", history: "ok" },
      rows: [rowFromLive(observation)], unresolved: run.unresolved, events: [], recentEvaluations: [], error: null,
    }, { candles: new Map([[observation.representation.id, candles]]), asOfMs: nowMs, historyHealth: "ok" });
    const row = board.rows[0];
    const context = row.kairos;
    expect(context).toBeDefined();
    if (!context) throw new Error("CONTEXT_UNAVAILABLE");
    expect(row.fidelity).toBe("live");
    expect(row.signals).toHaveLength(3);
    expect(context.identity.underlyingTicker).toBe("TSLA");
    const research = buildResearchContext({ userId: watchlist.userId, agentId: context.agentId,
      row, candles, watchlist: watchlist.tickers, dataSource: "LIVE_BINANCE_HISTORY", nowMs });
    expect(research.context.newsContext.status).toBe("UNAVAILABLE");
    expect(research.context.earningsContext.status).toBe("UNAVAILABLE");
    const key = stateKey(["test", randomUUID(), context.contextId]);
    const url = process.env.REDIS_URL;
    if (!url || process.env.KAIROS_STATE_BACKEND !== "redis") throw new Error("REDIS_REQUIRED");
    const transport = new LazyRedisTransport(url);
    const replayTransport = new LazyRedisTransport(url);
    try {
      const store = new RedisKairosStateStore(url, transport);
      commitRecord(store, key, { context, row, research: research.context }, timestamp);
      const restored = new RedisKairosStateStore(url, replayTransport).get<{ context: typeof context; row: typeof row; research: typeof research.context }>(key);
      expect(serializeContext(restored!.value.context)).toBe(serializeContext(context));
      expect(restored!.value.row).toEqual(row);
      expect(restored!.value.research).toEqual(research.context);
    } finally { try { transport.command(["DEL", key]); } finally { transport.close(); replayTransport.close(); } }
  }, 90_000);
});
