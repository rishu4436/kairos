# Strategy performance

Performance memory is paper, experiment, or shadow. Those datasets are stored separately. A paper fill is attributed by the strategy id, version, intent id, execution id, and correlation id already on the fill. It is not inferred from the clock.

Records are created only for contexts that occur:

- global
- asset
- regime
- session
- asset + regime
- asset + session
- regime + session

User A's records are not readable as User B's. The runtime does not roll user paper results into a cross-user aggregate.

## Expectancy

For n completed trades:

```text
expectancy = (wins / n) × average win − (losses / n) × average loss
```

Average win and average loss are positive net-PnL magnitudes. The identity is net PnL / n. Flat trades stay in n and add zero. n = 0 leaves expectancy null.

Profit factor is gross winning net divided by the absolute losing net. It is null when there are no losses. Win rate is wins / n. Max drawdown is the largest peak-to-trough decline of cumulative net PnL.

## Sample size

| Trades | State |
| --- | --- |
| 0–9 | `INSUFFICIENT` |
| 10–29 | `EARLY` |
| 30–99 | `DEVELOPING` |
| 100+ | `ESTABLISHED` |

These thresholds are policy version `1.0`.

## Health

`UNKNOWN` means no completed trade. `INSUFFICIENT_DATA` covers `INSUFFICIENT` and `EARLY`. A strategy is not `HEALTHY` until the sample is at least `DEVELOPING`, expectancy is positive, drawdown is inside the configured limit, and the warning counters are quiet.

`DEGRADED` is a warning: non-positive expectancy, four consecutive losses, or repeated conflicts. `UNSTABLE` is eight consecutive losses, a drawdown of at least 1500.00 in net PnL units, or repeated data-quality failures. Built-in strategies are not retired by these warnings. A research candidate can be reviewed for retirement only after an established sample and a severe deterioration, and that review does not run itself from the paper loop.

Regime rows and session rows keep their own health. One global number is not the whole record.

An outcome timestamped after the recorder clock, or earlier than the last outcome, is rejected.
