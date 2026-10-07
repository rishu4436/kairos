import { describe, expect, it } from "vitest";
import { getCommandCenterModel } from "@/services/command-center";
import { agenticWalletPort, assertPortReady, bnbBroadcastPort, bnbMarketDataPort, bnbQuotePort, bnbSimulationPort, bnbTokenizedEquityPort } from "@/services/bnb-ports";
import { kairosExternalReadPort } from "@/services/external-access";
import { readDataMode } from "@/lib/mode";
import { ids } from "@/test/fixtures";

describe("integration boundaries", () => {
  it("connects market observation and keeps execution ports closed", () => {
    expect(bnbMarketDataPort.connected).toBe(true);
    expect(bnbTokenizedEquityPort.connected).toBe(true);
    expect(bnbQuotePort.connected).toBe(true);
    expect(bnbSimulationPort.connected).toBe(true);
    expect(bnbBroadcastPort.connected).toBe(false);
    expect(agenticWalletPort.connected).toBe(false);
    expect(() => assertPortReady(bnbBroadcastPort)).toThrow(/not configured/);
    expect(() => assertPortReady(bnbMarketDataPort)).not.toThrow();
  });

  it("does not implement external agent access", () => {
    expect(kairosExternalReadPort.implemented).toBe(false);
    expect(() =>
      kairosExternalReadPort.queryAgentState({ userId: ids.userId, agentId: ids.agentId }),
    ).toThrow(/not implemented/);
  });

  it("accepts paper and live modes and rejects any other mode", () => {
    expect(readDataMode({})).toBe("paper");
    expect(readDataMode({ KAIROS_DATA_MODE: "mock" })).toBe("paper");
    expect(readDataMode({ KAIROS_DATA_MODE: "live" })).toBe("live");
    expect(readDataMode({ NEXT_PUBLIC_KAIROS_DATA_MODE: "paper" })).toBe("paper");
    expect(() => readDataMode({ KAIROS_DATA_MODE: "production" })).toThrow(/not supported/);
  });

  it("builds a command center that does not claim a committed order", () => {
    const model = getCommandCenterModel();
    expect(model.agent.lastDecision).toBe("None");
    expect(model.agent.strategy).toBe("No live strategy selected yet");
    expect(model.decision.action).toBe("WAIT");
    expect(model.risk.liveTrading).toBe("Disabled");
    expect(model.portfolio.equity).toBe("47,217.90 USDT");
    expect(model.events.at(-1)?.message).toBe("No execution — confidence threshold not met");
    expect(model.strategies.find((strategy) => strategy.id === "arbitrage")?.status).toBe("coming_soon");
    expect(model.lab.activeExperiments).toBe(2);
    expect(model.lab.underEvaluation).toBe(3);
    expect(model.lab.bestRecent).toBe("—");
  });
});
