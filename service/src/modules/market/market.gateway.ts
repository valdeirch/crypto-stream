import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { MarketStore } from './market.store';
import { TRADE_PROCESSED_EVENT, TradeProcessedEvent } from './market.events';
import { PairName } from './market.types';

// CORS origin is configurable via environment variable so we never hardcode
// localhost in a build that might be deployed elsewhere.
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3001';

// How often (ms) the buffer is flushed and broadcast to all connected clients.
// Trades arriving faster than this rate are coalesced: only the latest value
// per pair survives to the next flush, which is exactly what the frontend needs.
const FLUSH_INTERVAL_MS = 500;

@WebSocketGateway({ cors: { origin: corsOrigin, methods: ['GET', 'POST'] } })
export class MarketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(MarketGateway.name);

  // Latest event per pair — older events for the same pair are overwritten,
  // so a burst of 200 ETH/USDC trades in one interval produces a single emit.
  private readonly buffer = new Map<PairName, TradeProcessedEvent>();

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  // MarketStore is injected here solely to send a snapshot to newly connected
  // clients so they see current prices immediately, not just after the next trade.
  constructor(private readonly store: MarketStore) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    this.logger.log(
      JSON.stringify({ event: 'flush_timer_started', intervalMs: FLUSH_INTERVAL_MS }),
    );
  }

  onModuleDestroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ─── Client lifecycle ─────────────────────────────────────────────────────

  handleConnection(client: Socket): void {
    this.logger.log(
      JSON.stringify({ event: 'client_connected', id: client.id, at: new Date().toISOString() }),
    );

    // Send current known prices immediately so the client doesn't wait for
    // the next Finnhub trade event to populate the UI.
    const snapshot = this.store.getLastKnown();
    if (snapshot.size > 0) {
      // Spread entries to avoid edge cases with Map serialisation in older runtimes.
      client.emit('snapshot', Object.fromEntries([...snapshot.entries()]));
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(
      JSON.stringify({
        event: 'client_disconnected',
        id: client.id,
        at: new Date().toISOString(),
      }),
    );
  }

  // ─── Trade buffering ──────────────────────────────────────────────────────

  // Subscribes to domain events emitted by MarketService via EventEmitter2.
  // Instead of broadcasting immediately, we overwrite the buffer for this pair.
  // Only the most recent trade in each flush window reaches clients.
  @OnEvent(TRADE_PROCESSED_EVENT)
  handleTradeProcessed(event: TradeProcessedEvent): void {
    this.buffer.set(event.pair, event);
  }

  // ─── Periodic flush ───────────────────────────────────────────────────────

  private flush(): void {
    if (this.buffer.size === 0) return;

    for (const event of this.buffer.values()) {
      this.server.emit('price-update', {
        pair: event.pair,
        price: event.price,
        timestamp: event.timestamp,
        hourlyAverage: event.hourlyAverage,
      });
    }

    this.buffer.clear();
  }
}
