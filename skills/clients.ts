/**
 * Smart Money live read.
 * The current skill tells the caller to run `node <skill-dir>/scripts/cli.mjs smart-money`.
 * That skill directory is not installed. references/cli.md documents the script fields and does not publish a URL.
 * This function does not guess an endpoint and does not call the network.
 */
export function readSmartMoney(): {
  ok: false;
  transport: "UNAVAILABLE";
  code: "UNAVAILABLE";
  reason: string;
} {
  return {
    ok: false,
    transport: "UNAVAILABLE",
    code: "UNAVAILABLE",
    reason:
      "binance-trading-signal 3.5 is not installed. Smart Money is a skill script, and references/cli.md does not publish a standalone URL. baw signal commands are SKILL_BLOCKED_BY_VERSION because baw 1.9.0 is older than 1.9.1.",
  };
}

export interface ExternalExperimentContext {
  signalIds: readonly string[];
  usedAsCandles: false;
  fabricatedHistory: false;
  note: string;
}

/** Paper lab context only. Signal rows are not turned into candles and missing history is not invented. */
export function buildExternalExperimentContext(signalIds: readonly (string | null)[]): ExternalExperimentContext {
  return {
    signalIds: signalIds.filter((id): id is string => id !== null && id.length > 0),
    usedAsCandles: false,
    fabricatedHistory: false,
    note: "External signals are context only. They are not historical candles, and no signal history was fabricated.",
  };
}
