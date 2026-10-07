import { asUserId } from "@/domain/ids";
import { readDataMode } from "@/lib/mode";
import { providerLabel, readLlmConfig, publicLlmStatus } from "@/research/llm-config";
import { readLlmAttempt } from "@/research/llm-status";
import { researchStore } from "@/research/store";
import type { ResearchThesis, StrategyExperiment, StrategyProposal } from "@/research/types";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { readBinanceConfig } from "@/services/binance/config";

export interface ResearchCard {
  thesisId: string;
  title: string;
  status: string;
  assetId: string;
  summary: string;
  confidence: string;
  provider: string;
  model: string;
  promptVersion: string;
  sourceType: "MOCK" | "LLM";
  dataSource: "LIVE BINANCE HISTORY" | "MOCK FIXTURE" | "—";
  configuredModel: boolean;
  supporting: readonly { kind: string; statement: string }[];
  contradicting: readonly { kind: string; statement: string }[];
  hypothesis: string;
  invalidation: string;
  requiredData: readonly string[];
  validation: "PASS" | "FAIL";
  proposal: {
    proposalId: string;
    action: string;
    holdingPeriod: string;
    status: string;
    conditions: readonly string[];
    exitConditions: readonly string[];
    invalidation: readonly string[];
  } | null;
  experiments: readonly {
    experimentId: string;
    status: string;
    reason: string | null;
    dataset: string;
    dataSource: string;
    thesisSource: string;
    netPnl: string | null;
    trades: string | null;
    winRate: string | null;
    drawdown: string | null;
    baseline: string | null;
    difference: string | null;
    warnings: readonly string[];
    researchWindow: string;
    validationWindow: string;
    outOfSampleWindow: string;
    outOfSampleClaim: boolean;
  }[];
}

export interface ResearchLabModel {
  notice: string;
  llmLabel: "NOT CONFIGURED" | "CONNECTED" | "ERROR" | "TIMEOUT" | "NOT VERIFIED";
  marketDataLabel: "LIVE BINANCE HISTORY" | "NOT CONFIGURED" | "MOCK FIXTURE";
  provider: string;
  providerLabel: string;
  productName: string;
  model: string;
  latestSource: "LLM" | "MOCK" | "—";
  latestData: string;
  lastSuccessAt: string | null;
  latencyMs: number | null;
  running: number;
  candidates: number;
  rejected: number;
  promoted: number;
  paperCapital: string;
  latestTitle: string;
  latestStatus: string;
  bestCandidate: string;
  cards: readonly ResearchCard[];
}

export async function loadResearchLab(userId = DEMO_USER_ID): Promise<ResearchLabModel> {
  const serverConfig = readLlmConfig();
  const lastAttempt = readLlmAttempt();
  const attempt = lastAttempt?.provider === serverConfig.provider && lastAttempt.model === serverConfig.model ? lastAttempt : null;
  const config = publicLlmStatus(
    serverConfig,
    attempt?.status === "SUCCESS" ? { at: attempt.completedAt, latencyMs: attempt.latencyMs } : null,
  );
  const label = llmLabel(config.provider, config.configured, attempt);
  if (userId !== DEMO_USER_ID) {
    return emptyLab(config, label, "No research is stored for this user.");
  }
  const store = researchStore();
  const user = asUserId(userId);
  const theses = store.listTheses(user);
  const experiments = store.listExperiments(user);
  const proposals = theses.map((thesis) => store.getProposal(user, `proposal_${thesis.thesisId}`)).filter((item): item is StrategyProposal => item !== null);
  const cards = theses.map((thesis) => toCard(thesis, proposals, experiments));
  const latest = cards[0];
  const candidate = proposals.find((item) => item.status === "RESULT");
  return {
    notice: "PAPER EXPERIMENT. NOT REAL MONEY. The research brain cannot directly execute trades.",
    llmLabel: label,
    marketDataLabel: readDataModeLabel(),
    provider: config.provider,
    providerLabel: config.providerLabel,
    productName: config.productName,
    model: config.model,
    latestSource: cards[0]?.sourceType ?? "—",
    latestData: cards[0]?.dataSource && cards[0].dataSource !== "—" ? cards[0].dataSource : readDataModeLabel(),
    lastSuccessAt: config.lastSuccessAt,
    latencyMs: config.latencyMs,
    running: experiments.filter((item) => item.status === "QUEUED" || item.status === "RUNNING").length,
    candidates: proposals.filter((item) => item.status === "RESULT").length,
    rejected: theses.filter((item) => item.status === "REJECTED" || item.status === "INVALID").length,
    promoted: 0,
    paperCapital: experiments[0]?.initialCapital ?? "—",
    latestTitle: latest?.title ?? "—",
    latestStatus: latest?.status ?? "—",
    bestCandidate: candidate ? candidate.features.join(", ") : "—",
    cards,
  };
}

function toCard(thesis: ResearchThesis, proposals: readonly StrategyProposal[], experiments: readonly StrategyExperiment[]): ResearchCard {
  const proposal = proposals.find((item) => item.thesisId === thesis.thesisId) ?? null;
  const related = experiments.filter((item) => item.thesisId === thesis.thesisId);
  return {
    thesisId: thesis.thesisId,
    title: thesis.title,
    status: thesis.status,
    assetId: thesis.assetId,
    summary: thesis.summary,
    confidence: thesis.confidence.toFixed(2),
    provider: providerLabel(thesis.provenance.provider),
    model: thesis.provenance.model,
    promptVersion: thesis.provenance.promptVersion,
    sourceType: thesis.provenance.sourceType,
    dataSource: dataLabel(related[0]?.dataSource),
    configuredModel: thesis.provenance.configuredModel,
    supporting: thesis.supportingEvidence.map((item) => ({ kind: item.kind, statement: item.statement })),
    contradicting: thesis.contradictingEvidence.map((item) => ({ kind: item.kind, statement: item.statement })),
    hypothesis: thesis.hypothesis.expectedOutcome,
    invalidation: thesis.invalidationConditions.join(" · "),
    requiredData: thesis.requiredData,
    validation: thesis.status === "COMPLETED" || thesis.status === "READY_FOR_EXPERIMENT" ? "PASS" : "FAIL",
    proposal: proposal
      ? {
          proposalId: proposal.proposalId,
          action: proposal.action,
          holdingPeriod: `${proposal.holdingPeriod} x 15m`,
          status: proposal.status,
          conditions: proposal.entryConditions.map((item) => `${item.feature} ${item.operator} ${formatThreshold(item.threshold)}`),
          exitConditions: proposal.exitConditions.map((item) => `${item.feature} ${item.operator} ${formatThreshold(item.threshold)}`),
          invalidation: proposal.invalidationConditions,
        }
      : null,
    experiments: related.map((experiment) => ({
      experimentId: experiment.experimentId,
      status: experiment.status,
      reason: experiment.reason,
      dataset: experiment.dataset,
      dataSource: dataLabel(experiment.dataSource),
      thesisSource: experiment.thesisSource,
      netPnl: experiment.result?.netPnl ?? null,
      trades: experiment.result ? String(experiment.result.numberOfTrades) : null,
      winRate: experiment.result?.winRate ?? null,
      drawdown: experiment.result?.maxDrawdownBps ?? null,
      baseline: experiment.result?.baselineNetPnl ?? null,
      difference: experiment.result?.differenceNetPnl ?? null,
      warnings: experiment.result?.warnings ?? [],
      researchWindow: windowText(experiment.result?.researchWindow),
      validationWindow: windowText(experiment.result?.validationWindow),
      outOfSampleWindow: windowText(experiment.result?.outOfSampleWindow),
      outOfSampleClaim: experiment.result?.outOfSampleClaim ?? false,
    })),
  };
}

function windowText(window: { name: string; bars: number; trades: number; netPnl: string; used: boolean } | undefined): string {
  if (!window || !window.used) {
    return "Not used";
  }
  return `${window.name} · ${window.bars} bars · ${window.trades} trades · net ${window.netPnl}`;
}

function formatThreshold(threshold: string | number | readonly string[]): string {
  return Array.isArray(threshold) ? threshold.join(", ") : String(threshold);
}

function llmLabel(
  provider: string,
  configured: boolean,
  attempt: ReturnType<typeof readLlmAttempt>,
): ResearchLabModel["llmLabel"] {
  if (provider === "" || provider === "mock" || !configured) {
    return "NOT CONFIGURED";
  }
  if (!attempt) {
    return "NOT VERIFIED";
  }
  if (attempt.status === "SUCCESS") {
    return "CONNECTED";
  }
  if (attempt.status === "TIMEOUT") {
    return "TIMEOUT";
  }
  return "ERROR";
}

function readDataModeLabel(): ResearchLabModel["marketDataLabel"] {
  if (readDataMode() !== "live") {
    return "MOCK FIXTURE";
  }
  try {
    readBinanceConfig();
    return "LIVE BINANCE HISTORY";
  } catch {
    return "NOT CONFIGURED";
  }
}

function dataLabel(source: "LIVE_BINANCE_HISTORY" | "MOCK_FIXTURE" | undefined): ResearchCard["dataSource"] {
  if (source === "LIVE_BINANCE_HISTORY") {
    return "LIVE BINANCE HISTORY";
  }
  if (source === "MOCK_FIXTURE") {
    return "MOCK FIXTURE";
  }
  return "—";
}

function emptyLab(config: ReturnType<typeof publicLlmStatus>, label: ResearchLabModel["llmLabel"], notice: string): ResearchLabModel {
  return {
    notice,
    llmLabel: label,
    marketDataLabel: readDataModeLabel(),
    provider: config.provider,
    providerLabel: config.providerLabel,
    productName: config.productName,
    model: config.model,
    latestSource: "—",
    latestData: readDataModeLabel(),
    lastSuccessAt: null,
    latencyMs: null,
    running: 0,
    candidates: 0,
    rejected: 0,
    promoted: 0,
    paperCapital: "—",
    latestTitle: "—",
    latestStatus: "—",
    bestCandidate: "—",
    cards: [],
  };
}
