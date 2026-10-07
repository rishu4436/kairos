import { describe, expect, it } from "vitest";
import { localPaperSession } from "@/paper/session";

describe("local paper session identity", () => {
  it("loads persisted legacy user, agent, and policy ids", () => {
    const session = localPaperSession("user_demo");
    expect(session?.user.id).toBe("user_demo");
    expect(session?.agent.id).toBe("agent_demo");
    expect(session?.policy.id).toBe("policy_demo");
    expect(localPaperSession("someone_else")).toBeNull();
  });
});
