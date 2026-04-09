import { MarketStore } from './market.store';

describe('MarketStore', () => {
  let store: MarketStore;

  // No NestJS DI needed — MarketStore has no dependencies; instantiate directly.
  beforeEach(() => {
    store = new MarketStore();
  });

  // ─── 1. Empty store ─────────────────────────────────────────────────────────

  it('returns 0 for an empty store', () => {
    expect(store.getAverage('ETH/USDC')).toBe(0);
  });

  // ─── 2. Single entry ────────────────────────────────────────────────────────

  it('returns the price itself for a single entry', () => {
    store.addPrice('ETH/USDC', 3_000, Date.now());
    expect(store.getAverage('ETH/USDC')).toBe(3_000);
  });

  // ─── 3. Multiple entries — arithmetic mean ──────────────────────────────────

  it('computes the arithmetic mean for multiple entries', () => {
    const now = Date.now();
    store.addPrice('ETH/USDC', 1_000, now);
    store.addPrice('ETH/USDC', 2_000, now + 1);
    store.addPrice('ETH/USDC', 3_000, now + 2);
    expect(store.getAverage('ETH/USDC')).toBe(2_000);
  });

  // ─── 4. Expired entries excluded from average ────────────────────────────────

  it('excludes entries older than 60 minutes from the average', () => {
    const now = Date.now();
    const expired = now - 3_600_001; // 1 ms beyond the window

    store.addPrice('ETH/USDC', 2_000, expired);
    store.addPrice('ETH/USDC', 3_000, now);

    // The expired entry should be pruned during addPrice (trade timestamp reference).
    expect(store.getAverage('ETH/USDC')).toBe(3_000);
  });

  // ─── 5. All entries expire → returns 0 ─────────────────────────────────────

  it('returns 0 when all entries fall outside the window', () => {
    const stale = Date.now() - 7_200_000; // 2 hours ago
    store.addPrice('ETH/USDC', 2_000, stale);

    // Force wall-clock prune by calling getAverage (Date.now() reference)
    expect(store.getAverage('ETH/USDC')).toBe(0);
  });

  // ─── 6. Pair isolation ───────────────────────────────────────────────────────

  it('isolates state between different pairs', () => {
    const now = Date.now();
    store.addPrice('ETH/USDC', 3_000, now);
    store.addPrice('ETH/USDT', 3_100, now);
    store.addPrice('ETH/BTC', 0.06, now);

    expect(store.getAverage('ETH/USDC')).toBe(3_000);
    expect(store.getAverage('ETH/USDT')).toBe(3_100);
    expect(store.getAverage('ETH/BTC')).toBeCloseTo(0.06);
  });

  // ─── 7. Running sum consistency after multiple inserts + prunes ──────────────

  it('keeps running sum consistent after a mix of valid and expired entries', () => {
    const now = Date.now();
    const hour = 3_600_000;

    // Insert two expired entries
    store.addPrice('ETH/USDC', 1_000, now - hour - 2_000);
    store.addPrice('ETH/USDC', 2_000, now - hour - 1_000);

    // Insert two valid entries with a timestamp that prunes the above
    store.addPrice('ETH/USDC', 3_000, now);
    store.addPrice('ETH/USDC', 5_000, now + 1);

    // Only the two valid entries should remain → mean = 4000
    expect(store.getAverage('ETH/USDC')).toBe(4_000);
    expect(store.getEntries('ETH/USDC')).toHaveLength(2);
  });

  // ─── 8. Out-of-order timestamps don't corrupt the running sum ───────────────
  // Real-time streams can occasionally deliver trades out of order.
  // The store must not over-prune or corrupt sum when an older timestamp arrives
  // after a newer one (the prune cutoff is relative to the incoming timestamp).

  it('handles out-of-order timestamps without corrupting the sum', () => {
    const now = Date.now();

    // Newer trade arrives first
    store.addPrice('ETH/USDC', 4_000, now);

    // Older trade arrives second (e.g., a delayed message from Finnhub)
    // Its timestamp is within the window so it should be retained.
    const slightly_older = now - 60_000; // 1 minute ago — still within the window
    store.addPrice('ETH/USDC', 2_000, slightly_older);

    // Both entries should be present; order in the queue may differ from insertion
    // but the sum must be correct.
    expect(store.getAverage('ETH/USDC')).toBe(3_000); // (4000 + 2000) / 2
    expect(store.getEntries('ETH/USDC')).toHaveLength(2);
  });
});
