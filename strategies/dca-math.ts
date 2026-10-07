import { parseDecimal, type Scaled } from "@/domain/money";
export type DcaMode = "TIME_BASED" | "DIP_BASED";
export type DcaReference = "LAST_DCA_FILL" | "INITIAL_REFERENCE";

export interface DcaAssetState {
  strategyId: "dca";
  strategyVersion: "1";
  assetId: string;
  ticker: string;
  mode: DcaMode;
  reference: DcaReference;
  initialReference: string | null;
  lastFillPrice: string | null;
  lastFillAtMs: number | null;
  lastEligibleKey: string | null;
  tranchesCompleted: number;
  budgetSpent: string;
  status: "IDLE" | "ACTIVE" | "COMPLETE" | "BLOCKED";
}

export function emptyDcaState(assetId: string, ticker: string, mode: DcaMode, reference: DcaReference): DcaAssetState {
  return {
    strategyId: "dca",
    strategyVersion: "1",
    assetId,
    ticker,
    mode,
    reference,
    initialReference: null,
    lastFillPrice: null,
    lastFillAtMs: null,
    lastEligibleKey: null,
    tranchesCompleted: 0,
    budgetSpent: "0",
    status: "IDLE",
  };
}

export function dcaEligibleKey(input: {
  mode: DcaMode;
  nowMs: number;
  intervalMs: number;
  dipThresholdBps: number;
  referencePrice: Scaled | null;
  lastFillPrice: string | null;
}): string {
  if (input.mode === "TIME_BASED") {
    const bucket = Math.floor(input.nowMs / input.intervalMs);
    return `time:${bucket}`;
  }
  const ref = input.lastFillPrice ?? (input.referencePrice === null ? "none" : input.referencePrice.toString());
  return `dip:${ref}:${input.dipThresholdBps}`;
}

export function dipTriggered(price: Scaled, reference: Scaled, thresholdBps: number): boolean {
  if (reference <= 0n) {
    return false;
  }
  const dropBps = ((reference - price) * 10_000n) / reference;
  return dropBps >= BigInt(thresholdBps);
}

export function budgetRemaining(spent: string, maxBudget: string): Scaled {
  const left = parseDecimal(maxBudget) - parseDecimal(spent);
  return left < 0n ? 0n : left;
}
