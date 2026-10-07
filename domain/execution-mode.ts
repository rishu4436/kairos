/**
 * Data and product modes. A mode string is not permission to execute.
 * Issuing and checking authority lives in domain/execution-authority.ts.
 */
export const EXECUTION_MODES = ["PAPER", "LIVE"] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];
