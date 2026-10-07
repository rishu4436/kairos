import { EXECUTABLE_CODE, isResearchSession } from "@/research/dsl";
import type { DslCondition } from "@/research/dsl";
import type { EvidenceItem, EvidenceKind, FalsifiableHypothesis } from "@/research/types";

const CODE_PATTERN = EXECUTABLE_CODE;

export function parseModelJson(text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false, reason: "The model response was not JSON." };
  }
}

export interface ThesisDraft {
  title: string;
  summary: string;
  hypothesis: FalsifiableHypothesis;
  observations: EvidenceItem[];
  assumptions: string[];
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  requiredData: string[];
  invalidationConditions: string[];
  riskConsiderations: string[];
  confidence: number;
}

export interface ProposalDraft {
  assetScope: string[];
  sessionScope: string[];
  regimeScope: string[];
  features: string[];
  entryConditions: DslCondition[];
  exitConditions: DslCondition[];
  holdingPeriod: number;
  action: string;
  positionSizingHint: string;
  invalidationConditions: string[];
  parameterSet: Record<string, string | number>;
}

export function parseThesisDraft(value: unknown): { ok: true; draft: ThesisDraft } | { ok: false; reasons: string[] } {
  if (!isRecord(value)) {
    return { ok: false, reasons: ["Thesis response must be an object."] };
  }
  const reasons: string[] = [];
  const title = readString(value.title, "title", reasons);
  const summary = readString(value.summary, "summary", reasons);
  const hypothesis = readHypothesis(value.hypothesis, reasons);
  const observations = readEvidence(value.observations, "observations", reasons);
  const supportingEvidence = readEvidence(value.supportingEvidence, "supportingEvidence", reasons);
  const contradictingEvidence = readEvidence(value.contradictingEvidence, "contradictingEvidence", reasons);
  const confidence = readConfidence(value.confidence, reasons);
  const assumptions = readStringList(value.assumptions, "assumptions", reasons);
  const requiredData = readStringList(value.requiredData, "requiredData", reasons);
  const invalidationConditions = readStringList(value.invalidationConditions, "invalidationConditions", reasons);
  const riskConsiderations = readStringList(value.riskConsiderations, "riskConsiderations", reasons);
  if (reasons.length > 0 || !hypothesis) {
    return { ok: false, reasons };
  }
  return {
    ok: true,
    draft: {
      title,
      summary,
      hypothesis,
      observations,
      assumptions,
      supportingEvidence,
      contradictingEvidence,
      requiredData,
      invalidationConditions,
      riskConsiderations,
      confidence,
    },
  };
}

export function parseProposalDraft(value: unknown): { ok: true; draft: ProposalDraft } | { ok: false; reasons: string[] } {
  if (!isRecord(value)) {
    return { ok: false, reasons: ["Proposal response must be an object."] };
  }
  const reasons: string[] = [];
  const action = readString(value.action, "action", reasons);
  const holding = value.holdingPeriod;
  if (!Number.isInteger(holding)) {
    reasons.push("Holding period must be an integer.");
  }
  const entry = readConditions(value.entryConditions, "entryConditions", reasons);
  const exit = readConditions(value.exitConditions, "exitConditions", reasons);
  const assetScope = readStringList(value.assetScope, "assetScope", reasons);
  const sessionScope = readStringList(value.sessionScope, "sessionScope", reasons);
  const regimeScope = readStringList(value.regimeScope, "regimeScope", reasons);
  const features = readStringList(value.features, "features", reasons);
  const invalidationConditions = readStringList(value.invalidationConditions, "invalidationConditions", reasons);
  const positionSizingHint = typeof value.positionSizingHint === "string" ? value.positionSizingHint.trim() : "";
  if (CODE_PATTERN.test(positionSizingHint)) {
    reasons.push("Executable code is not allowed in position sizing.");
  }
  if (reasons.length > 0 || !Number.isInteger(holding)) {
    return { ok: false, reasons };
  }
  return {
    ok: true,
    draft: {
      assetScope,
      sessionScope,
      regimeScope,
      features,
      entryConditions: entry,
      exitConditions: exit,
      holdingPeriod: holding as number,
      action,
      positionSizingHint,
      invalidationConditions,
      parameterSet: readParameters(value.parameterSet),
    },
  };
}

function readHypothesis(value: unknown, reasons: string[]): FalsifiableHypothesis | null {
  if (!isRecord(value)) {
    reasons.push("Hypothesis must be an object.");
    return null;
  }
  const session = typeof value.session === "string" ? value.session : "";
  if (!isResearchSession(session)) {
    reasons.push("Hypothesis session is not a known session.");
  }
  return {
    conditions: readStringList(value.conditions, "hypothesis.conditions", reasons),
    session: isResearchSession(session) ? session : "ANY",
    observationWindowBars: Number.isInteger(value.observationWindowBars) ? (value.observationWindowBars as number) : 0,
    testWindowBars: Number.isInteger(value.testWindowBars) ? (value.testWindowBars as number) : 0,
    expectedOutcome: typeof value.expectedOutcome === "string" ? value.expectedOutcome.trim() : "",
    invalidation: typeof value.invalidation === "string" ? value.invalidation.trim() : "",
  };
}

function readEvidence(value: unknown, label: string, reasons: string[]): EvidenceItem[] {
  if (!Array.isArray(value)) {
    reasons.push(`${label} must be a list.`);
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.statement !== "string" || typeof item.kind !== "string") {
      reasons.push(`${label} contains an item without kind and statement.`);
      return [];
    }
    if (CODE_PATTERN.test(item.statement)) {
      reasons.push(`Executable code is not allowed in ${label}.`);
    }
    const kind = item.kind as EvidenceKind;
    const source = item.source === null || item.source === undefined ? null : typeof item.source === "string" ? item.source : null;
    if (item.source !== null && item.source !== undefined && typeof item.source !== "string") {
      reasons.push(`${label} source must be a string or null.`);
    }
    return [{ kind, statement: item.statement.trim(), source }];
  });
}

function readConditions(value: unknown, label: string, reasons: string[]): DslCondition[] {
  if (!Array.isArray(value)) {
    reasons.push(`${label} must be a list.`);
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.feature !== "string" || typeof item.operator !== "string") {
      reasons.push(`${label} contains a malformed condition.`);
      return [];
    }
    if (CODE_PATTERN.test(item.feature) || CODE_PATTERN.test(item.operator)) {
      reasons.push(`Executable code is not allowed in ${label}.`);
    }
    const threshold = readThreshold(item.threshold, label, reasons);
    if (threshold === null) {
      return [];
    }
    return [{ feature: item.feature, operator: item.operator, threshold }];
  });
}

function readThreshold(value: unknown, label: string, reasons: string[]): DslCondition["threshold"] | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      reasons.push(`${label} threshold is not finite.`);
      return null;
    }
    return value;
  }
  if (typeof value === "string") {
    if (CODE_PATTERN.test(value)) {
      reasons.push(`Executable code is not allowed in ${label}.`);
    }
    return value.trim();
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => item.trim());
  }
  reasons.push(`${label} threshold is not a number, string, or list of strings.`);
  return null;
}

function readParameters(value: unknown): Record<string, string | number> {
  if (!isRecord(value)) {
    return {};
  }
  const parameters: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number" && Number.isFinite(item)) {
      parameters[key] = item;
    } else if (typeof item === "string" && !CODE_PATTERN.test(item)) {
      parameters[key] = item;
    }
  }
  return parameters;
}

function readConfidence(value: unknown, reasons: string[]): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    reasons.push("Confidence must be a finite number.");
    return 0;
  }
  return value;
}

function readString(value: unknown, label: string, reasons: string[]): string {
  if (typeof value !== "string") {
    reasons.push(`${label} must be a string.`);
    return "";
  }
  if (CODE_PATTERN.test(value)) {
    reasons.push(`Executable code is not allowed in ${label}.`);
  }
  return value.trim();
}

function readStringList(value: unknown, label: string, reasons: string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    if (CODE_PATTERN.test(item)) {
      reasons.push(`Executable code is not allowed in ${label}.`);
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length > 0) {
      items.push(trimmed);
    }
  }
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
