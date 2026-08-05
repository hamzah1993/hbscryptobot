# HBS Trading Platform

A full-stack cryptocurrency trading platform focused on safe paper trading, Binance Spot Testnet execution, configurable DCA strategies, Royal Q-style independent sub-positions, operational reliability, and historical backtesting.

> **Safety status:** Live-money order execution is disabled. The platform supports paper trading, public Binance market data, historical backtesting, and controlled Binance Spot Testnet execution only.

## Current project status

**Latest completed numbered roadmap commit:** 173  
**Current milestone:** Core v1 release readiness  
**Estimated overall completion:** approximately 94–96% for paper trading, Binance Spot Testnet, historical data, and backtesting.

Core paper-trading, Binance Spot Testnet, historical candle ingestion, Royal Q-style DCA simulation, backtest analytics, persisted trades/equity curves, CSV exports, and dashboard comparison are implemented. Remaining work is primarily operational hardening, deployment guidance, durable background delivery, and broader integration testing.

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
| Deployment, monitoring, backups, and runbooks | In progress | 35–45% |
| Live-execution safeguards | Future | Not started |
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
- Binance WebSocket market-price streaming
- Trading dashboard, charts, Testnet orders, positions, notifications, and emergency controls
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
| Authentication | JWT, Argon2 |
| Exchange | Binance Spot REST and WebSocket APIs |
| CI | GitHub Actions |

## Trading modes

### Paper trading

Paper strategies simulate initial entries, DCA orders, average-price changes, parent take-profit exits, independent sub-position exits, and realized P&L without sending exchange orders.

### Binance Spot Testnet

Testnet strategies can place controlled Binance Spot Testnet market orders using encrypted user credentials. Supported execution includes initial entries, parent DCA entries, parent and independent take-profit exits, persistent reconciliation, idempotent actions, scheduled execution, and Redis lock protection.

### Live trading

Live Binance public market data and historical candles may be read, but live order placement and cancellation remain explicitly disabled.

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
2. Keep live execution disabled.
3. Use Binance Spot Testnet credentials without withdrawal permission.
4. Apply the Prisma schema and verify PostgreSQL and Redis health.
5. Run backend tests, backend build, frontend build, and Docker validation.
6. Test backtest creation, report loading, comparison, and CSV exports.
7. Test Testnet emergency-stop behavior and unresolved-order reconciliation.
8. Configure backups, log retention, external monitoring, and restart policies.
9. Review lock TTLs for the deployed workload.
10. Do not treat simulated or Testnet results as proof of profitable live performance.

## Known limitations

- Live-money order placement and cancellation are disabled.
- Bybit and OKX are not integrated.
- Backtests use candle close prices rather than intrabar high/low execution.
- Gap-through DCA levels execute at the candle close, not each theoretical trigger price.
- Historical candles are accumulated before simulation, which can increase memory usage for very large ranges.
- Backtest execution is synchronous and can be heavy for long ranges.
- Webhook delivery is not backed by a fully durable external queue.
- Fixed Redis lock TTLs do not currently renew during long-running operations.
- Emergency stop does not liquidate already-open positions.
- Production monitoring, automated backups, restore drills, and administrator runbooks still need completion.
- The platform is not approved for unattended live production trading.

## Security guidance

- Never commit `.env`, API keys, encryption keys, webhook secrets, or private URLs.
- Create Binance API keys without withdrawal permission.
- Use separate Testnet and Live credential records.
- Back up `EXCHANGE_CREDENTIALS_KEY` securely.
- Restrict database and Redis access to trusted networks.
- Keep live execution disabled until dedicated safeguards are implemented and reviewed.

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
- Deployment and production operations package
- Backup and restore documentation
- Administrator runbook and troubleshooting guide
- Durable notification delivery architecture
- Final user manual and release checklist

### Version 2 candidates

- Explicitly gated live-execution safeguards
- Daily loss and exposure controls
- Preflight balance and permission checks
- Bybit adapter and integration
- OKX adapter and integration
- Cross-exchange normalization

## Disclaimer

This software is under active development and is not financial advice. Cryptocurrency trading can result in substantial financial loss. Use paper trading and exchange Testnets for validation. Do not treat backtests, simulations, or Testnet results as guarantees of future performance, and do not treat the current codebase as approved for live or unattended production trading.
