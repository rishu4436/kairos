import type { ReasoningProvider, ProviderResult } from "@/research/provider";
import { STRATEGY_PROPOSAL_PROMPT_VERSION, THESIS_PROMPT_VERSION, type ResearchContext, type ResearchThesis } from "@/research/types";

/** Deterministic stand-in. The same context always produces the same payload. */
export class MockReasoningProvider implements ReasoningProvider {
  readonly id = "mock";
  readonly model = "mock-1";
  readonly configured = false;

  async generateThesis(context: ResearchContext): Promise<ProviderResult> {
    return ok(THESIS_PROMPT_VERSION, {
      title: `Continuation check for ${context.ticker}`,
      summary: "A falsifiable momentum check. This record was not produced by a live model.",
      hypothesis: {
        conditions: ["1h return is at least 50 bps", "regime is TRENDING_UP"],
        session: "ANY",
        observationWindowBars: 4,
        testWindowBars: 4,
        expectedOutcome: "Forward close 4 bars later exceeds the entry close by more than 20 bps after fees.",
        invalidation: "1h return falls below 0 bps or the regime is no longer TRENDING_UP.",
      },
      observations: [
        { kind: "OBSERVED_FACT", statement: "The research context includes return_1h when the feature engine can compute it.", source: "return_1h" },
      ],
      assumptions: ["15-minute closes are the only price input.", "No news or earnings were supplied."],
      supportingEvidence: [
        { kind: "OBSERVED_FACT", statement: "return_1h is an exposed feature.", source: "return_1h" },
        { kind: "MODEL_INFERENCE", statement: "A positive 1h return can persist for a few bars while the regime stays up.", source: null },
      ],
      contradictingEvidence: [
        { kind: "HYPOTHESIS", statement: "The same return can reverse inside the holding window.", source: null },
        { kind: "OBSERVED_FACT", statement: "News and earnings were not provided.", source: "observation" },
      ],
      requiredData: ["return_1h", "regime"],
      invalidationConditions: ["return_1h < 0", "regime != TRENDING_UP"],
      riskConsiderations: ["Single asset.", "Fees can erase a small continuation."],
      confidence: 0.42,
    });
  }

  async generateStrategyProposal(context: ResearchContext, thesis: ResearchThesis): Promise<ProviderResult> {
    return ok(STRATEGY_PROPOSAL_PROMPT_VERSION, {
      assetScope: [context.ticker],
      sessionScope: ["ANY"],
      regimeScope: ["TRENDING_UP"],
      features: ["return_1h", "regime"],
      entryConditions: [
        { feature: "return_1h", operator: "GTE", threshold: 50 },
        { feature: "regime", operator: "EQ", threshold: "TRENDING_UP" },
      ],
      exitConditions: [{ feature: "return_1h", operator: "LT", threshold: 0 }],
      holdingPeriod: thesis.hypothesis.testWindowBars,
      action: "BUY",
      positionSizingHint: "Experiment uses one unit. The hint does not allocate capital.",
      invalidationConditions: ["return_1h < 0"],
      parameterSet: { holdingBars: thesis.hypothesis.testWindowBars },
    });
  }
}

function ok(promptVersion: string, value: unknown): ProviderResult {
  return {
    ok: true,
    value,
    latencyMs: 0,
    requestId: `mock_${promptVersion}`,
    provider: "mock",
    model: "mock-1",
    promptVersion,
    startedAt: "",
    completedAt: "",
  };
}
