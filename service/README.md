# crypto-stream-service

NestJS backend for a real-time cryptocurrency dashboard. Connects to Finnhub's WebSocket API, processes live trade events for ETH/USDC, ETH/USDT and ETH/BTC, computes rolling hourly averages, and streams updates to frontend clients via socket.io.

---

## Getting Started

### 1. Obtain a Finnhub API key

1. Create a free account at [finnhub.io](https://finnhub.io)
2. Copy your API key from the dashboard

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

```bash
# Required
export FINNHUB_API_KEY=your_key_here

# Optional (defaults shown)
export CORS_ORIGIN=http://localhost:3001
export PORT=3000
```

Or create a `.env` file at the project root (load it via `dotenv` or your shell before starting).

### 4. Run

```bash
# Development (hot reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The backend starts on `http://localhost:3000`.

### 5. Run tests

```bash
npm run test
```

---

## Architecture

```
Finnhub WSS
  │  { type: "trade", data: [{ s, p, t }] }
  ▼
FinnhubClient           — resilient WS client (exponential backoff, no duplicate connections)
  │  handleTrade(symbol, price, timestamp)
  ▼
MarketService           — validates input, updates store, emits domain event
  │  store.addPrice()   → O(1) rolling average update
  │  void emitAsync('market.trade.processed', TradeProcessedEvent)
  ▼
EventEmitter2 bus       — decouples processing from transport
  ▼
MarketGateway           — buffers latest event per pair, flushes every 500 ms
  │  Map<PairName, TradeProcessedEvent>  ← overwritten on each incoming event
  │  setInterval → server.emit('price-update', PriceUpdate) per pair → buffer.clear()
  ▼
Frontend (socket.io)
```

### Module structure

```
src/
├── modules/
│   └── market/
│       ├── market.types.ts      — strict TypeScript types, symbol→pair map
│       ├── market.events.ts     — domain event class (TradeProcessedEvent)
│       ├── market.store.ts      — in-memory rolling window per pair
│       ├── market.finnhub.ts    — Finnhub WebSocket client
│       ├── market.service.ts    — core orchestration
│       ├── market.gateway.ts    — socket.io gateway
│       ├── market.module.ts     — NestJS module wiring
│       └── market.store.spec.ts — unit tests
├── app.module.ts
├── app.controller.ts            — GET /health
└── main.ts
```

---

## WebSocket API (frontend integration)

Connect using the [socket.io client](https://socket.io/docs/v4/client-api/):

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// Fired once on connect with the current known state (no waiting for next trade)
socket.on('snapshot', (data: Record<string, PriceUpdate>) => {
  console.log(data);
});

// Fired at most every 500 ms — latest price per pair within that window
socket.on('price-update', (update: PriceUpdate) => {
  console.log(update);
});
```

### PriceUpdate payload

```ts
type PriceUpdate = {
  pair: 'ETH/USDC' | 'ETH/USDT' | 'ETH/BTC'
  price: number       // latest trade price
  timestamp: number   // trade timestamp in ms (from Finnhub)
  hourlyAverage: number  // rolling 60-minute average
}
```

---

## Health Check

```
GET http://localhost:3000/health
```

```json
{
  "status": "ok",
  "finnhub": "CONNECTED",
  "reconnectCount": 0,
  "tradesProcessed": 1482,
  "storeMetrics": {
    "ETH/USDC": { "count": 240, "average": 3241.57 },
    "ETH/USDT": { "count": 238, "average": 3242.10 },
    "ETH/BTC":  { "count": 195, "average": 0.0534 }
  },
  "uptime": 3600,
  "memory": {
    "rss": "72.4 MB",
    "heapUsed": "38.1 MB",
    "heapTotal": "56.0 MB"
  },
  "at": "2025-08-22T14:32:00.000Z"
}
```

---

## Key Architectural Decisions

| Decision | Reasoning |
|---|---|
| **EventEmitter2 between service and gateway** | MarketService has zero knowledge of socket.io. MarketGateway has zero knowledge of Finnhub. Each layer is independently testable and replaceable. |
| **`void emitAsync(...)` (no await)** | Broadcasting to WebSocket clients must not slow down or block the Finnhub trade ingestion pipeline. Fire-and-forget is correct here. |
| **Gateway-level throttle buffer** | Finnhub can deliver hundreds of trades per second. Forwarding each one directly would saturate socket.io and overwhelm frontend render cycles. The gateway buffers the latest event per pair and flushes every 500 ms — so clients receive at most 2 updates/second per pair regardless of upstream volume. The ingest pipeline is unaffected. |
| **Overwrite-not-queue buffer strategy** | Only the most recent `TradeProcessedEvent` per pair is kept. A burst of 200 ETH/USDC trades between flushes produces exactly one `price-update` emit — the freshest price wins, which is all the frontend needs. |
| **O(1) rolling average** | Each pair maintains a FIFO queue + running sum. Insert and prune are O(1) amortized — no full array scan per trade. |
| **Trade timestamp as prune reference (insert)** | When a new trade arrives at timestamp T, entries older than `T - 3,600,000ms` are pruned. This handles delayed or replayed data correctly without depending on wall-clock time. |
| **`Date.now()` as prune reference (read)** | On `getAverage()` calls, we prune against the wall clock. This guarantees entries expire even when the Finnhub stream goes idle — using `queue.at(-1).timestamp` would silently preserve stale data in dormant markets. |
| **Snapshot on connect** | When a frontend client connects, it immediately receives the last known price for each pair. Without this, the UI would be empty until the next trade event fires. |
| **`closeSocket()` before reconnect** | Removes all listeners and terminates the socket before opening a new one. Prevents ghost connections and listener accumulation across reconnect cycles. |
| **`timestamp == null` guard** | `!timestamp` would incorrectly reject `timestamp = 0` (Unix epoch). The `== null` check catches only `null` and `undefined`. |
| **`Array.shift()` trade-off** | Acknowledged O(n) operation. For this domain (crypto pairs, ~1 trade/second each) the practical impact is negligible. A circular buffer with an index pointer would give O(1) but adds complexity that is not warranted here. |

### Why not use the official Finnhub client?

The official Finnhub JavaScript client primarily focuses on REST endpoints and abstracts away WebSocket lifecycle control.

For this project, a custom WebSocket client was implemented to ensure:

- Full control over reconnection strategy (exponential backoff)
- Prevention of duplicate connections and listener leaks
- Fine-grained error handling and resilience
- Integration into a controlled event-driven pipeline

This approach better reflects real-world streaming system design.

---

## Trade-offs & Known Limitations

- **In-memory only** — all state is lost on restart. Reconnecting clients receive a snapshot only if the server has already processed trades since startup.
- **Single Finnhub connection** — subscriptions are on the free tier (60 req/min). The three subscribe messages sent on each reconnect are well within limits.
- **ETH/BTC liquidity** — `BINANCE:ETHBTC` may have lower trade frequency on the free tier. The app handles this gracefully (no crashes, averages reflect available data).

---

## Running Both Services Locally

```bash
# Terminal 1 — backend
cd service
echo "FINNHUB_API_KEY=your_key_here" > .env
npm install
npm run start:dev

# Terminal 2 — frontend
cd web
npm install
npm run dev
```

The frontend connects to the backend at `http://localhost:3000`.  
Vite auto-increments to port 3001 when the backend already occupies 3000, which matches the default `CORS_ORIGIN`.
