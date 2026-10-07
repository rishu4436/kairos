import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const COMPATIBLE_AT = [0, 0, 14];

function present(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function stateBackend() {
  if (process.env.KAIROS_STATE_BACKEND !== "redis") {
    return "MEMORY_EPHEMERAL";
  }
  return present("REDIS_URL") ? "READY" : "NOT_CONFIGURED";
}

function binance() {
  return present("BINANCE_WEB3_API_KEY") && present("BINANCE_WEB3_SECRET_KEY") ? "READY" : "NOT_CONFIGURED";
}

function qwen() {
  return process.env.KAIROS_LLM_PROVIDER === "qwen" && present("KAIROS_LLM_API_KEY") && present("KAIROS_QWEN_BASE_URL") ? "READY" : "NOT_CONFIGURED";
}

function fmp() {
  return present("FMP_API_KEY") ? "READY" : "NOT_CONFIGURED";
}

function resolveBagBin() {
  const configured = process.env.KAIROS_BAG_BIN?.trim();
  return configured && configured.length > 0 ? configured : "bag";
}

function classify(version) {
  if (!version) {
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

function studioCli() {
  const bin = resolveBagBin();
  const explicit = Boolean(process.env.KAIROS_BAG_BIN?.trim());
  if (explicit && (bin.includes("\\") || bin.includes("/") || bin.includes(":")) && !existsSync(bin)) {
    return { version: null, compatibility: "INCOMPATIBLE", bin: "EXPLICIT" };
  }
  const command = bin.includes(" ") ? `"${bin}" --version` : `${bin} --version`;
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 120000,
        windowsVerbatimArguments: true,
      })
    : spawnSync(bin, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0) {
    return { version: null, compatibility: "INCOMPATIBLE", bin: explicit ? "EXPLICIT" : "PATH" };
  }
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = text.match(/(\d+\.\d+\.\d+)/);
  const version = match?.[1] ?? null;
  return { version, compatibility: classify(version), bin: explicit ? "EXPLICIT" : "PATH" };
}

const studio = studioCli();
console.log("KAIROS preflight");
console.log("Values are not printed.");
console.log(`STATE BACKEND\t${stateBackend()}`);
console.log(`BINANCE WEB3\t${binance()}`);
console.log(`QWEN\t${qwen()}`);
console.log(`FMP\t${fmp()}`);
console.log("BINANCE SKILLS\tNOT_CONFIGURED");
console.log("AGENTIC WALLET\tBLOCKED");
console.log("LIVE EXECUTION\tBLOCKED");
console.log("AGENT IDENTITY\tNOT_REGISTERED");
console.log("OPERATING WALLET\tNOT_CONFIGURED");
console.log("STUDIO PROJECT\tCONFIGURED");
console.log("DEPLOYMENT\tNOT_DEPLOYED");
console.log(`STUDIO CLI\t${studio.compatibility}`);
console.log(`STUDIO CLI SOURCE\t${studio.bin}`);
console.log(`STUDIO CLI VERSION\t${studio.version ?? "UNAVAILABLE"}`);
console.log(`PRODUCTION DURABLE\t${stateBackend() === "READY" ? "YES" : "NO"}`);
