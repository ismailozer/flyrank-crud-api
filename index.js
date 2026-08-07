const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi.json');
const db = require('./database');

const app = express();
const port = 3000;

app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// Geçici, bellek içi görev listesi
const tasks = [
  {
    id: 1,
    title: 'Buy groceries',
    done: false,
  },
  {
    id: 2,
    title: 'Walk the dog',
    done: true,
  },
  {
    id: 3,
    title: 'Read a book',
    done: false,
  },
];

function formatTask(row) {
  return {
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
  };
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

// Yeni görev oluştur
app.post('/tasks', (req, res) => {
  const { title } = req.body ?? {};

  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      error: 'title is required and cannot be empty',
    });
  }

  const id =
    tasks.length === 0
      ? 1
      : Math.max(...tasks.map((task) => task.id)) + 1;

  const newTask = {
    id,
    title: title.trim(),
    done: false,
  };

  tasks.push(newTask);

  res.status(201).json(newTask);
});

// ID'ye göre tek bir görevi veritabanından getir
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  const row = db
    .prepare('SELECT id, title, done FROM tasks WHERE id = ?')
    .get(id);

  if (!row) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  res.json(formatTask(row));
});

// Bir görevi güncelle
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((task) => task.id === id);

  if (!task) {
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

  if (hasTitle) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return res.status(400).json({
        error: 'title cannot be empty',
      });
    }

    task.title = body.title.trim();
  }

  if (hasDone) {
    if (typeof body.done !== 'boolean') {
      return res.status(400).json({
        error: 'done must be a boolean',
      });
    }

    task.done = body.done;
  }

  res.json(task);
});

// Bir görevi sil
app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const taskIndex = tasks.findIndex((task) => task.id === id);

  if (taskIndex === -1) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  tasks.splice(taskIndex, 1);

  res.status(204).send();
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});