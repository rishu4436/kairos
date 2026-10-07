import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/research/route";
import { generateResearchThesis } from "@/research/generate";

vi.mock("@/research/generate", () => ({ generateResearchThesis: vi.fn(async () => ({ ok: false, code: "NOT_CONFIGURED" })) }));

describe("server-controlled research provider", () => {
  it("does not pass untrusted provider/model/key fields to the generator", async () => {
    await POST(new Request("http://localhost/api/research", { method: "POST", body: JSON.stringify({ userId: "user_demo", assetId: "NVDA", mode: "llm", provider: "gemini", model: "untrusted", apiKey: "untrusted", KAIROS_LLM_PROVIDER: "gemini" }) }));
    expect(generateResearchThesis).toHaveBeenCalledExactlyOnceWith({ userId: "user_demo", assetId: "NVDA", mode: "llm" });
  });
});
