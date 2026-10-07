/**
 * Session used by observation. Raw provider values that are not one of these
 * states stay UNKNOWN and are kept beside the mapped state.
 */
export type MarketSessionState = "OPEN" | "CLOSED" | "PRE_OPEN" | "POST_CLOSE" | "UNKNOWN";

/** Values documented on the Binance Web3 RWA `marketStatus` field. */
export type DocumentedMarketStatus =
  | "premarket"
  | "regular"
  | "postmarket"
  | "overnight"
  | "closed"
  | "pause";

export function mapMarketSession(raw: string | null | undefined): MarketSessionState {
  switch (raw) {
    case "regular":
      return "OPEN";
    case "premarket":
      return "PRE_OPEN";
    case "postmarket":
      return "POST_CLOSE";
    case "closed":
      return "CLOSED";
    case "overnight":
    case "pause":
      return "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}

export function sessionLabel(state: MarketSessionState, raw: string | null): string {
  if (state === "UNKNOWN" && raw && raw.length > 0) {
    return `UNKNOWN · ${raw}`;
  }
  if (state === "PRE_OPEN") {
    return "PRE-OPEN";
  }
  if (state === "POST_CLOSE") {
    return "POST-CLOSE";
  }
  return state;
}
