import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObservationRow } from "@/domain/observation";
import { admitLiveCapability, admitPaperCapability, executionAuthoritySize } from "@/domain/execution-authority";
import { clearPublicIntelligenceSnapshots, commerceCapability, fulfillIntelligenceJob, publicIntelligencePort, publishPublicMarketSnapshot, refuseCommerceStockExecution } from "@/studio/intelligence";
import { runIntelligenceWork } from "@/studio/bnb/app/agent/src/kairosWork";
import { POST } from "@/app/api/intelligence/route";

const now = Date.parse("2026-10-07T06:00:00Z");
const job = { requestId: "brief_1", ticker: "TSLA", requestedReportType: "MARKET_INTELLIGENCE_BRIEF", timestamp: new Date(now).toISOString() };
function row(): ObservationRow {
  return { id: "public_row", ticker: "TSLA", companyName: "Tesla", tokenSymbol: "TSLAon",
    platformLabel: "Ondo", chainLabel: "BSC", contractAddress: "0xpublic", price: "200", referencePrice: "201",
    deviationPct: null, change24hPct: null, session: "OPEN", sessionLabel: "Open", rawMarketStatus: null,
    freshness: "FRESH", freshnessLabel: "Fresh", ageMs: 0, sourceTimestamp: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(),
    volume24hUsd: null, nextOpenAt: null, reasonMessage: null, fidelity: "live", representationId: "tsla_ondo_bsc",
    regime: "UNKNOWN", regimeDetail: null, dataQuality: null, historyPoints: 0, features: [], signals: [], candles: [], arbitration: null };
}

beforeEach(clearPublicIntelligenceSnapshots);
describe("public ERC-8183 intelligence fulfillment", () => {
  it("returns a supported brief honestly when the public cache is empty", () => {
    const result = fulfillIntelligenceJob(job, undefined, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.brief).toMatchObject({ underlyingTicker: "TSLA", marketStatus: "UNAVAILABLE", representation: null,
      researchEvidence: "RESEARCH_NOT_CONFIGURED", liveReadiness: "BLOCKED" });
  });
  it.each([
    [{ ...job, ticker: "GOOG" }, "UNSUPPORTED_TICKER"],
    [{ ...job, requestedReportType: "TRADE" }, "UNSUPPORTED_REPORT_TYPE"],
    [{ ...job, requestId: "" }, "INVALID_REQUEST"],
    [{ ...job, timestamp: "yesterday" }, "INVALID_REQUEST"],
    ["buy TSLA", "UNSUPPORTED_ACTION"], ["sell my position", "UNSUPPORTED_ACTION"],
    ["execute this trade", "UNSUPPORTED_ACTION"], ["connect wallet", "UNSUPPORTED_ACTION"],
    [{ ...job, ticker: "buy TSLA" }, "UNSUPPORTED_ACTION"],
    [{ ...job, instructions: "connect wallet" }, "UNSUPPORTED_ACTION"],
    [{ ...job, userId: "other_user" }, "UNSUPPORTED_ACTION"],
  ])("rejects unsupported input without reading context: %j", (input, code) => {
    const readPublicMarket = vi.fn();
    expect(fulfillIntelligenceJob(input, { readPublicMarket }, now)).toEqual({ ok: false, code });
    expect(readPublicMarket).not.toHaveBeenCalled();
  });
  it("projects public fields, never account/position/wallet/risk fields, and ages snapshots", () => {
    const polluted = Object.assign(row(), { cash: "SECRET_CASH", positions: [{ quantity: "SECRET_QTY" }],
      walletBalances: "SECRET_BALANCE", riskSettings: "SECRET_RISK", privateKey: "SECRET_KEY", watchlist: "SECRET_WATCHLIST" });
    publishPublicMarketSnapshot(polluted, [], now);
    const result = fulfillIntelligenceJob(job, undefined, now);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SECRET_");
    if (result.ok) expect(result.brief.marketStatus).toBe("AVAILABLE");
    const stale = fulfillIntelligenceJob(job, undefined, now + 180_000);
    if (!stale.ok) throw new Error("expected brief");
    expect(stale.brief.marketFreshness).toBe("STALE");
    expect(stale.brief.marketStatus).toBe("DEGRADED");
    expect(stale.brief.strategySignals).toEqual([]);
  });
  it("does not publish paper fixtures as live data", () => {
    publishPublicMarketSnapshot({ ...row(), fidelity: "paper" }, [], now);
    expect(publicIntelligencePort.readPublicMarket("TSLA", now).marketStatus).toBe("UNAVAILABLE");
  });
  it("re-projects injected envelopes so extra nested private fields are excluded", () => {
    const base = publicIntelligencePort.readPublicMarket("TSLA", now);
    const result = fulfillIntelligenceJob(job, { readPublicMarket: () => ({ ...base, cash: "SECRET_CASH",
      representation: { id: "rep", tokenSymbol: "TSLAon", contractAddress: null, positions: "SECRET_QTY" },
      provenance: { ...base.provenance, privateKey: "SECRET_KEY" } }) }, now);
    expect(JSON.stringify(result)).not.toContain("SECRET_");
  });
  it("serves typed JSON from the Studio work hook and read-only HTTP adapter", async () => {
    expect(JSON.parse(await runIntelligenceWork(JSON.stringify(job))).ok).toBe(true);
    expect(JSON.parse(await runIntelligenceWork("buy TSLA"))).toEqual({ ok: false, code: "UNSUPPORTED_ACTION" });
    const response = await POST(new Request("http://localhost/api/intelligence", { method: "POST", body: JSON.stringify(job) }));
    expect(response.status).toBe(200);
    expect((await response.json()).brief.underlyingTicker).toBe("TSLA");
  });
  it("commerce capabilities cannot open either stock execution domain or create an execution context", () => {
    const count = executionAuthoritySize();
    fulfillIntelligenceJob(job, undefined, now);
    expect(executionAuthoritySize()).toBe(count);
    const binding = { userId: "public", agentId: "commerce", nowMs: now };
    // Deliberately malformed runtime inputs prove the real execution admission rejects this domain.
    expect(admitLiveCapability(commerceCapability as never, binding).ok).toBe(false);
    expect(admitPaperCapability(commerceCapability as never, binding).ok).toBe(false);
    expect(refuseCommerceStockExecution().ok).toBe(false);
  });
  it("fulfillment dependency graph contains no intents, executors, wallet access or real signing", () => {
    const seen = new Set<string>();
    function visit(relative: string) {
      if (seen.has(relative)) return;
      seen.add(relative);
      const source = readFileSync(path.resolve(relative), "utf8");
      for (const match of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)) {
        if (match[1].startsWith("type ")) continue;
        const target = match[2];
        expect(target).not.toMatch(/^@\/(wallet|execution|paper|position|agent|runtime|research|risk|services)\//);
        expect(target).not.toMatch(/studio-runtime\/(wallet|erc8183)|signing|node:(fs|crypto)/);
        if (target.startsWith("@/")) visit(`${target.slice(2)}.ts`);
      }
      expect(source).not.toMatch(/createTradeIntent|PositionTradeIntent|executeSwap|getWallet\(|signQuote\(/);
    }
    visit("studio/intelligence.ts");
  });
  it("uses the single official seller address and canonical free price", () => {
    const toml = readFileSync("studio/bnb/app/agent/studio.toml", "utf8");
    expect(toml).toContain('address = "0xe7a6b15AE66ddCe94C28BC47c66e60222824494E"');
    expect(toml).toMatch(/\[payments\.seller\]\s+price_usd = "0"/);
    expect(toml).toMatch(/\[payments\.erc8183\][\s\S]*?enabled = true/);
  });
});
