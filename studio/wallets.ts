import type { OperatingWallet, TradingWalletRef } from "@/studio/types";

export function emptyOperatingWallet(): OperatingWallet {
  return { role: "OPERATING", source: "agent-studio", address: null, configured: false };
}

export function tradingWallet(input: { userId: string; address: string | null; connectionStatus: TradingWalletRef["connectionStatus"] }): TradingWalletRef {
  return { role: "TRADING", source: "agentic-wallet", userId: input.userId, address: input.address, connectionStatus: input.connectionStatus };
}

export function walletsAreDistinct(operating: OperatingWallet, trading: TradingWalletRef): boolean {
  return !(operating.address && trading.address && operating.address.toLowerCase() === trading.address.toLowerCase());
}

export function useOperatingCapitalForTrade(): { ok: false; reason: "OPERATING_CAPITAL_IS_NOT_TRADING_CAPITAL" } {
  return { ok: false, reason: "OPERATING_CAPITAL_IS_NOT_TRADING_CAPITAL" };
}

export function useTradingCapitalForOperatingExpense(): { ok: false; reason: "TRADING_CAPITAL_IS_NOT_OPERATING_CAPITAL" } {
  return { ok: false, reason: "TRADING_CAPITAL_IS_NOT_OPERATING_CAPITAL" };
}
