# Binance LIVE Validation and Release Checklist

This file records the current Binance LIVE validation state. PR #16 removed the former `Live-money readiness` panel and `liveMoneyReady` execution blocker to allow bounded small-amount testing. The risk budget, per-strategy limits, LIVE capital ceiling, credential checks, Binance exchange filters, and emergency controls remain in force.

## Current verified state (2026-08-07)

- [x] Binance LIVE credentials configured
- [x] Binance strategy routing verified
- [x] LIVE routing implemented
- [x] Binance Testnet W2W certified
- [x] Operational notification provider configured and test received
- [x] Telegram one-click connection verified in production
- [x] Fixed risk budget enforced
- [x] Per-bot risk ceilings implemented
- [x] Daily loss gate implemented
- [x] Emergency exit workflow implemented
- [x] Emergency re-entry block implemented
- [x] LIVE capital ceiling configured at 10 USDT
- [x] Explicit LIVE confirmation mechanism implemented
- [x] Binance LIVE connection verified in production
- [x] Controlled small-amount LIVE order executed
- [x] LIVE order flow verified after removal of the former readiness blocker
- [ ] Production hardening ready
- [ ] At least 10 execution-latency samples collected with p95 <= 500 ms
- [ ] No unresolved exchange actions
- [ ] No permanent action failures
- [ ] Redis available and schedulers healthy
- [x] `ENABLE_LIVE_TRADING=true` configured in production
- [ ] Controlled Binance LIVE emergency-exit verification completed successfully
- [ ] `BINANCE_LIVE_EMERGENCY_EXIT_VERIFIED=true` configured only after that verification
- [x] Small-amount LIVE execution confirmed by the operator

## Operational readiness telemetry

`ProductionReadinessService` still reports operational hardening telemetry. It no longer blocks bounded LIVE entries after PR #16. A healthy production deployment should still maintain:

1. At least 10 recorded execution-latency samples.
2. p95 execution latency at or below 500 ms.
3. Strategy scheduler, order sync scheduler, and retry scheduler are HEALTHY or IDLE.
4. Redis is AVAILABLE.
5. No strategy actions remain PENDING, SUBMITTED, or FAILED.
6. No strategy actions are PERMANENTLY_FAILED.

## Remaining certification sequence

1. Keep LIVE exposure bounded while collecting the required latency evidence on controlled execution flows.
2. Confirm the dashboard shows at least `10/10` latency samples and p95 <= 500 ms.
3. Resolve or acknowledge every unresolved/permanent failed strategy action before proceeding.
4. Verify Redis and all runner health fields are healthy/idle.
5. Keep `ENABLE_LIVE_TRADING=true` only while bounded LIVE validation is intended.
6. Perform the controlled Binance LIVE emergency-exit verification. The verification must demonstrate that the emergency endpoint pauses LIVE strategies, cancels/reconciles tracked pending orders, submits closure for tracked LIVE exposure, and leaves LIVE strategies STOPPED/re-entry blocked. Do not fabricate this evidence.
7. Only after successful operator review, set `BINANCE_LIVE_EMERGENCY_EXIT_VERIFIED=true` and redeploy/restart.
8. Verify exchange fill, local reconciliation, position state, P&L state, Telegram notification, and emergency controls before increasing any limit.
9. Complete automated backups, a restore drill, external monitoring, and the incident-response checks before unattended operation.

## Stop conditions

Stop immediately and keep LIVE strategies STOPPED if any of the following occurs:

- p95 latency rises above 500 ms during readiness validation
- Redis becomes unavailable
- scheduler health is not HEALTHY/IDLE
- unresolved or permanent failed strategy actions appear
- Binance rejects/cannot reconcile an order
- emergency-exit cancellation or close reports a failure
- notification delivery is unavailable
- operational-readiness telemetry reports a new blocker or regression

Do not bypass risk limits or exchange safeguards in code or database state. Fix the underlying condition and re-run validation.
