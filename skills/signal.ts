import type { ExternalSignalFreshness } from "@/domain/arbitration";
import type { AssetMapResult, CanonicalAssetRef, ConfirmationOutcome, ExternalSignal } from "@/skills/types";

/** KAIROS freshness windows. Provider status "timeout" is EXPIRED even when the timestamp is recent. */
export const FRESH_MAX_MS = 15 * 60 * 1000;
export const AGING_MAX_MS = 60 * 60 * 1000;
export const STALE_MAX_MS = 24 * 60 * 60 * 1000;

const SOURCES = ["SMART_MONEY", "USER_STRATEGY", "MEME_OFFICIAL"] as const;

export function signalFreshness(input: {
  triggerTimeMs: number | null;
  observedAtMs: number;
  providerStatus: string | null;
}): ExternalSignalFreshness {
  if (input.providerStatus === "timeout") {
    return "EXPIRED";
  }
  if (input.triggerTimeMs === null || !Number.isFinite(input.triggerTimeMs)) {
    return "UNKNOWN";
  }
  const age = input.observedAtMs - input.triggerTimeMs;
  if (!Number.isFinite(age) || age < 0) {
    return "UNKNOWN";
  }
  if (input.providerStatus === "outDecline" || input.providerStatus === "exitRate") {
    return age <= FRESH_MAX_MS ? "STALE" : age <= STALE_MAX_MS ? "STALE" : "EXPIRED";
  }
  if (age <= FRESH_MAX_MS) {
    return "FRESH";
  }
  if (age <= AGING_MAX_MS) {
    return "AGING";
  }
  if (age <= STALE_MAX_MS) {
    return "STALE";
  }
  return "EXPIRED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function directionOf(value: unknown): "BUY" | "SELL" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "buy") {
    return "BUY";
  }
  if (normalized === "sell") {
    return "SELL";
  }
  return null;
}

function sourceOf(value: unknown): ExternalSignal["source"] {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return (SOURCES as readonly string[]).includes(normalized) ? (normalized as ExternalSignal["source"]) : null;
}

/** Normalize one Smart Money row. Missing provider fields stay null. Confidence is not derived. */
export function normalizeSmartMoneyRow(row: unknown, observedAtMs: number): ExternalSignal | null {
  if (!isRecord(row)) {
    return null;
  }
  const triggerMs = numberOrNull(row.signalTriggerTime);
  const providerStatus = row.status === null ? null : stringOrNull(row.status);
  const signalId = stringOrNull(row.signalId);
  const source = sourceOf(row.smartSignalType) ?? "SMART_MONEY";
  return {
    signalId,
    source,
    provider: "binance-trading-signal",
    chainId: stringOrNull(row.chainId),
    ticker: stringOrNull(row.ticker),
    contractAddress: stringOrNull(row.contractAddress),
    direction: directionOf(row.direction),
    triggerPrice: stringOrNull(row.alertPrice),
    currentPrice: stringOrNull(row.currentPrice),
    triggerTime: triggerMs === null ? null : new Date(triggerMs).toISOString(),
    maxGain: stringOrNull(row.maxGain),
    exitRate: numberOrNull(row.exitRate),
    confidence: numberOrNull(row.confidence),
    strength: numberOrNull(row.strength),
    status: providerStatus,
    freshness: signalFreshness({ triggerTimeMs: triggerMs, observedAtMs, providerStatus }),
    rawSourceReference: signalId === null ? "binance-trading-signal:smart-money" : `binance-trading-signal:smart-money:${signalId}`,
    observedAt: new Date(observedAtMs).toISOString(),
    smartMoneyCount: numberOrNull(row.smartMoneyCount),
    tokenTag: Object.prototype.hasOwnProperty.call(row, "tokenTag") ? (row.tokenTag ?? null) : null,
  };
}

export function normalizeSmartMoneyPayload(payload: unknown, observedAtMs: number): ExternalSignal[] {
  const rows = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  return rows.flatMap((row) => {
    const signal = normalizeSmartMoneyRow(row, observedAtMs);
    return signal === null ? [] : [signal];
  });
}

export function dedupeKey(signal: ExternalSignal): string {
  if (signal.signalId !== null) {
    return `${signal.provider}:${signal.signalId}`;
  }
  return `${signal.provider}:${signal.contractAddress ?? ""}:${signal.triggerTime ?? ""}:${signal.direction ?? ""}`;
}

/** First occurrence wins. The same provider event does not become two strategy inputs. */
export function dedupeExternalSignals(signals: readonly ExternalSignal[]): ExternalSignal[] {
  const seen = new Set<string>();
  const kept: ExternalSignal[] = [];
  for (const signal of signals) {
    const key = dedupeKey(signal);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(signal);
  }
  return kept;
}

function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Attach a signal only when chain and contract match one canonical representation.
 * Ticker-only matches are SIGNAL_UNRELATED.
 */
export function mapSignalToAsset(signal: Pick<ExternalSignal, "chainId" | "contractAddress" | "ticker">, assets: readonly CanonicalAssetRef[]): AssetMapResult {
  if (signal.chainId === null || signal.contractAddress === null) {
    return { status: "SIGNAL_UNRELATED", reason: "Chain and contract address are required. Ticker-only matching is not used." };
  }
  const matches = assets.filter((asset) => asset.chainId === signal.chainId && sameAddress(asset.contractAddress, signal.contractAddress ?? ""));
  if (matches.length !== 1) {
    return {
      status: "SIGNAL_UNRELATED",
      reason: matches.length === 0 ? "No canonical representation matches this chain and contract." : "More than one representation matches this chain and contract.",
    };
  }
  const sameTicker = assets.filter((asset) => signal.ticker !== null && asset.ticker === signal.ticker);
  if (sameTicker.length > 1 && !sameTicker.every((asset) => asset.assetId === matches[0]?.assetId)) {
    const verified = matches[0];
    if (!verified) {
      return { status: "SIGNAL_UNRELATED", reason: "No canonical representation matches this chain and contract." };
    }
    return { status: "MAPPED", assetId: verified.assetId };
  }
  return { status: "MAPPED", assetId: matches[0].assetId };
}

export interface ConfirmationInput {
  direction: "BUY" | "SELL" | null;
  freshness: ExternalSignalFreshness;
  source: string | null;
  mapStatus: "MAPPED" | "SIGNAL_UNRELATED";
}

/** Analytical only. A Smart Money row does not become a trade. */
export function evaluateSmartMoneyConfirmation(
  internalAction: "BUY" | "SELL" | "HOLD" | "NO_SIGNAL" | null,
  signals: readonly ConfirmationInput[],
): ConfirmationOutcome {
  const current = signals.filter((signal) => signal.mapStatus === "MAPPED" && signal.source === "SMART_MONEY" && signal.freshness === "FRESH");
  const buys = current.some((signal) => signal.direction === "BUY");
  const sells = current.some((signal) => signal.direction === "SELL");
  if (buys && sells) {
    return "CONFLICTING_EVIDENCE";
  }
  if (internalAction !== "BUY" && internalAction !== "SELL") {
    return "NO_SIGNAL";
  }
  if ((internalAction === "BUY" && sells) || (internalAction === "SELL" && buys)) {
    return "CONFLICTING_EVIDENCE";
  }
  if ((internalAction === "BUY" && buys) || (internalAction === "SELL" && sells)) {
    return "CONFIRMING_EVIDENCE";
  }
  return "NO_SIGNAL";
}
