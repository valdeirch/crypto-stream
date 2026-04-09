import { EventEmitter2 } from '@nestjs/event-emitter';
import { MarketService } from './market.service';
import { MarketStore } from './market.store';
import { TRADE_PROCESSED_EVENT, TradeProcessedEvent } from './market.events';

describe('MarketService', () => {
  let service: MarketService;
  let store: jest.Mocked<MarketStore>;
  let emitter: jest.Mocked<EventEmitter2>;

  beforeEach(() => {
    store = {
      addPrice: jest.fn(),
      getAverage: jest.fn().mockReturnValue(3_000),
    } as unknown as jest.Mocked<MarketStore>;

    emitter = {
      emitAsync: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new MarketService(store, emitter);
  });

  // ─── handleTrade — happy path ────────────────────────────────────────────────

  it('stores the trade and emits a TradeProcessedEvent', () => {
    const now = Date.now();
    service.handleTrade('BINANCE:ETHUSDC', 3_100, now);

    expect(store.addPrice).toHaveBeenCalledWith('ETH/USDC', 3_100, now);
    expect(emitter.emitAsync).toHaveBeenCalledWith(
      TRADE_PROCESSED_EVENT,
      new TradeProcessedEvent('ETH/USDC', 3_100, now, 3_000),
    );
    expect(service.tradesProcessed).toBe(1);
  });

  it('increments tradesProcessed on each valid trade', () => {
    const now = Date.now();
    service.handleTrade('BINANCE:ETHUSDC', 3_000, now);
    service.handleTrade('BINANCE:ETHUSDT', 3_010, now + 1);
    service.handleTrade('BINANCE:ETHBTC', 0.062, now + 2);

    expect(service.tradesProcessed).toBe(3);
  });

  // ─── handleTrade — validation guards ────────────────────────────────────────

  it('drops trades with an unknown symbol', () => {
    service.handleTrade('BINANCE:UNKNOWN', 3_000, Date.now());

    expect(store.addPrice).not.toHaveBeenCalled();
    expect(emitter.emitAsync).not.toHaveBeenCalled();
    expect(service.tradesProcessed).toBe(0);
  });

  it('drops trades with price = 0', () => {
    service.handleTrade('BINANCE:ETHUSDC', 0, Date.now());

    expect(store.addPrice).not.toHaveBeenCalled();
    expect(service.tradesProcessed).toBe(0);
  });

  it('drops trades with a negative price', () => {
    service.handleTrade('BINANCE:ETHUSDC', -1, Date.now());

    expect(store.addPrice).not.toHaveBeenCalled();
    expect(service.tradesProcessed).toBe(0);
  });

  it('drops trades with a null timestamp', () => {
    service.handleTrade('BINANCE:ETHUSDC', 3_000, null as unknown as number);

    expect(store.addPrice).not.toHaveBeenCalled();
    expect(service.tradesProcessed).toBe(0);
  });

  // ─── getMetrics ──────────────────────────────────────────────────────────────

  it('returns current tradesProcessed count via getMetrics', () => {
    const now = Date.now();
    service.handleTrade('BINANCE:ETHUSDC', 3_000, now);
    service.handleTrade('BINANCE:ETHUSDT', 3_010, now + 1);

    expect(service.getMetrics()).toEqual({ tradesProcessed: 2 });
  });
});
