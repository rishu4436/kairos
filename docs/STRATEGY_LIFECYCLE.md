# Strategy lifecycle

A strategy version is immutable. A change appends version 2, version 3, and so on. Built-in Momentum, Mean reversion, and Weekend are version 1, source `BUILT_IN`. A research proposal becomes a separate `RESEARCH_GENERATED` version. The two sources cannot share a version line.

## States

Built-in strategies use `IMPLEMENTED`, `SHADOW`, `PAPER_ACTIVE`, `LIVE_ELIGIBLE`, `LIVE_ACTIVE`, and `RETIRED`.

Research strategies use `PROPOSED`, `VALIDATING`, `EXPERIMENTING`, `CANDIDATE`, `SHADOW`, `PAPER_ACTIVE`, `LIVE_ELIGIBLE`, `REJECTED`, and `RETIRED`.

`RESEARCH_GENERATED` cannot move to `LIVE_ACTIVE`. `activateLiveCandidate()` returns `activated: false`.

```text
RESEARCH → VALIDATION → EXPERIMENT → CANDIDATE → SHADOW → PAPER_ACTIVE → LIVE_ELIGIBLE → explicit activation
```

Shadow evaluates the declarative DSL, records a hypothetical outcome, and does not create a trade intent. Paper-active participation still goes through KAIROS risk and the paper book. It does not broadcast.

The built-in catalog remains the three implemented strategies. Research candidates live in `StrategyCandidateRegistry`.

## Declarative evaluation

`DeclarativeStrategyEvaluator` uses the existing research DSL and the features already computed for the strategy context. It does not generate code and it does not build a second feature engine. `executable` stays false.

## Position attribution

A paper fill records the origin strategy id and version through `recordPaperFill`. An add keeps that version. A hold does not record a trade. `INSUFFICIENT_DATA` does not reduce or exit a position. `DEGRADED` or `UNSTABLE` with a positive sample can support one partial reduction. `RETIRED` can invalidate the origin thesis. Measured health does not replace the current signal and does not promote a candidate. `promoteResearchCandidate()` still returns `promoted: false`. There is no automatic strategy handoff.

`SHADOW` research candidates are evaluated on the paper context and do not enter execution arbitration. `PAPER_ACTIVE` candidates may be scored when the arbitration view is paper. They do not enter live arbitration. `activateLiveCandidate()` stays disabled. A paper research fill keeps `candidateId` and `thesisId` on the evaluation tags together with the strategy version.
