import { publishStrategyVersion, setVersionStatus } from "@/lifecycle/version";
import type { ResearchLifecycle, StrategyCandidate } from "@/lifecycle/types";

interface Memory {
  candidates: StrategyCandidate[];
}

const KEY = "__kairosStrategyCandidates";

function memory(): Memory {
  const host = globalThis as typeof globalThis & { [KEY]?: Memory };
  if (!host[KEY]) {
    host[KEY] = { candidates: [] };
  }
  return host[KEY];
}

export function resetStrategyCandidates(): void {
  memory().candidates = [];
}

export function listStrategyCandidates(userId?: string): readonly StrategyCandidate[] {
  return memory().candidates.filter((candidate) => userId === undefined || candidate.userId === userId);
}

export function getStrategyCandidate(userId: string, candidateId: string): StrategyCandidate | null {
  return memory().candidates.find((candidate) => candidate.userId === userId && candidate.candidateId === candidateId) ?? null;
}

export function registerStrategyCandidate(input: Omit<StrategyCandidate, "strategyVersion" | "status" | "lastEvaluatedAt"> & { status?: ResearchLifecycle }): StrategyCandidate {
  const version = publishStrategyVersion({
    strategyId: input.strategyId,
    source: "RESEARCH_GENERATED",
    createdAt: input.createdAt,
    parameters: { action: input.action },
    definition: input.conditions.map((condition) => `${condition.feature} ${condition.operator} ${String(condition.threshold)}`).join("; "),
    status: "PROPOSED",
  });
  const candidate: StrategyCandidate = {
    ...input,
    strategyVersion: version.version,
    status: input.status ?? "PROPOSED",
    lastEvaluatedAt: null,
    conditions: input.conditions.map((condition) => ({ ...condition })),
  };
  memory().candidates.push(candidate);
  return candidate;
}

const RESEARCH_EDGES: Record<ResearchLifecycle, readonly ResearchLifecycle[]> = {
  PROPOSED: ["VALIDATING", "REJECTED"],
  VALIDATING: ["EXPERIMENTING", "REJECTED"],
  EXPERIMENTING: ["CANDIDATE", "REJECTED"],
  CANDIDATE: ["SHADOW", "REJECTED", "RETIRED"],
  SHADOW: ["PAPER_ACTIVE", "REJECTED", "RETIRED"],
  PAPER_ACTIVE: ["LIVE_ELIGIBLE", "REJECTED", "RETIRED"],
  LIVE_ELIGIBLE: ["REJECTED", "RETIRED"],
  REJECTED: ["RETIRED"],
  RETIRED: [],
};

export function transitionCandidate(userId: string, candidateId: string, status: ResearchLifecycle): StrategyCandidate {
  if (status === "LIVE_ACTIVE" as ResearchLifecycle) {
    throw new Error("RESEARCH_CANNOT_BECOME_LIVE");
  }
  const current = getStrategyCandidate(userId, candidateId);
  if (!current) {
    throw new Error("CANDIDATE_MISSING");
  }
  if (!(RESEARCH_EDGES[current.status] as readonly string[]).includes(status)) {
    throw new Error("LIFECYCLE_TRANSITION_REFUSED");
  }
  const next = { ...current, status };
  memory().candidates = memory().candidates.map((item) => (item.candidateId === candidateId && item.userId === userId ? next : item));
  setVersionStatus(next.strategyId, next.strategyVersion, status);
  return next;
}

export function markCandidateEvaluated(userId: string, candidateId: string, at: string): void {
  memory().candidates = memory().candidates.map((item) =>
    item.userId === userId && item.candidateId === candidateId ? { ...item, lastEvaluatedAt: at } : item,
  );
}

export function activateLiveCandidate(): { activated: false; reason: "LIVE_ACTIVATION_IS_NOT_ENABLED" } {
  return { activated: false, reason: "LIVE_ACTIVATION_IS_NOT_ENABLED" };
}

export function exportUserCandidates(userId: string): StrategyCandidate[] {
  return memory().candidates.filter((candidate) => candidate.userId === userId).map((candidate) => ({
    ...candidate,
    conditions: candidate.conditions.map((condition) => ({ ...condition })),
  }));
}

export function importUserCandidates(userId: string, candidates: readonly StrategyCandidate[]): void {
  const kept = memory().candidates.filter((candidate) => candidate.userId !== userId);
  const incoming = candidates.filter((candidate) => candidate.userId === userId && candidate.status !== ("LIVE_ACTIVE" as ResearchLifecycle));
  memory().candidates = [...kept, ...incoming.map((candidate) => ({ ...candidate, conditions: candidate.conditions.map((condition) => ({ ...condition })) }))];
}
