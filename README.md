# 🚀 Crypto Stream

A production-grade real-time cryptocurrency streaming platform.

Built with NestJS + React, this system ingests high-frequency trade data from Finnhub's WebSocket API and delivers a low-latency, UI-optimized stream via Socket.IO — featuring rolling averages, interactive charts, and resilient reconnection handling.

---

## ⚙️ Architecture

```
Finnhub (WebSocket)
        ↓
NestJS Backend
  ├─ FinnhubClient   (ingestion + exponential backoff)
  ├─ MarketService   (validation + O(1) rolling average)
  ├─ EventEmitter2   (event decoupling)
  └─ MarketGateway   (throttled broadcast — 500ms)
        ↓
Socket.IO
        ↓
React Dashboard (useCryptoStream hook)
```

---

## 🧠 Design Highlights

- **Event-driven architecture** — clear separation between ingestion, processing, and delivery layers
- **O(1) rolling average (sliding window)** — constant-time updates with no recomputation on reads
- **Gateway-level throttling** — reduces high-frequency tick data to UI-friendly updates (~2/sec per pair)
- **Snapshot on connect** — eliminates empty states and improves perceived performance

---

## ⚡ Real-Time Strategy

Finnhub streams tick-level data at very high frequency (hundreds of events/sec).

To balance accuracy and performance:

- All trades are processed internally at full frequency
- The frontend receives a throttled stream (~500ms flush interval)

This ensures data integrity, smooth rendering, and controlled network usage.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + NestJS |
| Transport | Socket.IO (WebSocket) |
| Data source | Finnhub WebSocket API |
| Frontend | React + TypeScript |
| Build tool | Vite |
| Charts | Recharts |
| Styling | Tailwind CSS |

---

## ✨ Features

- **Real-time prices** — ETH/USDC, ETH/USDT, ETH/BTC
- **Rolling hourly average** — computed in O(1), server-side
- **Interactive charts** — 50-point history with trend comparison
- **Price movement indicators** — visual feedback per tick
- **Instant state sync** — snapshot delivered on connect
- **Auto-reconnect** — resilient backend + frontend recovery
- **Health endpoint** — system metrics and connection status

---

## 🚀 Quick Start

You'll need a free [Finnhub API key](https://finnhub.io).

### Option A — Two Terminals

**Backend**

```bash
cd service
npm install
echo "FINNHUB_API_KEY=your_key_here" > .env
npm run start
```

**Frontend**

```bash
cd web
npm install
npm run dev
```

Open: **http://localhost:3001**

> Backend runs on port 3000. Vite auto-selects 3001.

### Option B — Single Command

```bash
npm install
npm run install:all
npm run dev
```

---

## 🔌 Endpoints

| Service | URL |
|---|---|
| Backend | http://localhost:3000 |
| Frontend | http://localhost:3001 |
| Health | http://localhost:3000/health |

---

## 📊 Health Check

`GET /health`

Returns:

- Finnhub connection status
- Total trades processed
- Per-pair metrics (price, average, trade count)
- Memory usage

---

## ⚙️ Environment Variables

### service/.env

```bash
FINNHUB_API_KEY=your_key_here
CORS_ORIGIN=http://localhost:3001
PORT=3000
```

---

## 📚 Documentation

- Backend: [service/README.md](service/README.md)
- Frontend: [web/README.md](web/README.md)
