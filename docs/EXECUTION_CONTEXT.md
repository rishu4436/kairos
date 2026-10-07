# Execution context

A caller-supplied `PAPER` or `LIVE` flag is not authority. Any function that can fill, preview, or open a gateway has to receive a trusted execution context. A plain object, a query parameter, or a JSON body does not qualify.

This is simulated execution and does not broadcast blockchain transactions.

## Why a mode argument is not enough

Phase 5.1 checked `executionMode === "PAPER"` on the arguments of the cycle and the gateways. That check is real, and it is also forgeable: the caller chooses the string. A browser request that can pass `mode=LIVE`, or a server function that forwards that string, would be the security boundary. The mode string is now only a field inside a context the server issued.

## Trusted context

`issuePaperExecutionContext` and `issueLiveExecutionContext` in `domain/execution-authority.ts` are the factories. Each context has:

- `contextId`
- `mode` (`PAPER` or `LIVE`)
- `userId`
- `agentId`
- `permissions`
- `createdAt`
- `expiresAt`

The factory stamps a module-private symbol and stores the user, agent, permissions, and expiry in a server registry. `admitPaperCapability` and `admitLiveCapability` accept the call only when the symbol matches the registry and the binding matches. `JSON.parse` of a context drops the symbol, so a browser cannot rebuild one. Changing `userId`, `agentId`, or `mode` on a copy fails because the registry still has the issued values.

Client components do not import the factories. `app/` and `components/` do not call them. `resolveServerPaperCapability` is the request boundary. It ignores `executionMode`, `mode`, and `agentId` from the query. It issues a paper context only when the server data mode is paper and the requested user is the session user. The agent id is the session agent.

## Capabilities

A paper context becomes a `PaperExecutionCapability` with permission `paper_execute`. `openPaperGateway` accepts that capability and returns a `PaperExecutionGateway`.

A live context becomes a `LiveExecutionCapability` with permission `live_execute`. `openLiveGateway` accepts that capability and returns a `LiveExecutionGateway`. That gateway is disconnected. It does not call the paper executor, sign, or broadcast.

The two gateway types are separate. Passing a paper capability to `openLiveGateway`, or a live capability to `openPaperGateway`, fails with `EXECUTION_CAPABILITY_MISMATCH`. The check is the capability kind plus the registry permissions, not a second look at a caller-chosen mode string.

## Binding and expiry

Every admit call takes the user id and agent id of the work being done. A context for `user_demo` / `agent_demo` fails for `user_b` or `agent_b` with `EXECUTION_USER_MISMATCH` or `EXECUTION_AGENT_MISMATCH`.

The default lifetime is 15 minutes. `nowMs >= expiresAt` fails with `EXECUTION_CONTEXT_EXPIRED` before a paper fill and before the disconnected live gateway will run. A missing context fails with `EXECUTION_CONTEXT_REQUIRED`.

## Audit

The context id is stored on the execution record. It is an audit key, not a credential. `readTradeLifecycle` rebuilds:

```text
Arbitration → Intent → Risk → Simulation → Execution Context → Execution → Position
```

The record does not store the seal, a key, or a signature.

## Two state machines

`ArbitrationDecision.loopPhase` stays `WAITING_FOR_RISK`. That record is the decision boundary. The arbitrator does not execute.

`PaperExecutionLifecycle` is the downstream paper loop: `WAITING_FOR_RISK → SIMULATING → PAPER_EXECUTING → MONITORING_POSITION`. Those states are not merged into the arbitration record. `PAPER_EXECUTING` is not chain `EXECUTING`. `MONITORING_POSITION` means an open paper position exists. A later paper cycle can hold, add, reduce, or exit it. See [POSITION_MANAGER.md](POSITION_MANAGER.md).

## Future wallet boundary

Live execution is not implemented. The intended order, still disconnected, is:

```text
Risk PASS
  → quote
    → simulation
      → live execution capability
        → Agentic Wallet
          → signing
            → broadcast
              → verification
```

Issuing a live capability today only opens the disconnected gateway.
