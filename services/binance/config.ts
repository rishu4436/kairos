import { KairosApiError } from "@/services/binance/errors";

export interface BinanceWeb3Config {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  recvWindowMs: number;
  timeoutMs: number;
  freshMaxMs: number;
  agingMaxMs: number;
  refreshIntervalMs: number;
}

const DEFAULT_BASE = "https://web3.binance.com/build";

function integerEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new KairosApiError({
      category: "INVALID_REQUEST",
      safeMessage: `${name} must be an integer from ${min} to ${max}.`,
      technicalMessage: `${name} is invalid.`,
    });
  }
  return value;
}

/**
 * Reads server-only credentials. Missing values throw. There is no mock fallback.
 */
export function readBinanceConfig(env: NodeJS.ProcessEnv = process.env): BinanceWeb3Config {
  const apiKey = env.BINANCE_WEB3_API_KEY?.trim() ?? "";
  const secretKey = env.BINANCE_WEB3_SECRET_KEY?.trim() ?? "";
  if (apiKey.length === 0 || secretKey.length === 0) {
    throw new KairosApiError({
      category: "AUTHENTICATION_ERROR",
      safeMessage: "API credentials missing",
      technicalMessage: "BINANCE_WEB3_API_KEY or BINANCE_WEB3_SECRET_KEY is empty.",
    });
  }
  const baseUrl = (env.BINANCE_WEB3_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new KairosApiError({
      category: "INVALID_REQUEST",
      safeMessage: "BINANCE_WEB3_BASE_URL is not a valid URL.",
      technicalMessage: "BINANCE_WEB3_BASE_URL did not parse.",
    });
  }
  if (parsed.protocol !== "https:") {
    throw new KairosApiError({
      category: "INVALID_REQUEST",
      safeMessage: "BINANCE_WEB3_BASE_URL must use https.",
      technicalMessage: "Refusing a non-https Binance base URL.",
    });
  }
  return {
    apiKey,
    secretKey,
    baseUrl,
    recvWindowMs: integerEnv(env, "BINANCE_WEB3_RECV_WINDOW_MS", 5_000, 1, 60_000),
    timeoutMs: integerEnv(env, "KAIROS_REQUEST_TIMEOUT_MS", 10_000, 1_000, 30_000),
    freshMaxMs: integerEnv(env, "KAIROS_FRESH_MAX_MS", 30_000, 1_000, 600_000),
    agingMaxMs: integerEnv(env, "KAIROS_AGING_MAX_MS", 120_000, 2_000, 3_600_000),
    refreshIntervalMs: integerEnv(env, "KAIROS_REFRESH_INTERVAL_MS", 15_000, 5_000, 120_000),
  };
}

export function readRefreshIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  return integerEnv(env, "KAIROS_REFRESH_INTERVAL_MS", 15_000, 5_000, 120_000);
}
