# HBS Trading Platform

A full-stack cryptocurrency trading platform focused on safe paper trading, Binance Spot Testnet execution, configurable DCA strategies, and Royal Q-style independent sub-positions.

> **Safety status:** Live-money order execution is disabled. The platform currently supports paper trading, public Binance market data, and controlled Binance Spot Testnet execution only.

## Current implementation status

The platform has completed the core paper-trading milestone and the main Binance Spot Testnet workflow through notification persistence and operational-alert retention.

### Completed capabilities

- User registration, login, JWT authentication, and protected APIs
- Encrypted Binance credential storage with separate Testnet and Live records
- Paper-trading positions, DCA, take profit, and strategy scheduling
- Binance Spot Testnet market-order execution
- Persistent Testnet orders, positions, fills, and strategy actions
- Royal Q-style independent sub-position entries and exits
- Dynamic DCA recovery logic
- Automatic Testnet strategy runner and scheduler
- Binance WebSocket market-price streaming
- Testnet orders, positions, account status, and strategy-action dashboard panels
- Testnet emergency stop with unresolved-order cancellation attempts
- TradingView charting with live candle updates and Testnet order/position markers
- Operational notifications with dashboard history, unread badge, toast alerts, browser alerts, and sound preferences
- Signed notification webhooks with retry handling, delivery metrics, persistence, restart restoration, and retention cleanup
- Persistent operational-notification history with configurable retention and scheduled cleanup
- GitHub Actions validation for backend, frontend, Prisma, and Docker

## Architecture

```text
React + Vite + Tailwind frontend
              |
              v
      NestJS REST API
       |      |      |
       |      |      +--> Binance Spot REST / WebSocket
       |      +---------> Redis
       +----------------> PostgreSQL via Prisma
```

### Technology stack

| Layer | Technology |
|---|---|
| Backend | NestJS, TypeScript |
| Frontend | React, Vite, Tailwind CSS |
| Database | PostgreSQL, Prisma ORM |
| Cache and infrastructure | Redis, Docker Compose |
| Authentication | JWT, Argon2 |
| Exchange | Binance Spot REST and WebSocket APIs |
| CI | GitHub Actions |

## Trading modes

### Paper trading

Paper strategies simulate entries, DCA orders, average-price changes, take-profit exits, and realized P&L without sending exchange orders.

### Binance Spot Testnet

Testnet strategies can place controlled Binance Spot Testnet market orders using encrypted user credentials. Testnet execution supports:

- Initial entries
- Parent-position DCA entries
- Parent take-profit exits
- Independent entries from the configured DCA level
- Independent take-profit exits
- Persistent order and fill reconciliation
- Idempotent strategy actions
- Automatic scheduler execution

### Live trading

Live Binance public market data may be viewed, but live order placement and live order cancellation are explicitly disabled.

## DCA and independent sub-position model

Each strategy has a fixed quote-currency risk budget rather than using the entire exchange account balance.

Configurable strategy fields include:

- Base order size
- Maximum DCA orders
- DCA step percentage
- DCA multiplier
- Take-profit percentage
- Independent-sub-position starting level
- Exchange environment
- Paper or Testnet mode

Before the independent threshold, DCA entries update the parent position's quantity, cost, average entry, next DCA trigger, and take-profit trigger.

From the configured independent level onward, qualifying entries are represented as separate sub-positions. Each independent sub-position tracks its own quantity, cost, entry price, take-profit price, status, and realized P&L.

## Testnet strategy action lifecycle

Automatic Testnet decisions are persisted as idempotent strategy actions. Supported action types are:

```text
INITIAL_ENTRY
DCA_ENTRY
INDEPENDENT_ENTRY
PARENT_EXIT
INDEPENDENT_EXIT
```

Action statuses are:

```text
PENDING
SUBMITTED
COMPLETED
FAILED
```

The action timeline links strategy decisions to positions, sub-positions, Binance order IDs, fill quantities, average fill prices, trigger prices, timestamps, and errors.

## Emergency stop

The authenticated Testnet emergency stop:

1. Changes all running or paused non-paper Testnet strategies to `STOPPED`.
2. Marks pending Testnet strategy actions as failed with an emergency-stop reason.
3. Finds local Testnet orders in `PENDING` or `PARTIALLY_FILLED` state.
4. Attempts to cancel each corresponding Binance Spot Testnet order.
5. Updates locally confirmed cancellations to `CANCELLED`.
6. Returns a per-order cancellation result and summary counts.

Important limitations:

- It does not liquidate open positions.
- It cannot reverse an order that Binance has already filled.
- Individual exchange cancellation failures are reported without aborting the remaining cancellation attempts.
- Live Binance cancellation remains disabled.

## Notifications and operational alerts

Operational events are published through a shared notification service and surfaced through the authenticated dashboard.

Current notification capabilities include:

- Persistent user-scoped history in PostgreSQL
- In-memory fallback if history reads fail
- INFO, WARNING, and CRITICAL severities
- Dashboard history panel, unread badge, toast alerts, browser notifications, and optional sound
- Configurable notification webhook URL, minimum severity, HMAC signing, timeout, and retries
- Delivery metrics for attempts, successes, failures, retries, timestamps, and latest HTTP status
- Persistent webhook-metrics snapshots restored after backend restart
- Scheduled cleanup for operational notifications and metrics snapshots

Relevant environment variables:

```env
NOTIFICATION_RETENTION_DAYS=30
NOTIFICATION_WEBHOOK_URL=
NOTIFICATION_WEBHOOK_SECRET=
NOTIFICATION_WEBHOOK_MIN_SEVERITY=WARNING
NOTIFICATION_WEBHOOK_MAX_ATTEMPTS=3
NOTIFICATION_WEBHOOK_METRICS_RETENTION_DAYS=30
```

Retention values are bounded to 1–365 days. Webhook delivery and notification persistence failures are logged but do not block trading execution.

## Dashboard

The responsive dashboard currently includes:

- Overview and paper-position analytics
- Strategy controls
- Live public market stream status
- TradingView market chart with live candles and Testnet markers
- Exchange Accounts page
- Binance Testnet Orders table
- Binance Testnet Positions panel
- Strategy Action Timeline
- Operational notification history and webhook delivery metrics
- Testnet emergency-stop confirmation and result feedback

The interface clearly separates paper, Testnet, and live-public-data behavior. Live execution is not presented as enabled.

## Repository structure

```text
hbstrading/
├── backend/
│   ├── prisma/                 Prisma schema
│   └── src/
│       ├── auth/               Authentication and JWT guards
│       ├── credentials/        Encrypted exchange credentials
│       ├── exchange/binance/   Binance REST and Testnet order services
│       ├── market/             REST cache and WebSocket market data
│       ├── notifications/      Operational alerts, webhooks, metrics, retention
│       ├── prisma/             Prisma service
│       └── trading/            Strategies, runners, positions, actions, safety
├── frontend/
│   └── src/
│       ├── auth/               Authentication state
│       ├── components/         Trading dashboard panels
│       ├── lib/                Typed API client
│       └── pages/              Dashboard and authentication pages
├── .github/workflows/          GitHub Actions CI
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick start with Docker

### Requirements

- Git
- Docker Desktop, or Docker Engine with Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/hamzah1993/hbstrading.git
cd hbstrading
```

### 2. Create the environment file

```bash
cp .env.example .env
```

Windows Command Prompt:

```cmd
copy .env.example .env
```

Generate a base64-encoded 32-byte credential-encryption key:

```bash
openssl rand -base64 32
```

Set it in `.env`:

```env
EXCHANGE_CREDENTIALS_KEY=your_generated_base64_key
```

Replace all example secrets and passwords before using a shared or hosted environment.

### 3. Start the stack

```bash
docker compose up --build
```

Default services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- Health endpoint: `http://localhost:3000/api/health`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### 4. Apply the Prisma schema

In another terminal:

```bash
docker compose exec backend npx prisma db push
docker compose exec backend npx prisma generate
docker compose restart backend
```

### 5. Register and configure Testnet

1. Open `http://localhost:5173`.
2. Register and sign in.
3. Open **Exchange accounts**.
4. Save Binance Spot Testnet API credentials.
5. Test the connection.
6. Create a strategy with environment `TESTNET` and paper trading disabled.
7. Start with small Binance Testnet balances and quantities.

Do not use production Binance credentials for Testnet.

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

### Builds

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

## Main API endpoints

All endpoints except registration, login, and health require a JWT bearer token.

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/users/me
```

### Strategy management

```text
GET    /api/strategies
POST   /api/strategies
PATCH  /api/strategies/:strategyId
POST   /api/strategies/:strategyId/status
DELETE /api/strategies/:strategyId
```

### Paper trading

```text
GET  /api/paper-trading/positions
POST /api/paper-trading/positions/open
POST /api/paper-trading/positions/:positionId/dca
POST /api/paper-trading/positions/:positionId/tick
POST /api/paper-trading/positions/:positionId/close
POST /api/strategies/run-paper-tick
```

### Testnet trading and observability

```text
POST /api/strategies/:strategyId/testnet-order
GET  /api/strategies/testnet-orders
POST /api/strategies/testnet-orders/:tradingOrderId/sync
GET  /api/strategies/testnet-positions
GET  /api/strategies/testnet-actions
POST /api/strategies/testnet-emergency-stop
```

### Notifications

```text
GET /api/notifications
GET /api/notifications/webhook-metrics
```

### Exchange credentials and connection checks

```text
GET    /api/exchange/credentials
POST   /api/exchange/credentials/binance
DELETE /api/exchange/credentials/binance/:environment
POST   /api/exchange/binance/account/test
```

### Market data

```text
GET    /api/market-data/quote
GET    /api/market-data/cache
DELETE /api/market-data/cache
POST   /api/market-data/stream/subscribe
DELETE /api/market-data/stream/subscribe
GET    /api/market-data/stream/status
GET    /api/market-data/stream/price
```

## CI workflow

GitHub Actions validates:

- Backend dependency installation
- Prisma client generation
- Prisma schema validation
- Database schema application against a service database
- Backend build and Jest tests
- Frontend build
- Docker Compose configuration
- Docker image builds

A workflow that stalls before repository checkout or during service-container initialization may indicate a GitHub-hosted runner issue rather than a source-code failure.

## Security guidance

- Never commit `.env` files, API keys, encryption keys, webhook secrets, or private webhook URLs.
- Create Binance keys without withdrawal permission.
- Use separate credentials for Testnet and Live.
- Keep live execution disabled until explicit production safeguards are completed and reviewed.
- Use strong, unique database and JWT secrets.
- Back up `EXCHANGE_CREDENTIALS_KEY` securely; encrypted credentials cannot be recovered without it.
- Test emergency-stop behavior using Binance Spot Testnet only.
- Validate webhook signatures and timestamps in downstream receivers.

## Known limitations

- Live-money order execution is disabled.
- Open positions are not automatically liquidated by emergency stop.
- Bybit and OKX are not integrated.
- Backtesting is not implemented.
- Telegram and email alerts are not implemented.
- Notification writes and webhook metric snapshots are fire-and-forget, so an abrupt process crash can lose an in-flight write.
- Webhook retries are process-local; there is no durable delivery queue yet.
- Production rate limiting, distributed locks, monitoring, backups, and operational runbooks still require hardening.
- The platform is not ready for unattended production trading.

## Roadmap

### Completed

- Platform foundation and authentication
- Secure exchange credentials
- Paper strategy engine and scheduler
- Royal Q-style independent sub-positions
- Dynamic DCA recovery
- Binance Spot Testnet execution and reconciliation
- Automatic Testnet strategy runner
- WebSocket market streaming
- Testnet orders, positions, and action timeline UI
- Emergency-stop control and unresolved Testnet-order cancellation
- TradingView chart and Testnet chart markers
- Operational notifications, browser alerts, and dashboard history
- Signed notification webhooks with retries and delivery metrics
- Persistent notification history and webhook metrics with retention cleanup

### Next

1. Reliability, rate limiting, distributed locking, and recovery hardening
2. Durable webhook delivery queue and delivery-attempt history
3. Backtesting and analytics
4. Deployment, monitoring, backups, and administrator documentation
5. User manual and operational runbook
6. Live execution safeguards and explicit production approval workflow
7. Bybit and OKX integrations

## Disclaimer

This software is under active development and is not financial advice. Cryptocurrency trading can result in substantial financial loss. Use paper trading and exchange Testnets for validation. Do not treat the current codebase as approved for live or unattended production trading.
