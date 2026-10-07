const GENERIC_CONFIRMATION = new Set(["yes", "confirm", "go ahead", "ok", "authorize"]);

/** Default tiny ceiling for an opt-in live test. Override with KAIROS_LIVE_TEST_CEILING_USD. */
export const DEFAULT_LIVE_TEST_CEILING_USD = 5;

export function liveExecutionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KAIROS_AGENTIC_WALLET_EXECUTE === "1";
}

export function liveTestOptIn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LIVE_AGENTIC_WALLET_TEST === "1" && liveExecutionEnabled(env);
}

export function liveTestCeilingUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.KAIROS_LIVE_TEST_CEILING_USD?.trim();
  if (raw === undefined || raw.length === 0) {
    return DEFAULT_LIVE_TEST_CEILING_USD;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 25) {
    return DEFAULT_LIVE_TEST_CEILING_USD;
  }
  return value;
}

export function notionalWithinCeiling(notionalUsd: number, ceilingUsd: number): boolean {
  return Number.isFinite(notionalUsd) && notionalUsd > 0 && notionalUsd <= ceilingUsd;
}

/** A model saying "yes" is not confirmation. The human must set both sides to the same non-generic phrase. */
export function acceptHumanConfirmation(submitted: string | null, expected: string | null): boolean {
  if (submitted === null || expected === null) {
    return false;
  }
  const phrase = expected.trim();
  if (phrase.length < 12 || GENERIC_CONFIRMATION.has(phrase.toLowerCase())) {
    return false;
  }
  return submitted.trim() === phrase;
}

export function reconcileObservedPosition(input: {
  verified: boolean;
  expectedAmount: string | null;
  observedAmount: string | null;
}): { updated: false; reconciliation: "NOT_OBSERVED" | "POSITION_RECONCILIATION_REQUIRED" } | { updated: true; reconciliation: "MATCH" } {
  if (!input.verified) {
    return { updated: false, reconciliation: "NOT_OBSERVED" };
  }
  if (input.expectedAmount === null || input.observedAmount === null || input.expectedAmount !== input.observedAmount) {
    return { updated: false, reconciliation: "POSITION_RECONCILIATION_REQUIRED" };
  }
  return { updated: true, reconciliation: "MATCH" };
}
