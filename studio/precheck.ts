export interface AgentStudioProbe {
  cliInstalled: boolean;
  cliVersion: string | null;
  cliPackageVersion: string | null;
  nodeVersion: string | null;
  pythonVersion: string | null;
  pythonSdkVersion: string | null;
  typeScriptSdkInstalled: boolean;
  studioProjectPresent: boolean;
  configurationValid: boolean;
  identityRegistered: boolean;
  operatingWalletCreated: boolean;
  deployed: boolean;
  doctorMessage: string | null;
}

export interface PrecheckLine {
  label: string;
  value: string;
}

export function buildAgentStudioPrecheck(probe: AgentStudioProbe): { status: "READY" | "BLOCKED"; lines: readonly PrecheckLine[] } {
  if (!probe.cliInstalled) {
    return {
      status: "BLOCKED",
      lines: [{ label: "CLI", value: "AGENT_STUDIO_CLI_NOT_INSTALLED" }],
    };
  }
  const deployment = probe.deployed ? "DEPLOYED" : probe.studioProjectPresent && probe.configurationValid ? "NOT DEPLOYED" : "NOT READY";
  return {
    status: probe.studioProjectPresent && probe.configurationValid ? "READY" : "BLOCKED",
    lines: [
      { label: "CLI", value: probe.cliVersion ?? "INSTALLED" },
      { label: "CLI package", value: probe.cliPackageVersion ?? "UNKNOWN" },
      { label: "Node", value: probe.nodeVersion ?? "UNKNOWN" },
      { label: "Python", value: probe.pythonVersion ?? "UNKNOWN" },
      { label: "Python SDK", value: probe.pythonSdkVersion ?? "NOT INSTALLED" },
      { label: "TypeScript SDK", value: probe.typeScriptSdkInstalled ? "INSTALLED" : "NOT INSTALLED" },
      { label: "Identity", value: probe.identityRegistered ? "REGISTERED" : "NOT REGISTERED" },
      { label: "Operating wallet", value: probe.operatingWalletCreated ? "CREATED" : "NOT CREATED" },
      { label: "Runtime", value: probe.deployed ? "DEPLOYED" : "LOCAL" },
      { label: "Deployment", value: deployment },
      { label: "Doctor", value: probe.doctorMessage ?? "NOT RUN" },
    ],
  };
}

export function formatPrecheck(probe: AgentStudioProbe): string {
  const report = buildAgentStudioPrecheck(probe);
  return ["AGENT STUDIO PRECHECK", ...report.lines.map((line) => `${line.label}:\n${line.value}`)].join("\n\n");
}
