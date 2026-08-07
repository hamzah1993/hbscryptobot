# HBS Trading Platform

A full-stack cryptocurrency trading platform focused on paper trading, Binance Spot Testnet and bounded Binance LIVE execution, configurable DCA strategies, Royal Q-style independent sub-positions, operational reliability, notifications, and historical backtesting.

> **Safety status:** Binance LIVE execution is enabled for controlled validation with real funds. Fixed risk budgets, per-strategy limits, the configured LIVE capital ceiling, exchange filters, and emergency-exit controls remain enforced. Start with the smallest exchange-valid order size and do not treat LIVE enablement as approval for unattended trading.

## Current project status

**Current milestone:** Binance v1 production validation and operational hardening
**Production status:** Deployed on Render; Prisma production migrations baselined; Binance LIVE credentials, bounded execution, emergency exit, and Telegram delivery verified.

Core paper trading, Binance Spot Testnet, bounded Binance LIVE execution, historical candle ingestion, Royal Q-style DCA simulation, backtest analytics, persisted trades/equity curves, CSV exports, dashboard comparison, Telegram notifications, and internal production health monitoring are implemented. Small-amount Binance LIVE execution and emergency exit have been verified. The remaining v1 work is operational hardening, including external uptime monitoring, automated backups/restore drills, and durable notification delivery before unattended use.

### Milestone progress

| Milestone | Status | Progress |
|---|---:|---:|
| Platform foundation and authentication | Complete | 100% |
| Paper-trading engine | Complete | 100% |
| DCA and fixed risk-budget logic | Complete | 100% |
| Royal Q-style independent sub-positions | Complete | 100% |
| Binance Spot Testnet execution | Complete | 100% |
| Dashboard and charting | Complete | 95–100% |
| Notifications and webhook reliability | Complete | 95% |
| API rate limiting | Complete | 100% |
| Distributed locking and scheduler recovery | Complete | 95–100% |
| Historical data and backtesting | Complete | 95–100% |
| Telegram connection and test delivery | Complete | 100% |
| Binance LIVE connection and bounded execution | Complete | Small-amount execution verified |
| Deployment, monitoring, backups, and runbooks | In progress | Internal monitoring implemented; external uptime/backups pending |
| Bybit and OKX integration | Future | Not started |

## Completed capabilities

- User registration, login, JWT authentication, protected APIs, and route-specific throttling
- Encrypted Binance credentials with separate Testnet and Live records
- Paper positions, DCA, take profit, realized P&L, and automatic strategy scheduling
- Binance Spot Testnet market-order execution and reconciliation
- Persistent Testnet orders, positions, fills, and idempotent strategy actions
- Royal Q-style parent positions and independent entries/exits
- Fixed quote-currency risk budgets instead of whole-account balance sizing
- Redis-backed scheduler and per-strategy distributed locks
- NestJS scheduled jobs via `@nestjs/schedule` for strategy ticks, order reconciliation, action retries, backtest recovery, and notification retention
- Binance WebSocket market-price streaming
- Binance LIVE credential validation, balances, orders, positions, reconciliation, retries, and emergency exit
- One-click Telegram bot connection with webhook verification and test notifications
- Trading dashboard, charts, Testnet/LIVE orders, positions, notifications, and emergency controls
- Historical candle storage, date-range imports, pagination, and chronological queries
- Backtest run lifecycle with atomic start and terminal transitions
- Candle-by-candle DCA simulation with parent and independent take-profit exits
- Configurable fees and adverse slippage
- Persisted trade events and equity/drawdown points
- Analytics including return, drawdown, win rate, profit factor, peak equity, and DCA depth
- Backtest dashboard with equity chart and trade history
- Run comparison for 2–10 backtests
- Trade and equity CSV exports
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
| Scheduler | NestJS `@nestjs/schedule` (`ScheduleModule`, `@Cron`) |
| Authentication | JWT, Argon2 |
| Exchange | Binance Spot REST and WebSocket APIs |
| Notifications | Telegram Bot API, email, webhooks |
| CI | GitHub Actions |

## Scheduler

The backend does **not** use `node-cron` directly. Scheduling is implemented with NestJS `@nestjs/schedule`, registered through `ScheduleModule.forRoot()` and `@Cron(...)` decorators.

Current recurring jobs include:

- Paper, Binance Testnet, and Binance LIVE strategy execution every 10 seconds
- Testnet and LIVE order reconciliation every 10 seconds
- Testnet and LIVE failed-action retry processing every 10 seconds
- Backtest recovery every 5 minutes
- Notification-retention cleanup daily at 03:00

Redis distributed locks prevent multiple application instances from executing the same trading scheduler concurrently.

## Trading modes

### Paper trading

Paper strategies simulate initial entries, DCA orders, average-price changes, parent take-profit exits, independent sub-position exits, and realized P&L without sending exchange orders.

### Binance Spot Testnet

Testnet strategies can place controlled Binance Spot Testnet market orders using encrypted user credentials. Supported execution includes initial entries, parent DCA entries, parent and independent take-profit exits, persistent reconciliation, idempotent actions, scheduled execution, and Redis lock protection.

### Live trading

Binance LIVE supports encrypted credentials, balance reads, controlled order execution, persisted positions/orders/actions, reconciliation, retries, take-profit controls, and emergency exit. The former operational "Live-money readiness" panel is not an execution blocker for small-amount validation; backend risk budgets, strategy limits, the LIVE capital ceiling, credential validation, and Binance symbol/order filters still apply.

The Binance LIVE connection, bounded small-amount execution, and Telegram notification path have been verified in production. LIVE emergency-exit certification remains an operational validation item before unattended use.

## Backtesting

The backtesting workflow supports:

- Authenticated creation and execution of backtest runs
- Historical candle pagination over a requested date range
- Strategy-driven DCA parameters
- Parent averaging before the independent threshold
- Independent positions from `independentFromLevel`
- Parent and independent take-profit exits
- Fees and adverse execution slippage
- Persisted trade events
- Persisted equity and drawdown points
- Summary analytics and chronological reports
- Comparison of 2–10 runs
- Trade and equity CSV exports
- Dashboard run form, history, metrics, equity chart, comparison table, and export controls

Backtest execution uses historical candle close prices. Results are deterministic for the same stored candles and inputs, but they remain simulations and do not guarantee real execution performance.

## Main backtest API

All endpoints require JWT authentication.

```text
POST /api/backtests
POST /api/backtests/:runId/start
GET  /api/backtests
GET  /api/backtests/compare?runIds=id1,id2
GET  /api/backtests/:runId
GET  /api/backtests/:runId/report
GET  /api/backtests/:runId/export/trades.csv
GET  /api/backtests/:runId/export/equity.csv
```

## Quick start with Docker

### Requirements

- Git
- Docker Desktop, or Docker Engine with Docker Compose

```bash
git clone https://github.com/hamzah1993/hbscryptobot.git
cd hbscryptobot
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

Apply committed Prisma migrations:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma generate
docker compose restart backend
```

## Local validation

```bash
cd backend
npm install
npx prisma generate
npm run build
npm test

cd ../frontend
npm install
npm run build
```

## Release-readiness checklist

Before using the platform outside local development:

1. Replace all example secrets and generate a strong `EXCHANGE_CREDENTIALS_KEY`.
2. Use Binance Spot Testnet first; for LIVE validation, use the smallest exchange-valid size and keep withdrawal permission disabled.
3. Configure a conservative LIVE capital ceiling and fixed risk budget before any real-money order.
4. Apply the Prisma schema and verify PostgreSQL and Redis health.
5. Run backend tests, backend build, frontend build, and Docker validation.
6. Test backtest creation, report loading, comparison, and CSV exports.
7. Test Testnet emergency-stop behavior and unresolved-order reconciliation before proving the LIVE emergency-exit path with minimal exposure.
8. Configure backups, log retention, external monitoring, and restart policies.
9. Review lock TTLs for the deployed workload.
10. Do not treat simulated or Testnet results as proof of profitable live performance.

Detailed operator documentation:

- [User manual](docs/user-manual.md)
- [Binance v1 release checklist](docs/release-checklist.md)
- [Production operations runbook](docs/operations.md)
- [PostgreSQL backup and restore runbook](docs/backup-and-restore.md)
- [Admin & Operations Center](docs/admin-operations.md)
- [Binance LIVE validation checklist](docs/final-live-readiness-checklist.md)

## Known limitations

- Binance LIVE bounded execution has been verified with a small amount; unattended production operation is not yet certified.
- Bybit and OKX are not integrated.
- Backtests use candle close prices rather than intrabar high/low execution.
- Gap-through DCA levels execute at the candle close, not each theoretical trigger price.
- Historical candles are accumulated before simulation, which can increase memory usage for very large ranges.
- Backtest execution is synchronous and can be heavy for long ranges.
- Webhook delivery is not backed by a fully durable external queue.
- Fixed Redis lock TTLs do not currently renew during long-running operations.
- Emergency stop does not liquidate already-open positions.
- Production monitoring, automated backups, restore drills, and administrator runbooks still need completion.
- The platform is not yet approved for unattended live production trading.

## Security guidance

- Never commit `.env`, API keys, encryption keys, webhook secrets, or private URLs.
- Create Binance API keys without withdrawal permission.
- Use separate Testnet and Live credential records.
- Back up `EXCHANGE_CREDENTIALS_KEY` securely.
- Restrict database and Redis access to trusted networks.
- Keep LIVE capital/risk limits conservative and retain exchange withdrawal restrictions while LIVE validation is in progress.

## Numbered roadmap status

The accelerated core roadmap reached **Commit 173**:

- 165: Complete Royal Q-style backtest engine
- 166: Add backtest fees and slippage
- 167: Add trade and equity persistence models
- 168: Persist simulator trade and equity events
- 169: Add analytics report endpoint
- 170: Add comparison and CSV export APIs
- 171: Add comparison/export frontend client methods
- 172: Add dashboard comparison and export controls
- 173: Add analytics, comparison, and export tests

### Remaining core-v1 work

- Operational integration and reliability test suite
- Durable notification delivery architecture
- Automated production backups, restore drill, and external monitoring/alerts
- LIVE emergency-exit certification for unattended operation

### Version 2 candidates

- Additional LIVE execution hardening and unattended-operation safeguards
- Expanded exchange-aware preflight validation and portfolio exposure controls
- Bybit adapter and integration
- OKX adapter and integration
- Cross-exchange normalization

## Disclaimer

This software is under active development and is not financial advice. Cryptocurrency trading can result in substantial financial loss. Use paper trading and exchange Testnets for validation. Do not treat backtests, simulations, or Testnet results as guarantees of future performance, and do not treat the current codebase as approved for live or unattended production trading.
