import {
  admitLiveCapability,
  admitPaperCapability,
  type ExecutionAuthorityErrorCode,
  type LiveExecutionCapability,
  type PaperExecutionCapability,
} from "@/domain/execution-authority";
import type { Scaled } from "@/domain/money";
import type { AgentTradeIntent } from "@/paper/intent";
import type { PaperExecutionPolicy } from "@/paper/policy";
import type { StructuredRiskDecision } from "@/paper/risk-gate";
import { executePaper, type PaperExecution, type PaperExecutionOutcome } from "@/paper/execute";
import type { PaperMarketSnapshot, PaperSimulation } from "@/paper/simulate";

export interface PaperGatewayRequest {
  intent: AgentTradeIntent;
  risk: StructuredRiskDecision;
  snapshot: PaperMarketSnapshot;
  policy: PaperExecutionPolicy;
  nowMs: number;
  cash: Scaled;
  heldQuantity: Scaled;
}

/**
 * Opened only from a paper capability. The live gateway is a different type.
 */
export interface PaperExecutionGateway {
  readonly kind: "paper";
  readonly connected: true;
  readonly contextId: string;
  execute(request: PaperGatewayRequest): PaperExecutionOutcome;
}

export interface LiveExecutionGateway {
  readonly kind: "live";
  readonly connected: false;
  execute(request: PaperGatewayRequest): PaperExecutionOutcome;
}

const PAPER_GATEWAY_SEAL = Symbol("kairos.paper.gateway");
const LIVE_GATEWAY_SEAL = Symbol("kairos.live.gateway");

export function openPaperGateway(
  capability: PaperExecutionCapability,
  nowMs: number,
): { ok: true; gateway: PaperExecutionGateway } | { ok: false; code: ExecutionAuthorityErrorCode; message: string } {
  const admitted = admitPaperCapability(capability, {
    userId: capability.context.userId,
    agentId: capability.context.agentId,
    nowMs,
  });
  if (!admitted.ok) {
    return admitted;
  }
  const contextId = admitted.capability.context.contextId;
  const gateway: PaperExecutionGateway & { readonly [PAPER_GATEWAY_SEAL]: string } = {
    kind: "paper",
    connected: true,
    contextId,
    [PAPER_GATEWAY_SEAL]: contextId,
    execute(request) {
      const again = admitPaperCapability(admitted.capability, {
        userId: request.intent.userId,
        agentId: request.intent.agentId,
        nowMs: request.nowMs,
      });
      if (!again.ok) {
        return refuse(request, again.code, again.message);
      }
      return executePaper({ ...request, authority: admitted.capability });
    },
  };
  return { ok: true, gateway };
}

/**
 * Live capability opens only this gateway. It stays disconnected.
 * It does not call the paper executor.
 */
export function openLiveGateway(
  capability: LiveExecutionCapability,
  nowMs: number,
): { ok: true; gateway: LiveExecutionGateway } | { ok: false; code: ExecutionAuthorityErrorCode; message: string } {
  const admitted = admitLiveCapability(capability, {
    userId: capability.context.userId,
    agentId: capability.context.agentId,
    nowMs,
  });
  if (!admitted.ok) {
    return admitted;
  }
  const gateway: LiveExecutionGateway & { readonly [LIVE_GATEWAY_SEAL]: string } = {
    kind: "live",
    connected: false,
    [LIVE_GATEWAY_SEAL]: admitted.capability.context.contextId,
    execute(request) {
      const again = admitLiveCapability(admitted.capability, {
        userId: request.intent.userId,
        agentId: request.intent.agentId,
        nowMs: request.nowMs,
      });
      if (!again.ok) {
        return { ...refuse(request, again.code, again.message), disconnected: true };
      }
      return {
        ...refuse(request, "EXECUTION_CAPABILITY_MISMATCH", "Real execution is not connected."),
        disconnected: true,
      };
    },
  };
  return { ok: true, gateway };
}

function refuse(request: PaperGatewayRequest, code: ExecutionAuthorityErrorCode, reason: string): PaperExecutionOutcome {
  const execution: PaperExecution = {
    executionId: `exec_${request.intent.intentId}`,
    intentId: request.intent.intentId,
    assetId: request.intent.assetId,
    side: request.intent.action,
    requestedQuantity: request.intent.requestedQuantity,
    filledQuantity: 0n,
    executionPrice: request.snapshot.observedPrice,
    referencePrice: request.intent.referencePrice,
    slippageBps: 0,
    fee: 0n,
    notional: 0n,
    timestamp: new Date(request.nowMs).toISOString(),
    status: "REJECTED",
    strategyId: request.intent.strategyId,
    broadcast: false,
    chainTransactionId: null,
    signature: null,
  };
  const simulation: PaperSimulation = {
    intentId: request.intent.intentId,
    status: "FAIL",
    requestedQuantity: request.intent.requestedQuantity,
    estimatedPrice: request.snapshot.observedPrice,
    estimatedNotional: 0n,
    expectedSlippageBps: 0,
    estimatedFee: 0n,
    estimatedTotalCost: 0n,
    impactBps: 0,
    reasons: [code, reason],
    formula: "refused",
  };
  return { execution, simulation, authorityCode: code };
}
