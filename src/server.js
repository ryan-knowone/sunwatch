const express = require('express');
const path = require('path');
const { getDb, migrate } = require('./db');
const { startPaymentPoller, checkPaymentForMonitor } = require('./payments');

const app = express();
const PORT = process.env.PORT || 3001;
const RECEIVING_WALLET = process.env.RECEIVING_WALLET || '0x1e2D7F8715E8180816c0236A5c4F21596C5b9c9e';
const MONTHLY_PRICE_USD = 3;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

migrate();

function setPaymentAmount(monitorId) {
  const uniqueAddon = (monitorId * 0.000001).toFixed(6);
  const amount = (MONTHLY_PRICE_USD + parseFloat(uniqueAddon)).toFixed(6);
  const db = getDb();
  db.prepare('UPDATE monitors SET payment_amount = ?, payment_currency = ? WHERE id = ?')
    .run(amount, 'USDC', monitorId);
  return amount;
}

app.get('/api/config', (_req, res) => {
  res.json({ receivingWallet: RECEIVING_WALLET, monthlyPriceUsd: MONTHLY_PRICE_USD });
});

app.get('/api/monitors', (_req, res) => {
  const db = getDb();
  const monitors = db.prepare('SELECT * FROM monitors ORDER BY created_at DESC').all();
  res.json(monitors);
});

app.get('/api/monitors/:id', (req, res) => {
  const db = getDb();
  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'not found' });
  res.json(monitor);
});

app.post('/api/monitors', (req, res) => {
  const { url, interval_sec, expected_status, response_ms_threshold, webhook_url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO monitors (url, interval_sec, expected_status, response_ms_threshold, webhook_url, state) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = insert.run(
    url,
    Number(interval_sec) || 300,
    Number(expected_status) || 200,
    response_ms_threshold ? Number(response_ms_threshold) : null,
    webhook_url || null,
    'pending'
  );

  const paymentAmount = setPaymentAmount(result.lastInsertRowid);

  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ monitor, receivingWallet: RECEIVING_WALLET, paymentAmount });
});

app.post('/api/monitors/:id/activate', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE monitors SET state = ?, paid_until = ?, updated_at = ? WHERE id = ?')
    .run('active', Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, Math.floor(Date.now() / 1000), req.params.id);
  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'not found' });
  res.json(monitor);
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
  res.json({ paid: result.found, monitor: result.monitor });
});

app.listen(PORT, () => {
  console.log(`sunwatch listening on http://localhost:${PORT}`);
  startPaymentPoller();
});
