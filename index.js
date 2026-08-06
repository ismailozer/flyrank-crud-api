const express = require('express');

const app = express();
const port = 3000;

app.use(express.json());

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

// Bütün görevleri getir
app.get('/tasks', (req, res) => {
  res.json(tasks);
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

// ID'ye göre tek bir görevi getir
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  const task = tasks.find((task) => task.id === id);

  if (!task) {
    return res.status(404).json({
      error: `Task ${id} not found`,
    });
  }

  res.json(task);
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});