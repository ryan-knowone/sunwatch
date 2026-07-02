# sunwatch

Crypto-paid uptime monitoring for builders.

**Try the hosted version:** [https://sunwatch.sunfamily.xyz](https://sunwatch.sunfamily.xyz)

sunwatch is a tiny, wallet-to-wallet uptime monitor. Add a URL, send the exact USDC amount shown on Base, and your monitor auto-activates. No accounts, no KYC, no monthly SaaS subscription—just a webhook when your site goes down or comes back up.

## Why it exists

Side projects and small services need uptime alerts, but most monitoring tools want a credit card, a long-term subscription, and a dashboard login. sunwatch flips that: you pay per monitor with stablecoins, wallet-to-wallet, and you get simple JSON webhook alerts.

## How the crypto-paid flow works

1. Create a monitor at `/dashboard`. Enter the URL, expected HTTP status, response-time threshold, and a webhook URL.
2. sunwatch shows a unique exact payment amount (e.g. `3.000042 USDC`). The small unique identifier lets us link your payment to the monitor.
3. Send exactly that amount in **USDC on Base** to the receiving wallet.
4. The payment poller watches on-chain transfers. Once it confirms your exact amount, the monitor activates automatically for 30 days.

Pricing: **$3 / monitor / month**, paid wallet-to-wallet in USDC on Base.

Receiving wallet (Base): `0x1e2D7F8715E8180816c0236A5c4F21596C5b9c9e`

## Stack

- **Node.js** >= 20
- **SQLite** (better-sqlite3, WAL mode)
- **Express** web server
- **viem** for Base on-chain payment verification
- **node-cron** pinger + payment poller
- **systemd** services on a small VPS
- HTTPS via Caddy + Let's Encrypt on the hosted instance

## Self-host

```bash
git clone https://github.com/ryan-knowone/sunwatch.git
cd sunwatch
npm install
```

Set environment variables:

```bash
export PORT=3001
export SUNWATCH_DB=/var/lib/sunwatch/sunwatch.db
export RECEIVING_WALLET=0x1e2D7F8715E8180816c0236A5c4F21596C5b9c9e
export BASE_RPC=https://mainnet.base.org
```

Run migrations:

```bash
npm run migrate
```

Start the server and pinger:

```bash
npm start        # API + dashboard
npm run pinger   # checks every minute
```

For production, put a reverse proxy (Caddy, Nginx, etc.) in front for HTTPS and run the processes as systemd services.

### systemd services

Sample unit files are included in `systemd/`. Copy and edit them for your user/paths:

```bash
sudo cp systemd/sunwatch-server.service /etc/systemd/system/
sudo cp systemd/sunwatch-pinger.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sunwatch-server sunwatch-pinger
```

## Webhook alert format

When a monitor changes state (up → down or down → up), sunwatch POSTs a JSON body to the monitor's `webhook_url`:

```json
{
  "monitor_id": 1,
  "url": "https://example.com",
  "state": "down",
  "status_code": 500,
  "response_ms": 245,
  "error": null,
  "timestamp": "2026-07-03T12:34:56.789Z"
}
```

- `state` is `"up"` or `"down"`.
- `status_code` is the HTTP response status (or `null` if the request failed).
- `response_ms` is the total request time.
- `error` contains an error message when the request could not complete.

## Try it

The fastest way to see sunwatch in action is the hosted version:

👉 **[https://sunwatch.sunfamily.xyz](https://sunwatch.sunfamily.xyz)**

Create your first monitor, send the exact USDC amount on Base, and watch it activate.

## License

MIT
