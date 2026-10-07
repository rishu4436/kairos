/** Deterministic surprise. A missing side stays null. A zero estimate does not divide. */

export interface Surprise {
  absolute: string | null;
  percent: string | null;
}

export function surprise(actual: string | null, estimate: string | null): Surprise {
  const left = readDecimal(actual);
  const right = readDecimal(estimate);
  if (left === null || right === null) {
    return { absolute: null, percent: null };
  }
  const delta = left - right;
  return {
    absolute: formatDecimal(delta),
    percent: right === 0n ? null : formatDecimal((delta * 100n * 1_000_000n) / right),
  };
}

function readDecimal(value: string | null): bigint | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = body.split(".");
  const micros = BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  return negative ? -micros : micros;
}

function formatDecimal(micros: bigint): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  const text = frac.length === 0 ? whole.toString() : `${whole.toString()}.${frac}`;
  return negative ? `-${text}` : text;
}
