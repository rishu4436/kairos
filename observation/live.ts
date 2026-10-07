import type { ObservationBoard } from "@/domain/observation";
import { configuredWatchlist, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { observeWatchlist } from "@/observation/engine";
import { emptyHealth, observationEvents, rowFromLive } from "@/observation/board";
import { noteLiveSuccess, readLastSuccess } from "@/observation/health-memory";
import { enrichBoard } from "@/observation/analyze";
import { warmUnderlyingEvents } from "@/events/service";
import { markCandlesFailed, markCandlesFetched, marketHistory, shouldFetchCandles, signalLog } from "@/observation/stores";
import { BinanceWeb3Client } from "@/services/binance/client";
import { readBinanceConfig, readRefreshIntervalMs } from "@/services/binance/config";
import { KairosApiError, safeMessage } from "@/services/binance/errors";
import { createBinanceGateway } from "@/services/binance/gateway";
import { createMarketCandleGateway } from "@/services/binance/market/gateway";
import { CANDLE_REFRESH_MS, CANDLE_RETRY_MS } from "@/strategies/parameters";
import type { Candle } from "@/domain/candle";
import { publishPublicMarketSnapshot } from "@/studio/intelligence";

export async function liveObservationBoard(userId: string, signal?: AbortSignal): Promise<ObservationBoard> {
  if (userId !== LOCAL_RUNTIME_USER_ID) {
    throw new KairosApiError({
      category: "DATA_UNAVAILABLE",
      safeMessage: "No watchlist is stored for this user.",
      technicalMessage: "Only the local operating user has a watchlist in this phase.",
    });
  }
  const config = readBinanceConfig();
  const watchlist = configuredWatchlist(userId);
  const receivedAt = new Date();
  const gateway = createBinanceGateway(new BinanceWeb3Client({ config }));
  const run = await observeWatchlist({
    watchlist,
    gateway,
    receivedAtMs: receivedAt.getTime(),
    policy: { freshMaxMs: config.freshMaxMs, agingMaxMs: config.agingMaxMs },
    signal,
  });
  const at = receivedAt.toISOString();
  noteLiveSuccess(at);
  const rows = run.observations.map(rowFromLive);
  const candles = new Map<string, Candle[]>();
  const candleGateway = createMarketCandleGateway(new BinanceWeb3Client({ config }));
  let historyHealth: "ok" | "error" | "skipped" = rows.length === 0 ? "skipped" : "ok";
  for (const observation of run.observations) {
    const key = observation.representation.id;
    const now = receivedAt.getTime();
    if (shouldFetchCandles(key, now, CANDLE_REFRESH_MS, CANDLE_RETRY_MS)) {
      try {
        const fetched = await candleGateway.getCandles(
          {
            binanceChainId: observation.representation.chainId,
            tokenContractAddress: observation.representation.contractAddress,
          },
          signal,
        );
        marketHistory.append(key, fetched);
        markCandlesFetched(key, now);
      } catch (error) {
        historyHealth = "error";
        markCandlesFailed(key, now);
        if (error instanceof KairosApiError) {
          logBinanceFailure(error);
        } else {
          console.error("[kairos.binance]", {
            category: "UNKNOWN_ERROR",
          });
        }
      }
    }
    candles.set(key, marketHistory.queryRecent(key, 100));
  }
  for (const row of rows) {
    publishPublicMarketSnapshot(row, candles.get(row.representationId) ?? [], receivedAt.getTime());
  }
  const board = {
    ok: true as const,
    dataMode: "live" as const,
    refreshIntervalMs: config.refreshIntervalMs,
    freshMaxMs: config.freshMaxMs,
    agingMaxMs: config.agingMaxMs,
    generatedAt: at,
    userId: watchlist.userId,
    watchlistId: watchlist.id,
    health: {
      connection: "connected" as const,
      reason: historyHealth === "error" ? "Candle history request failed" : null,
      httpStatus: null,
      lastSuccessAt: at,
      rwa: "ok" as const,
      market: "ok" as const,
      history: historyHealth,
    },
    rows,
    unresolved: run.unresolved,
    events: observationEvents(rows, at),
    recentEvaluations: [],
    error: null,
  };
  await warmUnderlyingEvents({
    tickers: [...watchlist.tickers, ...rows.map((row) => row.ticker)],
    nowMs: receivedAt.getTime(),
    fidelity: "live",
  });
  return enrichBoard(board, {
    candles,
    asOfMs: receivedAt.getTime(),
    historyHealth,
    record: (signal) => signalLog.record(signal),
  });
}

export function failureBoard(
  error: KairosApiError,
  dataMode: "live" | "paper",
  userId: string = LOCAL_RUNTIME_USER_ID,
): ObservationBoard {
  const at = new Date().toISOString();
  const health = emptyHealth(readLastSuccess());
  health.reason = failureReason(error);
  health.httpStatus = error.httpStatus;
  health.rwa = "error";
  health.market = "error";
  health.history = "skipped";
  return {
    ok: false,
    dataMode,
    refreshIntervalMs: refreshIntervalOrDefault(),
    freshMaxMs: 30_000,
    agingMaxMs: 120_000,
    generatedAt: at,
    userId,
    watchlistId: "",
    health,
    rows: [],
    unresolved: [],
    events: [],
    recentEvaluations: [],
    error: {
      category: error.category,
      message: error.safeMessage,
      httpStatus: error.httpStatus,
    },
  };
}

export function logBinanceFailure(error: KairosApiError): void {
  console.error("[kairos.binance]", {
    category: error.category,
    httpStatus: error.httpStatus,
  });
}

function refreshIntervalOrDefault(): number {
  try {
    return readRefreshIntervalMs();
  } catch {
    return 15_000;
  }
}

function failureReason(error: KairosApiError): string {
  if (error.safeMessage === "API credentials missing") {
    return "API credentials missing";
  }
  if (error.httpStatus) {
    return `Request failed HTTP ${error.httpStatus}`;
  }
  return error.safeMessage || safeMessage(error.category);
}
