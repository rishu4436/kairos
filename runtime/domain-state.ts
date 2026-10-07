import { exportArbitrationMemory, importArbitrationMemory, type StoredArbitrationSelection } from "@/arbitration/memory";
import { exportUserCandidates, importUserCandidates } from "@/lifecycle/candidates";
import { exportPromotionAudits, importPromotionAudits } from "@/lifecycle/promote";
import { exportUserPerformance, importUserPerformance } from "@/lifecycle/store";
import type { PromotionAudit, StrategyCandidate, StrategyPerformanceRecord, StrategyVersion } from "@/lifecycle/types";
import { exportStrategyVersions, importStrategyVersions } from "@/lifecycle/version";
import { asAgentId, asUserId } from "@/domain/ids";
import { readPaperBook } from "@/paper/store";
import { exportResearchBook, importResearchBook, type ResearchMemory } from "@/research/store";
import { assertPersistable, commitRecord, stateKey, type KairosStateStore } from "@/runtime/store";

export const DOMAIN_SNAPSHOT_VERSION = 1;
export const CONTEXT_RETENTION = 100;

export interface DecisionContextRecord {
  contextId: string;
  cycleId: string;
  userId: string;
  agentId: string;
  assetId: string;
  timestamp: string;
  strategyId: string | null;
  strategyVersion: string | null;
  lastDecision: string | null;
  thesisState: string | null;
  addCount: number | null;
  reduceCount: number | null;
  lastAddAt: string | null;
  lastReduceAt: string | null;
  entryContextId: string | null;
}

export interface DomainSnapshot {
  schemaVersion: typeof DOMAIN_SNAPSHOT_VERSION;
  userId: string;
  agentId: string;
  research: ResearchMemory;
  performance: StrategyPerformanceRecord[];
  candidates: StrategyCandidate[];
  versions: StrategyVersion[];
  audits: PromotionAudit[];
  arbitration: StoredArbitrationSelection[];
  contexts: DecisionContextRecord[];
  researchSchedule: { lastResearchAtMs: number | null };
}

const researchAt = new Map<string, number>();

function scheduleKey(userId: string, agentId: string): string {
  return `${userId}\n${agentId}`;
}

export function resetDurableDomainMemory(): void {
  researchAt.clear();
}

export function lastResearchAt(userId: string, agentId: string): number | null {
  return researchAt.get(scheduleKey(userId, agentId)) ?? null;
}

export function rememberResearchAt(userId: string, agentId: string, atMs: number): void {
  researchAt.set(scheduleKey(userId, agentId), atMs);
}

export function captureDomain(userId: string, agentId: string): DomainSnapshot {
  const candidates = exportUserCandidates(userId);
  return stripSecrets({
    schemaVersion: DOMAIN_SNAPSHOT_VERSION,
    userId,
    agentId,
    research: exportResearchBook(asUserId(userId), asAgentId(agentId)),
    performance: exportUserPerformance(userId),
    candidates,
    versions: exportStrategyVersions(),
    audits: exportPromotionAudits(candidates.map((candidate) => candidate.candidateId)),
    arbitration: exportArbitrationMemory(userId),
    contexts: contextsFromPaper(userId, agentId, "capture", new Date(0).toISOString()),
    researchSchedule: { lastResearchAtMs: lastResearchAt(userId, agentId) },
  });
}

export function restoreDomainIfEmpty(snapshot: DomainSnapshot): void {
  if (snapshot.schemaVersion !== DOMAIN_SNAPSHOT_VERSION) {
    throw new Error("STATE_INVALID");
  }
  const research = exportResearchBook(asUserId(snapshot.userId), asAgentId(snapshot.agentId));
  if (research.theses.length === 0 && research.proposals.length === 0 && research.experiments.length === 0) {
    importResearchBook(asUserId(snapshot.userId), asAgentId(snapshot.agentId), snapshot.research);
  }
  if (exportUserPerformance(snapshot.userId).length === 0 && snapshot.performance.length > 0) {
    importUserPerformance(snapshot.userId, snapshot.performance);
  }
  if (exportUserCandidates(snapshot.userId).length === 0 && snapshot.candidates.length > 0) {
    importStrategyVersions(snapshot.versions);
    importUserCandidates(snapshot.userId, snapshot.candidates);
    importPromotionAudits(snapshot.audits);
  }
  if (exportArbitrationMemory(snapshot.userId).length === 0 && snapshot.arbitration.length > 0) {
    importArbitrationMemory(snapshot.userId, snapshot.arbitration);
  }
  if (lastResearchAt(snapshot.userId, snapshot.agentId) === null && snapshot.researchSchedule.lastResearchAtMs !== null) {
    rememberResearchAt(snapshot.userId, snapshot.agentId, snapshot.researchSchedule.lastResearchAtMs);
  }
}

export function hydrateDomain(store: KairosStateStore, userId: string, agentId: string): void {
  const saved = store.get<DomainSnapshot>(stateKey(["domain", userId, agentId]));
  if (!saved || saved.schemaVersion !== DOMAIN_SNAPSHOT_VERSION) {
    return;
  }
  restoreDomainIfEmpty(saved.value);
}

export function persistDomain(store: KairosStateStore, userId: string, agentId: string, nowIso: string, cycleId: string): void {
  const key = stateKey(["domain", userId, agentId]);
  const previous = store.get<DomainSnapshot>(key)?.value;
  const captured = captureDomain(userId, agentId);
  const contexts = mergeContexts(previous?.contexts ?? [], contextsFromPaper(userId, agentId, cycleId, nowIso));
  const snapshot: DomainSnapshot = stripSecrets({ ...captured, contexts });
  assertPersistable(snapshot);
  commitRecord(store, key, snapshot, nowIso);
}

export function contextsFromPaper(userId: string, agentId: string, cycleId: string, timestamp: string): DecisionContextRecord[] {
  const book = readPaperBook(asUserId(userId), asAgentId(agentId));
  if (!book) {
    return [];
  }
  return [...book.metas.values()].map((meta) => ({
    contextId: meta.entryContextId ?? `${cycleId}:${meta.assetId}`,
    cycleId,
    userId,
    agentId,
    assetId: meta.assetId,
    timestamp,
    strategyId: meta.strategyId,
    strategyVersion: meta.strategyVersion,
    lastDecision: meta.lastDecision,
    thesisState: meta.thesisState,
    addCount: meta.addCount,
    reduceCount: meta.reduceCount,
    lastAddAt: meta.lastAddAt,
    lastReduceAt: meta.lastReduceAt,
    entryContextId: meta.entryContextId,
  }));
}

function mergeContexts(existing: readonly DecisionContextRecord[], incoming: readonly DecisionContextRecord[]): DecisionContextRecord[] {
  const merged = [...existing];
  for (const record of incoming) {
    const index = merged.findIndex((item) => item.contextId === record.contextId && item.cycleId === record.cycleId);
    if (index >= 0) {
      merged[index] = record;
    } else {
      merged.push(record);
    }
  }
  return merged.slice(-CONTEXT_RETENTION);
}

const SECRET_KEY = /api[_-]?key|private[_-]?key|authorization|secret|seed|password|pairing|credential/i;

function stripSecrets<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => walk(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) {
        continue;
      }
      out[key] = walk(entry);
    }
    return out;
  }
  if (typeof value === "string" && /BEGIN PRIVATE|FMP_API_KEY/.test(value)) {
    return "[redacted]";
  }
  return value;
}
