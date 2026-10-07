import { mkdirSync, writeFileSync } from "node:fs";

/** Recorded proof is never presented as a fresh provider response on replay. */
export function writeIntelligenceEvidence(name: string, value: unknown): void {
  const text = JSON.stringify(value, null, 2);
  const secrets = [process.env.BINANCE_WEB3_API_KEY, process.env.BINANCE_WEB3_SECRET_KEY,
    process.env.KAIROS_LLM_API_KEY, process.env.REDIS_URL].filter((value): value is string => Boolean(value));
  if (secrets.some(secret => text.includes(secret)) || /X-OC-SIGN|Bearer\s|BEGIN PRIVATE KEY|rediss?:\/\//i.test(text)) {
    throw new Error("EVIDENCE_REDACTION_FAILED");
  }
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(`docs/evidence/${name}.json`, `${text}\n`);
}
