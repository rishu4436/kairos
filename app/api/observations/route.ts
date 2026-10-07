import { localPaperSession } from "@/paper/session";
import { resolveServerPaperCapability } from "@/domain/execution-authority";
import type { ObservationBoard } from "@/domain/observation";
import { DEMO_USER_ID, DEMO_WATCH_TICKERS } from "@/domain/watchlist";
import { asAgentId, asUserId } from "@/domain/ids";
import { warmUnderlyingEvents } from "@/events/service";
import { readPaperBook } from "@/paper/store";
import { failureBoard, liveObservationBoard, logBinanceFailure } from "@/observation/live";
import { runManualPaperCycle } from "@/observation/autonomous-board";
import { buildPaperObservation } from "@/observation/paper";
import { readDataMode } from "@/lib/mode";
import { KairosApiError, safeMessage } from "@/services/binance/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requested = url.searchParams.get("userId")?.trim() || DEMO_USER_ID;

  try {
    const mode = readDataMode();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(requested)) {
      return json(invalidUser(requested, mode), 400);
    }
    if (mode === "paper") {
      if (requested !== DEMO_USER_ID) {
        return json(buildPaperObservation(requested).board);
      }
      const session = localPaperSession()!;
      const authority = resolveServerPaperCapability({
        serverDataMode: "paper",
        requestedUserId: requested,
        clientAgentId: url.searchParams.get("agentId"),
        clientMode: url.searchParams.get("executionMode") ?? url.searchParams.get("mode"),
        sessionUserId: session.user.id,
        sessionAgentId: session.agent.id,
        nowMs: Date.now(),
      });
      if (!authority.ok) {
        return json(buildPaperObservation(requested).board);
      }
      const open = readPaperBook(asUserId(requested), asAgentId(session.agent.id))?.account.positions.map((position) => position.assetSymbol) ?? [];
      await warmUnderlyingEvents({ tickers: [...DEMO_WATCH_TICKERS, ...open], nowMs: Date.now(), fidelity: "paper" });
      return json(runManualPaperCycle());
    }
    return json(await liveObservationBoard(requested, request.signal));
  } catch (error) {
    if (isAbort(error)) {
      return new Response(null, { status: 499 });
    }
    if (error instanceof KairosApiError) {
      logBinanceFailure(error);
      const status = error.category === "AUTHENTICATION_ERROR" && error.httpStatus === null ? 503 : error.httpStatus ?? 502;
      return json(failureBoard(error, "live", requested), status >= 400 && status < 600 ? status : 502);
    }
    console.error("[kairos.binance]", {
      category: "UNKNOWN_ERROR",
    });
    return json(
      failureBoard(
        new KairosApiError({
          category: "UNKNOWN_ERROR",
          safeMessage: error instanceof Error && error.message.includes("data mode")
            ? error.message
            : safeMessage("UNKNOWN_ERROR"),
          technicalMessage: error instanceof Error ? error.message : "Unknown failure",
        }),
        "live",
        requested,
      ),
      500,
    );
  }
}

function invalidUser(userId: string, dataMode: "live" | "paper"): ObservationBoard {
  return failureBoard(
    new KairosApiError({
      category: "INVALID_REQUEST",
      safeMessage: "The user id is not valid.",
      technicalMessage: "Rejected userId query.",
    }),
    dataMode,
    userId,
  );
}

function json(body: ObservationBoard, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
