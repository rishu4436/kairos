/** 1_000_000 minor units = 1.000000 quote unit. */
export const SCALE = 1_000_000n;

export type Scaled = bigint;

export function add(left: Scaled, right: Scaled): Scaled {
  return left + right;
}

export function sub(left: Scaled, right: Scaled): Scaled {
  return left - right;
}

/** Half-away-from-zero integer division. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error("Division by zero.");
  }
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absNumerator + absDenominator / 2n) / absDenominator;
  return negative ? -rounded : rounded;
}

/** Multiply two scaled amounts and rescale. */
export function mul(left: Scaled, right: Scaled): Scaled {
  return divRound(left * right, SCALE);
}

export function parseDecimal(input: string): Scaled {
  const trimmed = input.trim();
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid decimal: ${input}`);
  }
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > 6) {
    throw new Error(`At most 6 decimal places: ${input}`);
  }
  const value = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
  return negative ? -value : value;
}

export function formatDecimal(value: Scaled, digits = 2): string {
  if (!Number.isInteger(digits) || digits < 0 || digits > 6) {
    throw new Error("Decimal digits must be between 0 and 6.");
  }
  const negative = value < 0n;
  let absolute = negative ? -value : value;
  if (digits < 6) {
    const factor = 10n ** BigInt(6 - digits);
    absolute = divRound(absolute, factor) * factor;
  }
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(6, "0").slice(0, digits);
  const body = digits === 0 ? whole.toString() : `${whole.toString()}.${fraction}`;
  return negative && absolute !== 0n ? `-${body}` : body;
}

export function formatGrouped(value: Scaled, digits = 2): string {
  const formatted = formatDecimal(value, digits);
  const negative = formatted.startsWith("-");
  const raw = negative ? formatted.slice(1) : formatted;
  const [whole, fraction] = raw.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  return negative ? `-${body}` : body;
}
