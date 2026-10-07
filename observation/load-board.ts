import type { ObservationBoard } from "@/domain/observation";
import { CONFIGURED_WATCHLIST_TICKERS, DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { warmUnderlyingEvents } from "@/events/service";
import { asAgentId, asUserId } from "@/domain/ids";
import { readPaperBook } from "@/paper/store";
import { readDataMode } from "@/lib/mode";
import { failureBoard, liveObservationBoard, logBinanceFailure } from "@/observation/live";
import { runManualPaperCycle } from "@/observation/autonomous-board";
import { buildPaperObservation } from "@/observation/paper";
import { sessionPaperCapability } from "@/paper/run-cycle";
import { KairosApiError, safeMessage } from "@/services/binance/errors";

/** Same board the observation route returns for the local operating user. Pages render it on the first response. */
export async function loadDemoObservationBoard(): Promise<ObservationBoard> {
  const userId = LOCAL_RUNTIME_USER_ID;
  try {
    const mode = readDataMode();
    if (mode === "paper") {
      const authority = sessionPaperCapability();
      if (!authority) {
        return buildPaperObservation(userId).board;
      }
      await warmUnderlyingEvents({ tickers: eventTickers(userId), nowMs: Date.now(), fidelity: "paper" });
      return await runManualPaperCycle();
    }
    return await liveObservationBoard(userId);
  } catch (error) {
    if (error instanceof KairosApiError) {
      logBinanceFailure(error);
      return failureBoard(error, "live", userId);
    }
    console.error("[kairos.binance]", {
      category: "UNKNOWN_ERROR",
    });
    return failureBoard(
      new KairosApiError({
        category: "UNKNOWN_ERROR",
        safeMessage:
          error instanceof Error && error.message.includes("data mode") ? error.message : safeMessage("UNKNOWN_ERROR"),
        technicalMessage: error instanceof Error ? error.message : "Unknown failure",
      }),
      "live",
      userId,
    );
  }
}

function eventTickers(userId: string): string[] {
  const open = readPaperBook(asUserId(userId), asAgentId(DEFAULT_AGENT_ID))?.account.positions.map((position) => position.assetSymbol) ?? [];
  return [...CONFIGURED_WATCHLIST_TICKERS, ...open];
}
