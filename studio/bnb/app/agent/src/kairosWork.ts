/**
 * Studio-facing work hook.
 * The generated seller signs quotes in its own signing module. This file does not.
 * Behavior is studio/entrypoint.ts, which calls runKairosAutonomousCycle in PAPER
 * unless the server explicitly passes LIVE_PREVIEW.
 */
export { runStudioKairosCycle, trustedStudioMode } from "../../../../entrypoint";
