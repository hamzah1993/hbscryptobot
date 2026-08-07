# PostgreSQL Backup and Restore Runbook

This runbook covers backup, verification, restore, and recovery checks for the HBS Trading Platform PostgreSQL database when the stack is deployed with Docker Compose.

> Bounded Binance LIVE execution is enabled. Backups may contain encrypted exchange credentials, user data, strategy configuration, orders, fills, notifications, historical candles, and backtest results. Store backup files as sensitive production data.

## Scope

The default Compose database service is named `postgres`, and the persistent volume is managed by Docker. This runbook uses PostgreSQL logical backups created with `pg_dump` because they are portable, inspectable, and suitable for routine recovery drills.

## Required environment values

The commands below read the same values used by `docker-compose.yml`:

```env
POSTGRES_DB=hbstrading
POSTGRES_USER=hbs
POSTGRES_PASSWORD=replace_me
```

Run commands from the repository root after loading the deployment `.env` file.

## Create a backup

Create a timestamped custom-format backup:

```bash
set -a
. ./.env
set +a

mkdir -p backups
BACKUP_FILE="backups/hbstrading-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker compose exec -T postgres \
  pg_dump \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  > "$BACKUP_FILE"

printf 'Created %s\n' "$BACKUP_FILE"
```

The command exits non-zero when `pg_dump` fails. Do not treat an empty or partially written file as a valid backup.

## Verify a backup

Check that the file exists and is not empty:

```bash
test -s "$BACKUP_FILE"
```

List the archive contents without restoring it:

```bash
docker compose exec -T postgres \
  pg_restore --list < "$BACKUP_FILE" > /tmp/hbstrading-backup-contents.txt

head -n 20 /tmp/hbstrading-backup-contents.txt
```

Generate and store a checksum:

```bash
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
sha256sum --check "$BACKUP_FILE.sha256"
```

A backup is not considered verified until both `pg_restore --list` and the checksum check succeed.

## Retention guidance

Keep at least:

- Seven daily backups
- Four weekly backups
- Three monthly backups

Store at least one encrypted copy outside the application host. Restrict access to operators who are authorized to handle user data and encrypted exchange credentials.

Never commit backups or checksum files to Git.

## Restore into a disposable verification database

A restore drill should normally use a temporary database first rather than overwriting the active database.

```bash
set -a
. ./.env
set +a

VERIFY_DB="${POSTGRES_DB}_restore_verify"

docker compose exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 \
  --command "DROP DATABASE IF EXISTS \"$VERIFY_DB\";"

docker compose exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 \
  --command "CREATE DATABASE \"$VERIFY_DB\";"

docker compose exec -T postgres \
  pg_restore \
  --username "$POSTGRES_USER" \
  --dbname "$VERIFY_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  < "$BACKUP_FILE"
```

Verify that application tables are present:

```bash
docker compose exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname "$VERIFY_DB" \
  --set ON_ERROR_STOP=1 \
  --command "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';"
```

Inspect selected record counts where appropriate:

```bash
docker compose exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname "$VERIFY_DB" \
  --set ON_ERROR_STOP=1 \
  --command 'SELECT COUNT(*) FROM "User";'
```

Drop the temporary verification database after the drill:

```bash
docker compose exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 \
  --command "DROP DATABASE \"$VERIFY_DB\";"
```

## Restore the active database

Only restore the active database during an approved maintenance window.

1. Announce the maintenance window and stop application writes.
2. Create a final pre-restore backup of the current database.
3. Verify the selected restore file and checksum.
4. Stop backend and frontend services.
5. Restore the database.
6. Start services and complete post-restore checks.

Stop application services while leaving PostgreSQL running:

```bash
docker compose stop frontend backend
```

Terminate active sessions, recreate the database, and restore:

```bash
set -a
. ./.env
set +a

docker compose exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$POSTGRES_DB'
  AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$POSTGRES_DB";
CREATE DATABASE "$POSTGRES_DB";
SQL

docker compose exec -T postgres \
  pg_restore \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  < "$BACKUP_FILE"
```

Restart services:

```bash
docker compose up -d backend frontend
```

## Post-restore validation

Confirm container health:

```bash
docker compose ps
```

Confirm the backend health endpoint:

```bash
curl --fail http://localhost:3000/api/health
```

Review recent backend logs:

```bash
docker compose logs --since=10m backend
```

Perform these application checks with a non-live test account:

- Login succeeds
- Strategies and paper positions load
- Binance Testnet/LIVE records load without starting a LIVE strategy or placing an order
- Notifications load
- Historical candles can be queried
- Existing backtest reports and CSV exports load
- A small paper-trading or backtest workflow succeeds

Do not place a LIVE order as part of a restore test.

## Recovery failure handling

When a restore fails:

1. Keep backend and frontend stopped.
2. Preserve the failed restore logs and selected backup file.
3. Do not repeatedly overwrite the database with unverified archives.
4. Recreate the database and retry with the most recent verified backup.
5. Escalate if checksums fail, archive listing fails, or required tables are missing.

## Routine drill schedule

Run a disposable restore verification at least monthly and before major database or Prisma schema changes. Record:

- Backup filename and checksum
- Backup creation time
- Restore start and completion time
- Operator
- Verification database name
- Table and record checks performed
- Result and any corrective action
