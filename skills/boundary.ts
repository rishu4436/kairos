import { hubSkill } from "@/skills/hub-metadata";
import { can, compareCliVersion } from "@/skills/registry";

export interface SkillReadResult {
  skill: string;
  version: string;
  ok: boolean;
  code: "OK" | "NOT_INSTALLED" | "VERSION_INCOMPATIBLE" | "UPSTREAM_ERROR" | "NOT_CONFIGURED";
  ticker: string | null;
  symbol: string | null;
  chainId: string | null;
  contractAddress: string | null;
  tradeIntent: null;
  signed: false;
  broadcast: false;
}

export function skillCanTrade(id: string): boolean {
  return can(id, "CREATE_TRADE_INTENT") || can(id, "EXECUTE_TRADE") || can(id, "SIGN") || can(id, "BROADCAST");
}

export function normalizeSkillRead(input: {
  skill: string;
  installed: boolean;
  bawVersion?: string;
  ok: boolean;
  ticker?: string | null;
  symbol?: string | null;
  chainId?: string | null;
  contractAddress?: string | null;
  error?: boolean;
}): SkillReadResult {
  const meta = hubSkill(input.skill);
  const version = meta?.version ?? "unknown";
  if (!input.installed && !meta?.publicRead) {
    return empty(input.skill, version, "NOT_INSTALLED");
  }
  if (meta?.requiredBaw && input.bawVersion && compareCliVersion(input.bawVersion, meta.requiredBaw) === "SKILL_BLOCKED_BY_VERSION") {
    return empty(input.skill, version, "VERSION_INCOMPATIBLE");
  }
  if (!input.installed && meta?.publicRead !== true) {
    return empty(input.skill, version, "NOT_INSTALLED");
  }
  if (input.error || !input.ok) {
    return empty(input.skill, version, "UPSTREAM_ERROR");
  }
  return {
    skill: input.skill,
    version,
    ok: true,
    code: "OK",
    ticker: input.ticker ?? null,
    symbol: input.symbol ?? null,
    chainId: input.chainId ?? null,
    contractAddress: input.contractAddress ?? null,
    tradeIntent: null,
    signed: false,
    broadcast: false,
  };
}

export function normalizeTokenizedRow(body: unknown, ticker: string): { ok: true; ticker: string; symbol: string; chainId: string; contractAddress: string } | { ok: false } {
  if (!body || typeof body !== "object") {
    return { ok: false };
  }
  const data = (body as { data?: unknown; success?: unknown }).data;
  if (!Array.isArray(data)) {
    return { ok: false };
  }
  const row = data.find((item) => item && typeof item === "object" && (item as { ticker?: unknown }).ticker === ticker);
  if (!row || typeof row !== "object") {
    return { ok: false };
  }
  const record = row as { ticker?: unknown; symbol?: unknown; chainId?: unknown; contractAddress?: unknown };
  if (typeof record.symbol !== "string" || typeof record.chainId !== "string" || typeof record.contractAddress !== "string") {
    return { ok: false };
  }
  return { ticker, symbol: record.symbol, chainId: record.chainId, contractAddress: record.contractAddress, ok: true };
}

function empty(skill: string, version: string, code: SkillReadResult["code"]): SkillReadResult {
  return {
    skill,
    version,
    ok: false,
    code,
    ticker: null,
    symbol: null,
    chainId: null,
    contractAddress: null,
    tradeIntent: null,
    signed: false,
    broadcast: false,
  };
}
