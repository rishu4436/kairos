import { KairosApiError } from "@/services/binance/errors";

export const EXECUTION_ERROR_CODES = [
  "AUTHENTICATION_ERROR",
  "RATE_LIMITED",
  "INVALID_REQUEST",
  "UPSTREAM_ERROR",
  "TIMEOUT",
  "QUOTE_UNAVAILABLE",
  "QUOTE_EXPIRED",
  "SLIPPAGE_LIMIT_EXCEEDED",
  "TRANSACTION_BUILD_FAILED",
  "SIMULATION_FAILED",
  "TRANSACTION_REJECTED",
  "WALLET_UNAVAILABLE",
  "USER_WALLET_MISMATCH",
  "UNKNOWN_ERROR",
] as const;

export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

/** Maps a provider failure to a stable code. The raw provider body is not returned. */
export function normalizeExecutionError(error: unknown): ExecutionErrorCode {
  if (error instanceof KairosApiError) {
    if (error.category === "AUTHENTICATION_ERROR") {
      return "AUTHENTICATION_ERROR";
    }
    if (error.category === "RATE_LIMITED") {
      return "RATE_LIMITED";
    }
    if (error.category === "INVALID_REQUEST") {
      return "INVALID_REQUEST";
    }
    if (error.category === "UPSTREAM_ERROR") {
      return "UPSTREAM_ERROR";
    }
    if (error.category === "TIMEOUT") {
      return "TIMEOUT";
    }
    if (error.category === "DATA_UNAVAILABLE" || error.category === "MALFORMED_RESPONSE") {
      return "QUOTE_UNAVAILABLE";
    }
  }
  return "UNKNOWN_ERROR";
}
