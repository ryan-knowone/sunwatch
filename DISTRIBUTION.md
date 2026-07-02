# sunwatch — distribution copy

Ready for Ryan to review and publish. Keep it casual and crypto-native.

---

## Twitter / X post

Shipped a tiny uptime monitor for builders: https://sunwatch.sunfamily.xyz

- Pay per monitor with USDC on Base
- No KYC, no subscription lock-in
- Webhook alerts when your site goes down/up
- $3/monitor/month

Create a monitor, send the exact USDC amount, and it auto-activates. Would love feedback from anyone running side projects.

---

## Show HN / forum post

**sunwatch — crypto-paid uptime monitoring for side projects**

https://sunwatch.sunfamily.xyz

I built a minimal uptime monitor where you pay per monitor with USDC on Base. No accounts, no KYC. You add a URL + webhook, send the exact USDC amount shown, and the monitor auto-activates. Pings every minute; alerts on down/up state changes via webhook.

Pricing: $3/monitor/month, paid wallet-to-wallet.

Stack: Node.js, SQLite, viem, systemd on a small VPS.

Looking for feedback from solo builders and anyone who wants alert flexibility without a SaaS subscription.

---

## Short email / DM

Hey — I just shipped sunwatch, a crypto-paid uptime monitor: https://sunwatch.sunfamily.xyz

$3/monitor/month, paid in USDC on Base, no KYC. Webhook alerts. Perfect for side projects you don't want to hook up to a monthly SaaS bill.

If you try it, let me know what breaks.

---

## Notes

- Public HTTPS is live via Caddy + Let's Encrypt.
- Systemd services survive reboot (confirmed after 2026-07-03 reboot).
- Landing page is at `/`; dashboard is at `/dashboard`.
