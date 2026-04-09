import { Injectable } from '@nestjs/common';
import { PairName, PriceEntry, PriceUpdate, SYMBOL_PAIR_MAP } from './market.types';

// ─── Per-pair rolling window state ──────────────────────────────────────────

interface PairState {
  queue: PriceEntry[]; // FIFO — entries ordered by timestamp ascending
  sum: number; // running sum for O(1) average computation
  count: number; // mirrors queue.length; kept explicit for clarity
}

// ─── Rolling window constants ─────────────────────────────────────────────────

const WINDOW_MS = 3_600_000; // 60 minutes in milliseconds
const MAX_QUEUE_SIZE = 10_000; // hard cap — prune aggressively if exceeded

@Injectable()
export class MarketStore {
  private readonly store = new Map<PairName, PairState>();

  // ─── Write path ────────────────────────────────────────────────────────────

  addPrice(pair: PairName, price: number, timestamp: number): void {
    const state = this.getOrInit(pair);

    // Safety: hard cap prevents unbounded memory on burst traffic.
    // When exceeded, aggressively remove the oldest entry before inserting.
    // Trade-off: Array.shift() is O(n). For sustained high-volume ingestion
    // a circular buffer (index pointer + fixed array) would be O(1).
    if (state.count >= MAX_QUEUE_SIZE) {
      const evicted = state.queue.shift()!;
      state.sum -= evicted.price;
      state.count--;
    }

    state.queue.push({ price, timestamp });
    state.sum += price;
    state.count++;

    // Prune expired entries using the incoming trade timestamp as the reference.
    // This is intentional: for delayed or replayed data, the window is relative
    // to the latest observed event — not wall-clock time. This avoids
    // incorrectly evicting recent entries during a burst of late-arriving trades.
    this.pruneOlderThan(state, timestamp - WINDOW_MS);
  }

  // ─── Read path ─────────────────────────────────────────────────────────────

  getAverage(pair: PairName): number {
    const state = this.store.get(pair);
    if (!state || state.count === 0) return 0;

    // On reads, prune against wall-clock time. This guarantees that even when
    // no new trades arrive, stale entries eventually fall out of the window.
    // Using queue.at(-1).timestamp here would silently preserve old entries
    // when the stream goes idle — a correctness bug in dormant markets.
    this.pruneOlderThan(state, Date.now() - WINDOW_MS);

    return state.count === 0 ? 0 : state.sum / state.count;
  }

  // ─── Snapshot support (send to newly connected clients) ──────────────────

  getLastKnown(): Map<PairName, PriceUpdate> {
    const result = new Map<PairName, PriceUpdate>();

    for (const pair of Object.values(SYMBOL_PAIR_MAP) as PairName[]) {
      const state = this.store.get(pair);
      if (!state || state.count === 0) continue;

      const last = state.queue.at(-1)!;
      result.set(pair, {
        pair,
        price: last.price,
        timestamp: last.timestamp,
        hourlyAverage: this.getAverage(pair),
      });
    }

    return result;
  }

  // ─── Metrics ──────────────────────────────────────────────────────────────

  getMetrics(): Record<PairName, { count: number; average: number }> {
    return Object.fromEntries(
      (Object.values(SYMBOL_PAIR_MAP) as PairName[]).map((pair) => [
        pair,
        {
          count: this.store.get(pair)?.count ?? 0,
          average: this.getAverage(pair),
        },
      ]),
    ) as Record<PairName, { count: number; average: number }>;
  }

  // ─── Test helper ─────────────────────────────────────────────────────────

  getEntries(pair: PairName): PriceEntry[] {
    return [...(this.store.get(pair)?.queue ?? [])];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private getOrInit(pair: PairName): PairState {
    if (!this.store.has(pair)) {
      this.store.set(pair, { queue: [], sum: 0, count: 0 });
    }
    return this.store.get(pair)!;
  }

  private pruneOlderThan(state: PairState, cutoff: number): void {
    while (state.queue.length > 0 && state.queue[0].timestamp < cutoff) {
      const evicted = state.queue.shift()!;
      state.sum -= evicted.price;
      state.count--;
    }

    // Floating-point guard: prevent sum drifting below zero on empty queue.
    if (state.count === 0) state.sum = 0;
  }
}
