import type { SimulationResult, TransactionBuildResult } from "@/domain/execution-prep";
import { KairosApiError } from "@/services/binance/errors";
import { BinanceWeb3Client } from "@/services/binance/client";

const SIMULATE_PATH = "/api/v1/dex/pre-transaction/simulate";

export interface TransactionSimulationGateway {
  simulate(build: TransactionBuildResult, chainId: string): Promise<SimulationResult>;
}

interface SimulatePayload {
  status?: unknown;
  failReason?: unknown;
}

export class BinanceSimulationGateway implements TransactionSimulationGateway {
  constructor(private readonly client: BinanceWeb3Client) {}

  async simulate(build: TransactionBuildResult, chainId: string): Promise<SimulationResult> {
    if (build.from === null || build.to === null || build.data === null || build.value === null) {
      return {
        outcome: "UNKNOWN",
        simulationId: null,
        timestamp: null,
        gas: null,
        failureReason: "The unsigned transaction is missing from, to, data, or value.",
        status: null,
        errorCategory: "MALFORMED_RESPONSE",
      };
    }
    try {
      const result = await this.client.post<SimulatePayload>(SIMULATE_PATH, {
        binanceChainId: chainId,
        evmTx: {
          from: build.from,
          to: build.to,
          value: build.value,
          data: build.data,
        },
      });
      return mapSimulation(result.data, result.responseTimestamp);
    } catch (error) {
      const category = error instanceof KairosApiError ? error.category : "UNKNOWN_ERROR";
      return {
        outcome: "FAIL",
        simulationId: null,
        timestamp: null,
        gas: null,
        failureReason: error instanceof KairosApiError ? error.safeMessage : "The simulation request failed.",
        status: null,
        errorCategory: category,
      };
    }
  }
}

export function mapSimulation(payload: SimulatePayload, responseTimestamp: number | null): SimulationResult {
  const status = typeof payload.status === "string" ? payload.status : null;
  const failReason = payload.failReason === null || payload.failReason === undefined
    ? null
    : typeof payload.failReason === "string"
      ? payload.failReason
      : null;
  const outcome = status === "SUCCESS" ? "PASS" : status === "FAILED" ? "FAIL" : "UNKNOWN";
  return {
    outcome,
    simulationId: null,
    timestamp: responseTimestamp === null ? null : new Date(responseTimestamp).toISOString(),
    gas: null,
    failureReason: outcome === "FAIL" ? failReason : null,
    status,
    errorCategory: outcome === "FAIL" ? "SIMULATION_FAILED" : null,
  };
}

/** This phase does not call the broadcast endpoint. */
export function refuseBroadcast(): { code: "EXECUTION_NOT_AVAILABLE"; broadcast: false; signature: null } {
  return { code: "EXECUTION_NOT_AVAILABLE", broadcast: false, signature: null };
}
