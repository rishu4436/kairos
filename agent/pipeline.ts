import type { AccountId } from "@/domain/ids";
import { validateIntentShape } from "@/domain/intent";
import type {
  MarketObservation,
  PaperAccountState,
  Quote,
  RiskPolicy,
  SimulationResult,
  StrategySignal,
  TradeExecution,
  TradeIntent,
  WalletAccount,
  WalletAuthorization,
  ExecutionPlan,
} from "@/domain/models";
import { buildExecutionPlan, simulatePlan } from "@/execution/prepare";
import { validateRiskPolicy, type RiskViolation } from "@/risk/validate";
import { authorizePlan } from "@/wallet/authorize";

export interface ProposalContext {
  observation: MarketObservation;
  signals: readonly StrategySignal[];
}

/**
 * A proposer, including a future model, may only return an intent or decline.
 * It does not enforce risk, simulate, authorize, or submit.
 */
export interface TradeProposer {
  propose(context: ProposalContext): TradeIntent | null;
}

export type PipelineStage =
  | "no_trade"
  | "intent_invalid"
  | "risk_rejected"
  | "simulation_rejected"
  | "authorization_rejected"
  | "blocked_chain_not_implemented"
  | "paper_ready";

export interface DecisionPipelineResult {
  stage: PipelineStage;
  violations: readonly RiskViolation[];
  plan: ExecutionPlan | null;
  simulation: SimulationResult | null;
  authorization: WalletAuthorization | null;
  execution: TradeExecution | null;
  submittedToChain: false;
}

export interface DecisionPipelineInput {
  proposal: TradeIntent | null;
  policy: RiskPolicy;
  account: WalletAccount;
  state: PaperAccountState;
  quote: Quote | null;
}

const LIVE_BLOCKED = "Live execution and BNB simulation are not connected.";

/**
 * Agent proposes. Risk, simulation, and wallet authorization are separate steps.
 * This function never broadcasts a transaction and never applies a paper fill.
 */
export function runDecisionPipeline(input: DecisionPipelineInput): DecisionPipelineResult {
  if (input.proposal === null) {
    return emptyResult("no_trade");
  }

  const shape = validateIntentShape(input.proposal);
  if (!shape.ok) {
    return {
      ...emptyResult("intent_invalid"),
      violations: shape.errors.map((message) => ({ code: "invalid_intent", message })),
    };
  }

  const risk = validateRiskPolicy(input.proposal, input.policy, input.state);
  if (!risk.ok) {
    return {
      ...emptyResult("risk_rejected"),
      violations: risk.violations,
    };
  }

  if (input.proposal.venue === "live") {
    return {
      ...emptyResult("blocked_chain_not_implemented"),
      simulation: rejectedSimulation(input.proposal.id, [LIVE_BLOCKED]),
      authorization: denied(input.account.id, input.proposal.id, [
        "Agentic wallet signing is not connected. No signature was produced.",
      ]),
      execution: notSubmitted(input.proposal, "Chain execution is not implemented."),
    };
  }

  if (!input.quote) {
    return {
      ...emptyResult("simulation_rejected"),
      simulation: rejectedSimulation(input.proposal.id, ["No quote is available."]),
    };
  }

  const built = buildExecutionPlan(input.proposal, input.quote);
  if (!built.ok) {
    return {
      ...emptyResult("simulation_rejected"),
      simulation: rejectedSimulation(input.proposal.id, [built.reason]),
    };
  }

  const simulation = simulatePlan(built.plan, input.state);
  if (!simulation.accepted) {
    return {
      ...emptyResult("simulation_rejected"),
      plan: built.plan,
      simulation,
    };
  }

  const authorization = authorizePlan(input.account, built.plan, input.policy);
  if (!authorization.granted) {
    return {
      ...emptyResult("authorization_rejected"),
      plan: built.plan,
      simulation,
      authorization,
    };
  }

  return {
    stage: "paper_ready",
    violations: [],
    plan: built.plan,
    simulation,
    authorization,
    execution: notSubmitted(
      input.proposal,
      "Paper plan passed risk, mock simulation, and account authorization. No fill was applied and nothing was sent to a chain.",
    ),
    submittedToChain: false,
  };
}

function emptyResult(stage: PipelineStage): DecisionPipelineResult {
  return {
    stage,
    violations: [],
    plan: null,
    simulation: null,
    authorization: null,
    execution: null,
    submittedToChain: false,
  };
}

function rejectedSimulation(planId: string, reasons: readonly string[]): SimulationResult {
  return {
    planId,
    accepted: false,
    reasons,
    estimatedAveragePrice: null,
    estimatedFee: null,
    priceImpactBps: null,
    source: "mock_simulator",
    broadcast: false,
  };
}

function denied(accountId: AccountId, planId: string, reasons: readonly string[]): WalletAuthorization {
  return {
    accountId,
    planId,
    granted: false,
    reasons,
    signature: null,
  };
}

function notSubmitted(intent: TradeIntent, message: string): TradeExecution {
  return {
    id: `exec_${intent.id}`,
    planId: intent.id,
    userId: intent.userId,
    agentId: intent.agentId,
    status: "not_submitted",
    venue: intent.venue,
    chainTransactionId: null,
    message,
  };
}
