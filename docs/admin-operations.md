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

Packages are fixed-amount, admin-defined Binance LIVE bots that users subscribe to. Funds never leave the subscriber's own Binance account: subscribing creates a strategy on that account through the user's own API key, so each user's profit and loss is their own strategy's result.

Create packages under **Trading packages** in the Admin Center. Each package has:

- an **amount** in USDT, which becomes the strategy's risk budget and its exposure limit;
- a **symbol**, such as `BTCUSDT`;
- a **strategy template** (JSON) with the DCA and take-profit settings. Capital, exchange and environment fields are rejected; the base order must be at least 5 USDT and no larger than the amount. Example:

```json
{ "baseOrderQuote": 10, "maxDcaOrders": 3, "dcaStepPercent": 3, "dcaMultiplier": 1,
  "dcaMultipliers": [1, 1.5, 2], "takeProfitPercent": 1.5, "independentFromLevel": 3,
  "maxDailyRealizedLossQuote": 10 }
```

Backtest a template before publishing it. Edits apply to new subscriptions only; existing package bots keep their original settings. Hide a package by unticking **Visible to users** instead of deleting it.

User flow:

1. Connect a Binance LIVE API key with trading enabled and **withdrawals disabled**.
2. Subscribe on the **Packages** page. The bot is created `STOPPED`. If the user-wide LIVE capital ceiling is below the total of their active packages, it is raised to that total, which clears the LIVE confirmation.
3. Confirm LIVE trading on the LIVE overview, then press **Start**.
4. To leave, stop the bot, close any open position, then cancel. While a subscription is active the bot cannot be edited or deleted.

All package changes are recorded in the admin audit log.

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
