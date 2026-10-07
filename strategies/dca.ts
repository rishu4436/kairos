import type { IntelligenceStrategy } from "@/strategies/types";
import { blocked, makeSignal } from "@/strategies/signal-base";
import { parseDecimal } from "@/domain/money";
import { budgetRemaining, dipTriggered, dcaEligibleKey, emptyDcaState } from "@/strategies/dca-math";


export const DCA_VERSION = "1";

export const dcaStrategy: IntelligenceStrategy = {
  metadata: {
    id: "dca",
    name: "DCA",
    category: "execution",
    description: "Deterministic time-based or dip-based tranches. Position-management owned by DCA.",
    enabled: true,
    supportedAssets: ["*"],
    riskLevel: "medium",
    requiredData: ["price", "history"],
    supportedSessions: ["*"],
    status: "implemented",
    version: DCA_VERSION,
  },
  evaluate(context) {
    const params = context.operator?.strategies.dca;
    if (!params?.enabled) {
      return makeSignal(context, {
        strategyId: "dca",
        version: DCA_VERSION,
        action: "NO_SIGNAL",
        evaluation: "NO_SIGNAL",
        confidence: 0,
        reasons: ["DCA is disabled by the operator."],
        evidence: ["disabled"],
        featuresUsed: [],
      });
    }
    if (context.price === null) {
      return blocked(context, "dca", DCA_VERSION, "INSUFFICIENT_DATA", "DCA needs a usable price.");
    }
    const book = context.operator?.dca ?? emptyDcaState(context.representationId, context.ticker, params.mode, params.reference);
    if (book.tranchesCompleted >= params.maxTranches) {
      return hold(context, params, "Maximum DCA tranches reached.");
    }
    if (budgetRemaining(book.budgetSpent, params.maxBudgetNotional) < parseDecimal(params.baseOrderNotional)) {
      return hold(context, params, "DCA budget remaining is below the base order.");
    }
    if (params.mode === "TIME_BASED") {
      if (book.lastFillAtMs !== null && context.asOfMs - book.lastFillAtMs < params.intervalMs) {
        return hold(context, params, "DCA time interval has not elapsed.");
      }
    } else {
      const referenceRaw = params.reference === "INITIAL_REFERENCE" ? book.initialReference ?? book.lastFillPrice : book.lastFillPrice ?? book.initialReference;
      if (referenceRaw !== null) {
        const reference = parseDecimal(referenceRaw);
        if (!dipTriggered(context.price, reference, params.dipThresholdBps)) {
          return hold(context, params, `Price has not declined ${ (params.dipThresholdBps / 100).toFixed(2) }% from the DCA reference.`);
        }
      }
    }
    const key = dcaEligibleKey({
      mode: params.mode,
      nowMs: context.asOfMs,
      intervalMs: params.intervalMs,
      dipThresholdBps: params.dipThresholdBps,
      referencePrice: context.price,
      lastFillPrice: book.lastFillPrice,
    });
    if (book.lastEligibleKey === key) {
      return hold(context, params, "This DCA tranche was already admitted for the current key.");
    }
    return makeSignal(context, {
      strategyId: "dca",
      version: DCA_VERSION,
      action: "BUY",
      evaluation: "SIGNAL",
      confidence: 0.6,
      reasons: [
        params.mode === "TIME_BASED" ? "Time-based DCA tranche is due." : "Dip-based DCA tranche is due.",
        `Tranches ${book.tranchesCompleted}/${params.maxTranches}.`,
      ],
      evidence: [`eligibleKey ${key}`],
      featuresUsed: ["data_freshness"],
      tags: ["DCA"],
    });
  },
};

function hold(context: Parameters<IntelligenceStrategy["evaluate"]>[0], params: NonNullable<NonNullable<typeof context.operator>["strategies"]["dca"]>, reason: string) {
  return makeSignal(context, {
    strategyId: "dca",
    version: DCA_VERSION,
    action: "HOLD",
    evaluation: "VALID",
    confidence: 0.35,
    reasons: [reason, `Mode ${params.mode}.`],
    evidence: [reason],
    featuresUsed: ["data_freshness"],
    tags: ["DCA"],
  });
}
