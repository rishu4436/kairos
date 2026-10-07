import type { DataQuality } from "@/domain/quality";

export type SignalAction = "BUY" | "SELL" | "HOLD" | "NO_SIGNAL";

/** How the evaluation ended. HOLD is an action, not this field. */
export type EvaluationStatus = "VALID" | "SIGNAL" | "NO_SIGNAL" | "INSUFFICIENT_DATA" | "STALE_DATA";

export interface AnalyticalSignal {
  strategyId: string;
  strategyVersion: string;
  assetId: string;
  ticker: string;
  representationId: string;
  timestamp: string;
  action: SignalAction;
  evaluation: EvaluationStatus;
  /** 0 to 1. Zero when the evaluation did not fire a usable result. */
  confidence: number;
  reasons: readonly string[];
  evidence: readonly string[];
  featuresUsed: readonly string[];
  riskHints: readonly string[];
  validUntil: string;
  dataQuality: DataQuality;
  tags: readonly string[];
  /** Signals are not orders. This phase never sets this to true. */
  executable: false;
}

export function coherentSignal(signal: AnalyticalSignal): boolean {
  if (signal.executable !== false) {
    return false;
  }
  if (signal.confidence < 0 || signal.confidence > 1 || !Number.isFinite(signal.confidence)) {
    return false;
  }
  if (signal.evaluation === "INSUFFICIENT_DATA" || signal.evaluation === "STALE_DATA") {
    return signal.action === "NO_SIGNAL" && signal.confidence === 0;
  }
  if (signal.evaluation === "NO_SIGNAL") {
    return signal.action === "NO_SIGNAL" && signal.confidence === 0;
  }
  if (signal.evaluation === "VALID") {
    return signal.action === "HOLD";
  }
  if (signal.evaluation === "SIGNAL") {
    return signal.action === "BUY" || signal.action === "SELL" || signal.action === "HOLD";
  }
  return false;
}

/** Directional actions are still not orders. Insufficient and stale evaluations cannot carry one. */
export function hasDirectionalAction(signal: AnalyticalSignal): boolean {
  return signal.evaluation === "SIGNAL" && (signal.action === "BUY" || signal.action === "SELL");
}

export function serializeSignal(signal: AnalyticalSignal): string {
  if (!coherentSignal(signal)) {
    throw new Error("Refusing to serialize an incoherent strategy signal.");
  }
  return JSON.stringify(signal);
}

export function parseSignal(raw: string): AnalyticalSignal {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("Strategy signal JSON must be an object.");
  }
  const signal: AnalyticalSignal = {
    strategyId: requiredString(parsed, "strategyId"),
    strategyVersion: requiredString(parsed, "strategyVersion"),
    assetId: requiredString(parsed, "assetId"),
    ticker: requiredString(parsed, "ticker"),
    representationId: requiredString(parsed, "representationId"),
    timestamp: requiredString(parsed, "timestamp"),
    action: requiredAction(parsed.action),
    evaluation: requiredEvaluation(parsed.evaluation),
    confidence: requiredConfidence(parsed.confidence),
    reasons: requiredStrings(parsed.reasons),
    evidence: requiredStrings(parsed.evidence),
    featuresUsed: requiredStrings(parsed.featuresUsed),
    riskHints: requiredStrings(parsed.riskHints),
    validUntil: requiredString(parsed, "validUntil"),
    dataQuality: requiredQuality(parsed.dataQuality),
    tags: requiredStrings(parsed.tags),
    executable: false,
  };
  if (parsed.executable !== false) {
    throw new Error("A strategy signal cannot be marked executable.");
  }
  if (!coherentSignal(signal)) {
    throw new Error("Strategy signal evaluation and action do not agree.");
  }
  if (signal.dataQuality.status === "STALE" && signal.evaluation !== "STALE_DATA") {
    throw new Error("Stale data cannot be evaluated as fresh.");
  }
  if (signal.dataQuality.status === "GOOD" && signal.evaluation === "STALE_DATA") {
    throw new Error("A stale evaluation cannot claim good data.");
  }
  return signal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Strategy signal is missing ${key}.`);
  }
  return value;
}

function requiredAction(value: unknown): SignalAction {
  if (value === "BUY" || value === "SELL" || value === "HOLD" || value === "NO_SIGNAL") {
    return value;
  }
  throw new Error("Strategy signal action is not recognized.");
}

function requiredEvaluation(value: unknown): EvaluationStatus {
  if (
    value === "VALID" ||
    value === "SIGNAL" ||
    value === "NO_SIGNAL" ||
    value === "INSUFFICIENT_DATA" ||
    value === "STALE_DATA"
  ) {
    return value;
  }
  throw new Error("Strategy signal evaluation is not recognized.");
}

function requiredConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Strategy signal confidence must be between 0 and 1.");
  }
  return value;
}

function requiredStrings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Strategy signal lists must be strings.");
  }
  return value;
}

function requiredQuality(value: unknown): DataQuality {
  if (!isRecord(value)) {
    throw new Error("Strategy signal data quality is missing.");
  }
  const status = value.status;
  if (status !== "GOOD" && status !== "DEGRADED" && status !== "INSUFFICIENT" && status !== "STALE") {
    throw new Error("Data quality status is not recognized.");
  }
  if (typeof value.historyPoints !== "number") {
    throw new Error("Data quality history depth is missing.");
  }
  return {
    status,
    historyPoints: value.historyPoints,
    latestAgeMs: typeof value.latestAgeMs === "number" ? value.latestAgeMs : null,
    referenceAgeMs: typeof value.referenceAgeMs === "number" ? value.referenceAgeMs : null,
    missingFields: requiredStrings(value.missingFields),
  };
}
