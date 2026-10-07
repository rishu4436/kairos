import type { ExitClass, PositionAction, PositionReasonCode } from "@/position/types";

const REASONS: Record<PositionReasonCode, string> = {
  NO_POSITION: "No open position.",
  ALREADY_CLOSED: "The position is already closed.",
  MANAGEMENT_IN_FLIGHT: "A position action is already in flight.",
  THESIS_VALID: "The origin thesis remains valid.",
  THESIS_UNKNOWN: "The thesis state is unknown.",
  RISK_WITHIN_LIMIT: "Risk is within limits.",
  NO_EXIT_TRIGGER: "No exit trigger fired.",
  CRITICAL_DATA_FAILURE: "Required market data is missing.",
  ADVERSE_MOVE: "Price moved against the position by the configured amount.",
  MAX_DRAWDOWN_BREACH: "Strategy drawdown reached the configured limit.",
  POSITION_LIMIT_BREACH: "Position notional breached the hard limit.",
  RISK_BREACH: "A hard risk limit was breached.",
  SECURITY_BLOCK: "Token security blocked the position.",
  TOKEN_NOT_TRADABLE: "The token is not tradable.",
  TRADING_RESTRICTION: "A trading restriction is active.",
  ORIGIN_STRATEGY_REVERSED: "The origin strategy reversed.",
  ORIGIN_STRATEGY_INVALID: "The origin strategy is no longer valid.",
  REGIME_INVALIDATED: "The regime invalidated the origin thesis.",
  TREND_NO_LONGER_SUPPORTIVE: "The trend no longer supports the thesis.",
  REVERSION_COMPLETED: "Price reverted to the mean.",
  EXTENSION_AGAINST_THESIS: "Price extended against the reversion thesis.",
  EXIT_SIGNAL: "The origin strategy printed an exit.",
  EXPOSURE_TOO_LARGE: "Exposure is above the position cap.",
  ALLOCATION_ABOVE_POLICY: "Allocation is above policy.",
  WEAKENED_SIGNAL: "The origin signal weakened.",
  EVENT_UNCERTAINTY: "A new information event appeared.",
  HEALTH_DEGRADED: "Measured strategy health is degraded.",
  WEEKEND_ANALYTICAL: "Weekend is analytical and does not manage the position.",
  NO_POSITION_POLICY: "This strategy has no position policy.",
  ADD_SUPPORTED: "Fresh support and risk room allow an add.",
  ADD_COOLDOWN: "The add cooldown has not elapsed.",
  ADD_PRICE_DOWN: "Price is below the entry, so an add is refused.",
  ADD_AT_MAX: "The add count or notional cap is reached.",
  ADD_RISK_BLOCKED: "Risk, security, or an event blocks an add.",
  ADD_NOT_FRESH: "The signal is not fresh enough to add.",
  MARKET_DATA_STALE: "Market data is stale.",
  SECURITY_UNKNOWN: "Security is unknown.",
  THESIS_EXPIRED: "The configured holding period ended.",
  ALTERNATE_STRATEGY_SIGNAL: "Another strategy is stronger. The origin strategy still owns the position.",
  EXTERNAL_CONFLICT: "External evidence conflicts with the origin buy. It does not exit by itself.",
  EXTERNAL_SUPPORT: "External evidence supports the origin buy.",
  MAINTENANCE: "Maintenance is active. The position is held.",
  TRAILING_EXIT: "The configured trailing threshold was reached.",
};

export function explainReasons(reasons: readonly string[]): string[] {
  return reasons.map((reason) => REASONS[reason as PositionReasonCode] ?? reason);
}

export function explainExitClass(exitClass: ExitClass | null): string | null {
  if (exitClass === "THESIS") {
    return "Thesis exit. The investment thesis is no longer valid.";
  }
  if (exitClass === "RISK") {
    return "Risk exit. The position violated a hard risk rule.";
  }
  return null;
}

export function explainAction(action: PositionAction | string | null): string {
  if (action === "HOLD") {
    return "HOLD";
  }
  if (action === "ADD") {
    return "ADD";
  }
  if (action === "REDUCE") {
    return "REDUCE";
  }
  if (action === "EXIT") {
    return "EXIT";
  }
  if (action === "BLOCKED") {
    return "BLOCKED";
  }
  return "—";
}
