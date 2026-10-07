import { describe, expect, it } from "vitest";
import { normalizeSkillRead, normalizeTokenizedRow, skillCanTrade } from "@/skills/boundary";
import { HUB_SKILLS, OBSERVED_BAW_VERSION_PHASE16 } from "@/skills/hub-metadata";

describe("binance skill boundary", () => {
  it("does not grant execution and reports install, version, and read outcomes", () => {
    expect(skillCanTrade("query-token-audit")).toBe(false);
    expect(skillCanTrade("binance-tokenized-securities-info")).toBe(false);
    expect(skillCanTrade("binance-agentic-wallet")).toBe(false);
    expect(normalizeSkillRead({ skill: "binance-wallet-tracker", installed: false, ok: false }).code).toBe("NOT_INSTALLED");
    expect(normalizeSkillRead({ skill: "binance-agentic-wallet", installed: true, bawVersion: OBSERVED_BAW_VERSION_PHASE16, ok: true }).code).toBe("VERSION_INCOMPATIBLE");
    const read = normalizeSkillRead({
      skill: "binance-tokenized-securities-info",
      installed: false,
      ok: true,
      ticker: "TSLA",
      symbol: "TSLAon",
      chainId: "56",
      contractAddress: "0xabc",
    });
    expect(read.ok).toBe(true);
    expect(read.tradeIntent).toBeNull();
    expect(read.signed).toBe(false);
    expect(read.broadcast).toBe(false);
    expect(normalizeSkillRead({ skill: "query-token-audit", installed: false, ok: false, error: true }).code).toBe("UPSTREAM_ERROR");
    expect(HUB_SKILLS.find((item) => item.id === "binance-agentic-wallet")?.phase17).toBe("PHASE_17_UPDATE_REQUIRED");
  });

  it("normalizes one tokenized-security row and ignores a bad payload", () => {
    const row = normalizeTokenizedRow({
      success: true,
      data: [{ ticker: "TSLA", symbol: "TSLAon", chainId: "56", contractAddress: "0xabc" }],
    }, "TSLA");
    expect(row.ok).toBe(true);
    if (row.ok) {
      expect(row.symbol).toBe("TSLAon");
    }
    expect(normalizeTokenizedRow({ data: [] }, "TSLA").ok).toBe(false);
    expect(normalizeTokenizedRow(null, "TSLA").ok).toBe(false);
  });
});
