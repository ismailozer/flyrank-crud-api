# Task API

A Dockerized Express CRUD API backed by PostgreSQL with Supabase authentication and JWT-protected routes.

The project was built with Node.js and Express as part of the FlyRank Backend AI Engineering internship assignments.

## Features

- Create, read, update and delete tasks
- PostgreSQL persistent storage
- Docker Compose for application + database
- Supabase user authentication
- User sign up and login
- JWT access tokens
- Reusable authentication middleware
- Public and protected API routes
- User logout
- JSON input validation
- Correct HTTP status codes
- Swagger UI with Bearer authentication
- Parameterized PostgreSQL queries
- Data that survives container restarts

## Technologies

- Node.js
- Express
- PostgreSQL
- `pg`
- Supabase Auth
- `@supabase/supabase-js`
- JSON Web Tokens (JWT)
- Docker
- Docker Compose
- Swagger UI
- OpenAPI 3.0

## Installation

Clone the repository:

```bash
git clone https://github.com/ismailozer/flyrank-crud-api.git
```

Open the project directory:

```bash
cd flyrank-crud-api
```

Install the dependencies:

```bash
npm install
```
PostgreSQL runs in Docker, so no separate local PostgreSQL installation is required when using Docker Compose.

Create a `.env` file from `.env.example` before starting the application. The PostgreSQL `tasks` table is created automatically when the application starts.

## Running the API

### Docker Compose

The recommended way to start the complete application stack is:

```bash
docker compose up --build
```

To run it in the background:

```bash
docker compose up --build -d
```

This starts both:

- the Express application
- the PostgreSQL database

### Run Node.js locally

If PostgreSQL is already running and `.env` contains a valid `DATABASE_URL`,
the Node.js application can also be started directly:

```bash
npm start
```

The API runs at:

```text
http://localhost:3000
```

Swagger UI:

```text
http://localhost:3000/docs
```

## Task structure

Each task has the following structure:

```json
{
  "id": 1,
  "title": "Buy groceries",
  "done": false
}
```

## Endpoints

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| GET | `/` | No | Returns API information |
| GET | `/health` | No | Checks server health |
| POST | `/auth/signup` | No | Creates a user account |
| POST | `/auth/login` | No | Logs in and returns JWT tokens |
| POST | `/auth/logout` | Bearer JWT | Logs out the authenticated user |
| GET | `/public/info` | No | Returns public information |
| GET | `/protected/profile` | Bearer JWT | Returns the authenticated user profile |
| GET | `/protected/dashboard` | Bearer JWT | Returns protected dashboard information |
| GET | `/tasks` | No | Returns all tasks |
| GET | `/tasks/:id` | No | Returns one task |
| POST | `/tasks` | No | Creates a new task |
| PUT | `/tasks/:id` | No | Updates a task |
| DELETE | `/tasks/:id` | No | Deletes a task |
| POST | `/triage` | No | Classifies a support message into a validated triage result |

## AI Triage Endpoint

The API includes a `POST /triage` endpoint that classifies an incoming support
message into a fixed and validated JSON structure.

The endpoint validates the request before any AI-related work is performed.

During Stage 1 development, the real model call can be disabled by setting:

```env
LLM_STUB=1
```

When stub mode is enabled, the endpoint returns a predefined response that still
passes the same output schema that will later be used for real LLM responses.

This allows the API contract and validation logic to be tested without making
any model calls.

### Triage input

The endpoint accepts a JSON body in the following format:

```json
{
  "text": "I was charged twice for my subscription."
}
```

The `text` field:

- must be a string
- cannot be empty
- must contain at most 2000 characters

### Valid triage request

```bash
curl -i -X POST http://localhost:3000/triage \
  -H "Content-Type: application/json" \
  -d '{"text":"I was charged twice for my subscription."}'
```

Expected status:

```text
200 OK
```

Example response while `LLM_STUB=1`:

```json
{
  "category": "billing",
  "urgency": "normal",
  "suggested_team": "billing",
  "confidence": 0.95,
  "reason": "Stub response used for development."
}
```

The response is validated against a fixed output schema.

Allowed `category` values:

- `billing`
- `bug`
- `feature`
- `account`
- `other`

Allowed `urgency` values:

- `low`
- `normal`
- `high`

Allowed `suggested_team` values:

- `billing`
- `engineering`
- `product`
- `support`

The `confidence` value must be between `0.0` and `1.0`.

### Invalid triage request

A request without the required `text` field:

```bash
curl -i -X POST http://localhost:3000/triage \
  -H "Content-Type: application/json" \
  -d '{}'
```

returns:

```text
400 Bad Request
```

Example response:

```json
{
  "error": "Invalid request",
  "field": "text",
  "message": "Invalid input: expected string, received undefined"
}
```

An empty message is also rejected:

```bash
curl -i -X POST http://localhost:3000/triage \
  -H "Content-Type: application/json" \
  -d '{"text":""}'
```

Example response:

```json
{
  "error": "Invalid request",
  "field": "text",
  "message": "text cannot be empty"
}
```

At this stage, no real LLM call is performed when `LLM_STUB=1`.

The purpose of stub mode is to establish and verify the API contract before
connecting real model output to the endpoint.

## Authentication

Authentication is handled by Supabase Auth.

The application does not store user passwords in the local PostgreSQL
database. Email and password credentials are sent to Supabase Auth, which
manages user accounts and password security.

### Sign up

Create a new user with:

```http
POST /auth/signup
```

Example request body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

A successful signup returns:

```text
201 Created
```

Missing email or password returns:

```text
400 Bad Request
```

### Log in

Log in with:

```http
POST /auth/login
```

Example request body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

A successful login returns an access token and refresh token:

```json
{
  "access_token": "<JWT>",
  "refresh_token": "<refresh-token>"
}
```

Invalid credentials return:

```text
401 Unauthorized
```

### Protected routes

Protected routes require an access token in the HTTP `Authorization` header:

```text
Authorization: Bearer <access_token>
```

Protected endpoints include:

```text
GET /protected/profile
GET /protected/dashboard
POST /auth/logout
```

Requests without an access token return:

```text
401 Unauthorized
```

Invalid or expired tokens also return:

```text
401 Unauthorized
```

## Authentication middleware

Reusable authentication logic is implemented in:

```text
authMiddleware.js
```

The middleware reads the `Authorization` header, extracts the Bearer token and
verifies it through Supabase Auth.

When the token is valid, the authenticated user is attached to:

```text
req.user
```

The access token is also attached to:

```text
req.accessToken
```

The protected route can then continue by calling the next Express handler.

This avoids duplicating JWT verification logic in every protected endpoint.

The same middleware currently protects:

```text
/protected/profile
/protected/dashboard
/auth/logout
```

## Swagger authentication

Swagger UI is available at:

```text
http://localhost:3000/docs
```

The authentication flow can be tested directly through Swagger UI.

First, run:

```text
POST /auth/login
```

Copy the returned `access_token`.

Then click the **Authorize** button at the top of Swagger UI and paste only the
JWT access token.

Swagger automatically sends the token using:

```text
Authorization: Bearer <token>
```

After authorization, protected endpoints such as:

```text
GET /protected/profile
GET /protected/dashboard
POST /auth/logout
```

can be tested using **Try it out**.

Public endpoints such as:

```text
GET /public/info
```

do not require authentication.

![Swagger Auth](./screenshots/swagger-auth.png)
![Protected route with JWT](./screenshots/swagger-auth-2.png)

## Create a task

Request:

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Buy milk\"}"
```

Request body:

```json
{
  "title": "Buy milk"
}
```

Example response:

```json
{
  "id": 4,
  "title": "Buy milk",
  "done": false
}
```

## Update a task

Request body:

```json
{
  "title": "Buy oat milk",
  "done": true
}
```

Example request:

```bash
curl -X PUT http://localhost:3000/tasks/4 \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Buy oat milk\",\"done\":true}"
```

## Validation and error responses

Creating a task without a valid title returns `400 Bad Request`:

```json
{
  "error": "title is required and cannot be empty"
}
```

Requesting an unknown task returns `404 Not Found`:

```json
{
  "error": "Task 99 not found"
}
```

Sending an invalid `done` value during an update returns `400 Bad Request`:

```json
{
  "error": "done must be a boolean"
}
```

## HTTP status codes

| Status | Meaning |
|---:|---|
| 200 | Request completed successfully |
| 201 | A resource was created successfully |
| 204 | A task was deleted successfully |
| 400 | The request body was invalid |
| 401 | Authentication failed or a valid token was not provided |
| 404 | The requested resource was not found |
| 500 | An unexpected server error occurred |

## PostgreSQL development container

PostgreSQL can be started manually for development with:

```bash
docker run --name taskdb \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=tasks \
  -p 5432:5432 \
  -v taskdata:/var/lib/postgresql/data \
  -d postgres:17
```

The database runs at `localhost:5432`.

The named Docker volume `taskdata` stores the PostgreSQL data outside the
container so that rows can survive container restarts.

The application connects to PostgreSQL through `postgresRepository.js`. All CRUD operations use PostgreSQL queries.

## Docker Compose stack

The application and PostgreSQL database can be started together with one
command:

```bash
docker compose up --build
```

To run the stack in the background:

```bash
docker compose up --build -d
```

The API is available at:

```text
http://localhost:3000
```

Swagger UI is available at:

```text
http://localhost:3000/docs
```

The running services can be inspected with:

```bash
docker compose ps
```

![Docker Compose stack](./screenshots/docker-compose-stack.png)

## Environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The application requires PostgreSQL and Supabase environment variables.

Example configuration:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=dev
POSTGRES_DB=tasks

DATABASE_URL=postgres://postgres:dev@localhost:5432/tasks
DOCKER_DATABASE_URL=postgres://postgres:dev@db:5432/tasks

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_publishable_key
```

`DATABASE_URL` is used when the Node.js application runs directly on the host
machine.

`DOCKER_DATABASE_URL` is used when the application runs inside Docker Compose,
where the PostgreSQL service is available with the hostname `db`.

`SUPABASE_URL` and `SUPABASE_KEY` are used to connect the application to
Supabase Auth.

The real `.env` file is ignored by Git and must never be committed.

Only `.env.example` is committed to the repository.

## Repository architecture

The API routes and their HTTP behaviour did not change when the storage layer
was switched from SQLite to PostgreSQL.

All PostgreSQL queries are contained in:

```text
postgresRepository.js
```

The Express routes call repository functions such as:

```text
getAllTasks
getTaskById
createTask
updateTask
deleteTask
```

The routes do not contain PostgreSQL connection configuration. This keeps the
API layer separate from the storage implementation.

## PostgreSQL initialization

The table definition is stored in:

```text
sql/init.sql
```

The application automatically:

1. connects to PostgreSQL,
2. creates the `tasks` table if it is missing,
3. inserts three example tasks only when the table is empty.

## Persistence proof

I created a task through `POST /tasks`, confirmed it directly in PostgreSQL,
and then stopped and removed both Compose containers:

```bash
docker compose down
```

I started the stack again:

```bash
docker compose up -d
```

The task was still returned by `GET /tasks`.

The data survived because PostgreSQL stores its files in the named Docker
volume:

```text
taskdata
```

The containers can be removed and recreated without deleting this volume.

![PostgreSQL persistence proof](./screenshots/postgres-persistence.png)

To stop the stack without deleting the database:

```bash
docker compose down
```

The following command also removes the database volume and should only be used
when a completely clean database is required:

```bash
docker compose down -v
```