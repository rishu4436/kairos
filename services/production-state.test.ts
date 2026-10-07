import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asAgentId, asUserId } from "@/domain/ids";
import { buildPaperObservation, paperObservationBoard } from "@/observation/paper";
import { resetMarketStores } from "@/observation/stores";
import { sessionPaperCapability } from "@/paper/run-cycle";
import { readPaperBook } from "@/paper/store";
import { generateResearchThesis } from "@/research/generate";
import { researchStore } from "@/research/store";
import { getAgentPageModel, getCommandCenterModel, getPortfolioPageModel } from "@/services/command-center";

beforeEach(() => resetMarketStores());
afterEach(() => resetMarketStores());

describe("unconfigured production state", () => {
  it("shows empty stored portfolio and lab state without creating a book", () => {
    const command = getCommandCenterModel();
    expect(command.portfolio.equity).toBe("—");
    expect(command.portfolio.sparkline).toEqual([]);
    expect(command.missions).toEqual([]);
    expect(command.events).toEqual([]);
    expect(command.lab.underEvaluation).toBe(0);
    expect(getPortfolioPageModel().positions).toEqual([]);
    expect(getAgentPageModel().runtimeState).toBe("OFFLINE");
    expect(readPaperBook(asUserId("user_demo"), asAgentId("agent_demo"))).toBeNull();
  });

  it("does not fabricate market inputs or execute an empty paper cycle", () => {
    const authority = sessionPaperCapability()!;
    const board = paperObservationBoard("user_demo", { authority });
    expect(board.ok).toBe(false);
    expect(board.rows).toEqual([]);
    expect(board.error?.category).toBe("DATA_UNAVAILABLE");
    expect(buildPaperObservation("user_b").board.rows).toEqual([]);
    expect(readPaperBook(asUserId("user_demo"), asAgentId("agent_demo"))).toBeNull();
  });

  it("requires supplied inputs even for explicit mock research", async () => {
    const result = await generateResearchThesis({ userId: "user_demo", assetId: "NVDA", mode: "mock" });
    expect(result.code).toBe("PAPER_MARKET_DATA_UNAVAILABLE");
    expect(researchStore().listTheses(asUserId("user_demo"))).toEqual([]);
  });
});
