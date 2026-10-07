import { DSL_FEATURES, DSL_OPERATORS, PROPOSAL_ACTIONS, RESEARCH_REGIMES, RESEARCH_SESSIONS } from "@/research/dsl";

const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["OBSERVED_FACT", "OBSERVED_EVENT", "OBSERVED_NEWS", "OBSERVED_EARNINGS", "OBSERVED_EXTERNAL_SIGNAL", "OBSERVED_HISTORICAL_RESULT", "MODEL_INFERENCE", "HYPOTHESIS"] },
    statement: { type: "string" },
    source: { type: ["string", "null"] },
  },
  required: ["kind", "statement", "source"],
} as const;

const hypothesisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    conditions: { type: "array", items: { type: "string" } },
    session: { type: "string", enum: [...RESEARCH_SESSIONS] },
    observationWindowBars: { type: "integer", minimum: 1 },
    testWindowBars: { type: "integer", minimum: 1 },
    expectedOutcome: { type: "string" },
    invalidation: { type: "string" },
  },
  required: ["conditions", "session", "observationWindowBars", "testWindowBars", "expectedOutcome", "invalidation"],
} as const;

const thresholdSchema = {
  anyOf: [
    { type: "number" },
    { type: "string" },
    { type: "array", items: { type: "string" } },
  ],
} as const;

const conditionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    feature: { type: "string", enum: [...DSL_FEATURES] },
    operator: { type: "string", enum: [...DSL_OPERATORS] },
    threshold: thresholdSchema,
  },
  required: ["feature", "operator", "threshold"],
} as const;

/** Schema sent to the Responses API. Identity fields are not in the schema. */
export const RESEARCH_THESIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    hypothesis: hypothesisSchema,
    observations: { type: "array", items: evidenceSchema },
    assumptions: { type: "array", items: { type: "string" } },
    supportingEvidence: { type: "array", items: evidenceSchema },
    contradictingEvidence: { type: "array", items: evidenceSchema },
    requiredData: { type: "array", items: { type: "string" } },
    invalidationConditions: { type: "array", items: { type: "string" } },
    riskConsiderations: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "title",
    "summary",
    "hypothesis",
    "observations",
    "assumptions",
    "supportingEvidence",
    "contradictingEvidence",
    "requiredData",
    "invalidationConditions",
    "riskConsiderations",
    "confidence",
  ],
} as const;

export const STRATEGY_PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assetScope: { type: "array", items: { type: "string" } },
    sessionScope: { type: "array", items: { type: "string", enum: [...RESEARCH_SESSIONS] } },
    regimeScope: { type: "array", items: { type: "string", enum: [...RESEARCH_REGIMES] } },
    features: { type: "array", items: { type: "string", enum: [...DSL_FEATURES] } },
    entryConditions: { type: "array", items: conditionSchema },
    exitConditions: { type: "array", items: conditionSchema },
    holdingPeriod: { type: "integer", minimum: 1, maximum: 96 },
    action: { type: "string", enum: [...PROPOSAL_ACTIONS] },
    positionSizingHint: { type: "string" },
    invalidationConditions: { type: "array", items: { type: "string" } },
    parameterSet: {
      type: "object",
      additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
    },
  },
  required: [
    "assetScope",
    "sessionScope",
    "regimeScope",
    "features",
    "entryConditions",
    "exitConditions",
    "holdingPeriod",
    "action",
    "positionSizingHint",
    "invalidationConditions",
    "parameterSet",
  ],
} as const;

export const RESEARCH_ANALYST_INSTRUCTIONS = [
  "You are a research analyst for KAIROS. You are not a trader.",
  "You have no access to live markets beyond the structured context provided to you.",
  "You must not claim to have read news, earnings, filings, or external sources unless they are explicitly included in the context.",
  "Do not invent missing market data.",
  "Inspect only the evidence in the context. Separate OBSERVED_FACT, OBSERVED_EVENT, OBSERVED_NEWS, OBSERVED_EARNINGS, OBSERVED_EXTERNAL_SIGNAL, MODEL_INFERENCE, and HYPOTHESIS.",
  "An OBSERVED_FACT must cite a source id that appears in the context. A prediction is not an observed fact.",
  "An OBSERVED_EVENT may cite only an event id in the context. A trading restriction is not an earnings result, an EPS figure, or an earnings date.",
  "News status UNAVAILABLE means the provider did not answer. Say news unavailable. Do not rewrite that as no relevant news.",
  "OBSERVED_NEWS cites only a news id in the context. OBSERVED_EARNINGS cites only the earnings event id. Do not invent an earnings date, EPS, or revenue.",
  "An OBSERVED_EXTERNAL_SIGNAL may cite only an external signal or security event id present in the context.",
  "Do not claim that whales are buying unless a fresh Smart Money buy signal is in the context.",
  "Token security is eligibility context. It is not a reason to raise confidence.",
  "An OBSERVED_HISTORICAL_RESULT cites measured paper or experiment performance. It is not a claim about future returns.",
  "Propose a falsifiable hypothesis with a numeric expected outcome and an invalidation condition.",
  "Include contradicting or missing evidence. Do not guarantee a return.",
  "Strategy conditions may use only the declared features, operators, and thresholds. Do not write JavaScript, TypeScript, Python, SQL, shell, or any executable expression.",
  "Do not request tools. Do not name a user, agent, account, or secret.",
  "A position hypothesis is not a PositionDecision. Do not output an exit, an add, or a reduction.",
].join(" ");
