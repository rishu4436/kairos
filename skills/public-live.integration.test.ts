import { randomUUID } from "node:crypto";
import { writeIntelligenceEvidence } from "@/runtime/intelligence-evidence";
import { describe, expect, it } from "vitest";
import { buildTokenAuditRequest, normalizeTokenAudit, TOKENIZED_LIST_URL, TOKENIZED_USER_AGENT } from "@/skills/security";

const enabled = process.env.BINANCE_SKILLS_LIVE_TEST === "1";

describe.skipIf(!enabled)("public Binance skill evidence", () => {
  it("resolves TSLA on BSC and audits exactly that contract once", async () => {
    const started = Date.now();
    const response = await fetch(`${TOKENIZED_LIST_URL}?type=1`, {
      headers: { "User-Agent": TOKENIZED_USER_AGENT, "Accept-Encoding": "identity" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    const listLatencyMs = Date.now() - started;
    expect(response.ok).toBe(true);
    expect(body.success).toBe(true);
    const representation = body.data.find((row: { ticker: string; chainId: string }) => row.ticker === "TSLA" && row.chainId === "56");
    expect(representation).toBeDefined();
    const request = buildTokenAuditRequest({ chainId: representation.chainId, contractAddress: representation.contractAddress, requestId: randomUUID() });
    const auditStarted = Date.now();
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
    const evidence = {
      label: "RECORDED REAL PROVIDER EVIDENCE",
      timestamp: new Date().toISOString(),
      installed: false,
      invocation: "DOCUMENTED PUBLIC HTTP READ; NO SKILL RUNTIME",
      tokenizedInfo: { httpStatus: response.status, code: body.code, latencyMs: listLatencyMs,
        representation: { ticker: representation.ticker, symbol: representation.symbol,
          chainId: representation.chainId, contractAddress: representation.contractAddress, multiplier: representation.multiplier ?? null } },
      audit: {
        httpStatus: auditResponse.status,
        code: auditBody.code,
        providerSuccess: auditBody.success === true,
        latencyMs: Date.now() - auditStarted,
        state: auditResponse.ok && auditBody.success === true ? assessment.supported ? assessment.available ? "AVAILABLE" : "UNAVAILABLE" : "UNSUPPORTED" : "PROVIDER_ERROR",
        assessment,
      },
      tradingSignal: "NOT_ATTEMPTED",
    };
    writeIntelligenceEvidence("phase-17i-skills", evidence);
    console.log(JSON.stringify(evidence));
    expect(auditResponse.ok && auditBody.success === true).toBe(true);
  }, 40_000);
});
