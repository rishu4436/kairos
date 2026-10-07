import { randomUUID } from "node:crypto";
import { buildPrehash, encodeQuery, signPrehash } from "@/services/binance/auth";
import type { BinanceWeb3Config } from "@/services/binance/config";
import {
  categoryForUpstream,
  isTransient,
  KairosApiError,
  redact,
  safeMessage,
} from "@/services/binance/errors";
import type { BinanceEnvelope } from "@/services/binance/types";

export interface BinanceCallResult<T> {
  data: T;
  responseTimestamp: number | null;
  endpoint: string;
}

export interface BinanceClientOptions {
  config: BinanceWeb3Config;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  attempts?: number;
}

const PATH_PREFIX = "/build";

export class BinanceWeb3Client {
  private readonly config: BinanceWeb3Config;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly attempts: number;
  private readonly origin: string;
  private readonly prefix: string;

  constructor(options: BinanceClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? delay;
    this.attempts = options.attempts ?? 3;
    const base = new URL(this.config.baseUrl);
    this.origin = base.origin;
    const pathname = base.pathname.replace(/\/$/, "");
    this.prefix = pathname.length > 0 ? pathname : PATH_PREFIX;
  }

  async get<T>(
    apiPath: string,
    query: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<BinanceCallResult<T>> {
    return this.attempt<T>("GET", `${apiPath}${encodeQuery(query)}`, "", signal);
  }

  async post<T>(apiPath: string, payload: unknown, signal?: AbortSignal): Promise<BinanceCallResult<T>> {
    return this.attempt<T>("POST", apiPath, JSON.stringify(payload), signal);
  }

  private async attempt<T>(
    method: "GET" | "POST",
    endpoint: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<BinanceCallResult<T>> {
    let last: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        return await this.once<T>(method, endpoint, body, signal);
      } catch (error) {
        last = error;
        if (isAbort(error)) {
          throw error;
        }
        if (!isTransient(error) || attempt === this.attempts) {
          throw error;
        }
        const wait = error.retryAfterMs ?? 250 * 3 ** (attempt - 1);
        await this.sleep(wait, signal);
      }
    }
    throw last;
  }

  private async once<T>(
    method: "GET" | "POST",
    endpoint: string,
    payload: string,
    signal?: AbortSignal,
  ): Promise<BinanceCallResult<T>> {
    const requestPath = `${this.prefix}${endpoint}`;
    const timestamp = this.now().toISOString();
    const prehash = buildPrehash({ timestamp, method, requestPath, body: payload });
    const signature = signPrehash(prehash, this.config.secretKey);
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.origin}${requestPath}`, {
        method,
        headers: {
          "X-OC-APIKEY": this.config.apiKey,
          "X-OC-TIMESTAMP": timestamp,
          "X-OC-SIGN": signature,
          "X-OC-NONCE": randomUUID(),
          "X-OC-RECV-WINDOW": String(this.config.recvWindowMs),
          Accept: "application/json",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "POST" ? payload : undefined,
        signal: combined,
        cache: "no-store",
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (timeout.aborted || isAbort(error)) {
        throw new KairosApiError({
          category: "TIMEOUT",
          safeMessage: safeMessage("TIMEOUT"),
          technicalMessage: "The Binance request timed out.",
          endpoint,
        });
      }
      throw new KairosApiError({
        category: "UNKNOWN_ERROR",
        safeMessage: safeMessage("UNKNOWN_ERROR"),
        technicalMessage: redact(errorText(error), [this.config.apiKey, this.config.secretKey]),
        endpoint,
      });
    }

    const text = await response.text();
    let body: BinanceEnvelope<T> | null = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as BinanceEnvelope<T>;
      } catch {
        throw new KairosApiError({
          category: "MALFORMED_RESPONSE",
          safeMessage: safeMessage("MALFORMED_RESPONSE"),
          technicalMessage: `Non-JSON response from ${endpoint}.`,
          httpStatus: response.status,
          endpoint,
        });
      }
    }

    const code = numericCode(body?.code);
    if (!response.ok || (code !== null && code !== 0) || body?.success === false) {
      const category = categoryForUpstream(response.status, code);
      const retryAfter = retryAfterMs(response);
      throw new KairosApiError({
        category,
        safeMessage: category === "AUTHENTICATION_ERROR" && response.status === 0
          ? "API credentials missing"
          : safeMessage(category),
        technicalMessage: redact(
          `HTTP ${response.status} code ${code ?? "none"} on ${endpoint}: ${body?.msg ?? "no message"}`,
          [this.config.apiKey, this.config.secretKey],
        ),
        httpStatus: response.status,
        upstreamCode: code,
        endpoint,
        retryAfterMs: retryAfter,
      });
    }

    if (!body || body.data === undefined || body.data === null) {
      throw new KairosApiError({
        category: "DATA_UNAVAILABLE",
        safeMessage: safeMessage("DATA_UNAVAILABLE"),
        technicalMessage: `Empty data from ${endpoint}.`,
        httpStatus: response.status,
        endpoint,
      });
    }

    return {
      data: body.data,
      responseTimestamp: typeof body.timestamp === "number" ? body.timestamp : null,
      endpoint,
    };
  }
}

function numericCode(code: number | string | undefined): number | null {
  if (typeof code === "number" && Number.isFinite(code)) {
    return code;
  }
  if (typeof code === "string" && code.trim() !== "" && Number.isFinite(Number(code))) {
    return Number(code);
  }
  return null;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return Math.round(seconds * 1000);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Network request failed.";
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
