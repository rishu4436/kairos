import type { MarketTransition } from "@/context/types";

export interface ContextPrior {
  session: string | null;
  regime: string | null;
  referenceFreshness: string | null;
  selectedStrategy: string | null;
  selectedAction: string | null;
  opportunity: string | null;
}

const SESSION_EDGES: Readonly<Record<string, string>> = {
  "OPEN→CLOSED": "Market closed",
  "CLOSED→PRE_OPEN": "Market moved to pre-open",
  "PRE_OPEN→OPEN": "Market opened",
  "OPEN→POST_CLOSE": "Market moved to post-close",
  "POST_CLOSE→CLOSED": "Post-close ended",
};

interface Memory {
  priors: Map<string, ContextPrior>;
}

const KEY = "__kairosContextTransitions";

function memory(): Memory {
  const host = globalThis as typeof globalThis & { [KEY]?: Memory };
  if (!host[KEY]) {
    host[KEY] = { priors: new Map() };
  }
  return host[KEY];
}

export function resetContextMemory(): void {
  memory().priors.clear();
}

export function readContextPrior(userId: string, assetId: string): ContextPrior | null {
  return memory().priors.get(priorKey(userId, assetId)) ?? null;
}

export function writeContextPrior(userId: string, assetId: string, prior: ContextPrior): void {
  memory().priors.set(priorKey(userId, assetId), prior);
}

function priorKey(userId: string, assetId: string): string {
  return `${userId}\n${assetId}`;
}

/**
 * Emits a transition only when a previous observation exists and the value changed.
 * The first observation of a session is stored and is not itself an event.
 */
export function detectTransitions(input: {
  at: string;
  prior: ContextPrior | null;
  session: string | null;
  regime: string | null;
  referenceFreshness: string | null;
  opportunity: string | null;
}): MarketTransition[] {
  if (!input.prior) {
    return [];
  }
  const rows: MarketTransition[] = [];
  const session = edge(input.prior.session, input.session, SESSION_EDGES);
  if (session && input.prior.session && input.session) {
    rows.push({
      kind: "SESSION",
      from: input.prior.session,
      to: input.session,
      at: input.at,
      label: session,
    });
  }
  if (changed(input.prior.referenceFreshness, input.referenceFreshness)) {
    rows.push({
      kind: "REFERENCE_FRESHNESS",
      from: input.prior.referenceFreshness ?? "",
      to: input.referenceFreshness ?? "",
      at: input.at,
      label: "Reference price freshness changed",
    });
  }
  if (changed(input.prior.regime, input.regime)) {
    rows.push({
      kind: "REGIME",
      from: input.prior.regime ?? "",
      to: input.regime ?? "",
      at: input.at,
      label: "Volatility regime changed",
    });
  }
  if (changed(input.prior.opportunity, input.opportunity)) {
    rows.push({
      kind: "OPPORTUNITY",
      from: input.prior.opportunity ?? "",
      to: input.opportunity ?? "",
      at: input.at,
      label: `Opportunity state → ${input.opportunity}`,
    });
  }
  return rows;
}

export function selectionTransition(input: {
  at: string;
  prior: ContextPrior | null;
  strategyId: string | null;
  action: string | null;
}): MarketTransition | null {
  if (!input.prior || input.prior.selectedStrategy === null) {
    return null;
  }
  const same = input.prior.selectedStrategy === input.strategyId && input.prior.selectedAction === input.action;
  if (same) {
    return null;
  }
  return {
    kind: "STRATEGY_SELECTION",
    from: `${input.prior.selectedStrategy}:${input.prior.selectedAction ?? ""}`,
    to: `${input.strategyId ?? "NONE"}:${input.action ?? ""}`,
    at: input.at,
    label: "Strategy selection changed",
  };
}

function edge(previous: string | null, next: string | null, table: Readonly<Record<string, string>>): string | null {
  if (!previous || !next || previous === next) {
    return null;
  }
  return table[`${previous}→${next}`] ?? null;
}

function changed(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && previous !== next;
}
