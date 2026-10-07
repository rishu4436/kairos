import type { ProviderFailure } from "@/events/model";
import { FMP_BASE_URL, fmpTimeoutMs } from "@/events/policy";

export interface FmpFetchResult {
  ok: true;
  body: unknown;
  latencyMs: number;
}

export interface FmpFetchFailure {
  ok: false;
  code: ProviderFailure;
  latencyMs: number | null;
}

export type FmpTransport = (url: URL, timeoutMs: number) => Promise<FmpFetchResult | FmpFetchFailure>;

let transport: FmpTransport = defaultTransport;

/** Tests replace the transport. Production uses fetch and never logs the key. */
export function setFmpTransport(next: FmpTransport | null): void {
  transport = next ?? defaultTransport;
}

export function fmpApiKey(): string | null {
  const key = process.env.FMP_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function earningsUrl(ticker: string, key: string): URL {
  const url = new URL(`${FMP_BASE_URL}/earnings`);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", key);
  return url;
}

export function newsUrl(ticker: string, key: string): URL {
  const url = new URL(`${FMP_BASE_URL}/news/stock`);
  url.searchParams.set("symbols", ticker);
  url.searchParams.set("apikey", key);
  return url;
}

export async function fetchFmp(url: URL): Promise<FmpFetchResult | FmpFetchFailure> {
  return transport(url, fmpTimeoutMs());
}

async function defaultTransport(url: URL, timeoutMs: number): Promise<FmpFetchResult | FmpFetchFailure> {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    const latencyMs = Date.now() - started;
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: "AUTHENTICATION_ERROR", latencyMs };
    }
    if (response.status === 429) {
      return { ok: false, code: "RATE_LIMITED", latencyMs };
    }
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, code: "UPSTREAM_ERROR", latencyMs };
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, code: "INVALID_RESPONSE", latencyMs };
    }
    const failure = errorObject(body);
    if (failure) {
      return { ok: false, code: failure, latencyMs };
    }
    return { ok: true, body, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { ok: false, code: "TIMEOUT", latencyMs };
    }
    return { ok: false, code: "UNKNOWN_ERROR", latencyMs };
  }
}

function errorObject(body: unknown): ProviderFailure | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const message = record["Error Message"] ?? record.error ?? record.message;
  if (typeof message !== "string") {
    return null;
  }
  if (/invalid api key|apikey|unauthorized|not authorized/i.test(message)) {
    return "AUTHENTICATION_ERROR";
  }
  if (/limit/i.test(message)) {
    return "RATE_LIMITED";
  }
  return "UPSTREAM_ERROR";
}
