/**
 * Future boundary only. No provider is implemented in this phase.
 * A later model may read observations, features, regime, signals, arbitration
 * evidence, news, and a user thesis. It may return a thesis, context, hypothesis,
 * and explanation. It does not receive authority over risk limits, wallet
 * permissions, or transaction signing.
 */
export interface ReasoningRequest {
  observations: readonly string[];
  features: readonly string[];
  regime: string;
  signals: readonly string[];
  arbitrationEvidence: readonly string[];
  news: readonly string[];
  userThesis: string | null;
}

export interface ReasoningNote {
  thesis: string;
  context: string;
  hypothesis: string;
  explanation: string;
}

export interface ReasoningProvider {
  explain(request: ReasoningRequest): Promise<ReasoningNote>;
}
