import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildTokenAuditRequest, normalizeTokenAudit, TOKENIZED_LIST_URL, TOKENIZED_USER_AGENT } from "@/skills/security";

const enabled = process.env.BINANCE_SKILLS_LIVE_TEST === "1";

describe.skipIf(!enabled)("public Binance skill integration", () => {
  it("resolves TSLA on BSC and audits exactly that contract once", async () => {
    const response = await fetch(`${TOKENIZED_LIST_URL}?type=1`, {
      headers: { "User-Agent": TOKENIZED_USER_AGENT, "Accept-Encoding": "identity" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    expect(response.ok).toBe(true);
    expect(body.success).toBe(true);
    const representation = body.data.find((row: { ticker: string; chainId: string }) => row.ticker === "TSLA" && row.chainId === "56");
    expect(representation).toBeDefined();
    const request = buildTokenAuditRequest({ chainId: representation.chainId, contractAddress: representation.contractAddress, requestId: randomUUID() });
    const auditResponse = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(15_000),
    });
    const auditBody = await auditResponse.json();
    const assessment = normalizeTokenAudit({
      assetId: `${representation.chainId}:${representation.contractAddress.toLowerCase()}`,
      chainId: representation.chainId,
      contractAddress: representation.contractAddress,
      body: auditBody,
      checkedAt: new Date().toISOString(),
    });
    expect(assessment.chainId).toBe(representation.chainId);
    expect(assessment.contractAddress).toBe(representation.contractAddress);
    if (!assessment.supported) {
      expect(assessment.available).toBe(false);
      expect(assessment.riskLevel).toBeNull();
    }
    expect(auditResponse.ok && auditBody.success === true).toBe(true);
  }, 40_000);
});
