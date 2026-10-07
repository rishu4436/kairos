import { createDemoSession } from "@/data/sample-session";
import {
  issuePaperExecutionContext,
  resolveServerPaperCapability,
  type ExecutionAuthorityErrorCode,
  type PaperExecutionCapability,
} from "@/domain/execution-authority";
import type { ExecutionMode } from "@/domain/execution-mode";
import { asUserId } from "@/domain/ids";
import type { RiskPolicy } from "@/domain/models";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { readDataMode } from "@/lib/mode";
import { buildPaperObservation } from "@/observation/paper";
import { runPreparedAgentCycle, type AgentCycleResult } from "@/paper/cycle";

/**
 * Paper entry for the stored demo policy.
 * The context is issued here from that policy. The caller does not pass a mode.
 */
export function runAgentCycle(userId: string, now = new Date(), options?: { safetyMode?: "NORMAL" | "RISK_REDUCTION_ONLY" }): AgentCycleResult {
  if (readDataMode() !== "paper") {
    return stopped("Paper execution is not issued in live data mode.", null, "EXECUTION_CONTEXT_REQUIRED");
  }
  const policy = readStoredRiskPolicy(userId);
  if (!policy || policy.userId !== userId) {
    return stopped("No risk policy is stored for this user.", null, "EXECUTION_CONTEXT_REQUIRED");
  }
  const authority = issuePaperExecutionContext({
    userId: policy.userId,
    agentId: policy.agentId,
    nowMs: now.getTime(),
  });
  const built = buildPaperObservation(userId, now);
  return runPreparedAgentCycle({
    authority,
    userId: policy.userId,
    agentId: policy.agentId,
    board: built.board,
    candles: built.candles,
    riskPolicy: policy,
    nowMs: now.getTime(),
    safetyMode: options?.safetyMode,
  });
}

/** Server pages mint paper authority for the demo session. Client fields are not accepted. */
export function sessionPaperCapability(nowMs = Date.now()): PaperExecutionCapability | null {
  if (readDataMode() !== "paper") {
    return null;
  }
  const session = createDemoSession();
  const resolved = resolveServerPaperCapability({
    serverDataMode: "paper",
    requestedUserId: session.user.id,
    clientAgentId: null,
    clientMode: null,
    sessionUserId: session.user.id,
    sessionAgentId: session.agent.id,
    nowMs,
  });
  return resolved.ok ? resolved.capability : null;
}

export function readStoredRiskPolicy(userId: string): RiskPolicy | null {
  if (userId !== DEMO_USER_ID) {
    return null;
  }
  return createDemoSession().policy;
}

function stopped(
  reason: string,
  executionMode: ExecutionMode | null,
  authorityCode: ExecutionAuthorityErrorCode | null,
): AgentCycleResult {
  return {
    ran: false,
    reason,
    events: [],
    view: null,
    createdIntentIds: [],
    executionMode,
    authorityCode,
    executionContextId: null,
    loopState: null,
    transitions: [],
  };
}

export function demoUserId() {
  return asUserId(DEMO_USER_ID);
}
