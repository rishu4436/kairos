import type { AgentRuntimeState } from "@/domain/models";
import { asAccountId, type AgentId, type UserId } from "@/domain/ids";
import type { PaperAccountState } from "@/domain/models";
import type { Scaled } from "@/domain/money";
import type { ObservationEventView } from "@/domain/observation";
import type { AgentTradeIntent } from "@/paper/intent";
import type { PositionMeta } from "@/paper/positions";
import type { ExecutionRecord } from "@/paper/records";

interface MutableBook {
  account: PaperAccountState;
  metas: Map<string, PositionMeta>;
  records: ExecutionRecord[];
  events: ObservationEventView[];
  lastIntentAt: Map<string, number>;
  loopState: AgentRuntimeState;
}

const books = new Map<string, MutableBook>();

function bookKey(userId: string, agentId: string): string {
  return `${userId}\n${agentId}`;
}

export function paperAccountId(userId: UserId): ReturnType<typeof asAccountId> {
  return asAccountId(`acct_paper_cycle_${userId}`);
}

export function resetPaperBooks(): void {
  books.clear();
}

/** Replaces one user/agent book. Used when a runtime reloads a persisted snapshot. */
export function replacePaperBook(userId: UserId, agentId: AgentId, book: MutableBook): void {
  if (book.account.userId !== userId || book.account.agentId !== agentId) {
    throw new Error("STATE_INVALID");
  }
  books.set(bookKey(userId, agentId), book);
}

export function readPaperBook(userId: UserId, agentId: AgentId): MutableBook | null {
  return books.get(bookKey(userId, agentId)) ?? null;
}

export function ensurePaperBook(userId: UserId, agentId: AgentId, startingCash: Scaled): MutableBook {
  const key = bookKey(userId, agentId);
  const existing = books.get(key);
  if (existing) {
    return existing;
  }
  const account: PaperAccountState = {
    accountId: paperAccountId(userId),
    userId,
    agentId,
    cash: startingCash,
    positions: [],
    realizedPnl: 0n,
    sessionStartEquity: startingCash,
    trades: [],
  };
  const created: MutableBook = {
    account,
    metas: new Map(),
    records: [],
    events: [],
    lastIntentAt: new Map(),
    loopState: "WAITING_FOR_RISK",
  };
  books.set(key, created);
  return created;
}

export function writeAccount(userId: UserId, agentId: AgentId, account: PaperAccountState): void {
  const book = books.get(bookKey(userId, agentId));
  if (!book || book.account.userId !== userId) {
    return;
  }
  book.account = account;
}

export function readLastIntentAt(userId: UserId, agentId: AgentId, dedupKey: string): number | null {
  return readPaperBook(userId, agentId)?.lastIntentAt.get(dedupKey) ?? null;
}

export function writeLoopState(userId: UserId, agentId: AgentId, state: AgentRuntimeState): void {
  const book = readPaperBook(userId, agentId);
  if (!book || book.account.userId !== userId) {
    return;
  }
  book.loopState = state;
}

export function stampIntent(userId: UserId, agentId: AgentId, dedupKey: string, atMs: number): void {
  readPaperBook(userId, agentId)?.lastIntentAt.set(dedupKey, atMs);
}

export function appendCycleEvent(userId: UserId, agentId: AgentId, event: ObservationEventView): void {
  const book = readPaperBook(userId, agentId);
  if (!book || event.userId !== userId) {
    return;
  }
  book.events.push(event);
  if (book.events.length > 80) {
    book.events.splice(0, book.events.length - 80);
  }
}

export function appendRecord(userId: UserId, agentId: AgentId, record: ExecutionRecord): void {
  const book = readPaperBook(userId, agentId);
  if (!book || book.account.userId !== record.intent.userId) {
    return;
  }
  book.records.push(record);
}

export function openIntent(userId: UserId, agentId: AgentId, assetId: string, nowMs: number): AgentTradeIntent | null {
  const book = readPaperBook(userId, agentId);
  if (!book) {
    return null;
  }
  return (
    book.records
      .map((record) => record.intent)
      .find((intent) => {
        if (intent.assetId !== assetId) {
          return false;
        }
        if (intent.status !== "RISK_PENDING" && intent.status !== "SIMULATION_PENDING" && intent.status !== "READY_FOR_PAPER") {
          return false;
        }
        return Date.parse(intent.expiresAt) > nowMs;
      }) ?? null
  );
}

export function putMeta(userId: UserId, agentId: AgentId, ticker: string, meta: PositionMeta): void {
  readPaperBook(userId, agentId)?.metas.set(ticker, meta);
}

export function dropMeta(userId: UserId, agentId: AgentId, ticker: string): void {
  readPaperBook(userId, agentId)?.metas.delete(ticker);
}
