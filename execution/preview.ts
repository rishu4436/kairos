import type { PreparationRecord } from "@/domain/execution-prep";

export const PAPER_MISSION_TRACK = ["INTENT", "RISK", "SIMULATION", "PAPER FILL", "POSITION"] as const;
export const LIVE_MISSION_TRACK = ["INTENT", "RISK", "QUOTE", "BUILD", "SIMULATION", "READY FOR WALLET"] as const;

export interface LivePreviewModel {
  side: string;
  asset: string;
  notional: string;
  expectedPrice: null;
  slippage: string | null;
  fee: string | null;
  route: string | null;
  quote: "VALID" | "NOT RUN" | "REJECTED" | "EXPIRED";
  build: "PASS" | "NOT RUN" | "FAIL";
  simulation: "PASS" | "NOT RUN" | "FAIL";
  status: "READY FOR WALLET" | "NOT READY";
  signing: "SIGNING DISABLED IN CURRENT BUILD";
  broadcast: false;
}

export interface ExecutionReadinessModel {
  strategy: string;
  risk: "PASS" | "NOT CHECKED";
  quote: "PASS" | "NOT RUN";
  simulation: "PASS" | "NOT RUN";
  wallet: "CONNECTED" | "NOT CONFIGURED";
  final: "READY FOR WALLET" | "NOT READY";
}

export function emptyLivePreview(asset = "—"): LivePreviewModel {
  return {
    side: "—",
    asset,
    notional: "—",
    expectedPrice: null,
    slippage: null,
    fee: null,
    route: null,
    quote: "NOT RUN",
    build: "NOT RUN",
    simulation: "NOT RUN",
    status: "NOT READY",
    signing: "SIGNING DISABLED IN CURRENT BUILD",
    broadcast: false,
  };
}

export function previewFromPreparation(record: PreparationRecord, asset: string, side: string, notional: string): LivePreviewModel {
  const ready = record.state === "TRANSACTION_SIMULATED" && record.simulation?.outcome === "PASS";
  return {
    side,
    asset,
    notional,
    expectedPrice: null,
    slippage: record.quote?.priceImpact === null || record.quote === null ? null : `${record.quote.priceImpact}%`,
    fee: record.quote?.fees ?? null,
    route: record.quote?.source ?? null,
    quote: record.quote === null ? "NOT RUN" : record.quote.status === "VALID" ? "VALID" : record.quote.status === "EXPIRED" ? "EXPIRED" : "REJECTED",
    build: record.build === null ? "NOT RUN" : record.build.to !== null && record.build.data !== null ? "PASS" : "FAIL",
    simulation: record.simulation === null ? "NOT RUN" : record.simulation.outcome === "PASS" ? "PASS" : "FAIL",
    status: ready ? "READY FOR WALLET" : "NOT READY",
    signing: "SIGNING DISABLED IN CURRENT BUILD",
    broadcast: false,
  };
}

export function executionReadiness(input: {
  strategy: string;
  riskPass: boolean;
  quotePass: boolean;
  simulationPass: boolean;
  walletConfigured: boolean;
}): ExecutionReadinessModel {
  const ready = input.riskPass && input.quotePass && input.simulationPass && input.walletConfigured;
  return {
    strategy: input.strategy,
    risk: input.riskPass ? "PASS" : "NOT CHECKED",
    quote: input.quotePass ? "PASS" : "NOT RUN",
    simulation: input.simulationPass ? "PASS" : "NOT RUN",
    wallet: input.walletConfigured ? "CONNECTED" : "NOT CONFIGURED",
    final: ready ? "READY FOR WALLET" : "NOT READY",
  };
}
