export type Pair = 'ETH/USDC' | 'ETH/USDT' | 'ETH/BTC';

export interface PriceUpdate {
  pair: Pair;
  price: number;
  timestamp: number;
  hourlyAverage: number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface MarketState {
  status: ConnectionStatus;
  prices: Record<string, PriceUpdate>;
  history: Record<string, PriceUpdate[]>;
}
