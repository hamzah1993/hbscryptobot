# HBS Trading Platform

A full-stack cryptocurrency trading platform focused on safe paper trading, Binance Spot Testnet execution, configurable DCA strategies, Royal Q-style independent sub-positions, operational reliability, and backtesting foundations.

> **Safety status:** Live-money order execution is disabled. The platform currently supports paper trading, public Binance market data, and controlled Binance Spot Testnet execution only.

## Current project status

**Latest completed numbered feature commit:** 118  
**Current milestone:** Backtesting and analytics foundation  
**Estimated overall completion:** approximately 85–87%

The core paper-trading and Binance Spot Testnet workflows are implemented. API throttling, Redis-backed distributed locking, scheduler recovery, notification persistence, and configurable lock TTLs are also in place. Historical candle storage, ingestion, and the first Binance importer foundation have now been added.

### Milestone progress

| Milestone | Status | Progress |
|---|---:|---:|
| Platform foundation and authentication | Complete | 100% |
| Paper-trading engine | Complete | 100% |
| DCA and fixed risk-budget logic | Complete | 100% |
| Royal Q-style independent sub-positions | Complete | 100% |
| Binance Spot Testnet execution | Complete | 100% |
| Dashboard, charting, and Testnet markers | Complete | 95–100% |
| Notifications and webhook reliability | Complete | 100% |
| API rate limiting | Complete | 100% |
| Distributed locking and scheduler recovery | Complete | 95–100% |
| Backtesting and analytics | In progress | 15–20% |
| Deployment, monitoring, and backups | Upcoming | 20–30% |
| Live-execution safeguards | Future | Not started |
| Bybit and OKX integration | Future | Not started |

## Completed capabilities

- User registration, login, JWT authentication, protected APIs, and route-specific throttling
- Encrypted Binance credentials with separate Testnet and Live records
- Paper positions, DCA, take profit, realized P&L, and automatic strategy scheduling
- Binance Spot Testnet market-order execution and reconciliation
- Persistent Testnet orders, positions, fills, and idempotent strategy actions
- Royal Q-style independent entries and independent take-profit exits
- Fixed quote-currency risk budgets instead of whole-account balance sizing
- Automatic Testnet strategy and order-sync schedulers
- Redis-backed scheduler and per-strategy distributed locks
- Token-protected atomic lock release and lock-expiry recovery
- Configurable Redis lock TTLs with safe fallbacks
- Binance WebSocket market-price streaming
- TradingView charting with live candles and Testnet markers
- Testnet orders, positions, account status, and action-timeline panels
- Testnet emergency stop and unresolved-order cancellation attempts
- Persistent operational notifications and webhook metrics
- Signed webhook delivery with retries, restart restoration, and retention cleanup
- Historical candle Prisma model
- Historical candle batch ingestion and deduplicating upserts
- Binance historical candle importer service foundation
- GitHub Actions validation for backend, frontend, Prisma, tests, and Docker

## Architecture

```text
React + Vite + Tailwind frontend
              |
              v
      NestJS REST API
       |      |      |
       |      |      +--> Binance Spot REST / WebSocket
       |      +---------> Redis distributed locks
       +----------------> PostgreSQL via Prisma
```

| Layer | Technology |
|---|---|
| Backend | NestJS, TypeScript |
| Frontend | React, Vite, Tailwind CSS |
| Database | PostgreSQL, Prisma ORM |
| Cache and coordination | Redis |
| Authentication | JWT, Argon2 |
| Exchange | Binance Spot REST and WebSocket APIs |
| CI | GitHub Actions |

## Trading modes

### Paper trading

Paper strategies simulate initial entries, DCA orders, average-price changes, parent take-profit exits, independent sub-position exits, and realized P&L without sending exchange orders.

### Binance Spot Testnet

Testnet strategies can place controlled Binance Spot Testnet market orders using encrypted user credentials. Supported execution includes:

- Initial entries
- Parent DCA entries
- Parent take-profit exits
- Independent entries from the configured level
- Independent take-profit exits
- Persistent order and fill reconciliation
- Idempotent strategy actions
- Automatic scheduled execution
- Multi-instance execution protection through Redis locks

### Live trading

Live Binance public market data and historical candles may be read, but live order placement and cancellation are explicitly disabled.

## DCA and independent sub-position model

Each strategy uses a fixed quote-currency risk budget.

Configurable strategy fields include:

- Base order size
- Maximum DCA orders
- DCA step percentage
- DCA multiplier
- Take-profit percentage
- Independent-sub-position starting level
- Exchange environment
- Paper or Testnet mode

Before the independent threshold, DCA entries update the parent position. From the configured independent level onward, new entries are tracked as separate sub-positions with their own quantity, cost, entry price, take-profit price, status, and realized P&L.

## Reliability and distributed locking

Redis locks protect:

- Testnet strategy scheduler ticks
- Testnet order synchronization
- Paper-strategy scheduler ticks
- Notification-retention cleanup
- Individual Testnet strategy execution

The lock service uses:

- `SET NX PX` acquisition
- Unique ownership tokens
- Atomic compare-and-delete release
- Expiry-based crash recovery
- Graceful handling of acquisition and release failures

Relevant environment variables:

```env
REDIS_URL=redis://redis:6379
TESTNET_STRATEGY_SCHEDULER_LOCK_TTL_MS=30000
TESTNET_ORDER_SYNC_SCHEDULER_LOCK_TTL_MS=30000
PAPER_STRATEGY_SCHEDULER_LOCK_TTL_MS=30000
NOTIFICATION_RETENTION_SCHEDULER_LOCK_TTL_MS=300000
TESTNET_STRATEGY_EXECUTION_LOCK_TTL_MS=30000
```

## API rate limiting

```env
API_RATE_LIMIT_TTL_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=120
AUTH_RATE_LIMIT_TTL_MS=60000
AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS=5
AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS=10
```

Invalid, zero, or negative values fall back to safe defaults.

## Historical candle and backtesting foundation

The current data foundation includes:

- `HistoricalCandle` Prisma model
- Exchange, symbol, interval, OHLC, volume, open time, and close time
- Unique exchange/symbol/interval/open-time constraint
- Chronological query index
- Batch ingestion through Prisma transactions
- Upserts that update existing candle values instead of creating duplicates
- Binance public-kline importer foundation supporting standard Binance intervals

The importer currently exists as a service foundation. Registration, API access, pagination, date-range importing, backtest execution, metrics, and dashboard reporting remain upcoming work.

## Notifications and operational alerts

Current notification capabilities include:

- Persistent user-scoped history in PostgreSQL
- INFO, WARNING, and CRITICAL severities
- Dashboard history, unread badge, toast, browser alerts, and optional sound
- Configurable webhook URL, minimum severity, HMAC signing, timeout, and retries
- Delivery metrics for attempts, successes, failures, retries, timestamps, and HTTP status
- Persistent metrics snapshots restored after restart
- Scheduled retention cleanup protected by a Redis lock

```env
NOTIFICATION_RETENTION_DAYS=30
NOTIFICATION_WEBHOOK_URL=
NOTIFICATION_WEBHOOK_SECRET=
NOTIFICATION_WEBHOOK_MIN_SEVERITY=WARNING
NOTIFICATION_WEBHOOK_MAX_ATTEMPTS=3
NOTIFICATION_WEBHOOK_METRICS_RETENTION_DAYS=30
```

## Repository structure

```text
hbstrading/
├── backend/
│   ├── prisma/                 Prisma schema
│   └── src/
│       ├── auth/               Authentication and JWT guards
│       ├── exchange/           Binance and credential services
│       ├── market/             REST cache and WebSocket market data
│       ├── notifications/      Alerts, webhooks, metrics, retention
│       ├── prisma/             Prisma service
│       ├── redis/              Distributed lock module and service
│       └── trading/            Strategies, execution, candles, safety
├── frontend/
│   └── src/
│       ├── auth/
│       ├── components/
│       ├── lib/
│       └── pages/
├── .github/workflows/
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick start with Docker

### Requirements

- Git
- Docker Desktop, or Docker Engine with Docker Compose

```bash
git clone https://github.com/hamzah1993/hbstrading.git
cd hbstrading
cp .env.example .env
openssl rand -base64 32
```

Set the generated value as `EXCHANGE_CREDENTIALS_KEY`, replace all example secrets, then start the stack:

```bash
docker compose up --build
```

Default services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- Health endpoint: `http://localhost:3000/api/health`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Apply the Prisma schema:

```bash
docker compose exec backend npx prisma db push
docker compose exec backend npx prisma generate
docker compose restart backend
```

## Local development

### Backend

```bash
cd backend
npm install
npx prisma generate
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Validation

```bash
cd backend
npm run build
npm test

cd ../frontend
npm run build
```

## Main API areas

All endpoints except registration, login, and health require JWT authentication.

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/users/me

GET    /api/strategies
POST   /api/strategies
PATCH  /api/strategies/:strategyId
POST   /api/strategies/:strategyId/status
DELETE /api/strategies/:strategyId

GET  /api/paper-trading/positions
POST /api/strategies/run-paper-tick

GET  /api/strategies/testnet-orders
GET  /api/strategies/testnet-positions
GET  /api/strategies/testnet-actions
POST /api/strategies/testnet-emergency-stop

GET /api/notifications
GET /api/notifications/webhook-metrics

GET  /api/market-data/quote
GET  /api/market-data/stream/status
GET  /api/market-data/stream/price
```

No historical-candle import endpoint is exposed yet.

## Numbered roadmap

### Current documentation commit

**Commit 119 — Refresh project status and numbered roadmap**

- Align README with implemented Redis reliability work
- Document the historical candle foundation
- Correct outdated limitations and milestone status
- Publish the next numbered delivery sequence

### Historical data and backtesting

**Commit 120 — Register Binance historical candle importer**

- Add the importer to `TradingEngineModule`
- Export it for controller and scheduler use

**Commit 121 — Test historical candle ingestion**

- Symbol normalization
- Decimal conversion
- Transactional upserts
- Duplicate-candle updates
- Empty batch behavior

**Commit 122 — Test Binance historical candle importer**

- Request validation
- Kline mapping
- Live public-data environment
- Import counts and error propagation

**Commit 123 — Add authenticated candle import endpoint**

- Manual symbol, interval, and limit import
- Validation and structured result
- No exchange credentials required for public data

**Commit 124 — Add Binance kline pagination parameters**

- Optional start and end time
- Cursor-safe page retrieval
- Maximum batch boundaries

**Commit 125 — Add date-range historical importer**

- Multi-page imports
- Deduplication through existing upserts
- Progress and imported-count reporting

**Commit 126 — Add historical candle query service**

- Chronological range queries
- Symbol and interval filtering
- Bounded result sizes

**Commit 127 — Add backtest run data model**

- Run status and configuration snapshot
- Start/end range
- Initial capital and strategy parameters
- Summary result fields

**Commit 128 — Add backtest execution engine foundation**

- Deterministic candle-by-candle processing
- Isolated state from paper and Testnet execution

**Commit 129 — Simulate initial entries and parent DCA**

**Commit 130 — Simulate independent sub-position entries and exits**

**Commit 131 — Calculate realized and unrealized P&L**

**Commit 132 — Calculate win rate and average trade duration**

**Commit 133 — Calculate maximum drawdown and equity curve**

**Commit 134 — Add backtest result API**

**Commit 135 — Add backtest dashboard and charts**

**Commit 136 — Add CSV export and run comparison**

### Deployment and operations

**Commits 137–145**

- Health checks for PostgreSQL and Redis
- Structured application metrics
- Scheduler and stale-action monitoring
- Database backup and restore procedures
- Deployment documentation
- Administrator runbook
- Durable webhook delivery queue

### Live-execution safeguards

**Commits 146–154**

- Explicit live-trading feature flag
- User approval and confirmation workflow
- Daily loss and exposure limits
- Preflight balance, symbol, and permission checks
- Live emergency controls
- Audit logging and production-readiness checklist

### Additional exchanges

**Commit 155 onward**

- Exchange adapter abstraction
- Bybit integration
- OKX integration
- Cross-exchange normalization and testing

The final roadmap is expected to reach approximately **160–175 numbered commits**, depending on the depth of analytics, production operations, and additional exchange support.

## Known limitations

- Live-money execution remains disabled.
- Historical candle importing currently has service foundations only; no public API, pagination, or scheduled importer exists yet.
- Backtest execution and reporting are not implemented yet.
- Emergency stop does not liquidate open positions.
- Bybit and OKX are not integrated.
- Webhook retries are process-local; there is no durable delivery queue yet.
- Production monitoring, backup automation, and operational runbooks remain incomplete.
- The platform is not ready for unattended production trading.

## Security guidance

- Never commit `.env`, API keys, encryption keys, webhook secrets, or private URLs.
- Create Binance API keys without withdrawal permission.
- Use separate Testnet and Live credentials.
- Keep live execution disabled until safeguards are completed and reviewed.
- Back up `EXCHANGE_CREDENTIALS_KEY` securely.
- Test all emergency and concurrency behavior on Binance Spot Testnet.

## Disclaimer

This software is under active development and is not financial advice. Cryptocurrency trading can result in substantial financial loss. Use paper trading and exchange Testnets for validation. Do not treat the current codebase as approved for live or unattended production trading.
