import { formatGrouped, type Scaled } from "@/domain/money";

export function formatUsdt(value: Scaled): string {
  return `${formatGrouped(value)} USDT`;
}

export function formatSignedUsdt(value: Scaled): string {
  const sign = value > 0n ? "+" : "";
  return `${sign}${formatGrouped(value)} USDT`;
}

export function formatQuantity(value: Scaled): string {
  return formatGrouped(value, 2);
}

export function formatPrice(value: Scaled): string {
  return formatGrouped(value, 2);
}

export function formatPercentFromBps(bps: number): string {
  const value = bps / 100;
  if (value > 0) {
    return `+${value.toFixed(2)}%`;
  }
  return `${value.toFixed(2)}%`;
}

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatScore(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Math.abs(rounded).toFixed(2);
  if (rounded > 0) {
    return `+${text}`;
  }
  if (rounded < 0) {
    return `-${text}`;
  }
  return "0.00";
}

export function formatClock(iso: string): string {
  const time = iso.slice(11, 19);
  return time.length === 8 ? time : iso;
}

export function formatStamp(iso: string): string {
  const day = iso.slice(5, 10);
  const time = iso.slice(11, 19);
  return day.length === 5 && time.length === 8 ? `${day} ${time}` : iso;
}

export function directionOf(value: Scaled): "up" | "down" | "flat" {
  if (value > 0n) {
    return "up";
  }
  if (value < 0n) {
    return "down";
  }
  return "flat";
}
