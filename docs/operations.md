# Production Operations Runbook

This runbook covers deployment and recovery for the current HBS Trading Platform scope: paper trading, historical backtesting, Binance Spot Testnet, and bounded Binance LIVE execution.

> Binance LIVE is enabled for controlled, bounded validation. This runbook is operational guidance, not approval for unattended trading or for increasing configured risk/capital limits.

## 1. Deployment prerequisites

- Linux host or managed container platform
- Docker Engine and Docker Compose
- PostgreSQL storage with durable backups
- Redis with persistence appropriate to the deployment
- TLS termination through a reverse proxy or managed load balancer
- Restricted firewall rules for PostgreSQL and Redis
- External uptime and log monitoring

## 2. Required configuration

Create `.env` from `.env.example`, then replace every placeholder secret.

At minimum, verify:

- `DATABASE_URL`
- `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`
- `REDIS_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL` — existing registered account to promote to the `ADMIN` role on startup if needed.
- `ADMIN_PASSWORD` — backend-only administrator step-up password (minimum 12 characters); never expose it through a `VITE_` variable or frontend configuration.
- `FRONTEND_URL` (public frontend origin used to build password-reset links)
- `EXCHANGE_CREDENTIALS_KEY`
- `VITE_API_URL`
- rate-limit settings
- scheduler and execution lock TTLs
- notification retention and webhook settings

For one-click Telegram account linking, configure these backend variables once:

- `TELEGRAM_BOT_TOKEN` — BotFather token; server-side only.
- `TELEGRAM_BOT_USERNAME` — the bot username, for example `HBS_Trading_Alerts_Bot`.
- `TELEGRAM_WEBHOOK_URL` — the public HTTPS backend URL ending in `/api/notifications/telegram/webhook`.
- `TELEGRAM_WEBHOOK_SECRET` — a random secret using only letters, numbers, `_`, or `-` (up to 256 characters).

On backend startup the app registers `TELEGRAM_WEBHOOK_URL` with Telegram and supplies the secret-token header requirement. The bot token and webhook secret must never be exposed in the frontend. After that one-time server setup, each user connects from **Notifications → Connect Telegram** and presses **START** in Telegram; Chat IDs are captured by the webhook and are never entered manually.

Never commit `.env`, exchange keys, encryption keys, webhook secrets, or database credentials.

## 3. Initial deployment

### Render production deployment

The current production backend is deployed on Render. Use committed Prisma migrations; the one-time baseline required by the original `db push` deployment has already been completed.

Backend build command:

```bash
npm install --include=dev && npx prisma generate && npm run build
```

Backend start command:

```bash
npx prisma migrate deploy && npm run start:prod
```

Do not restore the old one-time `prisma migrate resolve` baseline command after a successful baseline, and do not use `prisma db push --accept-data-loss` in production.

After a Render deployment, verify the service reports a successful Nest application start, check `/api/health`, then smoke-test authentication, Binance connection/balance reads, and Telegram delivery before resuming bounded LIVE validation.

### Docker Compose deployment

```bash
git clone https://github.com/hamzah1993/hbscryptobot.git
cd hbscryptobot
cp .env.example .env
# Edit .env before continuing.
docker compose config
docker compose build
docker compose up -d
```

Apply the database schema:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma generate
docker compose restart backend
```

For a controlled release, validate the application before opening public traffic:

```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose logs --tail=100 postgres
docker compose logs --tail=100 redis
curl --fail http://127.0.0.1:3000/api/health
```

## 4. Release procedure

1. Confirm the target commit passed backend tests, frontend build, Prisma validation, and Docker validation in CI.
2. Back up PostgreSQL before schema or application changes.
3. Pull the approved commit or release tag.
4. Rebuild images.
5. Apply committed Prisma migrations.
6. Restart services.
7. Verify health, authentication, backtest creation, report retrieval, Telegram status, and Binance Testnet/LIVE connection status without increasing LIVE exposure.
8. Watch logs and external monitors during the release window.

```bash
git fetch --all --tags
git checkout <approved-commit-or-tag>
docker compose build
docker compose up -d
docker compose exec backend npx prisma migrate deploy
docker compose restart backend frontend
docker compose ps
```

## 5. Health verification

The backend health endpoint is:

```text
GET /api/health
```

Operational checks should verify:

- backend endpoint returns a successful response
- PostgreSQL accepts connections
- Redis responds to `PING`
- scheduled jobs are not repeatedly failing
- no stale Testnet/LIVE actions or unresolved orders are accumulating
- notification webhook failures remain within expected limits
- disk space is sufficient for PostgreSQL, logs, and backups

Useful commands:

```bash
docker compose exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose exec redis redis-cli ping
docker compose logs --since=30m backend
```

## 6. Database backup

Create a logical PostgreSQL backup:

```bash
mkdir -p backups
set -a
. ./.env
set +a

docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  > "backups/hbstrading-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Store backups outside the application host and encrypt them at rest. Define retention based on business and regulatory needs. Test restoration regularly; an untested backup is not a recovery plan.

## 7. Database restore

Restoration is destructive. Stop application writes and take a fresh backup before proceeding.

```bash
set -a
. ./.env
set +a

docker compose stop backend frontend

docker compose exec -T postgres dropdb \
  -U "$POSTGRES_USER" \
  --if-exists "$POSTGRES_DB"

docker compose exec -T postgres createdb \
  -U "$POSTGRES_USER" \
  "$POSTGRES_DB"

docker compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  < backups/<backup-file>.dump

docker compose up -d backend frontend
```

After restoration, verify Prisma compatibility, authentication, strategy data, Testnet records, historical candles, and backtest reports.

## 8. Rollback

Application rollback:

1. Stop public traffic or place the application in a maintenance window.
2. Check out the last known-good commit or image.
3. Rebuild and restart services.
4. Restore the database only when the failed release introduced incompatible or damaging data changes.
5. Verify health and critical workflows before reopening traffic.

Do not automatically roll back the database merely because an application deployment failed. Database rollback can discard valid new records.

## 9. Incident response

### Backend unavailable

- inspect backend logs
- verify PostgreSQL and Redis health
- verify environment variables and secrets
- restart only the affected service first
- escalate to a full stack restart only when dependencies are healthy

### Redis unavailable

- scheduler locks and coordination may fail
- keep Binance Spot Testnet execution paused until Redis is stable
- inspect Redis persistence, memory, and disk state
- verify lock TTL configuration after recovery

### PostgreSQL unavailable

- stop trading and backtest writes
- verify disk capacity and database logs
- recover the database before restarting normal schedulers
- restore from backup only when database repair is not possible

### Binance Testnet or LIVE inconsistency

- use the appropriate Testnet stop or LIVE emergency-exit control
- stop automatic strategy execution
- inspect unresolved orders and reconciliation logs
- verify exchange credentials and permissions
- reconcile exchange state before re-enabling schedulers

### Suspected credential exposure

- revoke affected Binance keys immediately
- rotate `JWT_SECRET`, webhook secrets, and database credentials as appropriate
- rotate `EXCHANGE_CREDENTIALS_KEY` only with a planned credential re-encryption process
- inspect audit and access logs
- change/reset the affected account password to invalidate all active sessions

## 10. Monitoring baseline

Configure alerts for:

- backend health failures
- repeated container restarts
- PostgreSQL connection or storage failures
- Redis connection failures
- scheduler exceptions
- Testnet/LIVE order reconciliation failures
- unresolved or stale strategy actions
- webhook delivery failure rates
- high CPU, memory, disk, and database growth
- backup failures and excessive backup age

## 11. Maintenance

Regular maintenance should include:

- verify backups and perform restoration drills
- review dependency and container-image updates
- inspect notification and application log retention
- review rate limits and Redis lock TTLs
- verify Binance Testnet/LIVE credentials and confirm withdrawal permission remains disabled
- purge obsolete test records only through controlled procedures
- run the full CI validation suite before every release

## 12. Safety boundary

The current operations package supports paper trading, historical backtesting, Binance Spot Testnet, and bounded Binance LIVE validation. Small-amount LIVE execution and Telegram delivery have been verified. Keep the configured risk budget and LIVE capital ceiling conservative, keep Binance withdrawal permission disabled, and do not treat bounded validation as certification for unattended trading. Complete the LIVE emergency-exit certification, monitoring, backup automation/restore drill, and incident-response verification before unattended operation.
