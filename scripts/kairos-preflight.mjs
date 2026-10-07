const names = [
  ["STATE BACKEND", stateBackend],
  ["BINANCE WEB3", binance],
  ["QWEN", qwen],
  ["FMP", fmp],
  ["BINANCE SKILLS", () => "NOT_CONFIGURED"],
  ["AGENT STUDIO", () => "INCOMPATIBLE"],
  ["AGENTIC WALLET", () => "BLOCKED"],
];

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

console.log("KAIROS preflight");
console.log("Values are not printed.");
for (const [label, read] of names) {
  console.log(`${label}\t${read()}`);
}
console.log("LIVE EXECUTION\tBLOCKED");
console.log("AGENT IDENTITY\tNOT_REGISTERED");
console.log("DEPLOYMENT\tDEPLOYMENT_BLOCKED");
console.log("PRODUCTION DURABLE\t" + (stateBackend() === "READY" ? "YES" : "NO"));
console.log("STUDIO CLI\tUPDATE_REQUIRED");
console.log("Installed bag\t0.0.5");
console.log("Published @bnbagent/studio-cli\t0.0.14");
