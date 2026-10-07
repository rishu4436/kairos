/**
 * Name expected by `bag doctor` at src/unifiedMain.ts.
 * The scaffold's file with this name loads the seller, signs quotes, and can broadcast.
 * This phase exposes the read-only intelligence work hook. It does not start
 * a server, load a wallet, negotiate a quote, or fulfill an on-chain job.
 */
export { runIntelligenceWork } from "./kairosWork";
