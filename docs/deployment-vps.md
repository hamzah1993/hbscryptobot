# Deploying on a VPS

One server runs everything with Docker Compose: PostgreSQL, Redis, the backend, and Caddy (HTTPS, the web app and the `/api` proxy). Only ports 80 and 443 are open to the internet.

## 1. Choose the server

| | Recommendation |
| --- | --- |
| Region | **Tokyo** (Binance's matching engine runs in AWS Tokyo, so orders arrive fastest). Never a US region: Binance.com blocks US IPs. |
| Provider | AWS Lightsail, Vultr or DigitalOcean (Tokyo or Singapore). All give a fixed public IPv4. |
| Size | 2 vCPU, 4 GB RAM, 80 GB SSD to start; 4 vCPU / 8 GB once you pass a few hundred active bots. |
| OS | Ubuntu 24.04 LTS |
| Extras | Turn on the provider's automatic daily snapshots. |

Before committing to a provider, check from the new server that Binance answers:

```bash
curl -s https://api.binance.com/api/v3/ping   # must print {}
```

The server's public IPv4 is your **fixed outbound IP**: users add it to their Binance API key restrictions.

## 2. Prepare the server

```bash
# As root on a fresh Ubuntu server
adduser hbs && usermod -aG sudo hbs
curl -fsSL https://get.docker.com | sh
usermod -aG docker hbs
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

Use SSH keys and disable password login (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).

Point your domain's **A record** (e.g. `app.example.com`) at the server's IP. If you use Cloudflare, either leave the record grey (DNS only) or set `TRUST_PROXY_HOPS=2`.

## 3. Configure and start

```bash
# As the hbs user
git clone https://github.com/hamzah1993/hbscryptobot.git && cd hbscryptobot
cp deploy/.env.production.example deploy/.env.production
nano deploy/.env.production      # fill in every value; generate secrets with openssl as noted in the file
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml up -d --build
```

Caddy gets the HTTPS certificate on first start. The backend applies all database migrations on every start (`prisma migrate deploy`), so a brand-new database is set up automatically.

Check it:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps
curl -s https://app.example.com/api/health
```

Then:

1. Register your account in the app, and promote it:
   `docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml exec backend npm run admin:promote -- you@example.com`
2. Sign in again, turn on **two-factor authentication** in your profile (required for the admin area).
3. Open `https://app.example.com/api/health/client-ip` while signed in (or check the same request in the browser's network tab): `ip` must be your own IP. If not, raise `TRUST_PROXY_HOPS` and restart.

## 4. Updating

```bash
git pull
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml up -d --build
```

## 5. Backups

- With `AUTO_BACKUPS_ENABLED=true` the backend writes PostgreSQL dumps to the `backups` volume. Copy them off the server regularly (e.g. `rclone` to S3/Backblaze), together with an offline copy of `deploy/.env.production`. **Losing `EXCHANGE_CREDENTIALS_KEY` makes every stored API key and 2FA secret unreadable.**
- Keep the provider's daily snapshots on as a second layer.
- Practise a restore on a spare server before launch (`docs/backup-and-restore.md`).

## 6. Moving from Render

1. Put Render in maintenance (stop LIVE bots), take a final backup from the admin panel and download it.
2. Start the VPS stack, then stop only the backend: `docker compose ... stop backend`.
3. Restore the dump into the VPS database (`docs/backup-and-restore.md`), use the **same** `EXCHANGE_CREDENTIALS_KEY` and `JWT_SECRET` as Render, and start the backend.
4. Switch DNS to the VPS, update `TELEGRAM_WEBHOOK_URL`, and set `SERVER_OUTBOUND_IP`.
5. Ask users to update their Binance API key IP restriction to the new server IP before resuming bots.

## 7. Lost authenticator

If a user loses their 2FA device, confirm their identity out of band, then:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml exec backend npm run user:reset-2fa -- user@example.com
```
