export type KairosErrorCategory =
  | "AUTHENTICATION_ERROR"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "DATA_UNAVAILABLE"
  | "MALFORMED_RESPONSE"
  | "UNKNOWN_ERROR";

const TRANSIENT = new Set<KairosErrorCategory>(["RATE_LIMITED", "UPSTREAM_ERROR", "TIMEOUT"]);

export class KairosApiError extends Error {
  readonly category: KairosErrorCategory;
  readonly httpStatus: number | null;
  readonly upstreamCode: string | null;
  readonly endpoint: string | null;
  readonly safeMessage: string;
  readonly technicalMessage: string;
  readonly retryAfterMs: number | null;

  constructor(input: {
    category: KairosErrorCategory;
    safeMessage: string;
    technicalMessage: string;
    httpStatus?: number | null;
    upstreamCode?: string | number | null;
    endpoint?: string | null;
    retryAfterMs?: number | null;
  }) {
    super(input.safeMessage);
    this.name = "KairosApiError";
    this.category = input.category;
    this.safeMessage = input.safeMessage;
    this.technicalMessage = input.technicalMessage;
    this.httpStatus = input.httpStatus ?? null;
    this.upstreamCode = input.upstreamCode === undefined || input.upstreamCode === null ? null : String(input.upstreamCode);
    this.endpoint = input.endpoint ?? null;
    this.retryAfterMs = input.retryAfterMs ?? null;
  }
}

export function isTransient(error: unknown): error is KairosApiError {
  return error instanceof KairosApiError && TRANSIENT.has(error.category);
}

const SAFE: Record<KairosErrorCategory, string> = {
  AUTHENTICATION_ERROR: "Binance rejected the request. Check the API key, secret, and clock.",
  RATE_LIMITED: "Binance rate limit reached. KAIROS will retry.",
  INVALID_REQUEST: "The market data request was rejected as invalid.",
  UPSTREAM_ERROR: "Binance Web3 API returned an error.",
  TIMEOUT: "The market data request timed out.",
  DATA_UNAVAILABLE: "Binance returned no data for this request.",
  MALFORMED_RESPONSE: "Binance returned a response KAIROS could not read.",
  UNKNOWN_ERROR: "The market data request failed.",
};

export function safeMessage(category: KairosErrorCategory): string {
  return SAFE[category];
}

export function categoryForUpstream(httpStatus: number, code: number | null): KairosErrorCategory {
  if (code === 42900 || httpStatus === 429) {
    return "RATE_LIMITED";
  }
  if (code === 40001 || httpStatus === 400) {
    return "INVALID_REQUEST";
  }
  if (
    code === 40101 ||
    code === 40102 ||
    code === 40103 ||
    code === 40104 ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    return "AUTHENTICATION_ERROR";
  }
  if (code === 50000 || code === 50001 || httpStatus === 500 || httpStatus === 503) {
    return "UPSTREAM_ERROR";
  }
  if (httpStatus >= 500) {
    return "UPSTREAM_ERROR";
  }
  if (httpStatus >= 400) {
    return "UNKNOWN_ERROR";
  }
  return "UNKNOWN_ERROR";
}

export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 4) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}
