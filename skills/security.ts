import type { SecurityGate } from "@/domain/arbitration";
import type { SecurityEvent, TokenRiskItem, TokenSecurityAssessment, TokenTaxInfo } from "@/skills/types";

export const TOKEN_AUDIT_URL = "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit";
export const TOKEN_AUDIT_USER_AGENT = "binance-web3/1.4 (Skill)";

export const TOKENIZED_LIST_URL = "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai";
export const TOKENIZED_MARKET_STATUS_URL = "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai";
export const TOKENIZED_ASSET_STATUS_URL = "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai";
export const TOKENIZED_USER_AGENT = "binance-web3/1.1 (Skill)";
export const TOKENIZED_LIMITATION = "ONDO_ONLY" as const;

const CORPORATE_ACTIONS = new Set([
  "cash_dividend",
  "stock_dividend",
  "stock_split",
  "merger",
  "acquisition",
  "spinoff",
  "maintenance",
  "corporate action",
  "earnings",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function riskItemsOf(value: unknown): TokenRiskItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: TokenRiskItem[] = [];
  for (const group of value) {
    if (!isRecord(group)) {
      continue;
    }
    const details = Array.isArray(group.details) ? group.details : [group];
    for (const detail of details) {
      if (!isRecord(detail) && !isRecord(group)) {
        continue;
      }
      const row = isRecord(detail) ? detail : group;
      items.push({
        id: stringOrNull(group.id),
        name: stringOrNull(group.name),
        title: stringOrNull(row.title),
        description: stringOrNull(row.description),
        isHit: booleanOrNull(row.isHit),
        riskType: stringOrNull(row.riskType),
      });
    }
  }
  return items;
}

export interface TokenAuditRequest {
  url: typeof TOKEN_AUDIT_URL;
  method: "POST";
  headers: {
    "Content-Type": "application/json";
    "Accept-Encoding": "identity";
    "User-Agent": typeof TOKEN_AUDIT_USER_AGENT;
    source: "agent";
  };
  body: {
    binanceChainId: string;
    contractAddress: string;
    requestId: string;
  };
}

/** Builds the documented request. This phase does not send it. */
export function buildTokenAuditRequest(input: { chainId: string; contractAddress: string; requestId: string }): TokenAuditRequest {
  return {
    url: TOKEN_AUDIT_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
      "User-Agent": TOKEN_AUDIT_USER_AGENT,
      source: "agent",
    },
    body: {
      binanceChainId: input.chainId,
      contractAddress: input.contractAddress,
      requestId: input.requestId,
    },
  };
}

/**
 * Authoritative only when hasResult and isSupported are both true.
 * Otherwise risk fields stay null and the status is SECURITY_AUDIT_UNAVAILABLE.
 * LOW is preserved as LOW. It is not renamed to safe.
 */
export function normalizeTokenAudit(input: {
  assetId: string | null;
  chainId: string | null;
  contractAddress: string | null;
  body: unknown;
  checkedAt: string | null;
}): TokenSecurityAssessment {
  const data = isRecord(input.body) && isRecord(input.body.data) ? input.body.data : isRecord(input.body) ? input.body : null;
  const hasResult = data?.hasResult === true;
  const isSupported = data?.isSupported === true;
  const base = {
    assetId: input.assetId,
    chainId: input.chainId,
    contractAddress: input.contractAddress,
    checkedAt: input.checkedAt,
    source: "query-token-audit",
  };
  if (!hasResult || !isSupported) {
    return {
      ...base,
      available: false,
      supported: data?.isSupported === true,
      riskLevel: null,
      riskLevelEnum: null,
      riskItems: null,
      taxInfo: null,
    };
  }
  const extra = isRecord(data.extraInfo) ? data.extraInfo : null;
  const taxInfo: TokenTaxInfo | null = extra
    ? {
        buyTax: extra.buyTax === null ? null : stringOrNull(extra.buyTax),
        sellTax: extra.sellTax === null ? null : stringOrNull(extra.sellTax),
        isVerified: booleanOrNull(extra.isVerified),
      }
    : null;
  return {
    ...base,
    available: true,
    supported: true,
    riskLevel: numberOrNull(data.riskLevel),
    riskLevelEnum: stringOrNull(data.riskLevelEnum),
    riskItems: riskItemsOf(data.riskItems),
    taxInfo,
  };
}

export function assessSecurityGate(assessment: Pick<TokenSecurityAssessment, "available" | "supported" | "riskLevel" | "riskLevelEnum"> | null): SecurityGate {
  if (assessment === null) {
    return "NOT_EVALUATED";
  }
  if (!assessment.available || !assessment.supported) {
    return "UNAVAILABLE";
  }
  if (assessment.riskLevelEnum === "HIGH" || assessment.riskLevel === 4 || assessment.riskLevel === 5) {
    return "BLOCK";
  }
  return "ELIGIBLE";
}

/** Security never adds confidence. A block withholds it. */
export function confidenceAfterSecurity(confidence: number | null, gate: SecurityGate): number | null {
  if (gate === "BLOCK") {
    return null;
  }
  return confidence;
}

/** The strategy score is copied through. A block does not add to it or subtract from it. */
export function scoreAfterSecurity(score: number | null, gate: SecurityGate): number | null {
  if (gate === "BLOCK") {
    return score;
  }
  return score;
}

function isoFromMs(value: unknown): string | null {
  const ms = numberOrNull(value);
  if (ms === null) {
    return null;
  }
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * A corporate-action or market-status event is created only from fields the payload contains.
 * A missing reason does not become earnings, a dividend, or a split.
 */
export function mapSecurityEvent(input: { assetId: string | null; body: unknown; source?: string }): SecurityEvent | null {
  const data = isRecord(input.body) && isRecord(input.body.data) ? input.body.data : isRecord(input.body) ? input.body : null;
  if (!data) {
    return null;
  }
  const reasonCode = stringOrNull(data.reasonCode);
  const reasonMsg = stringOrNull(data.reasonMsg);
  if (reasonCode === null && reasonMsg === null) {
    return null;
  }
  const eventType = reasonMsg !== null && CORPORATE_ACTIONS.has(reasonMsg) ? reasonMsg : reasonCode;
  return {
    eventType,
    status: stringOrNull(data.marketStatus) ?? reasonCode,
    effectiveTime: isoFromMs(data.nextOpenTime),
    source: input.source ?? "binance-tokenized-securities-info",
    assetId: input.assetId,
  };
}

export interface TokenizedSecurityStatus {
  limitation: typeof TOKENIZED_LIMITATION;
  openState: boolean | null;
  marketStatus: string | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  source: string;
}

/** Optional Ondo adapter. It does not replace the KAIROS RWA resolver. */
export function normalizeTokenizedAssetStatus(body: unknown): TokenizedSecurityStatus {
  const data = isRecord(body) && isRecord(body.data) ? body.data : isRecord(body) ? body : {};
  return {
    limitation: TOKENIZED_LIMITATION,
    openState: booleanOrNull(data.openState),
    marketStatus: stringOrNull(data.marketStatus),
    reasonCode: stringOrNull(data.reasonCode),
    reasonMsg: stringOrNull(data.reasonMsg),
    source: "binance-tokenized-securities-info",
  };
}
