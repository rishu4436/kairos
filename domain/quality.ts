import type { FreshnessStatus } from "@/domain/freshness";

export type DataQualityStatus = "GOOD" | "DEGRADED" | "INSUFFICIENT" | "STALE";

export interface DataQuality {
  status: DataQualityStatus;
  historyPoints: number;
  latestAgeMs: number | null;
  referenceAgeMs: number | null;
  missingFields: readonly string[];
}

export function assessDataQuality(input: {
  historyPoints: number;
  requiredPoints: number;
  freshness: FreshnessStatus | "SAMPLE";
  latestAgeMs: number | null;
  referenceAgeMs: number | null;
  missingFields: readonly string[];
  fidelity: "live" | "paper";
}): DataQuality {
  const missing = [...input.missingFields];
  let status: DataQualityStatus = "GOOD";
  if (input.freshness === "STALE") {
    status = "STALE";
  } else if (input.historyPoints < input.requiredPoints || missing.length > 0) {
    status = "INSUFFICIENT";
  } else if (input.fidelity === "paper" || input.freshness === "AGING" || input.freshness === "UNKNOWN" || input.freshness === "SAMPLE") {
    status = "DEGRADED";
  }
  return {
    status,
    historyPoints: input.historyPoints,
    latestAgeMs: input.latestAgeMs,
    referenceAgeMs: input.referenceAgeMs,
    missingFields: missing,
  };
}
