export const PAPER_MODE = "paper" as const;
export const LIVE_MODE = "live" as const;

export type KairosDataMode = typeof PAPER_MODE | typeof LIVE_MODE;

export interface DataModeEnv {
  KAIROS_DATA_MODE?: string;
  NEXT_PUBLIC_KAIROS_DATA_MODE?: string;
}

/**
 * Explicit data mode. `paper` and `mock` are the sample snapshot.
 * `live` requests Binance Web3 market data and does not fall back to that snapshot.
 * Any other value fails closed.
 *
 * `KAIROS_DATA_MODE` wins when both variables are set.
 * `NEXT_PUBLIC_KAIROS_DATA_MODE` is not a secret. API keys must not use that prefix.
 */
export function readDataMode(env?: DataModeEnv): KairosDataMode {
  const source: DataModeEnv = env ?? {
    KAIROS_DATA_MODE: process.env.KAIROS_DATA_MODE,
    NEXT_PUBLIC_KAIROS_DATA_MODE: process.env.NEXT_PUBLIC_KAIROS_DATA_MODE,
  };
  const explicit = source.KAIROS_DATA_MODE;
  const legacy = source.NEXT_PUBLIC_KAIROS_DATA_MODE;
  const raw = (explicit ?? legacy ?? PAPER_MODE).trim().toLowerCase();
  if (raw === PAPER_MODE || raw === "mock") {
    return PAPER_MODE;
  }
  if (raw === LIVE_MODE) {
    return LIVE_MODE;
  }
  throw new Error(
    `KAIROS data mode "${raw}" is not supported. Set KAIROS_DATA_MODE to "live" or "paper".`,
  );
}
