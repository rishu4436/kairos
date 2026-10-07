/**
 * Studio-facing read-only intelligence work hook. The generated seller's
 * sign/submit/settle runtime is deliberately not instantiated in this phase.
 */
import { fulfillIntelligenceJob } from "../../../../intelligence";

/** Studio 0.0.14 RunWork-compatible deliverable hook. No signer or LLM required. */
export async function runIntelligenceWork(prompt: string): Promise<string> {
  let job: unknown;
  try { job = JSON.parse(prompt); } catch { job = prompt; }
  return JSON.stringify(fulfillIntelligenceJob(job));
}
