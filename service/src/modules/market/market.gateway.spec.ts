import { MarketGateway } from './market.gateway';
import { MarketStore } from './market.store';
import { TradeProcessedEvent } from './market.events';
import { PairName } from './market.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(pair: PairName, price: number): TradeProcessedEvent {
  return new TradeProcessedEvent(pair, price, Date.now(), price * 0.99);
}

function makeSocket(id = 'test-socket') {
  return { id, emit: jest.fn() } as unknown as import('socket.io').Socket;
}

function makeServer() {
  return { emit: jest.fn() } as unknown as import('socket.io').Server;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MarketGateway', () => {
  let gateway: MarketGateway;
  let store: jest.Mocked<MarketStore>;
  let server: ReturnType<typeof makeServer>;

  beforeEach(() => {
    store = {
      getLastKnown: jest.fn().mockReturnValue(new Map()),
    } as unknown as jest.Mocked<MarketStore>;

    gateway = new MarketGateway(store);

    // Inject the mock server directly (normally set by the decorator)
    server = makeServer();
    (gateway as unknown as { server: typeof server }).server = server;
  });

  afterEach(() => {
    // Stop the flush interval started by onModuleInit
    gateway.onModuleDestroy();
  });

  // ─── Connection — snapshot ────────────────────────────────────────────────

  it('emits a snapshot to a connecting client when prices are known', () => {
    const snapshot = new Map<PairName, import('./market.types').PriceUpdate>([
      ['ETH/USDC', { pair: 'ETH/USDC', price: 3_000, timestamp: Date.now(), hourlyAverage: 2_990 }],
    ]);
    store.getLastKnown.mockReturnValue(snapshot);

    const socket = makeSocket();
    gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith(
      'snapshot',
      expect.objectContaining({ 'ETH/USDC': expect.any(Object) }),
    );
  });

  it('does not emit a snapshot when the store is empty', () => {
    store.getLastKnown.mockReturnValue(new Map());

    const socket = makeSocket();
    gateway.handleConnection(socket);

    expect(socket.emit).not.toHaveBeenCalled();
  });

  // ─── Buffer — deduplication ───────────────────────────────────────────────

  it('overwrites the buffer entry for the same pair (keeps only the latest event)', () => {
    const first = makeEvent('ETH/USDC', 3_000);
    const second = makeEvent('ETH/USDC', 3_100);

    gateway.handleTradeProcessed(first);
    gateway.handleTradeProcessed(second);

    gateway.onModuleInit(); // start flush timer
    jest.useFakeTimers();
    jest.advanceTimersByTime(500);
    jest.useRealTimers();

    // Force a synchronous flush by calling the private method via cast
    (gateway as unknown as { flush(): void }).flush();

    // Server should emit exactly once for ETH/USDC, with the second (latest) price
    expect(server.emit).toHaveBeenCalledTimes(1);
    expect(server.emit).toHaveBeenCalledWith(
      'price-update',
      expect.objectContaining({ pair: 'ETH/USDC', price: 3_100 }),
    );
  });

  it('flushes all buffered pairs in a single interval', () => {
    gateway.handleTradeProcessed(makeEvent('ETH/USDC', 3_000));
    gateway.handleTradeProcessed(makeEvent('ETH/USDT', 3_010));
    gateway.handleTradeProcessed(makeEvent('ETH/BTC', 0.062));

    (gateway as unknown as { flush(): void }).flush();

    expect(server.emit).toHaveBeenCalledTimes(3);
  });

  it('clears the buffer after flushing (no double-emit)', () => {
    gateway.handleTradeProcessed(makeEvent('ETH/USDC', 3_000));

    const flush = () => (gateway as unknown as { flush(): void }).flush();
    flush();
    flush(); // second flush — buffer should be empty

    expect(server.emit).toHaveBeenCalledTimes(1);
  });

  it('does nothing on flush when the buffer is empty', () => {
    (gateway as unknown as { flush(): void }).flush();
    expect(server.emit).not.toHaveBeenCalled();
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  it('clears the flush timer on destroy', () => {
    gateway.onModuleInit();
    const spy = jest.spyOn(global, 'clearInterval');
    gateway.onModuleDestroy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
