import type { AgentEvent, AgentEventType } from "@/domain/events";
import type { AgenticWalletExecutionResult, LiveExecutionPhase } from "@/domain/agentic-wallet";
import { admitLiveCapability, type LiveExecutionCapability, type PaperExecutionCapability } from "@/domain/execution-authority";
import { acceptHumanConfirmation } from "@/wallet/agentic/live-test";
import { assessWalletPolicy } from "@/wallet/agentic/policy";
import type { AgenticWalletGateway } from "@/wallet/agentic/gateway";
import type { AgenticWalletSecurityPolicy } from "@/domain/agentic-wallet";
import type { OperatorTokenScope } from "@/wallet/agentic/token-scope";

export interface AgenticExecutionRequest {
  capability: LiveExecutionCapability | PaperExecutionCapability;
  userId: string;
  agentId: string;
  assetId: string;
  action: "BUY" | "SELL" | "HOLD";
  notionalUsd: number;
  fromToken: string;
  toToken: string;
  fromTokenQty: string;
  slippagePercent: string;
  chainId: string;
  correlationId: string;
  intentId: string;
  nowMs: number;
  riskPassed: boolean;
  quoteValid: boolean;
  quoteExpired: boolean;
  slippageWithinPolicy: boolean;
  buildPassed: boolean;
  simulationPassed: boolean;
  tradable: boolean;
  policy: AgenticWalletSecurityPolicy | null;
  walletConnected: boolean;
  walletAddress: string | null;
  expectedWalletAddress: string | null;
  humanConfirmation: string | null;
  expectedConfirmation: string | null;
  operatorScope?: OperatorTokenScope | null;
}

export interface AgenticExecutionOutcome {
  phase: LiveExecutionPhase;
  reason: string | null;
  result: AgenticWalletExecutionResult | null;
  events: AgentEvent[];
  paperFill: false;
}

export async function executeThroughAgenticWallet(
  request: AgenticExecutionRequest,
  gateway: AgenticWalletGateway,
  executeEnabled: boolean,
): Promise<AgenticExecutionOutcome> {
  const events: AgentEvent[] = [];
  const push = (type: AgentEventType, message: string) => {
    events.push(event(request, type, message));
  };
  if (request.capability.kind !== "live_execution") {
    return done("EXECUTION_REJECTED", "EXECUTION_CAPABILITY_MISMATCH", null, events);
  }
  const admitted = admitLiveCapability(request.capability, {
    userId: request.userId,
    agentId: request.agentId,
    nowMs: request.nowMs,
  });
  if (!admitted.ok) {
    return done("EXECUTION_REJECTED", admitted.code, null, events);
  }
  push("WALLET_CHECK_STARTED", "Wallet precheck started.");
  const missing = precondition(request);
  if (missing !== null) {
    push("WALLET_EXECUTION_REJECTED", missing);
    return done("EXECUTION_REJECTED", missing, null, events);
  }
  if (request.walletConnected) {
    push("WALLET_CONNECTED", "Wallet status is connected.");
  }
  push("WALLET_POLICY_READ", "Wallet policy was read.");
  const policy = assessWalletPolicy({
    notionalUsd: request.notionalUsd,
    policy: request.policy,
    chainId: request.chainId,
    tokens: [request.fromToken, request.toToken],
    operatorScope: request.operatorScope,
  });
  if (!policy.allowed) {
    push("WALLET_POLICY_BLOCKED", policy.reason);
    return done("WALLET_POLICY_BLOCKED", policy.reason, null, events);
  }
  if (policy.reason === "REQUIRES APP CONFIRMATION") {
    push("WALLET_CONFIRMATION_REQUIRED", "The wallet requires Binance App confirmation.");
  }
  if (!executeEnabled) {
    return done("READY_FOR_WALLET", "EXECUTION_NOT_ENABLED", null, events);
  }
  if (!acceptHumanConfirmation(request.humanConfirmation, request.expectedConfirmation)) {
    return done("READY_FOR_WALLET", "CONFIRMATION_REQUIRED", null, events);
  }
  push("WALLET_EXECUTION_STARTED", "Wallet execution started.");
  const submitted = await gateway.executeSwap({
    userId: request.userId,
    agentId: request.agentId,
    fromToken: request.fromToken,
    toToken: request.toToken,
    fromTokenQty: request.fromTokenQty,
    binanceChainId: "56",
    slippagePercent: request.slippagePercent,
  });
  if (submitted.status !== "SUBMITTED" || submitted.orderId === null) {
    push("WALLET_EXECUTION_REJECTED", submitted.errorCategory ?? "EXECUTION_ERROR");
    return done("EXECUTION_ERROR", submitted.errorCategory ?? "EXECUTION_ERROR", submitted, events);
  }
  push("WALLET_EXECUTION_SUBMITTED", "The wallet accepted an order id. Confirmation is separate.");
  push("TRANSACTION_VERIFICATION_STARTED", "Order status check started.");
  const verified = await gateway.getOrderStatus(request.userId, submitted.orderId);
  if (verified.status === "CONFIRMED") {
    push("TRANSACTION_CONFIRMED", "The wallet reported the order finished.");
    return done("CONFIRMED", null, verified, events);
  }
  if (verified.status === "REJECTED") {
    push("WALLET_EXECUTION_REJECTED", "The wallet reported the order failed.");
    return done("EXECUTION_REJECTED", "EXECUTION_REJECTED", verified, events);
  }
  push("TRANSACTION_VERIFICATION_FAILED", "The order is not confirmed.");
  return done("VERIFICATION_FAILED", "VERIFICATION_FAILED", verified, events);
}

function precondition(request: AgenticExecutionRequest): string | null {
  if (request.action !== "BUY" && request.action !== "SELL") {
    return "ACTION_NOT_EXECUTABLE";
  }
  if (!request.riskPassed) {
    return "RISK_NOT_PASSED";
  }
  if (!request.quoteValid || request.quoteExpired) {
    return "QUOTE_EXPIRED";
  }
  if (!request.slippageWithinPolicy) {
    return "SLIPPAGE_LIMIT_EXCEEDED";
  }
  if (!request.buildPassed) {
    return "TRANSACTION_BUILD_FAILED";
  }
  if (!request.simulationPassed) {
    return "SIMULATION_FAILED";
  }
  if (!request.tradable) {
    return "TOKEN_NOT_TRADABLE";
  }
  if (!request.walletConnected) {
    return "WALLET_UNAVAILABLE";
  }
  if (request.chainId !== "56") {
    return "WRONG_CHAIN";
  }
  if (request.walletAddress === null || request.walletAddress !== request.expectedWalletAddress) {
    return "WALLET_MISMATCH";
  }
  return null;
}

function done(
  phase: LiveExecutionPhase,
  reason: string | null,
  result: AgenticWalletExecutionResult | null,
  events: AgentEvent[],
): AgenticExecutionOutcome {
  return { phase, reason, result, events, paperFill: false };
}

function event(request: AgenticExecutionRequest, type: AgentEventType, message: string): AgentEvent {
  return {
    id: `${type}_${request.intentId}_${request.nowMs}`,
    type,
    at: new Date(request.nowMs).toISOString(),
    ticker: null,
    strategyId: null,
    message,
    userId: request.userId,
    agentId: request.agentId,
    assetId: request.assetId,
    correlationId: request.correlationId,
    intentId: request.intentId,
  };
}
