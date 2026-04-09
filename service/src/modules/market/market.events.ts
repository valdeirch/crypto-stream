import { PairName } from './market.types';

// Domain event emitted by MarketService and consumed by MarketGateway.
// Using an event bus decouples the processing pipeline from the transport layer:
// MarketService has no knowledge of socket.io; MarketGateway has no knowledge
// of Finnhub or averaging logic.

export const TRADE_PROCESSED_EVENT = 'market.trade.processed';

export class TradeProcessedEvent {
  constructor(
    public readonly pair: PairName,
    public readonly price: number,
    public readonly timestamp: number,
    public readonly hourlyAverage: number,
  ) {}
}
