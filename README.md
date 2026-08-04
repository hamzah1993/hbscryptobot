# HBS Trading Platform

A full-stack crypto trading platform focused on safe paper trading, DCA strategy management, Royal Q-style sub-position planning, Binance market data, and a modern responsive dashboard.

> **Important:** Live-money trading is not enabled yet. The current platform is intended for development and paper-trading tests.

## Current features

### Platform foundation
- NestJS backend with TypeScript
- React, Vite, and Tailwind CSS frontend
- PostgreSQL with Prisma ORM
- Redis service in Docker Compose
- Dockerized frontend and backend
- GitHub Actions CI for backend, frontend, Prisma, and Docker builds

### Authentication and security
- User registration and login
- JWT-protected API routes
- Argon2 password hashing
- AES-256-GCM encrypted Binance API credentials
- Separate Binance testnet and live credential records

### Strategy and risk management
- Create, list, update, start, pause, stop, and delete strategies
- Fixed quote-currency risk budget per strategy
- Base-order allocation
- Configurable DCA count, step percentage, and multiplier
- Configurable take-profit percentage
- Configurable independent sub-position starting level
- Risk-plan preview and validation before strategy creation

### Paper trading
- Open simulated positions
- Simulated filled buy and sell orders
- DCA trigger processing
- Average-entry-price recalculation
- Take-profit processing
- Manual position closing
- Realized and unrealized P&L calculations
- Position and order history
- Paper strategy runner for processing all running strategies

### Binance market data
- Binance Spot ticker-price integration
- Testnet and live public market-price endpoints
- Short-lived quote cache
- Forced quote refresh
- Cache inspection and clearing endpoints

### User interface
- Responsive dark trading dashboard
- Registration and login screens
- Create Bot wizard
- Paper/live interface mode selector
- Real position data from PostgreSQL
- Capital, P&L, strategy, DCA, and position summaries
- Loading, empty, and error states

## Technology stack

| Layer | Technology |
|---|---|
| Backend | NestJS, TypeScript |
| Frontend | React, Vite, Tailwind CSS |
| Database | PostgreSQL, Prisma |
| Cache / infrastructure | Redis, Docker Compose |
| Authentication | JWT, Argon2 |
| Exchange | Binance Spot REST API |
| CI | GitHub Actions |

## Repository structure

```text
hbstrading/
├── backend/              NestJS API, Prisma, strategy and trading services
├── frontend/             React dashboard and Create Bot wizard
├── .github/workflows/    GitHub Actions CI
├── docker-compose.yml    PostgreSQL, Redis, backend and frontend services
├── .env.example          Environment-variable template
└── README.md
```

## Quick start with Docker

### Requirements
- Git
- Docker Desktop or Docker Engine with Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/hamzah1993/hbstrading.git
cd hbstrading
```

To test the latest paper strategy runner branch before it is merged:

```bash
git checkout feature/paper-strategy-runner
```

### 2. Create the environment file

```bash
cp .env.example .env
```

On Windows Command Prompt:

```cmd
copy .env.example .env
```

Generate a base64-encoded 32-byte credential-encryption key:

```bash
openssl rand -base64 32
```

Set the generated value in `.env`:

```env
EXCHANGE_CREDENTIALS_KEY=your_generated_base64_key
```

Also replace the default database password and JWT secret before running outside local development.

### 3. Start the stack

```bash
docker compose up --build
```

Services:
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

### 5. Register and test

Open `http://localhost:5173`, create a user account, sign in, and use the Create Bot wizard to create a paper-trading strategy and initial simulated position.

## Main API endpoints

All endpoints below, except authentication and health, require a JWT bearer token.

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

### Trading engine

```text
POST /api/trading-engine/preview
```

### Paper trading

```text
GET  /api/paper-trading/positions
POST /api/paper-trading/positions/open
POST /api/paper-trading/positions/:positionId/dca
POST /api/paper-trading/positions/:positionId/tick
POST /api/paper-trading/positions/:positionId/close
```

### Paper strategy runner

```text
POST /api/strategies/run-paper-tick
```

This endpoint fetches current Binance prices for all running paper strategies and then opens, holds, DCA-fills, or closes positions as appropriate.

### Market data

```text
GET    /api/market-data/quote
GET    /api/market-data/cache
DELETE /api/market-data/cache
```

Example:

```text
GET /api/market-data/quote?symbol=BTCUSDT&environment=live&refresh=true
```

### Binance integration

```text
GET  /api/exchange/binance/time
GET  /api/exchange/binance/ticker
POST /api/exchange/binance/account/test
POST /api/exchange/binance/order/test
```

## Development commands

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

### Production builds

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

## Current limitations

- No live Binance order placement
- No continuous background scheduler yet; the paper runner is triggered through an API endpoint
- No Binance WebSocket streaming yet
- Royal Q independent sub-position exits are not fully implemented
- No TradingView webhook integration
- No backtesting engine
- No Telegram or email notifications
- Bybit and OKX are not integrated yet
- Not ready for unattended production trading

## Planned roadmap

1. Background scheduler for continuous paper strategy execution
2. Binance WebSocket market-data streaming
3. Complete Royal Q independent sub-position logic
4. Dynamic global DCA recovery mode
5. TradingView webhook integration
6. Backtesting and analytics
7. Telegram and email notifications
8. Real Binance order execution with testnet-first safeguards
9. VPS deployment, monitoring, backups, and rate limiting
10. Bybit and OKX integration

## Security notes

- Never commit `.env` files or real exchange credentials.
- Create Binance API keys without withdrawal permission.
- Use Binance testnet before enabling any live functionality.
- Use a strong unique `JWT_SECRET` and database password.
- Back up the encryption key securely. Losing it makes saved exchange credentials unrecoverable.

## Disclaimer

This software is under active development and is not financial advice. Cryptocurrency trading can result in substantial financial loss. Test all strategies in paper mode and exchange testnets before considering live use.
