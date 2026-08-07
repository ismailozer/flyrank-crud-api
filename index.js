const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi.json');
const db = require('./database');
const postgresRepository = require('./postgresRepository');

const app = express();
const port = 3000;

app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));


function formatTask(row) {
  return {
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
  };
}

function parseTaskId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks'],
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
  });
});


// Bütün görevleri veritabanından getir
app.get('/tasks', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, done FROM tasks ORDER BY id')
    .all();

  const taskList = rows.map(formatTask);

  res.json(taskList);
});

// Yeni görevi veritabanına ekle
app.post('/tasks', (req, res) => {
  const { title } = req.body ?? {};

  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      error: 'title is required and cannot be empty',
    });
  }

  const result = db
    .prepare(`
      INSERT INTO tasks (title, done)
      VALUES (?, ?)
    `)
    .run(title.trim(), 0);

  const newTaskRow = db
    .prepare(`
      SELECT id, title, done
      FROM tasks
      WHERE id = ?
    `)
    .get(Number(result.lastInsertRowid));

  res.status(201).json(formatTask(newTaskRow));
});

// ID'ye göre tek bir görevi veritabanından getir
app.get('/tasks/:id', (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === null) {
    return res.status(404).json({
      error: `Task ${req.params.id} not found`,
    });
  }

  const row = db
    .prepare(`
      SELECT id, title, done
      FROM tasks
      WHERE id = ?
    `)
    .get(id);

  if (!row) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  res.json(formatTask(row));
});

// Bir görevi veritabanında güncelle
app.put('/tasks/:id', (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === null) {
    return res.status(404).json({
      error: `Task ${req.params.id} not found`,
    });
  }

  const existingTask = db
    .prepare(`
      SELECT id, title, done
      FROM tasks
      WHERE id = ?
    `)
    .get(id);

  if (!existingTask) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  const body = req.body ?? {};

  const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(body, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({
      error: 'request body must include title and/or done',
    });
  }

  let updatedTitle = existingTask.title;
  let updatedDone = Boolean(existingTask.done);

  if (hasTitle) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return res.status(400).json({
        error: 'title cannot be empty',
      });
    }

    updatedTitle = body.title.trim();
  }

  if (hasDone) {
    if (typeof body.done !== 'boolean') {
      return res.status(400).json({
        error: 'done must be a boolean',
      });
    }

    updatedDone = body.done;
  }

  db.prepare(`
    UPDATE tasks
    SET title = ?, done = ?
    WHERE id = ?
  `).run(updatedTitle, updatedDone ? 1 : 0, id);

  const updatedTask = db
    .prepare(`
      SELECT id, title, done
      FROM tasks
      WHERE id = ?
    `)
    .get(id);

  res.json(formatTask(updatedTask));
});

// Bir görevi veritabanından sil
app.delete('/tasks/:id', (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === null) {
    return res.status(404).json({
      error: `Task ${req.params.id} not found`,
    });
  }

  const result = db
    .prepare('DELETE FROM tasks WHERE id = ?')
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  res.status(204).send();
});

async function startServer() {
  try {
    await postgresRepository.init();

    console.log('PostgreSQL connection and table are ready');

    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error.message);
    process.exit(1);
  }
}

startServer();