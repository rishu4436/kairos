import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BinanceWeb3Client } from "@/services/binance/client";
import { readBinanceConfig } from "@/services/binance/config";
import { createBinanceGateway } from "@/services/binance/gateway";
import { createMarketCandleGateway } from "@/services/binance/market/gateway";
import { observeWatchlist } from "@/observation/engine";
import { createUserWatchlist } from "@/domain/watchlist";
import { rowFromLive, emptyHealth } from "@/observation/board";
import { enrichBoard } from "@/observation/analyze";
import { ingestTokenSecurity } from "@/skills/store";
import { type TokenSecurityAssessment } from "@/skills/types";
import { buildResearchContext } from "@/research/context";
import { LazyRedisTransport } from "@/runtime/redis";
import { RedisKairosStateStore, commitRecord, stateKey } from "@/runtime/store";
import { serializeContext } from "@/context/snapshot";
import { writeIntelligenceEvidence } from "@/runtime/intelligence-evidence";
import { formatDecimal } from "@/domain/money";

const enabled = process.env.BINANCE_WEB3_LIVE_TEST === "1";

describe.skipIf(!enabled)("real market decision snapshot", () => {
  it("evaluates one BSC equity context and replays it from remote Redis", async () => {
    const calls: { endpoint: string; httpStatus: number; latencyMs: number; timestamp: string }[] = [];
    const config = readBinanceConfig();
    const client = new BinanceWeb3Client({ config, attempts: 1, fetchImpl: async (url, init) => {
      const parsed = new URL(String(url));
      if (!parsed.pathname.startsWith("/build/api/v1/dex/market/")) throw new Error("READ_ONLY_BOUNDARY");
      const start = Date.now();
      const response = await fetch(url, init);
      calls.push({ endpoint: parsed.pathname + parsed.search, httpStatus: response.status, latencyMs: Date.now() - start, timestamp: new Date().toISOString() });
      return response;
    } });
    const gateway = createBinanceGateway(client);
    const watchlist = createUserWatchlist("user_phase17i", ["TSLA"], "Read-only provider evidence");
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
    const skillEvidence = JSON.parse(readFileSync("docs/evidence/phase-17i-skills.json", "utf8")) as { audit: { assessment: TokenSecurityAssessment } };
    const assessment = skillEvidence.audit.assessment;
    expect(assessment.chainId).toBe(observation.representation.chainId);
    expect(assessment.contractAddress?.toLowerCase()).toBe(observation.representation.contractAddress.toLowerCase());
    ingestTokenSecurity({ userId: watchlist.userId, assessment, nowMs: Date.now() });
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
    const key = stateKey(["evidence", "phase17i", context.contextId]);
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
      const evidence = {
        label: "RECORDED REAL PROVIDER EVIDENCE", timestamp, provider: "BINANCE_WEB3",
        redisKey: key, persisted: true, replay: "PASS", contextId: context.contextId, cycleId: context.cycleId,
        calls, observation, row, context, research: research.context,
        history: { bar: "15m", count: candles.length, firstAt: new Date(candles[0].timestampMs).toISOString(),
          lastAt: new Date(candles.at(-1)!.timestampMs).toISOString(), ageMs: nowMs - candles.at(-1)!.timestampMs,
          candles: candles.map(candle => ({ timestampMs: candle.timestampMs, open: formatDecimal(candle.open, 6),
            high: formatDecimal(candle.high, 6), low: formatDecimal(candle.low, 6), close: formatDecimal(candle.close, 6),
            volume: candle.volume === null ? null : formatDecimal(candle.volume, 6), tradeCount: candle.tradeCount })),
        },
        quoteRequested: false, walletConnected: false, executionPrepared: false,
      };
      writeIntelligenceEvidence("phase-17i-market", evidence);
      console.log(JSON.stringify({ contextId: context.contextId, cycleId: context.cycleId, timestamp, representation: observation.representation,
        price: row.price, referencePrice: row.referencePrice, priceSourceAt: row.sourceTimestamp,
        candles: candles.length, candleLatestAt: evidence.history.lastAt, regime: row.regime,
        dataQuality: row.dataQuality, signals: row.signals.map(s => ({ strategy: s.strategyName, action: s.action, confidence: s.confidence, evaluation: s.evaluation })),
        arbitration: row.arbitration?.decision ?? "CONTEXT_BLOCKED", opportunity: context.opportunity.state, persisted: true, replay: "PASS" }));
    } finally { transport.close(); replayTransport.close(); }
  }, 90_000);
});
