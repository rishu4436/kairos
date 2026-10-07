import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyStudioCli, parseBagVersion, resolveBagBin } from "@/runtime/bag-bin";
import { runStudioKairosCycle } from "@/studio/entrypoint";
import { InMemoryKairosStateStore } from "@/runtime/store";

describe("studio cli selection", () => {
  it("uses an explicit binary and classifies versions without reading PATH", () => {
    const empty = { ...process.env };
    delete empty.KAIROS_BAG_BIN;
    expect(resolveBagBin({ ...empty, KAIROS_BAG_BIN: "" })).toBe("bag");
    expect(resolveBagBin(empty)).toBe("bag");
    expect(resolveBagBin({ ...empty, KAIROS_BAG_BIN: "D:\\tools\\bag.cmd" })).toBe("D:\\tools\\bag.cmd");
    expect(parseBagVersion("0.0.14\n")).toBe("0.0.14");
    expect(parseBagVersion("bag 0.0.5")).toBe("0.0.5");
    expect(classifyStudioCli("0.0.14")).toBe("COMPATIBLE");
    expect(classifyStudioCli("0.0.15")).toBe("COMPATIBLE");
    expect(classifyStudioCli("0.0.5")).toBe("UPDATE_REQUIRED");
    expect(classifyStudioCli(null)).toBe("NOT_CONFIGURED");
    expect(classifyStudioCli("studio")).toBe("INCOMPATIBLE");
  });

  it("reports a missing explicit binary and does not let PATH bag replace it", () => {
    const root = mkdtempSync(join(tmpdir(), "kairos-bag-"));
    const missing = join(root, "missing-bag.cmd");
    const fake = join(root, "fake-bag.cmd");
    writeFileSync(fake, "@echo 0.0.14\r\n");
    try {
      const missingRun = execFileSync(process.execPath, ["scripts/kairos-preflight.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, KAIROS_STATE_BACKEND: "memory", REDIS_URL: "", KAIROS_BAG_BIN: missing },
      });
      expect(missingRun).toMatch(/STUDIO CLI\tINCOMPATIBLE/);
      expect(missingRun).toMatch(/STUDIO CLI SOURCE\tEXPLICIT/);
      const explicit = execFileSync(process.execPath, ["scripts/kairos-preflight.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, KAIROS_STATE_BACKEND: "memory", REDIS_URL: "", KAIROS_BAG_BIN: fake },
      });
      expect(explicit).toMatch(/STUDIO CLI\tCOMPATIBLE/);
      expect(explicit).toMatch(/STUDIO CLI VERSION\t0\.0\.14/);
      expect(explicit).toMatch(/DEPLOYMENT\tNOT_DEPLOYED/);
      expect(explicit).not.toMatch(/0\.0\.5/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps Studio storage free of secrets and separate from KAIROS Redis", () => {
    const toml = readFileSync("studio/bnb/app/agent/studio.toml", "utf8");
    expect(toml).toMatch(/kind = "ipfs"/);
    expect(toml).not.toMatch(/STORAGE_API_KEY=\S/);
    expect(toml).not.toMatch(/WALLET_PASSWORD=\S/);
    const store = new InMemoryKairosStateStore();
    const cycle = runStudioKairosCycle({
      userId: "user_storage",
      agentId: "agent_storage",
      nowMs: 1_700_000_400_000,
      requestedMode: "LIVE",
      store,
      runPaper: () => ({
        ran: true,
        reason: "paper",
        events: [],
        view: null,
        createdIntentIds: [],
        executionMode: "PAPER",
        authorityCode: null,
        executionContextId: null,
        loopState: "MONITORING_POSITION",
        transitions: [],
      }),
    });
    expect(cycle.executionMode).toBe("PAPER");
    expect(cycle.signed).toBe(false);
    expect(store.backend).toBe("MEMORY");
    expect(store.durable).toBe(false);
  });
});
