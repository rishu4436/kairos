import { spawn } from "node:child_process";
import { LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import type { AgenticWalletAccount, AgenticWalletExecutionResult, AgenticWalletSecurityPolicy, AgenticTokenBalance } from "@/domain/agentic-wallet";
import type { AgenticSwapRequest, AgenticWalletGateway } from "@/wallet/agentic/gateway";
import {
  disconnectedAccount,
  parseBalances,
  parseBscAddress,
  parseChains,
  parseCliJson,
  parseConnectionStatus,
  parseOrderStatus,
  parseSecurityPolicy,
  parseSwapSubmission,
} from "@/wallet/agentic/parse";

export interface BawRunner {
  run(args: readonly string[]): Promise<string>;
}

const ALLOWED_PREFIXES = ["wallet status", "wallet address", "wallet chains", "wallet balance", "wallet settings", "market-order list", "market-order swap"] as const;

/** Runs a fixed `baw` argument list. Windows needs `baw.cmd` through the shell. Arguments stay the allowlist. */
export function spawnBaw(args: readonly string[], timeoutMs = 8000): Promise<string> {
  assertAllowed(args);
  const command = process.platform === "win32" ? "baw.cmd" : "baw";
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { shell: process.platform === "win32", windowsHide: true });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(stdout);
    });
  });
}

export class CliAgenticWalletGateway implements AgenticWalletGateway {
  constructor(private readonly run: BawRunner["run"] = (args) => spawnBaw(args)) {}

  async getStatus(userId: string, agentId: string): Promise<AgenticWalletAccount> {
    const at = new Date().toISOString();
    if (userId !== LOCAL_RUNTIME_USER_ID) {
      return disconnectedAccount(userId, agentId, at);
    }
    try {
      const status = parseConnectionStatus(parseCliJson(await this.run(["wallet", "status", "--json"])).data);
      if (status !== "CONNECTED") {
        return { ...disconnectedAccount(userId, agentId, at), connectionStatus: status };
      }
      const address = parseBscAddress(parseCliJson(await this.run(["wallet", "address", "--json"])).data);
      const chains = parseChains(parseCliJson(await this.run(["wallet", "chains", "--json"])).data);
      const securityPolicy = parseSecurityPolicy(parseCliJson(await this.run(["wallet", "settings", "--json"])).data);
      return {
        userId,
        agentId,
        provider: "binance-agentic-wallet",
        accountId: null,
        walletAddress: address,
        supportedChains: chains,
        connectionStatus: status,
        securityPolicy,
        lastUpdated: at,
      };
    } catch {
      return disconnectedAccount(userId, agentId, at);
    }
  }

  async getSecurityPolicy(userId: string): Promise<AgenticWalletSecurityPolicy | null> {
    if (userId !== LOCAL_RUNTIME_USER_ID) {
      return null;
    }
    const parsed = parseCliJson(await this.run(["wallet", "settings", "--json"]));
    return parsed.success ? parseSecurityPolicy(parsed.data) : null;
  }

  async getBalances(userId: string, chainId: "56"): Promise<readonly AgenticTokenBalance[]> {
    if (userId !== LOCAL_RUNTIME_USER_ID) {
      return [];
    }
    const parsed = parseCliJson(await this.run(["wallet", "balance", "--binanceChainId", chainId, "--json"]));
    return parsed.success ? parseBalances(parsed.data) : [];
  }

  async executeSwap(request: AgenticSwapRequest): Promise<AgenticWalletExecutionResult> {
    if (request.userId !== LOCAL_RUNTIME_USER_ID) {
      return errorResult("USER_WALLET_MISMATCH");
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(request.fromToken) || !/^0x[0-9a-fA-F]{40}$/.test(request.toToken)) {
      return errorResult("INVALID_REQUEST");
    }
    if (!/^\d+(\.\d+)?$/.test(request.fromTokenQty) || !/^\d+(\.\d+)?$/.test(request.slippagePercent)) {
      return errorResult("INVALID_REQUEST");
    }
    const parsed = parseCliJson(await this.run([
      "market-order",
      "swap",
      "--fromTokenQty",
      request.fromTokenQty,
      "--fromToken",
      request.fromToken,
      "--toToken",
      request.toToken,
      "--binanceChainId",
      request.binanceChainId,
      "--slippage",
      request.slippagePercent,
      "--json",
    ]));
    if (!parsed.success) {
      return errorResult(parsed.errorName ?? "EXECUTION_ERROR");
    }
    return parseSwapSubmission(parsed.data, null);
  }

  async getOrderStatus(userId: string, orderId: string): Promise<AgenticWalletExecutionResult> {
    if (userId !== LOCAL_RUNTIME_USER_ID || !/^[A-Za-z0-9_-]{1,80}$/.test(orderId)) {
      return errorResult("VERIFICATION_FAILED");
    }
    const parsed = parseCliJson(await this.run(["market-order", "list", "--orderId", orderId, "--json"]));
    if (!parsed.success) {
      return errorResult("VERIFICATION_FAILED");
    }
    return parseOrderStatus(parsed.data, null);
  }
}

function assertAllowed(args: readonly string[]): void {
  const prefix = args.slice(0, 2).join(" ");
  if (!(ALLOWED_PREFIXES as readonly string[]).includes(prefix) || args.at(-1) !== "--json") {
    throw new Error("INVALID_REQUEST");
  }
}

function errorResult(errorCategory: string): AgenticWalletExecutionResult {
  return {
    status: "ERROR",
    walletAddress: null,
    transactionHash: null,
    orderId: null,
    timestamp: null,
    broadcasted: false,
    chainId: "56",
    errorCategory,
    providerMetadata: {},
  };
}
