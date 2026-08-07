# HBS Crypto Bot — Project Checklist

This file is the canonical progress tracker for `hamzah1993/hbscryptobot`.

Update the milestone sections when project status changes. Every pull request merged
into `main` is recorded automatically in the **Merged PR history** section by
`.github/workflows/update-project-checklist.yml`.

Last reconciled: 2026-08-07 (Asia/Dubai), through PR #20.

## Completed

- [x] Platform foundation, authentication, and user accounts
- [x] Paper-trading engine
- [x] Fixed/pre-allocated risk-budget enforcement
- [x] Royal Q-style DCA and independent sub-positions
- [x] Binance Spot Testnet execution and W2W certification
- [x] Historical candle ingestion and backtesting/analytics
- [x] Dashboard, positions, trade history, charts, and strategy controls
- [x] Binance LIVE credentials and bounded small-amount execution
- [x] Telegram connection and real notification delivery
- [x] Binance LIVE Emergency Exit — real-money close and Telegram notification verified
- [x] Admin & Operations Center v1
- [x] Separate admin step-up login at `/super/admin/control`
- [x] Manual PostgreSQL backup creation, verification, and download
- [x] Internal Monitoring & Alerts v1 — database, Redis, scheduler/action health and incident history
- [x] Stateful Telegram incident/recovery alert pipeline implemented
- [x] Production/operator documentation for current Binance v1 scope

## In progress — Binance v1 production reliability

- [ ] Verify Monitoring & Alerts v1 after PR #20 deployment
- [ ] Add safe simulated **Test Alert** and recovery control for Telegram monitoring verification
- [ ] Add external uptime monitoring so a complete backend/Render outage is detectable
- [ ] Harden durable notification delivery/retry behavior for unattended operation
- [ ] Run final end-to-end production reliability suite
- [ ] Complete final unattended-operation review/certification

## Deferred until paid Render or VPS

- [ ] Attach persistent backup storage
- [ ] Set `BACKUP_DIRECTORY` to persistent storage
- [ ] Enable automatic PostgreSQL backups
- [ ] Perform and record a verified production restore drill

Current free Render storage is ephemeral. Manual backups must be downloaded off-server;
`AUTO_BACKUPS_ENABLED` remains `false` until persistent storage is available.

## Future exchange/features phase

- [ ] Bybit integration and credential-backed certification
- [ ] OKX integration and credential-backed certification
- [ ] Freefall Guard for Main DCA/Recovery entries

## Mobile Apps — Flutter for iOS & Android

### Technology decision

- [x] Use **Flutter + Dart** as the shared iOS/Android client
- [x] Keep the existing **NestJS + PostgreSQL + Redis** backend as the single trading engine
- [x] Mobile is a client only: exchange API secrets and trading strategy execution stay server-side
- [x] Use REST for command/request flows and WebSocket for realtime mobile updates
- [x] Use iOS Keychain / Android Keystore-backed secure storage for mobile session credentials
- [x] Use device biometrics for step-up confirmation of sensitive LIVE actions
- [x] Use Firebase Cloud Messaging + APNs for push-notification delivery
- [x] Target TestFlight for iOS beta and Google Play Internal Testing for Android beta

### Milestone M1 — Mobile foundation & API contract

- [ ] Define mobile v1 UX/navigation and screen inventory
- [ ] Audit/version the existing API for mobile use; avoid duplicating the trading engine
- [ ] Define REST + WebSocket contracts for dashboard, bots, positions, orders, alerts, and health
- [ ] Create Flutter project structure, environments, configuration, and CI checks
- [ ] Establish reusable design system/theme for iOS and Android

### Milestone M2 — Authentication & mobile security

- [ ] Register/login/logout using existing HBS user accounts
- [ ] Implement access/refresh-token lifecycle and secure device storage
- [ ] Add Face ID / Touch ID / fingerprint step-up for sensitive actions
- [ ] Define session expiry, revoked-session, lost-device, and multi-device behavior
- [ ] Verify Binance/Bybit/OKX credentials are never stored or exposed on the phone

### Milestone M3 — Core dashboard & account experience

- [ ] Dashboard with balances, P&L, bot/system status, and exchange status
- [ ] Realtime prices and trading charts
- [ ] Positions, orders, trade history, and P&L views
- [ ] User/settings screens and exchange connection/account status
- [ ] Monitoring/health view appropriate for mobile operators

### Milestone M4 — Trading controls

- [ ] Create and configure bots/strategies using server-authoritative validation
- [ ] Start, stop, pause/resume, and manage bots
- [ ] Position and take-profit controls
- [ ] Paper/Testnet/LIVE mode clearly differentiated throughout the app
- [ ] Emergency Exit with explicit confirmation and biometric step-up for LIVE
- [ ] Risk-changing LIVE actions require strong confirmation and backend authorization

### Milestone M5 — Realtime & notifications

- [ ] WebSocket lifecycle, reconnect, stale-data detection, and background/foreground behavior
- [ ] Push notifications for trades, incidents, failures, and recoveries
- [ ] Deep-link notifications to the relevant bot/position/incident where safe
- [ ] Notification preferences and device-token lifecycle

### Milestone M6 — Mobile certification

- [ ] Automated Flutter unit/widget/integration test baseline
- [ ] Test full workflows against Paper mode
- [ ] Complete Binance Testnet mobile W2W certification
- [ ] Complete bounded small-amount Binance LIVE mobile certification
- [ ] Verify Emergency Exit end-to-end from both iOS and Android
- [ ] Security, lifecycle, offline/reconnect, and failure-recovery testing
- [ ] Performance verification for realtime dashboard/charts on representative devices

### Milestone M7 — Beta & store release

- [ ] iOS TestFlight beta
- [ ] Android Google Play Internal Testing/beta
- [ ] Resolve beta findings and complete release checklist
- [ ] App Store production submission/readiness
- [ ] Google Play production submission/readiness
- [ ] Establish mobile crash/error monitoring and post-release support process

## Safety boundaries that remain in force

- [x] Fixed campaign risk budget is authoritative
- [x] Conservative LIVE capital ceiling/risk limits remain enforced
- [x] Binance withdrawal permission remains disabled for trading keys
- [x] Emergency/risk-reducing exits remain available
- [ ] Do not certify unattended LIVE operation until the open production-reliability items above are complete

## Current next sequence

1. Verify deployed Monitoring & Alerts v1.
2. Add/verify a safe Telegram monitoring test-alert path.
3. Add external backend uptime monitoring.
4. Finish notification durability and the end-to-end reliability suite.
5. On paid Render/VPS, configure persistent backups and complete the restore drill.
6. Certify Binance v1 for the intended production operating model.
7. Start Mobile M1 using Flutter on the certified production API, then progress through M2–M7 in order.
8. Start Bybit, then OKX; keep Freefall Guard deferred until the core reliability work is complete.

## Merged PR history

The entries below are append-only. The automation de-duplicates by PR number.

<!-- AUTO-MERGED-PRS:START -->
- 2026-08-07 | PR #18 | Admin & Operations Center v1 | merged
- 2026-08-07 | PR #19 | Admin step-up authentication (`/super/admin/control`) | merged
- 2026-08-07 | PR #20 | Monitoring & Alerts v1 | merged
<!-- AUTO-MERGED-PRS:END -->

## Tracking rules

- GitHub `main` is authoritative for merged code.
- This checklist is authoritative for project progress and the agreed next sequence.
- A merged PR is logged automatically, but a merge alone does **not** automatically mark a milestone complete. Completion requires the relevant validation/deployment evidence.
- Update the milestone checkboxes whenever validation changes project status.
- Do not modify the auto-history markers; the GitHub workflow uses them to locate the append-only history.
