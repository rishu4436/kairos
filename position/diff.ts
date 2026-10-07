import type { EntryContextSnapshot, KAIROSContext, PositionCycleSnapshot } from "@/context/types";

export interface PositionFieldDiff {
  entry: string | null;
  previous: string | null;
  current: string | null;
  changed: boolean;
}

/** Deterministic comparison. A model does not write these values. */
export interface PositionContextDiff {
  price: PositionFieldDiff;
  regime: PositionFieldDiff;
  session: PositionFieldDiff;
  strategyAction: PositionFieldDiff;
  strategyHealth: PositionFieldDiff;
  externalConfirmation: PositionFieldDiff;
  security: PositionFieldDiff;
  events: PositionFieldDiff;
}

export function captureCycleSnapshot(context: KAIROSContext): PositionCycleSnapshot {
  const position = context.positionContext?.value ?? null;
  const originId = position?.originStrategy ?? position?.entry?.entryStrategySignal.strategyId ?? null;
  const signal = originId ? (context.strategySignals?.value?.signals.find((item) => item.strategyId === originId) ?? null) : null;
  const health = originId ? (context.strategyHealth?.value?.reports.find((item) => item.strategyId === originId) ?? null) : null;
  const events = (context.eventContext?.value?.events ?? []).filter((event) => event.active).map((event) => event.type);
  return {
    cycleId: context.cycleId,
    price: context.market?.value?.price ?? position?.currentMark ?? null,
    regime: context.regime?.value?.regime ?? null,
    session: context.session?.value?.session ?? null,
    strategyAction: signal ? `${signal.strategyId}:${signal.action}` : null,
    strategyHealth: health?.status ?? null,
    externalConfirmation: externalLabel(context),
    security: context.tokenSecurity?.value?.label ?? context.tokenSecurity?.status ?? null,
    events,
  };
}

export function diffPositionContext(input: {
  entry: EntryContextSnapshot | null;
  previous: PositionCycleSnapshot | null;
  current: PositionCycleSnapshot;
}): PositionContextDiff {
  const entryExternal = input.entry?.entryExternalEvidence?.mappedDirections.join(",") || (input.entry ? "unavailable" : null);
  const entryEvents = input.entry?.entryEventState?.activeTypes.join(",") ?? (input.entry ? "unavailable" : null);
  return {
    price: field(input.entry?.entryPrice ?? null, input.previous?.price ?? null, input.current.price),
    regime: field(input.entry?.entryRegime ?? null, input.previous?.regime ?? null, input.current.regime),
    session: field(input.entry?.entrySession ?? null, input.previous?.session ?? null, input.current.session),
    strategyAction: field(
      input.entry ? `${input.entry.entryStrategySignal.strategyId}:${input.entry.entryStrategySignal.action}` : null,
      input.previous?.strategyAction ?? null,
      input.current.strategyAction,
    ),
    strategyHealth: field(input.entry?.entryStrategyHealth?.status ?? null, input.previous?.strategyHealth ?? null, input.current.strategyHealth),
    externalConfirmation: field(entryExternal, input.previous?.externalConfirmation ?? null, input.current.externalConfirmation),
    security: field(null, input.previous?.security ?? null, input.current.security),
    events: field(entryEvents, input.previous ? input.previous.events.join(",") : null, input.current.events.join(",")),
  };
}

export function changedLines(diff: PositionContextDiff): string[] {
  const labels: Record<keyof PositionContextDiff, string> = {
    price: "Price",
    regime: "Regime",
    session: "Session",
    strategyAction: "Strategy",
    strategyHealth: "Health",
    externalConfirmation: "External",
    security: "Security",
    events: "Events",
  };
  return (Object.keys(labels) as (keyof PositionContextDiff)[])
    .filter((key) => diff[key].changed)
    .map((key) => `${labels[key]}: ${show(diff[key].previous ?? diff[key].entry)} → ${show(diff[key].current)}`);
}

function externalLabel(context: KAIROSContext): string {
  if (context.externalAbsence === "SOURCE_ERROR" || context.externalAbsence === "SOURCE_UNAVAILABLE") {
    return context.externalAbsence;
  }
  if (!context.externalSignals || context.externalSignals.status === "UNAVAILABLE" || context.externalSignals.value === null) {
    return "SOURCE_UNAVAILABLE";
  }
  const mapped = context.externalSignals.value.signals.filter((signal) => signal.relevance === "MAPPED" && signal.direction);
  if (mapped.length === 0) {
    return "NO_SIGNAL";
  }
  return mapped.map((signal) => signal.direction).join(",");
}

function field(entry: string | null, previous: string | null, current: string | null): PositionFieldDiff {
  const baseline = previous ?? entry;
  return {
    entry,
    previous,
    current,
    changed: baseline !== current,
  };
}

function show(value: string | null): string {
  return value === null || value.length === 0 ? "unavailable" : value;
}
