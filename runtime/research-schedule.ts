export const DEFAULT_RESEARCH_INTERVAL_MS = 60 * 60 * 1000;

export type ResearchTrigger =
  | "NO_VALID_THESIS"
  | "REGIME_CHANGED"
  | "MAJOR_EVENT_CHANGED"
  | "STRATEGY_HEALTH_DEGRADED"
  | "PERIODIC_RESEARCH_DUE"
  | null;

export function researchDue(input: {
  nowMs: number;
  lastResearchAtMs: number | null;
  intervalMs?: number;
  hasThesis: boolean;
  regimeChanged: boolean;
  majorEventChanged: boolean;
  healthDegraded: boolean;
}): { due: boolean; trigger: ResearchTrigger } {
  if (!input.hasThesis) {
    return { due: true, trigger: "NO_VALID_THESIS" };
  }
  if (input.regimeChanged) {
    return { due: true, trigger: "REGIME_CHANGED" };
  }
  if (input.majorEventChanged) {
    return { due: true, trigger: "MAJOR_EVENT_CHANGED" };
  }
  if (input.healthDegraded) {
    return { due: true, trigger: "STRATEGY_HEALTH_DEGRADED" };
  }
  const interval = input.intervalMs ?? positive(process.env.KAIROS_RESEARCH_INTERVAL_MS, DEFAULT_RESEARCH_INTERVAL_MS);
  if (input.lastResearchAtMs === null || input.nowMs - input.lastResearchAtMs >= interval) {
    return { due: true, trigger: "PERIODIC_RESEARCH_DUE" };
  }
  return { due: false, trigger: null };
}

function positive(raw: string | undefined, fallback: number): number {
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
