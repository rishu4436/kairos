export interface LlmConfig {
  provider: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  configured: boolean;
  /** HTTPS compatible-mode base for Qwen. Empty for other providers. Never sent to the browser. */
  qwenBaseUrl: string;
}

export interface LlmEnv {
  KAIROS_LLM_PROVIDER?: string;
  KAIROS_LLM_API_KEY?: string;
  KAIROS_LLM_MODEL?: string;
  KAIROS_LLM_TIMEOUT_MS?: string;
  KAIROS_QWEN_BASE_URL?: string;
}

const XAI_MODEL = "grok-4.7";
const QWEN_MODEL = "qwen3.8-max";
const GEMINI_MODEL = "gemini-3.8-flash";
const DEFAULT_TIMEOUT_MS = 15_000;

/** Server configuration. The key and the Qwen base URL stay in this object. */
export function readLlmConfig(env: LlmEnv | NodeJS.ProcessEnv = process.env): LlmConfig {
  const source = env as LlmEnv;
  const apiKey = source.KAIROS_LLM_API_KEY?.trim() ?? "";
  const named = source.KAIROS_LLM_PROVIDER?.trim().toLowerCase() ?? "";
  const provider = named || (apiKey.length > 0 ? "xai" : "");
  const qwenBaseUrl = provider === "qwen" ? normalizeQwenBase(source.KAIROS_QWEN_BASE_URL) : "";
  const model = source.KAIROS_LLM_MODEL?.trim() || defaultModel(provider);
  return {
    provider,
    apiKey,
    model,
    timeoutMs: readTimeout(source.KAIROS_LLM_TIMEOUT_MS),
    configured: isConfigured(provider, apiKey, qwenBaseUrl),
    qwenBaseUrl,
  };
}

export function providerLabel(provider: string): string {
  if (provider === "gemini") return "Gemini";
  if (provider === "qwen") {
    return "Qwen";
  }
  if (provider === "xai") {
    return "xAI";
  }
  if (provider === "mock") {
    return "Mock";
  }
  return provider;
}

export function providerProductName(provider: string, model: string): string {
  if (provider === "qwen" && (model === QWEN_MODEL || model.length === 0)) {
    return "Qwen3.8-Max";
  }
  const label = providerLabel(provider);
  return label.length > 0 ? label : "—";
}

export function publicLlmStatus(config: LlmConfig, last: { at: string; latencyMs: number } | null): {
  configured: boolean;
  provider: string;
  providerLabel: string;
  productName: string;
  model: string;
  lastSuccessAt: string | null;
  latencyMs: number | null;
} {
  return {
    configured: config.configured,
    provider: config.provider,
    providerLabel: providerLabel(config.provider),
    productName: providerProductName(config.provider, config.model),
    model: config.model,
    lastSuccessAt: last?.at ?? null,
    latencyMs: last?.latencyMs ?? null,
  };
}

function defaultModel(provider: string): string {
  if (provider === "gemini") return GEMINI_MODEL;
  if (provider === "qwen") {
    return QWEN_MODEL;
  }
  if (provider === "xai") {
    return XAI_MODEL;
  }
  if (provider === "mock") {
    return "mock-1";
  }
  return "";
}

function isConfigured(provider: string, apiKey: string, qwenBaseUrl: string): boolean {
  if (provider === "mock") {
    return true;
  }
  if (provider === "qwen") {
    return apiKey.length > 0 && qwenBaseUrl.length > 0;
  }
  if (provider === "xai" || provider === "gemini") {
    return apiKey.length > 0;
  }
  return provider.length > 0;
}

/** Accepts only an https compatible-mode base. A bad value becomes empty and the provider stays unconfigured. */
export function normalizeQwenBase(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return "";
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function readTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(120_000, Math.max(1_000, parsed));
}
