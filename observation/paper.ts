import { createDemoSession } from "@/data/sample-session";
import type { Candle } from "@/domain/candle";
import type { PaperExecutionCapability } from "@/domain/execution-authority";
import { formatDecimal } from "@/domain/money";
import type { ObservationBoard, ObservationRow } from "@/domain/observation";
import { DEFAULT_FRESHNESS_POLICY } from "@/domain/freshness";
import { asUserId } from "@/domain/ids";
import { readPaperBook } from "@/paper/store";
import { DEMO_USER_ID, demoWatchlist } from "@/domain/watchlist";
import { formatClock } from "@/lib/format";
import { blankIntelligence } from "@/observation/board";
import { enrichBoard } from "@/observation/analyze";
import { buildPaperSeries } from "@/observation/paper-series";
import { marketHistory, signalLog } from "@/observation/stores";
import { runPreparedAgentCycle } from "@/paper/cycle";
import { readRefreshIntervalMs } from "@/services/binance/config";

export interface PaperObservationBuild {
  board: ObservationBoard;
  candles: Map<string, readonly Candle[]>;
}

export function paperObservationBoard(
  userId: string,
  options: { now?: Date; authority: PaperExecutionCapability },
): ObservationBoard {
  const now = options.now ?? new Date();
  const built = buildPaperObservation(userId, now);
  if (!built.board.ok || userId !== DEMO_USER_ID) {
    return built.board;
  }
  const session = createDemoSession();
  const cycle = runPreparedAgentCycle({
    authority: options.authority,
    userId: session.policy.userId,
    agentId: session.policy.agentId,
    board: built.board,
    candles: built.candles,
    riskPolicy: session.policy,
    nowMs: now.getTime(),
  });
  if (!cycle.ran || cycle.view === null) {
    return built.board;
  }
  const persisted = readPaperBook(asUserId(DEMO_USER_ID), session.agent.id)?.events ?? cycle.events;
  return {
    ...built.board,
    events: [...built.board.events, ...persisted].slice(-200),
    paperCycle: cycle.view,
  };
}

export function buildPaperObservation(userId: string, now = new Date()): PaperObservationBuild {
  const watchlist = demoWatchlist(DEMO_USER_ID);
  const at = now.toISOString();
  if (userId !== DEMO_USER_ID) {
    const board: ObservationBoard = {
      ok: false,
      dataMode: "paper",
      refreshIntervalMs: readRefreshIntervalMs(),
      freshMaxMs: DEFAULT_FRESHNESS_POLICY.freshMaxMs,
      agingMaxMs: DEFAULT_FRESHNESS_POLICY.agingMaxMs,
      generatedAt: at,
      userId,
      watchlistId: "",
      health: {
        connection: "offline",
        reason: "No watchlist is stored for this user.",
        httpStatus: null,
        lastSuccessAt: null,
        rwa: "skipped",
        market: "skipped",
        history: "skipped",
      },
      rows: [],
      unresolved: [],
      events: [],
      recentEvaluations: [],
      error: {
        category: "DATA_UNAVAILABLE",
        message: "No watchlist is stored for this user.",
        httpStatus: null,
      },
    };
    return { board, candles: new Map() };
  }
  const session = createDemoSession();
  const rows: ObservationRow[] = session.watchlist.map((item) => ({
      id: `paper:${item.asset.ticker}`,
      ticker: item.asset.ticker,
      companyName: item.asset.name,
      tokenSymbol: item.asset.tokenizedSymbol,
      platformLabel: "Paper sample",
      chainLabel: "Not resolved",
      contractAddress: null,
      price: formatDecimal(item.price, 2),
      referencePrice: null,
      deviationPct: null,
      change24hPct: item.change24hBps / 100,
      session: "UNKNOWN",
      sessionLabel: "UNKNOWN",
      rawMarketStatus: null,
      freshness: "SAMPLE",
      freshnessLabel: "SAMPLE",
      ageMs: null,
      sourceTimestamp: null,
      receivedAt: at,
      volume24hUsd: null,
      nextOpenAt: null,
      reasonMessage: null,
      fidelity: "paper",
      representationId: `paper:${item.asset.ticker}`,
      ...blankIntelligence(),
    }));

  const board: ObservationBoard = {
    ok: true,
    dataMode: "paper",
    refreshIntervalMs: readRefreshIntervalMs(),
    freshMaxMs: DEFAULT_FRESHNESS_POLICY.freshMaxMs,
    agingMaxMs: DEFAULT_FRESHNESS_POLICY.agingMaxMs,
    generatedAt: at,
    userId: watchlist.userId,
    watchlistId: watchlist.id,
    health: {
      connection: "offline",
      reason: "Paper / mock mode does not call Binance.",
      httpStatus: null,
      lastSuccessAt: null,
      rwa: "skipped",
      market: "skipped",
      history: "skipped",
    },
    rows,
    unresolved: [],
    events: [
      { id: `${at}:paper`, at, clock: formatClock(at), type: "NOTE", message: "Paper snapshot loaded" },
      ...rows.map((row) => ({
        id: `${at}:${row.ticker}`,
        at,
        clock: formatClock(at),
        type: "NOTE" as const,
        message: `${row.ticker} observation is sample data`,
      })),
      { id: `${at}:none`, at, clock: formatClock(at), type: "NOTE" as const, message: "No Binance request was sent" },
    ],
    recentEvaluations: [],
    error: null,
  };
  const candles = new Map<string, readonly Candle[]>();
  for (const row of board.rows) {
    const series = buildPaperSeries(row.ticker, row.price, now.getTime());
    marketHistory.append(row.representationId, series);
    candles.set(row.representationId, marketHistory.queryRecent(row.representationId, 100));
  }
  return {
    board: enrichBoard(board, {
      candles,
      asOfMs: now.getTime(),
      historyHealth: "skipped",
      record: (signal) => signalLog.record(signal),
    }),
    candles,
  };
}

