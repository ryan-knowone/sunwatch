// Regression test for the FIFO payment-allocation bug.
// Simulates two pending monitors and two $1.00 USDC payments arriving in the
// same polling window, confirming each payment activates a *different* monitor.

process.env.SUNWATCH_DB = ':memory:';
process.env.RECEIVING_WALLET = '0x1e2D7F8715E8180816c0236A5c4F21596C5b9c9e';

const assert = require('assert');
const { getDb, migrate } = require('../src/db');
const { tryActivateMonitor } = require('../src/payments');

function makeLog(txHash, blockNumber) {
  // viem returns value as a BigInt (uint256).
  const oneDollarUSDC = 1000000n;
  return {
    transactionHash: txHash,
    blockNumber: BigInt(blockNumber),
    args: { value: oneDollarUSDC },
  };
}

function createPendingMonitor(url) {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO monitors (url, state, payment_amount, payment_currency, expected_status) VALUES (?, 'pending', '1.00', 'USDC', 200)"
    )
    .run(url);
  return result.lastInsertRowid;
}

function main() {
  migrate();

  const idA = createPendingMonitor('https://alpha.example.com');
  const idB = createPendingMonitor('https://beta.example.com');

  const db = getDb();
  const pending = db
    .prepare("SELECT * FROM monitors WHERE state = 'pending' AND payment_amount = '1.00' AND payment_currency = 'USDC' ORDER BY id ASC")
    .all();

  assert.strictEqual(pending.length, 2, 'expected two pending monitors');
  assert.strictEqual(pending[0].id, idA, 'first pending monitor should be alpha');
  assert.strictEqual(pending[1].id, idB, 'second pending monitor should be beta');

  const logA = makeLog('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 12345);
  const logB = makeLog('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 12346);

  const activatedA = tryActivateMonitor(logA, pending);
  const activatedB = tryActivateMonitor(logB, pending);

  assert.strictEqual(activatedA, idA, 'first payment should activate monitor A');
  assert.strictEqual(activatedB, idB, 'second payment should activate monitor B');
  assert.notStrictEqual(activatedA, activatedB, 'payments must activate different monitors');
  assert.strictEqual(pending.length, 0, 'both pending slots should be consumed');

  const payments = db.prepare('SELECT * FROM payments ORDER BY id ASC').all();
  assert.strictEqual(payments.length, 2, 'expected two payment records');
  assert.strictEqual(payments[0].monitor_id, idA, 'first payment record should belong to monitor A');
  assert.strictEqual(payments[1].monitor_id, idB, 'second payment record should belong to monitor B');
  assert.strictEqual(payments[0].tx_hash, logA.transactionHash);
  assert.strictEqual(payments[1].tx_hash, logB.transactionHash);

  const activeA = db.prepare('SELECT * FROM monitors WHERE id = ?').get(idA);
  const activeB = db.prepare('SELECT * FROM monitors WHERE id = ?').get(idB);
  assert.strictEqual(activeA.state, 'active', 'monitor A should be active');
  assert.strictEqual(activeB.state, 'active', 'monitor B should be active');
  assert.strictEqual(activeA.payment_tx_hash, logA.transactionHash);
  assert.strictEqual(activeB.payment_tx_hash, logB.transactionHash);

  console.log('✓ FIFO payment-allocation regression test passed');
}

main();
