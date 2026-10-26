# Admin & Operations Center

The administrator UI is available at `/super/admin/control` to users whose database role is `ADMIN`. Opening it shows a separate administrator password screen before operations are available. Backend authorization is enforced independently of the UI route.

## First administrator

For Render deployments without Shell access, configure both of these backend-only environment variables:

- `ADMIN_EMAIL` — the email of an existing registered HBS Trading account. On startup that account is promoted to `ADMIN` if necessary and its old sessions are invalidated.
- `ADMIN_PASSWORD` — a strong, unique password of at least 12 characters used only by the administrator step-up login screen. Do not reuse the user's normal account password.

After the deployment, sign in to HBS Trading again, open `/super/admin/control`, and enter `ADMIN_PASSWORD`. The resulting administrator session lasts 15 minutes and is stored only for the current browser tab/session.

If Shell access is available, the CLI promotion command remains supported:

Promote an existing trusted account from the backend service shell:

```bash
npm run admin:promote -- trusted-admin@example.com
```

The command increments `authVersion`, invalidating existing sessions. Sign in again after promotion. Do not make shared/demo accounts administrators.

## Trading packages

Packages are fixed-amount managed plans that users subscribe to. Funds never leave the subscriber's own Binance account: subscribing creates Binance LIVE bots on that account through the user's own API key, so each user's profit and loss is their own bots' result.

Users only see a package's name, description and amount, plus its combined status and profit. They never see which strategies a package uses or their settings. Users who prefer their own settings create their own bots from the **Bots** page as before.

### 1. Package strategies

Create the predefined bots under **Package strategies** in the Admin Center. Each has a name, a symbol such as `BTCUSDT`, and a settings form grouped into Entry, Orders, Exit, Sub-positions, Recovery and Limits. Every field shows its help text and allowed range; fields that do not apply are hidden. The form is generated from the field list in `backend/src/packages/package-template.ts`, so a new setting added there appears in the panel automatically.

**Entry rules.** With *Entry mode* set to *Wait for dip + bounce candle*, a new cycle opens only when:

1. the price has dropped at least *Dip size* % below the highest price of the *Recent high window*, and
2. the latest **closed** candle(s) on the *Candle timeframe* confirm a bounce: one green candle, a green candle that closes above the previous candle's high (recommended), or several green candles in a row;
3. optionally, RSI(14) dipped to the *RSI filter* value or below just before the bounce.

*DCA waits for bounce candle* applies the same confirmation (without the dip) to DCA and recovery buys.

**Exit.** *Take profit* sells everything at that % above the average buy price. The optional *Stop-loss* sells the whole basket once the price is that % below the average buy price; leave it empty to hold and DCA instead.

**Buy until the budget runs out (no stop-loss).** *DCA levels* goes up to 200, but the risk budget is the real limit: buying stops when the next order no longer fits, and the bot then holds until the take profit is reached. It never sells below the average buy price. For equal-sized buys every *DCA step* % lower, use:

| Field | Value |
| --- | --- |
| Entry mode | Wait for dip + bounce candle |
| DCA levels | 200 |
| DCA multiplier | 1 |
| Per-level multipliers | empty (every level uses the multiplier) |
| Stop-loss (optional) | empty |
| Independent from level | DCA levels + 2 (e.g. 202), so all buys stay in one basket |
| Recovery mode | off |

With a 100 USDT budget and 10 USDT orders this makes 10 buys. The money stays locked while the price is below the average, so size the budget for the deepest drop you are willing to wait out.

**Backtest before publishing.** *Backtest these settings* runs the form's current values, saved or not, on Binance history for the chosen days and capital (0.1% fee per buy and sell). It shows return, drawdown, cycles, stop-losses and profitable exits next to the same settings without the entry rules, so you can see whether the rules help. Cooldown and the daily loss stop are not simulated, and results on past data do not guarantee future returns.

A strategy cannot be deactivated while an active package uses it, and an edit is refused if any package using it could no longer fund it.

### 2. Packages

Create packages under **Trading packages**. Each has a USDT amount and one or more strategies with a percentage of the amount; percentages must add up to 100%. For example, a 500 USDT package at BTC 60% / ETH 40% creates a 300 USDT BTC bot and a 200 USDT ETH bot. Each strategy's share must cover its base order.

Package and strategy edits apply to new subscriptions only; existing bots keep the settings they were created with. Hide a package by unticking **Visible to users** instead of deleting it.

### User flow

1. Connect a Binance LIVE API key with trading enabled and **withdrawals disabled**.
2. Subscribe on the **Packages** page. One bot per package strategy is created `STOPPED`, with generic names. If the user-wide LIVE capital ceiling is below the total of their active packages, it is raised to that total, which clears the LIVE confirmation.
3. Confirm LIVE trading on the LIVE overview, then press **Start**, which starts all of the package's bots.
4. To leave, press **Stop**, close any open positions, then **Cancel**.

Package bots never appear in the user's Bots list and cannot be edited, started, stopped or deleted individually, including after cancelling. Positions remain visible (they are trades on the user's own account), but their strategy settings are blanked. Emergency exit still closes package positions.

All package and strategy changes are recorded in the admin audit log.

## Mobile app and announcements

Users land on the mobile-first app at `/` with five tabs: **Home** (banner, latest announcement, shortcuts, recent profits, Binance spot market list), **Strategy** (packages), **Team** (referrals), **News** and **Mine**. The previous full dashboard remains available at `/pro` (Mine → Full dashboard, or Home → More) for users who manage their own bots.

- **Announcements** are written under **Announcements** in the Admin Center. Only published items are shown; pinned items stay on top and the newest one appears on Home. Users see a red dot on the bell until they open News.
- **Recent profits** on Home show real closed, profitable Binance LIVE trades from the last 7 days: the symbol, the return over the position's filled buys, and the user's masked initial only. Nothing is shown when there are none; never seed this with invented trades.
- **Market list** uses Binance's public 24-hour ticker, shared and cached for 5 seconds across all users. During a brief Binance outage the last snapshot is shown.

## Billing, deposits and referrals

Every user has a prepaid USDT **fuel balance** on the platform. It pays the fees; trading capital stays on the user's own exchange account.

- **Membership:** users activate it from their balance on the **Wallet** page (default 100 USDT for 365 days). Extending adds time after the current expiry.
- **Profit fee:** each Binance LIVE position that closes with a profit is charged `profitFeePercent` (default 20%) of its realized profit, within about a minute. Losing positions are not charged. Positions closed before billing was deployed (`profitFeeStartAt`) are never charged. The balance may go negative after a fee.
- **Trading gate:** new LIVE entries (package and user-created bots) require an active membership and at least the minimum balance (default 20 USDT). Exits and emergency exit are never blocked.
- **Referrals:** users sign up with an invitation code or link (`/auth?ref=CODE`). Each fee a user pays credits their uplines' balances by level (default 10% / 5% / 3%). An upline without an active membership is skipped for that fee. Rewards come only from fees actually paid, never from sign-ups. Total rewards are capped at 50% of a fee and at 5 levels.

Change fees under **Billing & referrals** in the Admin Center; changes apply to future charges. Use **Manual balance adjustment** for refunds or promotions (negative to debit). Every change is in the audit log. Have the fee and referral terms reviewed by a lawyer before launch.

### Deposit wallet setup

Deposits use USDT on BNB Smart Chain (BEP20). Each user gets their own deposit address, derived from a **watch-only** extended public key, so the server can see deposits but can never move them.

1. Create a new wallet seed phrase dedicated to deposits, offline, and store it securely. Never put it on the server.
2. Export the account-level extended public key (`xpub`) for path `m/44'/60'/0'` and set it as `DEPOSIT_XPUB`. The backend refuses an `xprv`.
3. Optionally set `BSC_RPC_URL` to a paid BSC RPC provider for reliability; the public endpoint is rate-limited.
4. Deploy, then send a small test deposit to your own account's address on the Wallet page and confirm it is credited after `BSC_CONFIRMATIONS` blocks.

Deposits land on individual addresses (`m/44'/60'/0'/0/<index>`). To collect them, import the seed phrase into a wallet that supports custom derivation paths, fund each address with a little BNB for gas, and transfer the USDT out. Do this from a secure machine, never from the server. The admin Billing page lists recent deposits.

Do not change `DEPOSIT_XPUB` after users have addresses: existing addresses would stop being watched.

## Render configuration

Set `BACKUP_DIRECTORY` to a directory on a **persistent Render disk**, for example `/var/data/hbs-backups`. A backup stored only on an ephemeral service filesystem is not a durable backup.

Set `AUTO_BACKUPS_ENABLED=true` to create a verified daily backup at 02:00 server time. Keep it `false` until persistent storage is attached and a manual backup/download has been tested.

The backend container includes PostgreSQL client tools (`pg_dump` and `pg_restore`).

## Backup behavior

`Create backup now` creates a PostgreSQL custom-format archive, verifies it using `pg_restore --list`, calculates SHA-256, and records the action in the admin audit log. Backups can be downloaded from the admin UI.

Backups contain sensitive production data, including encrypted exchange credentials. Protect backup storage and downloads accordingly.

## Restore behavior

Restore requires typing `RESTORE <filename>` exactly. The backend verifies the archive, enables maintenance mode, stops non-paper strategies, creates a safety backup, restores in one PostgreSQL transaction, and leaves restored non-paper strategies `STOPPED`.

LIVE schedulers, retries/order synchronization, and manual LIVE execution fail closed while maintenance mode is active. Trading is **not** automatically resumed after restore.

Run the first restore drill with a non-production database or approved maintenance window before relying on this workflow for disaster recovery.
