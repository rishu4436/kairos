import { describe, expect, it } from "vitest";
import { AGENT_STATES, canTransition, paperLoopTargets, transitionAgent, transitionPaperLoop } from "@/agent/states";
import type { AgentRuntimeState } from "@/domain/models";

describe("agent state transitions", () => {
  it("follows the observation path and rejects skips", () => {
    expect(transitionAgent("OFFLINE", "STARTING").ok).toBe(true);
    expect(transitionAgent("OFFLINE", "EXECUTING").ok).toBe(false);
    expect(canTransition("EXECUTING", "OBSERVING")).toBe(false);
    expect(canTransition("EXECUTING", "MONITORING_POSITION")).toBe(true);

    let state: AgentRuntimeState = "OFFLINE";
    const path = [
      "STARTING",
      "OBSERVING",
      "ANALYZING",
      "EVALUATING_STRATEGIES",
      "RISK_CHECK",
      "SIMULATING",
      "EXECUTING",
      "MONITORING_POSITION",
      "OBSERVING",
    ] as const;
    for (const next of path) {
      const moved = transitionAgent(state, next);
      expect(moved.ok).toBe(true);
      if (moved.ok) {
        state = moved.state;
      }
    }
    expect(state).toBe("OBSERVING");
  });

  it("stops the intelligence loop before execution", () => {
    let state: AgentRuntimeState = "OBSERVING";
    for (const next of ["ANALYZING", "EVALUATING_STRATEGIES", "ARBITRATING", "DECISION_READY", "WAITING_FOR_RISK"] as const) {
      const moved = transitionAgent(state, next);
      expect(moved.ok).toBe(true);
      if (moved.ok) {
        state = moved.state;
      }
    }
    expect(state).toBe("WAITING_FOR_RISK");
    expect(canTransition("WAITING_FOR_RISK", "EXECUTING")).toBe(false);
    expect(canTransition("WAITING_FOR_RISK", "SIMULATING")).toBe(false);
    expect(canTransition("WAITING_FOR_RISK", "PAPER_EXECUTING")).toBe(false);
    expect(canTransition("DECISION_READY", "EXECUTING")).toBe(false);
    expect(canTransition("ARBITRATING", "EXECUTING")).toBe(false);
    expect(canTransition("SIMULATING", "EXECUTING")).toBe(true);
    expect(canTransition("SIMULATING", "PAPER_EXECUTING")).toBe(false);
    expect(canTransition("PAPER_EXECUTING", "EXECUTING")).toBe(false);
    expect(canTransition("EXECUTING", "PAPER_EXECUTING")).toBe(false);
  });

  it("advances the paper loop without entering chain execution", () => {
    let state: AgentRuntimeState = "WAITING_FOR_RISK";
    for (const next of ["SIMULATING", "PAPER_EXECUTING", "MONITORING_POSITION"] as const) {
      const moved = transitionPaperLoop(state, next, "PAPER");
      expect(moved.ok).toBe(true);
      if (moved.ok) {
        state = moved.state;
      }
    }
    expect(state).toBe("MONITORING_POSITION");
    expect(transitionPaperLoop("MONITORING_POSITION", "OBSERVING", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("SIMULATING", "OBSERVING", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("PAPER_EXECUTING", "OBSERVING", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("PAPER_EXECUTING", "ERROR", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("WAITING_FOR_RISK", "PAUSED", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("WAITING_FOR_RISK", "ERROR", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("SIMULATING", "ERROR", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("MONITORING_POSITION", "PAUSED", "PAPER").ok).toBe(true);
    expect(transitionPaperLoop("MONITORING_POSITION", "ERROR", "PAPER").ok).toBe(true);
  });

  it("refuses paper edges that would weaken the chain boundary", () => {
    expect(transitionPaperLoop("WAITING_FOR_RISK", "EXECUTING", "PAPER").ok).toBe(false);
    expect(transitionPaperLoop("SIMULATING", "EXECUTING", "PAPER").ok).toBe(false);
    expect(transitionPaperLoop("PAPER_EXECUTING", "EXECUTING", "PAPER").ok).toBe(false);
    expect(transitionPaperLoop("DECISION_READY", "PAPER_EXECUTING", "PAPER").ok).toBe(false);
    expect(transitionPaperLoop("ARBITRATING", "SIMULATING", "PAPER").ok).toBe(false);
    expect(transitionPaperLoop("OFFLINE", "PAPER_EXECUTING", "PAPER").ok).toBe(false);
    expect(transitionPaperLoop("EXECUTING", "MONITORING_POSITION", "PAPER").ok).toBe(false);
    expect(transitionPaperLoop("WAITING_FOR_RISK", "PAPER_EXECUTING", "PAPER").ok).toBe(false);
    for (const state of AGENT_STATES) {
      expect(paperLoopTargets(state, "LIVE")).toEqual([]);
      expect(paperLoopTargets(state, "PAPER").includes("EXECUTING")).toBe(false);
      expect(transitionPaperLoop(state, "EXECUTING", "LIVE").ok).toBe(false);
      expect(transitionPaperLoop(state, "PAPER_EXECUTING", "LIVE").ok).toBe(false);
      expect(transitionPaperLoop(state, "SIMULATING", "LIVE").ok).toBe(false);
    }
  });

  it("allows pause, resume, and error recovery", () => {
    expect(transitionAgent("OBSERVING", "PAUSED").ok).toBe(true);
    expect(transitionAgent("PAUSED", "OBSERVING").ok).toBe(true);
    expect(transitionAgent("SIMULATING", "ERROR").ok).toBe(true);
    expect(transitionAgent("ERROR", "OFFLINE").ok).toBe(true);
    expect(transitionAgent("ERROR", "ANALYZING").ok).toBe(false);
  });
});
