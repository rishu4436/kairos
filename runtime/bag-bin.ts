export type StudioCliClass = "COMPATIBLE" | "UPDATE_REQUIRED" | "NOT_CONFIGURED" | "INCOMPATIBLE";

const COMPATIBLE_AT = [0, 0, 14];

/** Explicit binary wins. An empty value keeps the PATH command name. */
export function resolveBagBin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.KAIROS_BAG_BIN?.trim();
  return configured && configured.length > 0 ? configured : "bag";
}

export function parseBagVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

export function classifyStudioCli(version: string | null): StudioCliClass {
  if (version === null || version.trim().length === 0) {
    return "NOT_CONFIGURED";
  }
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length < 3 || parts.some((part) => !Number.isInteger(part))) {
    return "INCOMPATIBLE";
  }
  for (let index = 0; index < 3; index += 1) {
    const have = parts[index] ?? 0;
    const need = COMPATIBLE_AT[index] ?? 0;
    if (have > need) {
      return "COMPATIBLE";
    }
    if (have < need) {
      return "UPDATE_REQUIRED";
    }
  }
  return "COMPATIBLE";
}
