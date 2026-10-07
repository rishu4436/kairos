import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync("bag", args, { encoding: "utf8", shell: false });
  return {
    code: result.status,
    text: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    missing: result.error && result.error.code === "ENOENT",
  };
}

const version = run(["--version"]);
const doctor = version.missing ? null : run(["doctor"]);
const lines = [
  "AGENT STUDIO PRECHECK",
  "",
  version.missing ? "CLI:\nAGENT_STUDIO_CLI_NOT_INSTALLED" : `CLI:\n${version.text || "INSTALLED"}`,
  "",
  "Doctor:",
  doctor ? doctor.text || "NO OUTPUT" : "NOT RUN",
  "",
  "Deployment:",
  "NOT RUN. This command does not deploy.",
];
process.stdout.write(`${lines.join("\n")}\n`);
process.exit(version.missing ? 2 : 0);
