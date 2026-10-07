/**
 * Data and product modes. A mode string is not permission to execute.
 * Issuing and checking authority lives in domain/execution-authority.ts.
 *
 * PAPER: simulated execution only.
 * LIVE_PREVIEW: market/execution preparation may run; Agentic Wallet submission is refused.
 * LIVE: requires live gates and the wallet adapter. Never selected from a request string.
 */
export const EXECUTION_MODES = ["PAPER", "LIVE"] as const;
export const AUTONOMOUS_EXECUTION_MODES = ["PAPER", "LIVE_PREVIEW", "LIVE"] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type ProductExecutionMode = (typeof AUTONOMOUS_EXECUTION_MODES)[number];

/** Untrusted UI/Studio request text cannot select LIVE or LIVE_PREVIEW. */
export function executionModeFromRequest(_requested: string | null | undefined): "PAPER" {
  void _requested;
  return "PAPER";
}

export function resolveProductExecutionMode(input: {
  serverMode?: ProductExecutionMode | null;
  requested?: string | null;
}): ProductExecutionMode {
  void input.requested;
  if (input.serverMode === "LIVE" || input.serverMode === "LIVE_PREVIEW" || input.serverMode === "PAPER") {
    return input.serverMode;
  }
  return "PAPER";
}
