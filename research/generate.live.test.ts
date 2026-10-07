import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asUserId } from "@/domain/ids";
import { resetMarketStores } from "@/observation/stores";
import { generateResearchThesis } from "@/research/generate";
import { researchStore } from "@/research/store";

const { liveBoard, paperBoard } = vi.hoisted(() => ({
  liveBoard: vi.fn(async () => {
    throw new Error("live unavailable");
  }),
  paperBoard: vi.fn(() => {
    throw new Error("paper fallback");
  }),
}));

vi.mock("@/lib/mode", () => ({
  readDataMode: () => "live",
}));

vi.mock("@/observation/live", () => ({
  liveObservationBoard: () => liveBoard(),
}));

vi.mock("@/observation/paper", () => ({
  buildPaperObservation: () => paperBoard(),
}));

const NOW = Date.parse("2026-01-01T14:30:00.000Z");
const savedLlmKey = process.env.KAIROS_LLM_API_KEY;
const savedLlmProvider = process.env.KAIROS_LLM_PROVIDER;

describe("live research context without credentials", () => {
  beforeEach(() => {
    resetMarketStores();
    liveBoard.mockClear();
    paperBoard.mockClear();
    delete process.env.KAIROS_LLM_API_KEY;
    delete process.env.KAIROS_LLM_PROVIDER;
  });

  afterEach(() => {
    if (savedLlmKey === undefined) {
      delete process.env.KAIROS_LLM_API_KEY;
    } else {
      process.env.KAIROS_LLM_API_KEY = savedLlmKey;
    }
    if (savedLlmProvider === undefined) {
      delete process.env.KAIROS_LLM_PROVIDER;
    } else {
      process.env.KAIROS_LLM_PROVIDER = savedLlmProvider;
    }
  });

  it("does not call the market board when the model is not configured", async () => {
    const result = await generateResearchThesis({ userId: "user_demo", assetId: "NVDA", mode: "llm", nowMs: NOW });
    expect(result.code).toBe("NOT_CONFIGURED");
    expect(result.message).toMatch(/mock lab is separate/);
    expect(liveBoard).not.toHaveBeenCalled();
    expect(paperBoard).not.toHaveBeenCalled();
    expect(researchStore().listTheses(asUserId("user_demo"))).toHaveLength(0);
  });

  it("reports live market data as not configured and does not substitute the paper series", async () => {
    process.env.KAIROS_LLM_PROVIDER = "xai";
    process.env.KAIROS_LLM_API_KEY = "test-key";
    const result = await generateResearchThesis({ userId: "user_demo", assetId: "NVDA", mode: "llm", nowMs: NOW });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("LIVE_MARKET_DATA_NOT_CONFIGURED");
    expect(result.message).toBe("Live market data is not configured.");
    expect(liveBoard).toHaveBeenCalledOnce();
    expect(paperBoard).not.toHaveBeenCalled();
    expect(researchStore().listTheses(asUserId("user_demo"))).toHaveLength(0);
  });

  it("keeps an explicit mock request off the live board", async () => {
    const result = await generateResearchThesis({ userId: "user_demo", assetId: "NVDA", mode: "mock", nowMs: NOW });
    expect(result.sourceType).toBe("MOCK");
    expect(result.dataSource).toBe("MOCK_FIXTURE");
    expect(liveBoard).not.toHaveBeenCalled();
    expect(paperBoard).not.toHaveBeenCalled();
  });
});
