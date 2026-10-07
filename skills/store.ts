import type { ExternalSignalFreshness } from "@/domain/arbitration";
import { dedupeExternalSignals, dedupeKey } from "@/skills/signal";
import type { AssetMapResult, ExternalSignal, SecurityEvent, SignalRead, SkillEvent, SkillEventType, TokenSecurityAssessment } from "@/skills/types";

interface StoredSignal {
  signal: ExternalSignal;
  assetId: string | null;
  mapStatus: AssetMapResult["status"];
}

interface UserBook {
  signals: StoredSignal[];
  assessments: TokenSecurityAssessment[];
  securityEvents: SecurityEvent[];
  events: SkillEvent[];
  failures: { skillId: string; message: string; at: string }[];
}

interface Memory {
  books: Map<string, UserBook>;
  sequence: number;
}

const GLOBAL_KEY = "__kairosSkillStore";

function memory(): Memory {
  const host = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Memory };
  if (!host[GLOBAL_KEY]) {
    host[GLOBAL_KEY] = { books: new Map(), sequence: 0 };
  }
  return host[GLOBAL_KEY];
}

function book(userId: string): UserBook {
  const store = memory();
  const existing = store.books.get(userId);
  if (existing) {
    return existing;
  }
  const created: UserBook = { signals: [], assessments: [], securityEvents: [], events: [], failures: [] };
  store.books.set(userId, created);
  return created;
}

export function resetSkillStore(): void {
  const store = memory();
  store.books.clear();
  store.sequence = 0;
}

export function publishSkillEvent(input: {
  userId: string;
  skillId: string;
  type: SkillEventType;
  agentId?: string | null;
  assetId?: string | null;
  payload?: Readonly<Record<string, string | number | boolean | null>>;
  freshness?: ExternalSignalFreshness | "NONE";
  source: string;
  nowMs: number;
}): SkillEvent {
  const store = memory();
  store.sequence += 1;
  const event: SkillEvent = {
    eventId: `skill_evt_${store.sequence}`,
    skillId: input.skillId,
    type: input.type,
    timestamp: new Date(input.nowMs).toISOString(),
    userId: input.userId,
    agentId: input.agentId ?? null,
    assetId: input.assetId ?? null,
    payload: input.payload ?? {},
    freshness: input.freshness ?? "NONE",
    source: input.source,
  };
  book(input.userId).events.push(event);
  return event;
}

export function ingestExternalSignal(input: {
  userId: string;
  agentId?: string | null;
  signal: ExternalSignal;
  map: AssetMapResult;
  nowMs: number;
}): SkillEvent {
  const user = book(input.userId);
  const incoming: StoredSignal = {
    signal: input.signal,
    assetId: input.map.status === "MAPPED" ? input.map.assetId : null,
    mapStatus: input.map.status,
  };
  const merged = dedupeExternalSignals([...user.signals.map((item) => item.signal), input.signal]);
  user.signals = merged.map((signal) => {
    if (dedupeKey(signal) === dedupeKey(input.signal)) {
      return { ...incoming, signal };
    }
    const previous = user.signals.find((item) => dedupeKey(item.signal) === dedupeKey(signal));
    return previous ?? { signal, assetId: null, mapStatus: "SIGNAL_UNRELATED" as const };
  });
  const type: SkillEventType = input.signal.freshness === "EXPIRED" || input.signal.freshness === "STALE" ? "SIGNAL_EXPIRED" : "SIGNAL_RECEIVED";
  return publishSkillEvent({
    userId: input.userId,
    agentId: input.agentId,
    skillId: "binance-trading-signal",
    type,
    assetId: input.map.status === "MAPPED" ? input.map.assetId : null,
    freshness: input.signal.freshness,
    source: input.signal.rawSourceReference,
    nowMs: input.nowMs,
    payload: {
      signalId: input.signal.signalId,
      direction: input.signal.direction,
      mapStatus: input.map.status,
    },
  });
}

export function ingestTokenSecurity(input: { userId: string; agentId?: string | null; assessment: TokenSecurityAssessment; nowMs: number }): SkillEvent {
  const user = book(input.userId);
  user.assessments = user.assessments.filter((item) => item.assetId !== input.assessment.assetId || item.contractAddress !== input.assessment.contractAddress);
  user.assessments.push(input.assessment);
  const unavailable = !input.assessment.available || !input.assessment.supported;
  return publishSkillEvent({
    userId: input.userId,
    agentId: input.agentId,
    skillId: "query-token-audit",
    type: unavailable ? "SECURITY_AUDIT_UNAVAILABLE" : "SECURITY_AUDIT_RECEIVED",
    assetId: input.assessment.assetId,
    source: input.assessment.source,
    nowMs: input.nowMs,
    payload: {
      available: input.assessment.available,
      supported: input.assessment.supported,
      riskLevel: input.assessment.riskLevel,
      riskLevelEnum: input.assessment.riskLevelEnum,
    },
  });
}

export function ingestSecurityEvent(input: { userId: string; agentId?: string | null; event: SecurityEvent; nowMs: number }): SkillEvent {
  const user = book(input.userId);
  user.securityEvents.push(input.event);
  return publishSkillEvent({
    userId: input.userId,
    agentId: input.agentId,
    skillId: "binance-tokenized-securities-info",
    type: "TOKEN_STATUS_RECEIVED",
    assetId: input.event.assetId,
    source: input.event.source,
    nowMs: input.nowMs,
    payload: {
      eventType: input.event.eventType,
      status: input.event.status,
    },
  });
}

/** A failure stays a failure. It does not become an empty successful read. */
export function recordSkillFailure(input: { userId: string; skillId: string; message: string; agentId?: string | null; nowMs: number }): SkillEvent {
  book(input.userId).failures.push({ skillId: input.skillId, message: input.message, at: new Date(input.nowMs).toISOString() });
  return publishSkillEvent({
    userId: input.userId,
    agentId: input.agentId,
    skillId: input.skillId,
    type: "SKILL_ERROR",
    source: input.skillId,
    nowMs: input.nowMs,
    payload: { message: input.message },
  });
}

export function readSignalState(userId: string, assetId: string | null): SignalRead {
  const user = book(userId);
  const failure = [...user.failures].reverse().find((item) => item.skillId === "binance-trading-signal");
  const signals = user.signals
    .filter((item) => (assetId === null ? item.mapStatus === "SIGNAL_UNRELATED" : item.mapStatus === "MAPPED" && item.assetId === assetId))
    .map((item) => item.signal);
  if (failure && assetId !== null) {
    return { kind: "SKILL_ERROR", signals, message: failure.message };
  }
  if (signals.length === 0) {
    return { kind: "NO_SIGNAL", signals: [] };
  }
  return { kind: "PRESENT", signals };
}

export interface AssetIntelligence {
  signals: readonly ExternalSignal[];
  signalRead: SignalRead;
  security: TokenSecurityAssessment | null;
  securityEvents: readonly SecurityEvent[];
  events: readonly SkillEvent[];
}

export function readAssetIntelligence(userId: string, assetId: string): AssetIntelligence {
  const user = book(userId);
  const signalRead = readSignalState(userId, assetId);
  return {
    signals: signalRead.signals,
    signalRead,
    security: user.assessments.find((item) => item.assetId === assetId) ?? null,
    securityEvents: user.securityEvents.filter((item) => item.assetId === assetId),
    events: user.events.filter((item) => item.userId === userId && (item.assetId === null || item.assetId === assetId)),
  };
}

export function listSkillEvents(userId: string): readonly SkillEvent[] {
  return book(userId).events.filter((event) => event.userId === userId);
}
