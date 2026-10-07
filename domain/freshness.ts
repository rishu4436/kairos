export type FreshnessStatus = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

/** KAIROS policy. These thresholds are not returned by Binance. */
export interface FreshnessPolicy {
  freshMaxMs: number;
  agingMaxMs: number;
}

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  freshMaxMs: 30_000,
  agingMaxMs: 120_000,
};

export interface DataFreshness {
  sourceTimestamp: string | null;
  receivedAt: string;
  ageMs: number | null;
  status: FreshnessStatus;
}

/**
 * Classifies age from the source timestamp to the time KAIROS received the payload.
 * A missing source time is UNKNOWN, even when the response just arrived.
 * A source time more than five seconds in the future is UNKNOWN.
 */
export function classifyFreshness(
  sourceTimestampMs: number | null,
  receivedAtMs: number,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): DataFreshness {
  const receivedAt = new Date(receivedAtMs).toISOString();
  if (sourceTimestampMs === null || !Number.isFinite(sourceTimestampMs)) {
    return { sourceTimestamp: null, receivedAt, ageMs: null, status: "UNKNOWN" };
  }
  const ageMs = receivedAtMs - sourceTimestampMs;
  if (!Number.isFinite(ageMs) || ageMs < -5_000) {
    return {
      sourceTimestamp: new Date(sourceTimestampMs).toISOString(),
      receivedAt,
      ageMs: null,
      status: "UNKNOWN",
    };
  }
  const age = Math.max(0, ageMs);
  let status: FreshnessStatus = "STALE";
  if (age < policy.freshMaxMs) {
    status = "FRESH";
  } else if (age < policy.agingMaxMs) {
    status = "AGING";
  }
  return {
    sourceTimestamp: new Date(sourceTimestampMs).toISOString(),
    receivedAt,
    ageMs: age,
    status,
  };
}

export function formatAge(ageMs: number | null): string {
  if (ageMs === null) {
    return "age unknown";
  }
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function freshnessLabel(status: FreshnessStatus, ageMs: number | null, fidelity: "live" | "paper"): string {
  if (fidelity === "paper") {
    return "SAMPLE";
  }
  return `${status} · ${formatAge(ageMs)}`;
}
