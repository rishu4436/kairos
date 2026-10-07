import type { ContextSlice, KAIROSContext } from "@/context/types";

const FUTURE_TOLERANCE_MS = 5_000;

/** Structural checks. A failing context must not be passed to the arbitrator. */
export function validateKairosContext(context: KAIROSContext, nowMs: number): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (context.userId.trim().length === 0) {
    reasons.push("USER_MISSING");
  }
  if (context.assetId !== context.identity.representationId) {
    reasons.push("ASSET_MISMATCH");
  }
  if (context.identity.underlyingTicker.trim().length === 0) {
    reasons.push("UNDERLYING_MISSING");
  }
  if (!context.watchlist.includes(context.identity.underlyingTicker)) {
    reasons.push("WATCHLIST_EXCLUDED");
  }
  if (!Number.isFinite(Date.parse(context.snapshotTimestamp))) {
    reasons.push("TIMESTAMP_INCONSISTENT");
  } else if (Date.parse(context.snapshotTimestamp) - nowMs > FUTURE_TOLERANCE_MS) {
    reasons.push("TIMESTAMP_INCONSISTENT");
  }
  if (context.identity.chainId && context.tokenSecurity.value?.chainId && context.identity.chainId !== context.tokenSecurity.value.chainId) {
    reasons.push("CHAIN_MISMATCH");
  }
  if (
    context.identity.contractAddress &&
    context.tokenSecurity.value?.contractAddress &&
    context.identity.contractAddress.toLowerCase() !== context.tokenSecurity.value.contractAddress.toLowerCase()
  ) {
    reasons.push("CHAIN_MISMATCH");
  }
  reasons.push(...sliceReasons("market", context.market));
  reasons.push(...sliceReasons("reference", context.reference));
  reasons.push(...sliceReasons("history", context.history));
  reasons.push(...sliceReasons("features", context.features));
  reasons.push(...sliceReasons("regime", context.regime));
  reasons.push(...sliceReasons("session", context.session));
  reasons.push(...sliceReasons("strategySignals", context.strategySignals));
  reasons.push(...sliceReasons("externalSignals", context.externalSignals));
  reasons.push(...sliceReasons("tokenSecurity", context.tokenSecurity));
  reasons.push(...sliceReasons("positionContext", context.positionContext));
  reasons.push(...sliceReasons("eventContext", context.eventContext));
  if (context.market.status === "AVAILABLE" && (context.market.value === null || context.market.value.price.trim().length === 0)) {
    reasons.push("MARKET_VALUE_MISSING");
  }
  if (context.walletAccess !== false || context.createsOrders !== false) {
    reasons.push("BOUNDARY_BROKEN");
  }
  return { ok: reasons.length === 0, reasons: unique(reasons) };
}

function sliceReasons(name: string, slice: ContextSlice<unknown>): string[] {
  const reasons: string[] = [];
  if (slice.status === "AVAILABLE" && slice.value === null) {
    reasons.push(`${name.toUpperCase()}_VALUE_MISSING`);
  }
  if (slice.status === "AVAILABLE" && (slice.provenance.source === null || slice.provenance.source.trim().length === 0)) {
    reasons.push(`${name.toUpperCase()}_SOURCE_MISSING`);
  }
  if (slice.status === "STALE" && slice.freshness === "FRESH") {
    reasons.push(`${name.toUpperCase()}_FRESHNESS_CONFLICT`);
  }
  if (slice.status === "UNAVAILABLE" && slice.value !== null && name !== "tokenSecurity") {
    reasons.push(`${name.toUpperCase()}_MISSING_HAS_VALUE`);
  }
  return reasons;
}

function unique(reasons: string[]): string[] {
  return [...new Set(reasons)];
}
