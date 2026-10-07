import { localPaperSession } from "@/paper/session";
import type { Candle } from "@/domain/candle";
import type { PaperExecutionCapability } from "@/domain/execution-authority";
import type { ObservationBoard, ObservationRow } from "@/domain/observation";
import { DEFAULT_FRESHNESS_POLICY } from "@/domain/freshness";
import { asUserId } from "@/domain/ids";
import { readPaperBook } from "@/paper/store";
import { DEMO_USER_ID, demoWatchlist } from "@/domain/watchlist";
import { enrichBoard } from "@/observation/analyze";
import { runPreparedAgentCycle } from "@/paper/cycle";
import { readRefreshIntervalMs } from "@/services/binance/config";

export interface PaperObservationBuild {
  board: ObservationBoard;
  candles: Map<string, readonly Candle[]>;
}
interface PaperObservationInput {
  rows: ObservationRow[];
  candles: Map<string, readonly Candle[]>;
}

/** Replay inputs are explicitly supplied by the server, scoped, and empty by default. */
const paperInputs = new Map<string, (now: Date) => PaperObservationInput>();
export function setPaperObservationInput(userId: string, read: (now: Date) => PaperObservationInput): void {
  paperInputs.set(userId, read);
}
export function resetPaperObservationInputs(): void { paperInputs.clear(); }

export function paperObservationBoard(userId: string, options: { now?: Date; authority: PaperExecutionCapability }): ObservationBoard {
  const now = options.now ?? new Date();
  const built = buildPaperObservation(userId, now);
  if (!built.board.ok || userId !== DEMO_USER_ID) return built.board;
  const session = localPaperSession()!;
  const cycle = runPreparedAgentCycle({
    authority: options.authority, userId: session.policy.userId, agentId: session.policy.agentId,
    board: built.board, candles: built.candles, riskPolicy: session.policy, nowMs: now.getTime(),
  });
  if (!cycle.ran || cycle.view === null) return built.board;
  const persisted = readPaperBook(asUserId(DEMO_USER_ID), session.agent.id)?.events ?? cycle.events;
  return { ...built.board, events: [...built.board.events, ...persisted].slice(-200), paperCycle: cycle.view };
}

export function buildPaperObservation(userId: string, now = new Date()): PaperObservationBuild {
  const owned = userId === DEMO_USER_ID;
  const watchlist = owned ? demoWatchlist(userId) : null;
  const input = owned ? paperInputs.get(userId)?.(now) : null;
  const rows = input?.rows ?? [];
  const candles = input?.candles ?? new Map<string, readonly Candle[]>();
  const reason = owned ? "No paper market input is configured." : "No watchlist is stored for this user.";
  const board: ObservationBoard = {
    ok: rows.length > 0, dataMode: "paper", refreshIntervalMs: readRefreshIntervalMs(),
    freshMaxMs: DEFAULT_FRESHNESS_POLICY.freshMaxMs, agingMaxMs: DEFAULT_FRESHNESS_POLICY.agingMaxMs,
    generatedAt: now.toISOString(), userId, watchlistId: watchlist?.id ?? "",
    health: {
      connection: "offline", reason: rows.length ? "Explicit paper input; no Binance request." : reason,
      httpStatus: null, lastSuccessAt: null, rwa: "skipped", market: "skipped", history: "skipped",
    },
    rows, unresolved: [], events: [], recentEvaluations: [],
    error: rows.length ? null : { category: "DATA_UNAVAILABLE", message: reason, httpStatus: null },
  };
  return { board: rows.length ? enrichBoard(board, { candles, asOfMs: now.getTime(), historyHealth: "skipped" }) : board, candles };
}
