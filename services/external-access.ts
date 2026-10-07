import type { AgentId, UserId } from "@/domain/ids";

/**
 * Future MCP / agent-to-agent boundary.
 *
 * A later adapter may query state, read approved signals, request trade
 * information, or subscribe to decisions. The transport is not implemented.
 * These methods fail closed so a caller cannot mistake this module for a server.
 * UI components are not imported here, so a future adapter can sit beside them.
 */

export interface ExternalAccessRequest {
  userId: UserId;
  agentId: AgentId;
}

export class ExternalAccessNotImplementedError extends Error {
  readonly capability: string;

  constructor(capability: string) {
    super(`External ${capability} access is not implemented. MCP transport is not part of this build.`);
    this.name = "ExternalAccessNotImplementedError";
    this.capability = capability;
  }
}

export interface KairosExternalReadPort {
  readonly implemented: false;
  readonly capabilities: readonly [
    "query_agent_state",
    "read_approved_signals",
    "request_trade_information",
    "subscribe_agent_decisions",
  ];
  queryAgentState(request: ExternalAccessRequest): never;
  readApprovedSignals(request: ExternalAccessRequest): never;
  requestTradeInformation(request: ExternalAccessRequest): never;
}

function notReady(capability: ExternalAccessNotImplementedError["capability"]): never {
  throw new ExternalAccessNotImplementedError(capability);
}

export const kairosExternalReadPort: KairosExternalReadPort = {
  implemented: false,
  capabilities: [
    "query_agent_state",
    "read_approved_signals",
    "request_trade_information",
    "subscribe_agent_decisions",
  ],
  queryAgentState() {
    return notReady("query_agent_state");
  },
  readApprovedSignals() {
    return notReady("read_approved_signals");
  },
  requestTradeInformation() {
    return notReady("request_trade_information");
  },
};
