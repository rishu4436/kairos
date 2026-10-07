export type ReadinessStatus = "READY" | "NOT_CONFIGURED" | "INCOMPATIBLE" | "BLOCKED" | "OPTIONAL" | "MEMORY_EPHEMERAL";

export interface RuntimeReadiness {
  stateBackend: ReadinessStatus;
  binanceWeb3: ReadinessStatus;
  qwen: ReadinessStatus;
  fmp: ReadinessStatus;
  binanceSkills: ReadinessStatus;
  agentStudio: ReadinessStatus;
  agenticWallet: ReadinessStatus;
  liveExecution: "BLOCKED";
  identity: "NOT_REGISTERED";
  operatingWallet: "NOT_CONFIGURED";
  autonomousRuntime: "LOCAL";
  deployment: "DEPLOYMENT_BLOCKED";
  productionDurable: boolean;
}

function present(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Presence only. Values are never returned. */
export function collectReadiness(env: NodeJS.ProcessEnv = process.env): RuntimeReadiness {
  const redisSelected = env.KAIROS_STATE_BACKEND === "redis";
  const redisUrl = present(env.REDIS_URL);
  const stateBackend: ReadinessStatus = !redisSelected ? "MEMORY_EPHEMERAL" : redisUrl ? "READY" : "NOT_CONFIGURED";
  return {
    stateBackend,
    binanceWeb3: present(env.BINANCE_WEB3_API_KEY) && present(env.BINANCE_WEB3_SECRET_KEY) ? "READY" : "NOT_CONFIGURED",
    qwen: env.KAIROS_LLM_PROVIDER === "qwen" && present(env.KAIROS_LLM_API_KEY) && present(env.KAIROS_QWEN_BASE_URL) ? "READY" : "NOT_CONFIGURED",
    fmp: present(env.FMP_API_KEY) ? "READY" : "NOT_CONFIGURED",
    binanceSkills: "NOT_CONFIGURED",
    agentStudio: "INCOMPATIBLE",
    agenticWallet: "BLOCKED",
    liveExecution: "BLOCKED",
    identity: "NOT_REGISTERED",
    operatingWallet: "NOT_CONFIGURED",
    autonomousRuntime: "LOCAL",
    deployment: "DEPLOYMENT_BLOCKED",
    productionDurable: stateBackend === "READY",
  };
}

export interface ReadinessLabels {
  autonomousRuntime: string;
  stateBackend: string;
  identity: string;
  operatingWallet: string;
  binanceData: string;
  binanceSkills: string;
  qwen: string;
  fmp: string;
  tradingWallet: string;
  liveExecution: string;
  studioProject: string;
  deployment: string;
}

export function readinessLabels(env: NodeJS.ProcessEnv = process.env): ReadinessLabels {
  const ready = collectReadiness(env);
  return {
    autonomousRuntime: "LOCAL",
    stateBackend: ready.stateBackend === "READY" ? "REDIS · DURABLE" : ready.stateBackend === "NOT_CONFIGURED" ? "REDIS · NOT CONFIGURED" : "MEMORY · EPHEMERAL",
    identity: "NOT REGISTERED",
    operatingWallet: "NOT CONFIGURED",
    binanceData: ready.binanceWeb3 === "READY" ? "CONNECTED" : "NOT CONFIGURED",
    binanceSkills: "NOT INSTALLED",
    qwen: ready.qwen === "READY" ? "CONNECTED" : "NOT CONFIGURED",
    fmp: ready.fmp === "READY" ? "CONNECTED" : "NOT CONFIGURED",
    tradingWallet: "NOT CONNECTED",
    liveExecution: "BLOCKED",
    studioProject: "CONFIGURED",
    deployment: "NOT DEPLOYED",
  };
}
