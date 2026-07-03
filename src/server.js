const express = require('express');
const path = require('path');
const { getDb, migrate } = require('./db');
const { startPaymentPoller, checkPaymentForMonitor } = require('./payments');

const app = express();
const PORT = process.env.PORT || 3001;
const RECEIVING_WALLET = process.env.RECEIVING_WALLET || '0x1e2D7F8715E8180816c0236A5c4F21596C5b9c9e';
const MONTHLY_PRICE_USD = 1;
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/vendor/base-account.min.js', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'node_modules', '@base-org', 'account', 'dist', 'base-account.min.js'));
});

migrate();

function eip681Url(amountAtomic) {
  return `ethereum:${USDC_BASE}@8453/transfer?address=${RECEIVING_WALLET}&uint256=${amountAtomic}`;
}

function withIsFree(monitor) {
  if (!monitor) return monitor;
  return {
    ...monitor,
    is_free: monitor.payment_amount === null && monitor.state !== 'pending',
  };
}

function countFreeSlotMonitors(db) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM monitors WHERE state IN ('active', 'down')")
    .get();
  return row ? row.count : 0;
}

app.get('/api/config', (_req, res) => {
  res.json({
    receivingWallet: RECEIVING_WALLET,
    monthlyPriceUsd: MONTHLY_PRICE_USD,
    freeTier: { maxActive: 3 },
    paidTier: { monthlyPriceUsd: 1 },
    usdcBase: USDC_BASE,
  });
});

app.get('/api/monitors', (_req, res) => {
  const db = getDb();
  const monitors = db.prepare('SELECT * FROM monitors ORDER BY created_at DESC').all();
  res.json(monitors.map(withIsFree));
});

app.get('/api/monitors/:id', (req, res) => {
  const db = getDb();
  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'not found' });
  res.json(withIsFree(monitor));
});

app.get('/api/monitors/:id/payment-link', (req, res) => {
  const db = getDb();
  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'not found' });
  if (monitor.state !== 'pending' || monitor.payment_amount !== '1.00') {
    return res.status(400).json({ error: 'monitor does not require payment' });
  }
  const eip681 = eip681Url(1000000);
  res.json({ eip681, qr: eip681 });
});

app.post('/api/monitors', (req, res) => {
  const { url, interval_sec, expected_status, response_ms_threshold, webhook_url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const db = getDb();
  const activeCount = countFreeSlotMonitors(db);
  const hasFreeSlot = activeCount < 3;

  const nowSec = Math.floor(Date.now() / 1000);
  const paidUntil = nowSec + 30 * 24 * 60 * 60;

  const insert = db.prepare(
    'INSERT INTO monitors (url, interval_sec, expected_status, response_ms_threshold, webhook_url, state, paid_until, payment_amount, payment_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  let state;
  let paymentAmount = null;
  let paymentCurrency = null;
  let paidUntilValue = null;

  if (hasFreeSlot) {
    state = 'active';
    paidUntilValue = paidUntil;
  } else {
    state = 'pending';
    paymentAmount = '1.00';
    paymentCurrency = 'USDC';
  }

  const result = insert.run(
    url,
    Number(interval_sec) || 300,
    Number(expected_status) || 200,
    response_ms_threshold ? Number(response_ms_threshold) : null,
    webhook_url || null,
    state,
    paidUntilValue,
    paymentAmount,
    paymentCurrency
  );

  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(result.lastInsertRowid);
  const response = { monitor: withIsFree(monitor), isFree: hasFreeSlot };
  if (!hasFreeSlot) {
    response.paymentLink = eip681Url(1000000);
  }
  res.status(201).json(response);
});

app.post('/api/monitors/:id/activate', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE monitors SET state = ?, paid_until = ?, updated_at = ? WHERE id = ?')
    .run('active', Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, Math.floor(Date.now() / 1000), req.params.id);
  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'not found' });
  res.json(withIsFree(monitor));
});

app.get('/api/monitors/:id/checks', (req, res) => {
  const db = getDb();
  const checks = db
    .prepare('SELECT * FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 100')
    .all(req.params.id);
  res.json(checks);
});

app.post('/api/monitors/:id/check-payment', async (req, res) => {
  const result = await checkPaymentForMonitor(req.params.id);
  if (result.error && result.error !== 'monitor not found') {
    return res.status(500).json({ error: result.error });
  }
  if (!result.monitor) {
    return res.status(404).json({ error: result.error });
  }
  res.json({ paid: result.found, monitor: withIsFree(result.monitor) });
});

app.listen(PORT, () => {
  console.log(`sunwatch listening on http://localhost:${PORT}`);
  startPaymentPoller();
});
