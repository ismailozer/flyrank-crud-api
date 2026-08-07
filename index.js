const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi.json');
const postgresRepository = require('./postgresRepository');
const supabase = require('./supabaseClient');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));


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

// Yeni kullanıcı oluştur
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    email.trim() === '' ||
    typeof password !== 'string' ||
    password.trim() === ''
  ) {
    return res.status(400).json({
      error: 'email and password are required',
    });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    return res.status(201).json({
      user: data.user,
    });
  } catch (error) {
    console.error('Signup failed:', error);

    return res.status(500).json({
      error: 'Failed to create user',
    });
  }
});

// Kullanıcı girişi
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    email.trim() === '' ||
    typeof password !== 'string' ||
    password.trim() === ''
  ) {
    return res.status(400).json({
      error: 'email and password are required',
    });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.session) {
      return res.status(401).json({
        error: 'Invalid login credentials',
      });
    }

    return res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (error) {
    console.error('Login failed:', error);

    return res.status(500).json({
      error: 'Failed to log in',
    });
  }
});

// Bütün görevleri PostgreSQL'den getir
app.get('/tasks', async (req, res) => {
  try {
    const tasks = await postgresRepository.getAllTasks();

    res.json(tasks);
  } catch (error) {
    console.error('Failed to read tasks:', error);

    res.status(500).json({
      error: 'Failed to read tasks',
    });
  }
});

// Yeni görevi PostgreSQL'e ekle
app.post('/tasks', async (req, res) => {
  const { title } = req.body ?? {};

  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      error: 'title is required and cannot be empty',
    });
  }

  try {
    const newTask = await postgresRepository.createTask(title.trim());

    return res.status(201).json(newTask);
  } catch (error) {
    console.error('Failed to create task:', error);

    return res.status(500).json({
      error: 'Failed to create task',
    });
  }
});

// ID'ye göre tek bir görevi PostgreSQL'den getir
app.get('/tasks/:id', async (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === null) {
    return res.status(404).json({
      error: `Task ${req.params.id} not found`,
    });
  }

  try {
    const task = await postgresRepository.getTaskById(id);

    if (!task) {
      return res.status(404).json({
        error: `Task ${id} not found`,
      });
    }

    res.json(task);
  } catch (error) {
    console.error(`Failed to read task ${id}:`, error);

    res.status(500).json({
      error: 'Failed to read task',
    });
  }
});

// Bir görevi PostgreSQL'de güncelle
app.put('/tasks/:id', async (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === null) {
    return res.status(404).json({
      error: `Task ${req.params.id} not found`,
    });
  }

  try {
    const existingTask = await postgresRepository.getTaskById(id);

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
    let updatedDone = existingTask.done;

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

    const updatedTask = await postgresRepository.updateTask(
      id,
      updatedTitle,
      updatedDone,
    );

    return res.json(updatedTask);
  } catch (error) {
    console.error(`Failed to update task ${id}:`, error);

    return res.status(500).json({
      error: 'Failed to update task',
    });
  }
});

// Bir görevi PostgreSQL'den sil
app.delete('/tasks/:id', async (req, res) => {
  const id = parseTaskId(req.params.id);

  if (id === null) {
    return res.status(404).json({
      error: `Task ${req.params.id} not found`,
    });
  }

  try {
    const deleted = await postgresRepository.deleteTask(id);

    if (!deleted) {
      return res.status(404).json({
        error: `Task ${id} not found`,
      });
    }

    return res.status(204).send();
  } catch (error) {
    console.error(`Failed to delete task ${id}:`, error);

    return res.status(500).json({
      error: 'Failed to delete task',
    });
  }
});

async function startServer() {
  try {
    await postgresRepository.init();

    console.log('PostgreSQL connection and table are ready');
    console.log('Supabase client initialized');

    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error.message);
    process.exit(1);
  }
}

startServer();