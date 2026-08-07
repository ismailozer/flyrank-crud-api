const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({
  connectionString,
});

async function init() {
  const client = await pool.connect();

  try {
    const initSqlPath = path.join(__dirname, 'sql', 'init.sql');
    const initSql = fs.readFileSync(initSqlPath, 'utf8');

    await client.query('BEGIN');

    // Tablo mevcut değilse oluştur.
    await client.query(initSql);

    // Örnek görevler yalnızca tablo boşsa eklenir.
    const countResult = await client.query(`
      SELECT COUNT(*)::INTEGER AS count
      FROM tasks
    `);

    if (countResult.rows[0].count === 0) {
      await client.query(
        `
          INSERT INTO tasks (title, done)
          VALUES
            ($1, $2),
            ($3, $4),
            ($5, $6)
        `,
        [
          'Buy groceries',
          false,
          'Walk the dog',
          true,
          'Read a book',
          false,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getAllTasks() {
  const result = await pool.query(`
    SELECT id, title, done
    FROM tasks
    ORDER BY id
  `);

  return result.rows;
}

async function getTaskById(id) {
  const result = await pool.query(
    `
      SELECT id, title, done
      FROM tasks
      WHERE id = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function createTask(title) {
  const result = await pool.query(
    `
      INSERT INTO tasks (title, done)
      VALUES ($1, $2)
      RETURNING id, title, done
    `,
    [title, false],
  );

  return result.rows[0];
}

async function updateTask(id, title, done) {
  const result = await pool.query(
    `
      UPDATE tasks
      SET title = $1, done = $2
      WHERE id = $3
      RETURNING id, title, done
    `,
    [title, done, id],
  );

  return result.rows[0] ?? null;
}

async function deleteTask(id) {
  const result = await pool.query(
    `
      DELETE FROM tasks
      WHERE id = $1
      RETURNING id
    `,
    [id],
  );

  return result.rowCount > 0;
}

async function close() {
  await pool.end();
}

module.exports = {
  init,
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  close,
};