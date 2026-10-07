const TOKEN_COOKIE = "kairos_operator";

export function operatorMutationsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KAIROS_OPERATOR_ENABLED === "true";
}

export function publicLock(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KAIROS_PUBLIC_LOCK === "true" || env.NODE_ENV === "production";
}

export function assertOperatorMutation(request: Request, env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; status: number; reason: string } {
  if (!operatorMutationsAllowed(env)) {
    return { ok: false, status: 403, reason: "OPERATOR_DISABLED" };
  }
  if (publicLock(env) && env.KAIROS_OPERATOR_ENABLED !== "true") {
    return { ok: false, status: 403, reason: "PUBLIC_LOCK" };
  }
  const cookie = request.headers.get("cookie") ?? "";
  const header = request.headers.get("x-kairos-operator") ?? "";
  const fromCookie = readCookie(cookie, TOKEN_COOKIE);
  if (!fromCookie || fromCookie !== header) {
    return { ok: false, status: 403, reason: "CSRF" };
  }
  return { ok: true };
}

export const OPERATOR_COOKIE = TOKEN_COOKIE;

export function operatorCookieHeader(token: string): string {
  return `${TOKEN_COOKIE}=${token}; Path=/; SameSite=Strict`;
}

export function newOperatorToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
}
