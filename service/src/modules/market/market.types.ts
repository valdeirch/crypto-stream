// ─── Pair names (single source of truth) ────────────────────────────────────

export type PairName = 'ETH/USDC' | 'ETH/USDT' | 'ETH/BTC';

// ─── Finnhub symbol → display pair map ──────────────────────────────────────
// `satisfies` validates that all values belong to PairName at compile time
// while `as const` preserves literal types for narrowing KnownSymbol.

export const SYMBOL_PAIR_MAP = {
  'BINANCE:ETHUSDC': 'ETH/USDC',
  'BINANCE:ETHUSDT': 'ETH/USDT',
  'BINANCE:ETHBTC': 'ETH/BTC',
} as const satisfies Record<string, PairName>;

export type KnownSymbol = keyof typeof SYMBOL_PAIR_MAP;

// ─── Internal store entry ────────────────────────────────────────────────────

export interface PriceEntry {
  price: number;
  timestamp: number; // milliseconds (Finnhub trade timestamp)
}

// ─── Outgoing WebSocket data contract (strict — do not modify) ──────────────

export interface PriceUpdate {
  pair: PairName;
  price: number;
  timestamp: number;
  hourlyAverage: number;
}

// ─── Finnhub connection lifecycle ───────────────────────────────────────────

export enum ConnectionStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
}
