# Recovery

On the next cycle the store looks at the previous record. A non-terminal status (`EXECUTING_PAPER` and the other in-progress states) is copied as `INTERRUPTED`. The runtime does not replay that execution.

Paper recovery reloads the account, position meta, intent stamps, and completed intent ids. The next cycle sees the open position and calls the Position Manager. It does not open a second independent position.

A completed intent id stays completed across that reload. The fill function returns the prior execution id.

Live recovery, when it exists, must check whether an order was submitted before it does anything else. That path is not enabled.

With the memory backend, research candidates, performance, and arbitration cooldown still live in the process. With Redis, the cycle writes them into the domain snapshot and a new store object reloads them before the next pass. `SHADOW` candidates still create no intent. `PAPER_ACTIVE` stays `PAPER_ACTIVE` across that reload and is not turned into `LIVE_ACTIVE`. `activateLiveCandidate()` still returns `activated: false`.

Research cadence defaults to one hour (`KAIROS_RESEARCH_INTERVAL_MS`). A model error is recorded and the market cycle continues. A new candidate does not promote itself to live.
