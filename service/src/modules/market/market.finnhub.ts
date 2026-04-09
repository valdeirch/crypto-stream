import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import WebSocket from 'ws';
import { ConnectionStatus, SYMBOL_PAIR_MAP } from './market.types';
import { MarketService } from './market.service';

// ─── Reconnect constants ──────────────────────────────────────────────────────

const FINNHUB_WS_URL = 'wss://ws.finnhub.io';
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

@Injectable()
export class FinnhubClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinnhubClient.name);

  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private destroyed = false;

  // Exposed for the health check endpoint
  status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  reconnectCount = 0;

  constructor(private readonly marketService: MarketService) {}

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.closeSocket();
    this.log('destroyed', {});
  }

  // ─── Connection lifecycle ────────────────────────────────────────────────

  private connect(): void {
    if (this.destroyed) return;

    // Prevent duplicate connections: always clean up before creating a new socket.
    if (this.ws) this.closeSocket();

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      this.logger.error(
        JSON.stringify({
          event: 'missing_api_key',
          message: 'FINNHUB_API_KEY is not set — Finnhub connection skipped',
          at: new Date().toISOString(),
        }),
      );
      return;
    }

    this.status = ConnectionStatus.CONNECTING;
    this.log('connecting', { attempt: this.reconnectAttempt });

    this.ws = new WebSocket(`${FINNHUB_WS_URL}?token=${apiKey}`);

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (err) => this.handleError(err));
    this.ws.on('close', () => this.handleClose());
  }

  // Tear down the current socket safely to avoid listener leaks and ghost connections.
  private closeSocket(): void {
    if (!this.ws) return;
    this.ws.removeAllListeners();
    this.ws.terminate();
    this.ws = null;
  }

  // ─── Event handlers ──────────────────────────────────────────────────────

  private handleOpen(): void {
    this.status = ConnectionStatus.CONNECTED;
    this.reconnectAttempt = 0; // Reset backoff on successful connection
    this.log('connected', {});
    this.subscribeAll();
  }

  private handleMessage(data: WebSocket.RawData): void {
    let msg: unknown;

    try {
      msg = JSON.parse(data.toString());
    } catch {
      this.log('parse_error', { raw: data.toString().slice(0, 100) });
      return;
    }

    if (!isTradeMessage(msg)) return;
    if (!msg.data.length) return;

    for (const trade of msg.data) {
      // Defensive guards — invalid trades are dropped silently with a log
      if (!(trade.s in SYMBOL_PAIR_MAP)) {
        this.log('unknown_symbol', { symbol: trade.s });
        continue;
      }
      if (!trade.p || trade.p <= 0) {
        this.log('invalid_price', { symbol: trade.s, price: trade.p });
        continue;
      }
      if (trade.t == null) {
        this.log('missing_timestamp', { symbol: trade.s });
        continue;
      }

      this.marketService.handleTrade(trade.s, trade.p, trade.t);
    }
  }

  private handleError(err: Error): void {
    // Log only — the 'close' event always fires after 'error' on a ws socket,
    // which triggers the reconnect logic. Handling reconnect here would duplicate it.
    this.log('error', { message: err.message });
  }

  private handleClose(): void {
    this.status = ConnectionStatus.DISCONNECTED;
    this.reconnectAttempt++;
    this.log('disconnected', { attempt: this.reconnectAttempt });
    this.scheduleReconnect();
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  private subscribeAll(): void {
    for (const symbol of Object.keys(SYMBOL_PAIR_MAP)) {
      this.ws?.send(JSON.stringify({ type: 'subscribe', symbol }));
      this.log('subscribed', { symbol });
    }
  }

  // ─── Reconnect with exponential backoff ─────────────────────────────────

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    const delay = Math.min(BACKOFF_BASE_MS * 2 ** this.reconnectAttempt, BACKOFF_MAX_MS);
    this.reconnectCount++;
    this.log('reconnect_scheduled', { attempt: this.reconnectAttempt, delayMs: delay });

    setTimeout(() => this.connect(), delay);
  }

  // ─── Structured logging ───────────────────────────────────────────────────

  private log(event: string, extra: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event,
        ...extra,
        at: new Date().toISOString(),
      }),
    );
  }
}

// ─── Type guard for Finnhub trade messages ────────────────────────────────────

interface FinnhubTrade {
  s: string; // symbol
  p: number; // price
  t: number; // timestamp (ms)
}

interface FinnhubTradeMessage {
  type: 'trade';
  data: FinnhubTrade[];
}

function isTradeMessage(msg: unknown): msg is FinnhubTradeMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'trade' &&
    Array.isArray((msg as Record<string, unknown>)['data'])
  );
}
