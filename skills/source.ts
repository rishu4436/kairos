export const SKILL_SOURCE_ORDER = ["DIRECT_API", "SKILL", "PLUGIN", "CLI", "LOCAL_CLI", "MOCK"] as const;
export type SkillSourceKind = (typeof SKILL_SOURCE_ORDER)[number] | "UNAVAILABLE";

export interface SkillSourceCandidate {
  id: string;
  transport: SkillSourceKind;
  available: boolean;
}

/** One source reaches the brain. A direct adapter wins over a skill or plugin that returns the same observation. */
export function selectSkillSource(candidates: readonly SkillSourceCandidate[]): { selected: SkillSourceCandidate | null; suppressed: readonly string[] } {
  const usable = candidates.filter((candidate) => candidate.available && candidate.transport !== "UNAVAILABLE");
  for (const kind of SKILL_SOURCE_ORDER) {
    const found = usable.find((candidate) => candidate.transport === kind || (kind === "CLI" && candidate.transport === "LOCAL_CLI"));
    if (found) {
      return { selected: found, suppressed: usable.filter((candidate) => candidate.id !== found.id).map((candidate) => candidate.id) };
    }
  }
  return { selected: null, suppressed: [] };
}
