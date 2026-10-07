import type { EntryContextSnapshot, KAIROSContext } from "@/context/types";

/** Keep the comparison small. Secrets and raw provider payloads are not copied. */
export function captureEntrySnapshot(
  context: KAIROSContext,
  strategyId: string,
  entryPrice: string,
  at: string,
): EntryContextSnapshot {
  const signal = context.strategySignals.value?.signals.find((item) => item.strategyId === strategyId) ?? null;
  const health = context.strategyHealth.value?.reports.find((item) => item.strategyId === strategyId) ?? null;
  const features = context.features.value?.features ?? [];
  const distance = features.find((feature) => feature.id === "distance_from_mean")?.value ?? null;
  const externalSignals = context.externalSignals.value?.signals.filter((item) => item.relevance === "MAPPED") ?? [];
  const events = context.eventContext.value?.events ?? [];
  return {
    entryContextId: context.contextId,
    entryCycleId: context.cycleId,
    entryStrategySignal: {
      strategyId,
      action: signal?.action ?? "BUY",
      evaluation: signal?.evaluation ?? "UNKNOWN",
      confidence: signal?.confidence ?? null,
    },
    entryRegime: context.regime.value?.regime ?? null,
    entrySession: context.session.value?.session ?? null,
    entryPrice,
    entryStrategyHealth: health
      ? { status: health.status, sample: health.sample, sampleSize: health.sampleSize }
      : null,
    entryExternalEvidence:
      context.externalSignals.status === "UNAVAILABLE" || context.externalSignals.value === null
        ? null
        : {
            mappedDirections: externalSignals
              .map((item) => item.direction)
              .filter((direction): direction is "BUY" | "SELL" => direction === "BUY" || direction === "SELL"),
            freshness: context.externalSignals.freshness,
          },
    entryEventState:
      context.eventContext.status === "UNAVAILABLE" || context.eventContext.value === null
        ? null
        : {
            activeTypes: events.map((event) => event.type),
            restriction: events.some((event) => event.severity === "RESTRICTION"),
          },
    entryTimestamp: at,
    entryFeatures: {
      trend: features.find((feature) => feature.id === "trend")?.value ?? null,
      distanceFromMeanBps: percentToBps(distance),
    },
  };
}

/** Parse a feature printed as +1.20% or -2.40% back into basis points. */
export function percentToBps(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = value.trim().match(/^([+-])?(\d+)\.(\d+)%$/);
  if (!match) {
    return null;
  }
  const whole = Number(match[2]);
  const frac = Number(match[3].padEnd(2, "0").slice(0, 2));
  if (!Number.isInteger(whole) || !Number.isInteger(frac)) {
    return null;
  }
  const bps = whole * 100 + frac;
  return match[1] === "-" ? -bps : bps;
}
