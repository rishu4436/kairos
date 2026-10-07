import { SCALE, type Scaled } from "@/domain/money";

/** One candlestick. Prices and volume are scaled integers, 6 decimal places. */
export interface Candle {
  timestampMs: number;
  open: Scaled;
  high: Scaled;
  low: Scaled;
  close: Scaled;
  /** REST `volume` as returned. The candle schema does not name the unit. Null when the field was absent. */
  volume: Scaled | null;
  tradeCount: number | null;
}

export const CANDLE_INTERVAL_MS = 15 * 60 * 1000;
export const HISTORY_CAP = 500;

/**
 * Parse a decimal string into scaled units.
 * More than 6 fractional digits are rounded half away from zero.
 * Returns null for blank or non-decimal input. Never substitutes zero.
 */
export function scaleDecimal(input: string): Scaled | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return null;
  }
  const [whole, fraction = ""] = raw.split(".");
  const digits = `${fraction}0000000`.slice(0, 7);
  let minor = BigInt(whole) * SCALE + BigInt(digits.slice(0, 6));
  if (digits[6] !== undefined && digits[6] >= "5") {
    minor += 1n;
  }
  if (minor === 0n) {
    return 0n;
  }
  return negative ? -minor : minor;
}

/** Accept a JSON string or number. Numbers are already binary floats from JSON.parse. */
export function scaleUnknown(value: unknown): Scaled | null {
  if (typeof value === "string") {
    return scaleDecimal(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Math.abs(value) > 1e12) {
      return null;
    }
    return scaleDecimal(value.toFixed(8));
  }
  return null;
}

export function epochUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function countUnknown(value: unknown): number | null {
  const parsed = epochUnknown(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}
