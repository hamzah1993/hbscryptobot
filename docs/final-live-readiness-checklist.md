# Final Binance LIVE Readiness Checklist

This file is the source of truth for the final production activation stage. It is intentionally fail-closed. Do not mark a gate complete unless the dashboard/API evidence actually passes.

## Current verified state (2026-08-07)

- [x] Binance LIVE credentials configured
- [x] Binance strategy routing verified
- [x] LIVE routing implemented
- [x] Binance Testnet W2W certified
- [x] Operational notification provider configured and test received
- [x] Fixed risk budget enforced
- [x] Per-bot risk ceilings implemented
- [x] Daily loss gate implemented
- [x] Emergency exit workflow implemented
- [x] Emergency re-entry block implemented
- [x] LIVE capital ceiling configured at 10 USDT
- [x] Explicit LIVE confirmation mechanism implemented
- [x] Production latency evidence is deployment-wide and may come from a separate Binance Testnet account
- [ ] Production hardening ready
- [ ] Deployment has at least 10 Binance Testnet execution-latency samples with p95 <= 500 ms
- [ ] No unresolved exchange actions on the LIVE user
- [ ] No permanent action failures on the LIVE user
- [ ] Redis available and schedulers healthy
- [ ] `ENABLE_LIVE_TRADING=true` configured in production
- [ ] Controlled Binance LIVE emergency-exit verification completed successfully
- [ ] `BINANCE_LIVE_EMERGENCY_EXIT_VERIFIED=true` configured only after that verification
- [ ] Explicit LIVE activation acknowledgement recorded
- [ ] `liveMoneyReady=true` confirmed from `GET /api/strategies/production-readiness`
- [ ] Controlled first live order executed within the 10 USDT capital ceiling
- [ ] First live order reconciled and notifications verified

## Gate logic from the application

`ProductionReadinessService` requires all of the following before `productionHardeningReady` becomes true:

1. At least 10 recorded execution-latency samples from Binance TESTNET orders in this deployment. These samples are not tied to the LIVE user's account.
2. p95 execution latency at or below 500 ms.
3. Strategy scheduler, order sync scheduler, and retry scheduler are HEALTHY or IDLE.
4. Redis is AVAILABLE.
5. The LIVE user has no strategy actions remaining PENDING, SUBMITTED, or FAILED.
6. The LIVE user has no strategy actions that are PERMANENTLY_FAILED.

This separation is intentional: a dedicated Testnet account can certify deployment execution behavior while a different account is used for Binance LIVE credentials and capital controls.

The explicit LIVE acknowledgement remains locked until all of these are true:

- production hardening ready
- operational notification provider ready
- risk budget and per-bot ceilings enabled
- daily loss and emergency safety controls enabled
- Binance Testnet W2W certification and Binance routing verified
- `ENABLE_LIVE_TRADING=true`
- Binance LIVE credentials configured
- LIVE capital ceiling configured
- `BINANCE_LIVE_EMERGENCY_EXIT_VERIFIED=true`

## Safe activation sequence

1. Keep all LIVE strategies STOPPED while using the already-tested Binance Testnet account to provide deployment latency evidence.
2. Confirm the dashboard shows at least `10/10` deployment samples and p95 <= 500 ms. The LIVE account itself does not need to generate those Testnet samples.
3. Resolve or acknowledge every unresolved/permanent failed strategy action on the LIVE user before proceeding.
4. Verify Redis and all runner health fields are healthy/idle.
5. Set `ENABLE_LIVE_TRADING=true` in the production backend environment and redeploy/restart.
6. Perform the controlled Binance LIVE emergency-exit verification. The verification must demonstrate that the emergency endpoint pauses LIVE strategies, cancels/reconciles tracked pending orders, submits closure for tracked LIVE exposure, and leaves LIVE strategies STOPPED/re-entry blocked. Do not fabricate this evidence.
7. Only after successful operator review, set `BINANCE_LIVE_EMERGENCY_EXIT_VERIFIED=true` and redeploy/restart.
8. Confirm the production-readiness panel unlocks the explicit LIVE acknowledgement.
9. Record the explicit LIVE acknowledgement in the dashboard.
10. Confirm `liveMoneyReady=true` before creating/running a LIVE strategy.
11. Execute the first controlled order at the smallest Binance-valid notional, never exceeding the configured 10 USDT ceiling.
12. Verify exchange fill, local reconciliation, position state, P&L state, Telegram notification, and emergency controls before increasing any limit.

## Stop conditions

Stop immediately and keep LIVE strategies STOPPED if any of the following occurs:

- p95 deployment latency rises above 500 ms during readiness validation
- Redis becomes unavailable
- scheduler health is not HEALTHY/IDLE
- unresolved or permanent failed strategy actions appear on the LIVE user
- Binance rejects/cannot reconcile an order
- emergency-exit cancellation or close reports a failure
- notification delivery is unavailable
- readiness changes from PASS to BLOCKED

Do not bypass a blocked gate in code or database state. Fix the underlying condition and re-run the readiness check.
