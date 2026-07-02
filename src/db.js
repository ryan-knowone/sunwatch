const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SUNWATCH_DB || path.join(__dirname, '..', 'db', 'sunwatch.db');

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function migrate() {
  const fs = require('fs');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  getDb().exec(sql);
}

module.exports = { getDb, migrate };
