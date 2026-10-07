import { localPaperSession } from "@/paper/session";
import { parseDecimal } from "@/domain/money";
import { readDataMode } from "@/lib/mode";
import { liveObservationBoard } from "@/observation/live";
import { buildPaperObservation } from "@/observation/paper";
import { marketHistory } from "@/observation/stores";
import { KairosApiError } from "@/services/binance/errors";
import { buildResearchContext } from "@/research/context";
import { readLlmConfig } from "@/research/llm-config";
import { MockReasoningProvider } from "@/research/mock-provider";
import { selectReasoningProvider } from "@/research/select-provider";
import { runResearchDraft } from "@/research/pipeline";
import { researchStore } from "@/research/store";
import { type MarketDataSource, type ResearchSourceType } from "@/research/types";
import { DEMO_USER_ID, demoWatchlist } from "@/domain/watchlist";

export interface GenerateResearchResult {
  ok: boolean;
  stage: "BUILDING CONTEXT" | "ANALYZING" | "VALIDATING" | "THESIS CREATED" | "FAILED";
  code: string | null;
  message: string;
  thesisId: string | null;
  sourceType: ResearchSourceType | null;
  dataSource: MarketDataSource | null;
  validation: "PASS" | "FAIL" | null;
}

export async function generateResearchThesis(input: {
  userId: string;
  assetId: string;
  /** Mock is used only when the caller explicitly selects it. */
  mode: "llm" | "mock";
  nowMs?: number;
}): Promise<GenerateResearchResult> {
  if (input.userId !== DEMO_USER_ID) {
    return failed("BUILDING CONTEXT", "USER_MISMATCH", "No watchlist is stored for this user.");
  }
  const session = localPaperSession()!;
  const watchlist = demoWatchlist(input.userId);
  const ticker = normalizeAsset(input.assetId);
  if (!watchlist.tickers.includes(ticker)) {
    return failed("BUILDING CONTEXT", "ASSET_NOT_ON_WATCHLIST", "That asset is not on this user's watchlist.");
  }
  const nowMs = input.nowMs ?? Date.now();
  const config = readLlmConfig();
  const mockRequested = input.mode === "mock" || config.provider === "mock";
  if (!mockRequested && !config.configured) {
    const message = config.provider === "qwen" && config.apiKey.length > 0
      ? "Qwen workspace base URL is not configured. The mock lab was not used."
      : "LLM is not configured. The mock lab is separate and was not used.";
    return failed("ANALYZING", "NOT_CONFIGURED", message);
  }
  const loaded = await loadCanonical(input.userId, ticker, nowMs, mockRequested);
  if (!loaded.ok) {
    return failed("BUILDING CONTEXT", loaded.code, loaded.message);
  }
  const provider = mockRequested ? new MockReasoningProvider() : selectReasoningProvider(config);
  const result = await runResearchDraft({
    provider,
    context: loaded.built.context,
    store: researchStore(),
    bars: loaded.built.bars,
    dataset: loaded.built.dataSource,
    dataSource: loaded.built.dataSource,
    contextTimestamp: loaded.built.contextTimestamp,
    contextDataVersion: loaded.built.contextDataVersion,
    initialCapital: parseDecimal("10000"),
    nowMs,
    userId: session.user.id,
    agentId: session.agent.id,
  });
  return toResult(
    result.thesis.status,
    result.thesis.thesisId,
    result.thesis.provenance.sourceType,
    loaded.built.dataSource,
    result.thesis.rejectionReasons,
    result.thesis.provenance.errorCategory,
  );
}

async function loadCanonical(
  userId: string,
  ticker: string,
  nowMs: number,
  paperOnly = false,
): Promise<{ ok: true; built: ReturnType<typeof buildResearchContext> } | { ok: false; code: string; message: string }> {
  const session = localPaperSession()!;
  if (!paperOnly && readDataMode() === "live") {
    try {
      const board = await liveObservationBoard(userId);
      const row = board.rows.find((item) => item.ticker === ticker);
      if (!board.ok || !row) {
        return { ok: false, code: "LIVE_MARKET_DATA_NOT_CONFIGURED", message: "Live market data is not configured." };
      }
      const candles = marketHistory.queryRecent(row.representationId, 100);
      return {
        ok: true,
        built: buildResearchContext({
          userId,
          agentId: session.agent.id,
          row,
          candles,
          watchlist: demoWatchlist(userId).tickers,
          dataSource: "LIVE_BINANCE_HISTORY",
          nowMs,
        }),
      };
    } catch (error) {
      if (error instanceof KairosApiError) {
        return { ok: false, code: "LIVE_MARKET_DATA_NOT_CONFIGURED", message: "Live market data is not configured." };
      }
      return { ok: false, code: "LIVE_MARKET_DATA_NOT_CONFIGURED", message: "Live market data is not configured." };
    }
  }
  const builtPaper = buildPaperObservation(userId, new Date(nowMs));
  const row = builtPaper.board.rows.find((item) => item.ticker === ticker);
  if (!builtPaper.board.ok || !row) {
    return { ok: false, code: "PAPER_MARKET_DATA_UNAVAILABLE", message: "No paper market input is configured." };
  }
  return {
    ok: true,
    built: buildResearchContext({
      userId,
      agentId: session.agent.id,
      row,
      candles: builtPaper.candles.get(row.representationId) ?? [],
      watchlist: demoWatchlist(userId).tickers,
      dataSource: "MOCK_FIXTURE",
      nowMs,
    }),
  };
}

function toResult(
  status: string,
  thesisId: string,
  sourceType: ResearchSourceType,
  dataSource: MarketDataSource,
  reasons: readonly string[],
  errorCategory: string | null,
): GenerateResearchResult {
  const failedStatus = status === "MODEL_ERROR" || status === "INVALID" || status === "REJECTED";
  const code = errorCategory === "MODEL_PROVIDER_UNSUPPORTED" ? "MODEL_PROVIDER_UNSUPPORTED" : failedStatus ? status : null;
  return {
    ok: !failedStatus,
    stage: failedStatus ? "FAILED" : "THESIS CREATED",
    code,
    message: failedStatus ? reasons.join(" ") || status : "THESIS CREATED",
    thesisId,
    sourceType,
    dataSource,
    validation: failedStatus ? "FAIL" : "PASS",
  };
}

function failed(stage: GenerateResearchResult["stage"], code: string, message: string): GenerateResearchResult {
  return { ok: false, stage, code, message, thesisId: null, sourceType: null, dataSource: null, validation: null };
}

function normalizeAsset(assetId: string): string {
  const trimmed = assetId.trim().toUpperCase();
  return trimmed.startsWith("PAPER:") ? trimmed.slice("PAPER:".length) : trimmed;
}
