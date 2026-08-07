const path = require('path');
const Database = require('better-sqlite3');

const databasePath = path.join(__dirname, 'tasks.db');
const db = new Database(databasePath);

// Tablo yalnızca mevcut değilse oluşturulur.
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
  )
`);

// Başlangıç görevleri yalnızca tablo boşsa eklenir.
const { count } = db
  .prepare('SELECT COUNT(*) AS count FROM tasks')
  .get();

if (count === 0) {
  const insertTask = db.prepare(`
    INSERT INTO tasks (title, done)
    VALUES (?, ?)
  `);

  insertTask.run('Buy groceries', 0);
  insertTask.run('Walk the dog', 1);
  insertTask.run('Read a book', 0);
}

module.exports = db;