const { createPublicClient, http, parseAbiItem, formatUnits } = require('viem');
const { base } = require('viem/chains');
const cron = require('node-cron');
const { getDb } = require('./db');

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RECEIVING_WALLET = process.env.RECEIVING_WALLET || '0x1e2D7F8715E8180816c0236A5c4F21596C5b9c9e';
const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const LOOKBACK_BLOCKS = 5000n; // ~2.7 hours of Base blocks

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC),
});

function pendingMonitors() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM monitors WHERE state = 'pending' AND payment_amount = '1.00' AND payment_currency = 'USDC' ORDER BY id ASC")
    .all();
}

async function fetchRecentTransfers() {
  const currentBlock = await client.getBlockNumber();
  let fromBlock = currentBlock - LOOKBACK_BLOCKS;
  if (fromBlock < 0n) fromBlock = 0n;

  const logs = await client.getLogs({
    address: USDC_BASE,
    event: TRANSFER_EVENT,
    args: { to: RECEIVING_WALLET },
    fromBlock,
    toBlock: currentBlock,
  });
  return logs;
}

function tryActivateMonitor(log, pending) {
  const db = getDb();
  const rawAmount = log.args.value;
  if (!rawAmount) return null;

  const humanAmount = formatUnits(rawAmount, 6);
  if (humanAmount !== '1.00') return null;

  const exists = db.prepare('SELECT 1 FROM payments WHERE tx_hash = ?').get(log.transactionHash);
  if (exists) return null;

  // Pick the oldest pending monitor requiring $1.00.
  const monitor = pending.length > 0 ? pending[0] : null;
  if (!monitor) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const paidUntil = nowSec + 30 * 24 * 60 * 60;

  db.prepare(
    'INSERT INTO payments (monitor_id, tx_hash, amount, currency, block_number, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(monitor.id, log.transactionHash, humanAmount, 'USDC', Number(log.blockNumber), nowSec);

  db.prepare(
    "UPDATE monitors SET state = 'active', paid_until = ?, payment_tx_hash = ?, updated_at = ? WHERE id = ?"
  ).run(paidUntil, log.transactionHash, nowSec, monitor.id);

  console.log(`[payments] activated monitor ${monitor.id} via tx ${log.transactionHash} (${humanAmount} USDC)`);
  return monitor.id;
}

async function pollPayments() {
  const pending = pendingMonitors();
  if (pending.length === 0) return { pending: 0, activated: [] };

  try {
    const logs = await fetchRecentTransfers();
    const activated = [];
    for (const log of logs) {
      const id = tryActivateMonitor(log, pending);
      if (id) activated.push(id);
    }
    console.log(`[payments] polled ${logs.length} transfer(s), activated ${activated.length} monitor(s)`);
    return { pending: pending.length, activated };
  } catch (err) {
    console.error('[payments] poll failed:', err.message);
    return { pending: pending.length, activated: [], error: err.message };
  }
}

async function checkPaymentForMonitor(monitorId) {
  const db = getDb();
  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(monitorId);
  if (!monitor) return { found: false, error: 'monitor not found' };
  if (monitor.state !== 'pending') return { found: true, monitor };

  const result = await pollPayments();
  if (result.error) return { found: false, error: result.error };

  const refreshed = db.prepare('SELECT * FROM monitors WHERE id = ?').get(monitorId);
  return { found: refreshed.state === 'active', monitor: refreshed };
}

function startPaymentPoller() {
  // Run immediately, then every minute.
  pollPayments();
  cron.schedule('* * * * *', pollPayments);
}

module.exports = {
  pollPayments,
  checkPaymentForMonitor,
  startPaymentPoller,
};
