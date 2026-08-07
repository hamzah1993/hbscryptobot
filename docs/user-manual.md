# HBS Trading Platform User Manual

This guide covers the supported Binance v1 workflow: Paper, Backtest, Binance Spot Testnet, bounded Binance LIVE execution, DCA/sub-position strategies, and Telegram notifications.

## 1. Create an account

Register in the web application and sign in. Keep your account password private. Exchange API credentials are stored separately from your login credentials.

## 2. Connect Binance

Open **Exchange Accounts** and add the Binance credentials for the environment you intend to use.

- Start with Binance Spot Testnet.
- For LIVE, create a Binance API key with Spot trading permission only.
- Keep withdrawal permission disabled.
- Never share an API secret in chat, screenshots, logs, or support messages.

After saving, confirm that the account connection succeeds and the expected balance is displayed.

## 3. Connect Telegram

Open **Notifications** and choose **Connect Telegram**. Open the bot link, press **START**, return to the application, and send a test notification. The page should report the account as connected and the test should arrive in Telegram.

Telegram server configuration is an administrator task. Users do not enter Chat IDs manually.

## 4. Choose a trading mode

### Paper

Use Paper first to validate strategy behavior without exchange orders.

### Backtest

Use stored historical candles to compare DCA configuration, fees/slippage assumptions, return, drawdown, win rate, profit factor, and DCA depth. Backtests are simulations and do not guarantee future results.

### Binance Testnet

Use Testnet to validate the full exchange order lifecycle without real funds: entry, DCA, take profit, reconciliation, retries, and stop controls.

### Binance LIVE

LIVE sends real orders to Binance. The platform supports bounded small-amount validation, but it is not yet certified for unattended trading. Keep the configured risk budget and LIVE capital ceiling conservative.

## 5. Configure a bot

Configure the symbol, quote risk budget, initial entry, DCA levels/spacing, multipliers, take-profit rules, and independent-position threshold as required by the strategy.

For Royal Q-style behavior, early DCA entries contribute to the parent average position. From the configured independent threshold onward, sub-positions can use their own entry/take-profit lifecycle.

Review the order preview before any Testnet or LIVE action.

## 6. Minimum Binance order size

Binance enforces symbol-specific quantity and notional filters. For a pair such as `LUNCUSDT`, USDT is the quote asset. If Binance requires a minimum 5 USDT notional, the order must meet that minimum at the current market price. Leave a small margin above the minimum to account for price movement and rounding.

Exchange filters remain authoritative even when the application's configured risk ceiling is higher.

## 7. Start and monitor

Before starting a LIVE strategy:

1. Confirm the correct Binance LIVE account is connected.
2. Confirm the intended symbol and strategy parameters.
3. Confirm the fixed quote risk budget and LIVE capital ceiling.
4. Confirm Telegram notifications are available.
5. Start with the smallest exchange-valid exposure.

Monitor **Orders**, **Positions**, **Actions**, **Trade History**, balances, and notifications. Do not increase exposure after an unexplained rejection, stale action, reconciliation problem, or notification failure.

## 8. Stops and emergency controls

Use the normal strategy stop when you want to prevent new scheduled entries. Use the LIVE emergency-exit control only when you intend the platform to perform its emergency workflow for tracked LIVE exposure.

If exchange state and local state disagree, stop the strategy and reconcile the exchange state before resuming.

## 9. Safety rules

- Never enable Binance withdrawal permission for the bot key.
- Never expose Binance secrets, Telegram tokens, webhook secrets, JWT secrets, or encryption keys.
- Validate changes in Paper/Testnet before LIVE whenever possible.
- Keep LIVE testing bounded by the configured risk budget and capital ceiling.
- Treat backtests and Testnet results as engineering evidence, not profit guarantees.
- Do not use the current v1 deployment for unattended LIVE trading until the remaining operational release items are certified.

## 10. Current v1 status

Verified in production as of 2026-08-07:

- Paper trading and backtesting
- Binance Spot Testnet W2W flow
- DCA and independent sub-position strategy behavior
- Binance LIVE credential connection
- Bounded small-amount Binance LIVE execution
- Telegram connection and test notification delivery
- Render deployment and Prisma migration workflow

Still pending before unattended production operation:

- controlled LIVE emergency-exit certification
- automated database backups and a restore drill
- external monitoring/alerting
- durable notification delivery architecture
- final reliability/end-to-end certification
