# crypto-stream-web

React + TypeScript frontend for the Crypto Stream dashboard. Connects to the NestJS backend via Socket.IO and displays live ETH/USDC, ETH/USDT and ETH/BTC prices with interactive charts and rolling hourly averages.

---

## Tech Stack

| | |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Real-time | Socket.IO client 4 |
| Icons | Lucide React |
| Date formatting | date-fns |

---

## Prerequisites

- Node.js 18+
- The NestJS backend running at `http://localhost:3000` (see [../service/README.md](../service/README.md))

---

## How to Run

```bash
npm install
npm run dev
```

Vite starts on port 3001. Open **http://localhost:3001** in your browser.

Other scripts:

```bash
npm run build    # production build → dist/
npm run preview  # preview production build locally
npm run lint     # TypeScript type check
```

---

## Connecting to the Backend

The socket URL is passed directly from `App.tsx`:

```ts
const { status, prices, history } = useCryptoStream('http://localhost:3000');
```

All socket logic lives in `src/hooks/useCryptoStream.ts`. Socket.IO handles reconnection automatically with a maximum delay of 5 seconds between attempts.

---

## Socket Events

### `snapshot` — received once on connect

```ts
socket.on('snapshot', (data: Record<string, PriceUpdate>) => { ... })
```

Payload: a map of all known pairs to their latest `PriceUpdate`. Populates the UI immediately without waiting for the first trade.

### `price-update` — received at most every 500 ms per pair

```ts
socket.on('price-update', (update: PriceUpdate) => { ... })
```

```ts
type PriceUpdate = {
  pair: 'ETH/USDC' | 'ETH/USDT' | 'ETH/BTC'
  price: number         // latest trade price
  timestamp: number     // trade timestamp in ms (from Finnhub)
  hourlyAverage: number // rolling 60-minute average (computed server-side)
}
```

The 500 ms throttle is enforced server-side — the frontend receives at most 2 updates per second per pair regardless of upstream trade frequency.

---

## State Management

No external state library. All market state is owned by the `useCryptoStream` hook and passed down via props.

```
useCryptoStream (hook)
  status: 'connected' | 'disconnected' | 'reconnecting'
  prices: Record<string, PriceUpdate>     ← latest price per pair
  history: Record<string, PriceUpdate[]>  ← up to 50 points per pair
    │
    ▼
App.tsx
  │  passes pair + data + history as props
  ▼
PriceCard.tsx  (one per pair, memoized)
```

Connection status drives the header badge (Live / Reconnecting... / Disconnected) and an inline warning banner when no data has arrived yet.

---

## Performance Considerations

| Technique | Where | Effect |
|---|---|---|
| `React.memo()` | `PriceCard` | Skips re-render when other pairs update |
| Timestamp deduplication | `useCryptoStream` | Prevents duplicate history entries |
| History cap (50 points) | `useCryptoStream` | Bounds memory and chart render cost |
| `isAnimationActive={false}` | Recharts `Line` | Eliminates animation overhead on each data point |
| Server-side 500 ms throttle | `MarketGateway` | Limits update frequency before it reaches the hook |
| Price flash via CSS animation | `PriceCard` | Offloads visual feedback to GPU; no JS polling |

---

## Project Structure

```
src/
├── App.tsx                   — root component, header, grid layout
├── components/
│   └── PriceCard.tsx         — individual pair card with chart and price flash
├── hooks/
│   └── useCryptoStream.ts    — Socket.IO connection + all market state
├── types.ts                  — shared TypeScript types
├── index.css                 — Tailwind imports + keyframe animations
└── main.tsx                  — React entry point
```
