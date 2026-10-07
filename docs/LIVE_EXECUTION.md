# Live execution

```text
KAIROS risk
  → Binance quote
    → unsigned build
      → simulation
        → Agentic Wallet policy
          → market-order swap, only when explicitly enabled
            → market-order list
```

Paper execution never enters this chain. A live failure does not create a paper fill.

The live record phases are `READY_FOR_WALLET`, `WALLET_PRECHECK`, `WALLET_EXECUTION`, `SUBMITTED`, `VERIFYING`, and `CONFIRMED`. Failures stay on `WALLET_POLICY_BLOCKED`, `EXECUTION_REJECTED`, `EXECUTION_ERROR`, or `VERIFICATION_FAILED`.

`CONFIRMED ON BSC` is reserved for a `FINISHED` order with a transaction hash. That state has not been observed. The command center shows `NOT CONFIGURED` while `baw wallet status` is `UNCONNECTED`.

Correlation id and intent id are copied onto the wallet events. The events do not store secrets.
