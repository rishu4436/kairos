import { createHmac } from "node:crypto";

/**
 * Official pre-hash: timestamp + METHOD + requestPath + body, with no separator.
 * requestPath includes the /build prefix and the raw encoded query.
 */
export function buildPrehash(input: {
  timestamp: string;
  method: string;
  requestPath: string;
  body: string;
}): string {
  return `${input.timestamp}${input.method.toUpperCase()}${input.requestPath}${input.body}`;
}

export function signPrehash(prehash: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(prehash, "utf8").digest("base64");
}

export function encodeQuery(params: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value.length === 0) {
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}
