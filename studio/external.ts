import type { AgentCapabilityManifest } from "@/studio/types";
import { kairosCapabilityManifest } from "@/studio/manifest";

export interface ExternalMarketContext {
  available: boolean;
  tickers: readonly string[];
}
export interface ExternalSignalView {
  strategyId: string;
  action: string;
}
export interface ExternalArbitrationView {
  decision: string | null;
}
export interface ExternalResearchView {
  available: boolean;
}
export interface ExternalApprovedTradeView {
  approved: false;
  reason: "EXTERNAL_AGENTS_CANNOT_EXECUTE";
}

/** In-process read boundary. This is not an MCP server and it cannot sign. */
export interface KairosExternalAgentInterface {
  getMarketContext(userId: string): ExternalMarketContext;
  getStrategySignals(userId: string): readonly ExternalSignalView[];
  getArbitration(userId: string): ExternalArbitrationView;
  getResearch(userId: string): ExternalResearchView;
  getApprovedTradeState(userId: string): ExternalApprovedTradeView;
  manifest(): AgentCapabilityManifest;
}

export function createExternalAgentInterface(books: ReadonlyMap<string, ExternalMarketContext> = new Map()): KairosExternalAgentInterface {
  return {
    getMarketContext(userId) {
      return books.get(userId) ?? { available: false, tickers: [] };
    },
    getStrategySignals(userId) {
      const book = books.get(userId);
      return book ? book.tickers.map((ticker) => ({ strategyId: "momentum", action: ticker })) : [];
    },
    getArbitration() {
      return { decision: null };
    },
    getResearch() {
      return { available: false };
    },
    getApprovedTradeState() {
      return { approved: false, reason: "EXTERNAL_AGENTS_CANNOT_EXECUTE" };
    },
    manifest() {
      return kairosCapabilityManifest();
    },
  };
}

export function refuseExternalSign(): { signed: false; reason: "EXTERNAL_SIGNING_DENIED" } {
  return { signed: false, reason: "EXTERNAL_SIGNING_DENIED" };
}
