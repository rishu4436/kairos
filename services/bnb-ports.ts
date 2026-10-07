/**
 * BNB and wallet boundaries.
 *
 * Market observation and tokenized-equity reference data are served by
 * services/binance from the official Binance Web3 RWA endpoints.
 * Quote, unsigned transaction build, simulation, and wallet balance reads are connected.
 * Signing, broadcast, Agent Studio, and Agentic Wallet stay disconnected.
 */

export interface ConnectedPort {
  readonly name: string;
  readonly connected: true;
  readonly documentationNote: string;
}

export interface DisconnectedPort {
  readonly name: string;
  readonly connected: false;
  readonly documentationNote: string;
}

export type BnbPort = ConnectedPort | DisconnectedPort;

export class IntegrationNotConfiguredError extends Error {
  readonly integration: string;

  constructor(integration: string) {
    super(
      `${integration} is not configured. Wire it from official documentation before use. No endpoint was called.`,
    );
    this.name = "IntegrationNotConfiguredError";
    this.integration = integration;
  }
}

function disconnected(name: string): DisconnectedPort {
  return {
    name,
    connected: false,
    documentationNote: `${name} is not connected. This phase does not quote, sign, simulate, or broadcast.`,
  };
}

export const bnbMarketDataPort: ConnectedPort = {
  name: "BNB market data",
  connected: true,
  documentationNote:
    "RWA reads plus GET /api/v1/dex/market/candles. See docs/BINANCE_INTEGRATION.md and docs/BINANCE_MARKET_DATA.md.",
};

export const bnbTokenizedEquityPort: ConnectedPort = {
  name: "BNB tokenized-equity reference data",
  connected: true,
  documentationNote:
    "GET /api/v1/dex/market/rwa/platforms, /search, and /tokens. Contracts are resolved at request time.",
};

export const bnbQuotePort: ConnectedPort = {
  name: "BNB quote service",
  connected: true,
  documentationNote:
    "GET /api/v1/dex/aggregator/quote then GET /api/v1/dex/aggregator/swap. The swap payload is unsigned. See docs/BNB_EXECUTION.md.",
};
export const bnbSimulationPort: ConnectedPort = {
  name: "BNB transaction simulation",
  connected: true,
  documentationNote: "POST /api/v1/dex/pre-transaction/simulate. Broadcast is not called.",
};
export const bnbWalletPort: ConnectedPort = {
  name: "BNB wallet balance read",
  connected: true,
  documentationNote: "GET /api/v1/dex/balance/all-token-balances-by-address. No transfer and no signing.",
};
export const bnbBroadcastPort = disconnected("BNB transaction broadcast");
export const bnbAgentStudioPort = disconnected(
  "BNB Agent Studio runtime. bag 0.0.5 is installed. No studio.toml project, identity, or deployment was found.",
);
export const agenticWalletPort: DisconnectedPort = {
  name: "Agentic Wallet provider",
  connected: false,
  documentationNote:
    "The baw adapter exists. wallet status returned UNCONNECTED. market-order swap is not called unless KAIROS_AGENTIC_WALLET_EXECUTE=1. No private key is stored.",
};

export const BNB_PORTS = [
  bnbMarketDataPort,
  bnbTokenizedEquityPort,
  bnbQuotePort,
  bnbSimulationPort,
  bnbWalletPort,
  bnbBroadcastPort,
  bnbAgentStudioPort,
  agenticWalletPort,
] as const;

export function assertPortReady(port: BnbPort): void {
  if (!port.connected) {
    throw new IntegrationNotConfiguredError(port.name);
  }
}
