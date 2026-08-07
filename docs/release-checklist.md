# Binance v1 Release Checklist

Use this checklist for production releases. A successful bounded LIVE test does not automatically certify unattended trading.

## Code and database

- [ ] Target commit/PR reviewed and approved
- [ ] Backend tests pass
- [ ] Backend production build passes
- [ ] Frontend production build passes
- [ ] Prisma schema/migrations validated
- [ ] Database backup completed before schema changes
- [ ] `npx prisma migrate deploy` completes successfully
- [ ] No `prisma db push --accept-data-loss` used in production

## Environment and security

- [ ] `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `EXCHANGE_CREDENTIALS_KEY` present
- [ ] Binance LIVE key has no withdrawal permission
- [ ] Telegram bot token, username, webhook URL, and webhook secret present
- [ ] Frontend/backend production URLs are correct
- [ ] Secrets are not committed or exposed in logs

## Post-deployment smoke test

- [ ] Backend health endpoint succeeds
- [ ] Login/authentication succeeds
- [ ] PostgreSQL and Redis are healthy
- [ ] Dashboard loads
- [ ] Binance account connection/balance loads
- [ ] Telegram connection status loads and test notification is received
- [ ] Paper workflow succeeds
- [ ] Backtest workflow/report succeeds
- [ ] Testnet order/reconciliation path succeeds when exchange validation is required
- [ ] No unresolved or permanent failed strategy actions

## Bounded LIVE validation

- [ ] Fixed quote risk budget reviewed
- [ ] LIVE capital ceiling reviewed
- [ ] Symbol/order size satisfies Binance filters
- [ ] Smallest intended LIVE exposure confirmed before execution
- [ ] LIVE order accepted by Binance
- [ ] Local order/position reconciliation matches Binance
- [ ] Notification delivery verified
- [ ] Strategy remains within configured limits after execution

## Unattended-operation certification

Do not mark the release certified for unattended LIVE operation until all are complete:

- [ ] Controlled LIVE emergency-exit test passes
- [ ] Emergency-exit result reconciles correctly with Binance
- [ ] Automated database backups are enabled
- [ ] A restore drill from a verified backup passes
- [ ] External health/error monitoring and alerts are enabled
- [ ] Scheduler/Redis failure alerting is enabled
- [ ] Notification durability/failure handling is accepted for production use
- [ ] Final end-to-end reliability suite passes
- [ ] Operator reviews and accepts the production limits

## Rollback trigger

Stop LIVE strategies and investigate before resuming if an order cannot be reconciled, Redis/scheduler health is degraded, exchange credentials fail unexpectedly, notifications fail during validation, capital/risk limits behave unexpectedly, or local and Binance position state disagree.

See [operations.md](operations.md), [backup-and-restore.md](backup-and-restore.md), and [final-live-readiness-checklist.md](final-live-readiness-checklist.md) for detailed operational procedures.
