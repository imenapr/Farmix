const path = require("path");
const sqlite3 = require("sqlite3");

const DB_PATH = path.join(__dirname, "database.db");

function openDb() {
  const sqlite = sqlite3.verbose();
  const db = new sqlite.Database(DB_PATH);

  // Promise helpers so the rest of the code stays simple.
  db.runAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

  db.getAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

  db.allAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

  return db;
}

async function initDb(db) {
  // Keep schema extremely small + close to your spec.
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT NOT NULL,
      images TEXT NOT NULL,
      seller_email TEXT,
      seller_phone TEXT
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      transport_rating INTEGER NOT NULL,
      quality_rating INTEGER NOT NULL,
      comment TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(listing_id) REFERENCES listings(id)
    )
  `);
}

module.exports = { DB_PATH, openDb, initDb };

