const cron = require('node-cron');
const { getDb } = require('./db');

async function pingMonitor(monitor) {
  const start = Date.now();
  let statusCode = null;
  let up = false;
  let error = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(monitor.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'sunwatch-pinger/0.1' },
    });
    clearTimeout(timeout);
    statusCode = res.status;
    up = res.status === Number(monitor.expected_status);
    if (monitor.response_ms_threshold && Date.now() - start > monitor.response_ms_threshold) {
      up = false;
    }
  } catch (err) {
    up = false;
    error = String(err.message || err);
  }

  const responseMs = Date.now() - start;

  const db = getDb();
  db.prepare(
    'INSERT INTO checks (monitor_id, status_code, response_ms, up, checked_at) VALUES (?, ?, ?, ?, ?)'
  ).run(monitor.id, statusCode, responseMs, up ? 1 : 0, Math.floor(Date.now() / 1000));

  const previous = db
    .prepare('SELECT up FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 2')
    .all(monitor.id);

  const lastState = previous.length > 1 ? previous[1].up : 1;
  if (Number(lastState) !== Number(up ? 1 : 0)) {
    await dispatchWebhook(monitor, up, { statusCode, responseMs, error });
    db.prepare('UPDATE monitors SET state = ?, updated_at = ? WHERE id = ?')
      .run(up ? 'active' : 'down', Math.floor(Date.now() / 1000), monitor.id);
  }
}

async function dispatchWebhook(monitor, up, details) {
  if (!monitor.webhook_url) return;
  const payload = {
    monitor_id: monitor.id,
    url: monitor.url,
    state: up ? 'up' : 'down',
    status_code: details.statusCode,
    response_ms: details.responseMs,
    error: details.error || null,
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(monitor.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(`[webhook] ${monitor.id} ${up ? 'UP' : 'DOWN'} -> ${res.status}`);
  } catch (err) {
    console.error(`[webhook] ${monitor.id} failed: ${err.message}`);
  }
}

async function tick() {
  const db = getDb();
  const monitors = db.prepare('SELECT * FROM monitors WHERE state IN (?, ?)').all('active', 'down');
  console.log(`[pinger] tick: ${monitors.length} monitors`);
  for (const m of monitors) {
    try {
      await pingMonitor(m);
    } catch (err) {
      console.error(`[pinger] monitor ${m.id} error:`, err);
    }
  }
}

if (require.main === module) {
  // every minute
  cron.schedule('* * * * *', tick);
  tick();
}

module.exports = { tick, pingMonitor };
