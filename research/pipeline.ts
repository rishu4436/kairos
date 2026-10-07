import type { AgentId, UserId } from "@/domain/ids";
import { parseDecimal, type Scaled } from "@/domain/money";
import { runExperiment } from "@/research/experiment";
import { parseProposalDraft, parseThesisDraft } from "@/research/parse";
import type { ProviderResult, ReasoningProvider } from "@/research/provider";
import type { ResearchBar } from "@/research/snapshot";
import type { ResearchStore } from "@/research/store";
import type { ResearchContext, ResearchProvenance, ResearchThesis, StrategyExperiment, StrategyProposal } from "@/research/types";
import { validateEvidenceAgainstContext, validateProposal, validateThesis } from "@/research/validate";
import { recordExperimentSummary } from "@/lifecycle/recorder";
import { buildExternalExperimentContext } from "@/skills/clients";
import type { MarketDataSource } from "@/research/types";

export interface ResearchRun {
  thesis: ResearchThesis;
  proposal: StrategyProposal | null;
  experiment: StrategyExperiment | null;
}

export async function runResearchDraft(input: {
  provider: ReasoningProvider;
  context: ResearchContext;
  store: ResearchStore;
  bars: readonly ResearchBar[];
  dataset: string;
  dataSource: MarketDataSource;
  contextTimestamp: string;
  contextDataVersion: string;
  initialCapital: Scaled;
  nowMs: number;
  userId: UserId;
  agentId: AgentId;
}): Promise<ResearchRun> {
  const createdAt = new Date(input.nowMs).toISOString();
  const thesisId = `thesis_${input.userId}_${input.context.ticker}_${input.nowMs}`;
  const thesisResponse = await input.provider.generateThesis(input.context);
  const parsedThesis = thesisResponse.ok ? parseThesisDraft(thesisResponse.value) : { ok: false as const, reasons: [thesisResponse.ok ? "" : thesisResponse.error] };
  const provenance = { ...provenanceFrom(thesisResponse, input.provider, createdAt, input.contextTimestamp, input.contextDataVersion), contextId: input.context.contextId };
  let thesis = blankThesis(input, thesisId, createdAt, provenance);
  if (!thesisResponse.ok) {
    thesis = { ...thesis, status: "MODEL_ERROR", rejectionReasons: [thesisResponse.error], updatedAt: createdAt };
    input.store.saveThesis(thesis);
    return { thesis, proposal: null, experiment: null };
  }
  if (!parsedThesis.ok) {
    thesis = { ...thesis, status: "INVALID", rejectionReasons: parsedThesis.reasons, updatedAt: createdAt };
    input.store.saveThesis(thesis);
    return { thesis, proposal: null, experiment: null };
  }
  thesis = {
    ...thesis,
    ...parsedThesis.draft,
    userId: input.userId,
    agentId: input.agentId,
    assetId: input.context.assetId,
    status: "VALIDATING",
    updatedAt: createdAt,
  };
  const thesisCheck = validateThesis(thesis);
  const evidenceCheck = thesisCheck.ok ? validateEvidenceAgainstContext(thesis, input.context) : { ok: true, reasons: [] };
  const thesisReasons = [...thesisCheck.reasons, ...evidenceCheck.reasons];
  if (thesisReasons.length > 0) {
    thesis = { ...thesis, status: "INVALID", rejectionReasons: thesisReasons, updatedAt: createdAt };
    input.store.saveThesis(thesis);
    return { thesis, proposal: null, experiment: null };
  }
  input.store.saveThesis(thesis);

  const proposalResponse = await input.provider.generateStrategyProposal(input.context, thesis);
  const proposalId = `proposal_${thesisId}`;
  if (!proposalResponse.ok) {
    thesis = { ...thesis, status: "MODEL_ERROR", rejectionReasons: [proposalResponse.error], updatedAt: createdAt };
    input.store.saveThesis(thesis);
    return { thesis, proposal: null, experiment: null };
  }
  const parsedProposal = parseProposalDraft(proposalResponse.value);
  if (!parsedProposal.ok) {
    thesis = { ...thesis, status: "REJECTED", rejectionReasons: parsedProposal.reasons, updatedAt: createdAt };
    input.store.saveThesis(thesis);
    return { thesis, proposal: null, experiment: null };
  }
  let proposal: StrategyProposal = {
    proposalId,
    thesisId,
    userId: input.userId,
    agentId: input.agentId,
    assetScope: parsedProposal.draft.assetScope,
    sessionScope: parsedProposal.draft.sessionScope as StrategyProposal["sessionScope"],
    regimeScope: parsedProposal.draft.regimeScope as StrategyProposal["regimeScope"],
    features: parsedProposal.draft.features,
    entryConditions: parsedProposal.draft.entryConditions,
    exitConditions: parsedProposal.draft.exitConditions,
    holdingPeriod: parsedProposal.draft.holdingPeriod,
    action: parsedProposal.draft.action as StrategyProposal["action"],
    positionSizingHint: parsedProposal.draft.positionSizingHint,
    invalidationConditions: parsedProposal.draft.invalidationConditions,
    parameterSet: parsedProposal.draft.parameterSet,
    version: "1",
    createdAt,
    status: "VALIDATING",
    provenance: { ...provenanceFrom(proposalResponse, input.provider, createdAt, input.contextTimestamp, input.contextDataVersion), contextId: input.context.contextId },
    rejectionReasons: [],
  };
  const proposalCheck = validateProposal(proposal);
  if (!proposalCheck.ok) {
    proposal = { ...proposal, status: "REJECTED", rejectionReasons: proposalCheck.reasons };
    thesis = { ...thesis, status: "REJECTED", rejectionReasons: proposalCheck.reasons, updatedAt: createdAt };
    input.store.saveProposal(proposal);
    input.store.saveThesis(thesis);
    return { thesis, proposal, experiment: null };
  }
  proposal = { ...proposal, status: "READY_FOR_EXPERIMENT" };
  thesis = { ...thesis, status: "READY_FOR_EXPERIMENT", updatedAt: createdAt };
  input.store.saveProposal(proposal);
  input.store.saveThesis(thesis);

  const experimentId = `experiment_${proposalId}`;
  let experiment: StrategyExperiment = {
    experimentId,
    proposalId,
    thesisId,
    userId: input.userId,
    agentId: input.agentId,
    assetScope: proposal.assetScope,
    startTime: createdAt,
    endTime: createdAt,
    initialCapital: input.initialCapital.toString(),
    executionPolicy: "paper fee assumption, one unit, separate from the user book",
    dataset: input.dataset,
    dataSource: input.dataSource,
    thesisSource: input.provider.id === "mock" ? "MOCK" : "LLM",
    result: null,
    reason: null,
    status: "RUNNING",
    createdAt,
    externalContext: buildExternalExperimentContext((input.context.externalSignals ?? []).map((signal) => signal.id)),
  };
  input.store.saveExperiment(experiment);
  thesis = { ...thesis, status: "TESTING", updatedAt: createdAt };
  proposal = { ...proposal, status: "PAPER_TESTING" };
  input.store.saveThesis(thesis);
  input.store.saveProposal(proposal);

  const run = runExperiment(proposal, input.bars, input.initialCapital);
  const historyShort = run.reason === "INSUFFICIENT_HISTORY";
  experiment = {
    ...experiment,
    status: run.status,
    reason: run.reason,
    result: run.metrics,
    startTime: run.startTime ?? createdAt,
    endTime: run.endTime ?? createdAt,
  };
  input.store.saveExperiment(experiment);
  if (run.metrics) {
    recordExperimentSummary({
      userId: input.userId,
      strategyId: `research:${proposal.proposalId}`,
      strategyVersion: "1",
      assetId: input.context.assetId,
      experimentId: experiment.experimentId,
      nowMs: input.nowMs,
      net: parseDecimal(run.metrics.netPnl),
      gross: parseDecimal(run.metrics.grossPnl),
    });
  }
  thesis = {
    ...thesis,
    status: run.status === "COMPLETED" ? "COMPLETED" : historyShort ? "READY_FOR_EXPERIMENT" : "INVALID",
    updatedAt: createdAt,
    rejectionReasons: historyShort ? [] : run.reason ? [run.reason] : [],
  };
  proposal = {
    ...proposal,
    status: run.status === "COMPLETED" ? "RESULT" : historyShort ? "READY_FOR_EXPERIMENT" : "REJECTED",
    rejectionReasons: historyShort ? [] : run.reason ? [run.reason] : [],
  };
  input.store.saveThesis(thesis);
  input.store.saveProposal(proposal);
  return { thesis, proposal, experiment };
}

function provenanceFrom(
  result: ProviderResult,
  provider: ReasoningProvider,
  createdAt: string,
  contextTimestamp: string,
  contextDataVersion: string,
): ResearchProvenance {
  const failed = result.ok ? null : result.errorCategory;
  return {
    sourceType: provider.id === "mock" ? "MOCK" : "LLM",
    provider: result.provider || provider.id,
    model: result.model || provider.model,
    promptVersion: result.promptVersion,
    createdAt,
    contextTimestamp,
    contextDataVersion,
    configuredModel: provider.configured,
    requestId: result.requestId,
    startedAt: result.startedAt.length > 0 ? result.startedAt : createdAt,
    completedAt: result.completedAt.length > 0 ? result.completedAt : createdAt,
    latencyMs: result.latencyMs,
    status: result.ok ? "SUCCESS" : failed === "TIMEOUT" ? "TIMEOUT" : "ERROR",
    errorCategory: result.ok ? null : failed,
  };
}

function blankThesis(
  input: { userId: UserId; agentId: AgentId; context: ResearchContext },
  thesisId: string,
  createdAt: string,
  provenance: ResearchProvenance,
): ResearchThesis {
  return {
    thesisId,
    userId: input.userId,
    agentId: input.agentId,
    assetId: input.context.assetId,
    createdAt,
    updatedAt: createdAt,
    title: "",
    summary: "",
    hypothesis: {
      conditions: [],
      session: "ANY",
      observationWindowBars: 0,
      testWindowBars: 0,
      expectedOutcome: "",
      invalidation: "",
    },
    observations: [],
    assumptions: [],
    supportingEvidence: [],
    contradictingEvidence: [],
    requiredData: [],
    invalidationConditions: [],
    riskConsiderations: [],
    confidence: 0,
    status: "DRAFT",
    version: "1",
    provenance,
    rejectionReasons: [],
  };
}
