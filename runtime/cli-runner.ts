import { createLocalKairosRunner } from "@/runtime/local-host";

const runner = createLocalKairosRunner();

function shutdown(): void {
  runner.stop();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await runner.runLoop();
