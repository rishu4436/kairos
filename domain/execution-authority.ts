import type { AgentId, UserId } from "@/domain/ids";
import type { ExecutionMode } from "@/domain/execution-mode";

/**
 * Server-issued execution authority.
 * A mode string, a query parameter, or a JSON body cannot mint this object.
 * The seal is a module-private symbol. The registry is the source of user,
 * agent, permission, and expiry. Copies that drop the symbol, or that change
 * a field, fail closed.
 */
export const EXECUTION_CONTEXT_TTL_MS = 15 * 60 * 1000;

export const EXECUTION_AUTHORITY_ERRORS = [
  "EXECUTION_CONTEXT_REQUIRED",
  "EXECUTION_CONTEXT_INVALID",
  "EXECUTION_CONTEXT_EXPIRED",
  "EXECUTION_USER_MISMATCH",
  "EXECUTION_AGENT_MISMATCH",
  "EXECUTION_CAPABILITY_MISMATCH",
] as const;

export type ExecutionAuthorityErrorCode = (typeof EXECUTION_AUTHORITY_ERRORS)[number];

export type ExecutionPermission = "paper_execute" | "live_execute";

export interface TrustedExecutionContext {
  readonly contextId: string;
  readonly mode: ExecutionMode;
  readonly userId: UserId;
  readonly agentId: AgentId;
  readonly permissions: readonly ExecutionPermission[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface PaperExecutionCapability {
  readonly kind: "paper_execution";
  readonly context: TrustedExecutionContext;
}

export interface LiveExecutionCapability {
  readonly kind: "live_execution";
  readonly context: TrustedExecutionContext;
}

export interface ExecutionBinding {
  userId: string;
  agentId: string;
  nowMs: number;
}

export type ExecutionAuthorityResult<T> =
  | { ok: true; capability: T }
  | { ok: false; code: ExecutionAuthorityErrorCode; message: string };

interface RegistryRecord {
  contextId: string;
  mode: ExecutionMode;
  userId: string;
  agentId: string;
  permissions: readonly ExecutionPermission[];
  createdAtMs: number;
  expiresAtMs: number;
}

const AUTHORITY_SEAL = Symbol("kairos.execution.authority");
const registry = new Map<string, RegistryRecord>();
let sequence = 0;

type SealedContext = TrustedExecutionContext & { readonly [AUTHORITY_SEAL]: string };

const MESSAGES: Record<ExecutionAuthorityErrorCode, string> = {
  EXECUTION_CONTEXT_REQUIRED: "Execution requires a trusted context.",
  EXECUTION_CONTEXT_INVALID: "The execution context is not trusted.",
  EXECUTION_CONTEXT_EXPIRED: "The execution context is expired.",
  EXECUTION_USER_MISMATCH: "The execution context belongs to a different user.",
  EXECUTION_AGENT_MISMATCH: "The execution context belongs to a different agent.",
  EXECUTION_CAPABILITY_MISMATCH: "This capability cannot perform that execution.",
};

export function resetExecutionAuthority(): void {
  registry.clear();
  sequence = 0;
}

export function executionAuthoritySize(): number {
  return registry.size;
}

export interface IssueExecutionContextInput {
  userId: UserId;
  agentId: AgentId;
  nowMs: number;
  ttlMs?: number;
}

/** Internal factory. Server code and tests call this. Client components must not. */
export function issuePaperExecutionContext(input: IssueExecutionContextInput): PaperExecutionCapability {
  return Object.freeze({
    kind: "paper_execution",
    context: seal("PAPER", ["paper_execute"], input),
  });
}

/**
 * Placeholder for a future live path. Issuing this does not connect a wallet,
 * sign, or broadcast. Request handlers must not call it from client input.
 */
export function issueLiveExecutionContext(input: IssueExecutionContextInput): LiveExecutionCapability {
  return Object.freeze({
    kind: "live_execution",
    context: seal("LIVE", ["live_execute"], input),
  });
}

export function admitPaperCapability(
  value: unknown,
  binding: ExecutionBinding,
): ExecutionAuthorityResult<PaperExecutionCapability> {
  return admit(value, "paper_execution", "PAPER", ["paper_execute"], binding);
}

export function admitLiveCapability(
  value: unknown,
  binding: ExecutionBinding,
): ExecutionAuthorityResult<LiveExecutionCapability> {
  return admit(value, "live_execution", "LIVE", ["live_execute"], binding);
}

export interface ServerPaperAuthorityInput {
  serverDataMode: "paper" | "live";
  requestedUserId: string;
  /** Ignored. A request must not choose the agent. */
  clientAgentId: string | null;
  /** Ignored. A request must not choose PAPER or LIVE. */
  clientMode: string | null;
  sessionUserId: UserId;
  sessionAgentId: AgentId;
  nowMs: number;
}

/**
 * The only request boundary that mints paper authority.
 * Client mode and client agent id are not read for the decision.
 * Live server mode does not mint a paper capability.
 */
export function resolveServerPaperCapability(
  input: ServerPaperAuthorityInput,
): ExecutionAuthorityResult<PaperExecutionCapability> {
  void input.clientAgentId;
  void input.clientMode;
  if (input.serverDataMode !== "paper") {
    return failure("EXECUTION_CONTEXT_REQUIRED");
  }
  if (input.requestedUserId !== input.sessionUserId) {
    return failure("EXECUTION_USER_MISMATCH");
  }
  const capability = issuePaperExecutionContext({
    userId: input.sessionUserId,
    agentId: input.sessionAgentId,
    nowMs: input.nowMs,
  });
  return { ok: true, capability };
}

function seal(
  mode: ExecutionMode,
  permissions: readonly ExecutionPermission[],
  input: IssueExecutionContextInput,
): SealedContext {
  const ttl = input.ttlMs ?? EXECUTION_CONTEXT_TTL_MS;
  const contextId = `ctx_${mode}_${input.userId}_${input.agentId}_${input.nowMs}_${sequence}`;
  sequence += 1;
  const record: RegistryRecord = {
    contextId,
    mode,
    userId: input.userId,
    agentId: input.agentId,
    permissions,
    createdAtMs: input.nowMs,
    expiresAtMs: input.nowMs + ttl,
  };
  registry.set(contextId, record);
  return Object.freeze({
    contextId,
    mode,
    userId: input.userId,
    agentId: input.agentId,
    permissions,
    createdAt: new Date(input.nowMs).toISOString(),
    expiresAt: new Date(record.expiresAtMs).toISOString(),
    [AUTHORITY_SEAL]: contextId,
  });
}

function admit<T extends PaperExecutionCapability | LiveExecutionCapability>(
  value: unknown,
  kind: T["kind"],
  mode: ExecutionMode,
  permissions: readonly ExecutionPermission[],
  binding: ExecutionBinding,
): ExecutionAuthorityResult<T> {
  if (value == null) {
    return failure("EXECUTION_CONTEXT_REQUIRED");
  }
  if (typeof value !== "object") {
    return failure("EXECUTION_CONTEXT_INVALID");
  }
  const candidate = value as { kind?: unknown; context?: SealedContext };
  if (candidate.kind === "live_execution" && kind === "paper_execution") {
    return failure("EXECUTION_CAPABILITY_MISMATCH");
  }
  if (candidate.kind === "paper_execution" && kind === "live_execution") {
    return failure("EXECUTION_CAPABILITY_MISMATCH");
  }
  if (candidate.kind !== kind) {
    return failure("EXECUTION_CONTEXT_INVALID");
  }
  const context = candidate.context;
  if (!context || typeof context !== "object") {
    return failure("EXECUTION_CONTEXT_INVALID");
  }
  if (context[AUTHORITY_SEAL] !== context.contextId) {
    return failure("EXECUTION_CONTEXT_INVALID");
  }
  const record = registry.get(context.contextId);
  if (!record || record.contextId !== context.contextId) {
    return failure("EXECUTION_CONTEXT_INVALID");
  }
  if (
    record.mode !== context.mode ||
    record.userId !== context.userId ||
    record.agentId !== context.agentId ||
    record.mode !== mode ||
    !samePermissions(record.permissions, permissions)
  ) {
    return failure("EXECUTION_CONTEXT_INVALID");
  }
  if (binding.nowMs >= record.expiresAtMs) {
    return failure("EXECUTION_CONTEXT_EXPIRED");
  }
  if (binding.userId !== record.userId) {
    return failure("EXECUTION_USER_MISMATCH");
  }
  if (binding.agentId !== record.agentId) {
    return failure("EXECUTION_AGENT_MISMATCH");
  }
  return { ok: true, capability: candidate as unknown as T };
}

function samePermissions(actual: readonly ExecutionPermission[], expected: readonly ExecutionPermission[]): boolean {
  return actual.length === expected.length && actual.every((permission, index) => permission === expected[index]);
}

function failure(code: ExecutionAuthorityErrorCode): { ok: false; code: ExecutionAuthorityErrorCode; message: string } {
  return { ok: false, code, message: MESSAGES[code] };
}
