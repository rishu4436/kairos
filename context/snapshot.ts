import type { KAIROSContext } from "@/context/types";

/** Exact context available at a decision. No secrets are stored on the context. */
export function serializeContext(context: KAIROSContext): string {
  return JSON.stringify(context);
}

export function restoreContext(serialized: string): KAIROSContext {
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Context snapshot is not an object.");
  }
  return parsed as KAIROSContext;
}
