import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KnownSymbol, SYMBOL_PAIR_MAP } from './market.types';
import { MarketStore } from './market.store';
import { TRADE_PROCESSED_EVENT, TradeProcessedEvent } from './market.events';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  // Simple internal counter — exposed via health check
  tradesProcessed = 0;

  constructor(
    private readonly store: MarketStore,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Core trade handler (called by FinnhubClient) ────────────────────────

  handleTrade(symbol: string, price: number, timestamp: number): void {
    // Guard: unknown symbol — should not reach here, but defensive
    if (!(symbol in SYMBOL_PAIR_MAP)) {
      this.logger.warn(
        JSON.stringify({ event: 'invalid_symbol', symbol, at: new Date().toISOString() }),
      );
      return;
    }

    // Guard: invalid price
    if (price <= 0) {
      this.logger.warn(
        JSON.stringify({ event: 'invalid_price', symbol, price, at: new Date().toISOString() }),
      );
      return;
    }

    // Guard: missing timestamp — use == null to avoid rejecting timestamp=0 (Unix epoch edge case)
    if (timestamp == null) {
      this.logger.warn(
        JSON.stringify({ event: 'missing_timestamp', symbol, at: new Date().toISOString() }),
      );
      return;
    }

    const pair = SYMBOL_PAIR_MAP[symbol as KnownSymbol];

    this.store.addPrice(pair, price, timestamp);
    const hourlyAverage = this.store.getAverage(pair);

    // Fire-and-forget: we do not await emitAsync so the gateway's broadcast
    // cannot block or slow down the Finnhub message processing pipeline.
    void this.eventEmitter.emitAsync(
      TRADE_PROCESSED_EVENT,
      new TradeProcessedEvent(pair, price, timestamp, hourlyAverage),
    );

    this.tradesProcessed++;

    this.logger.log(
      JSON.stringify({
        event: 'trade_processed',
        pair,
        price,
        timestamp,
        hourlyAverage,
        at: new Date().toISOString(),
      }),
    );
  }

  getMetrics(): { tradesProcessed: number } {
    return { tradesProcessed: this.tradesProcessed };
  }
}
