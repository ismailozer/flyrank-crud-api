# SQLite Exploration

I opened `tasks.db` in DB Browser for SQLite and manually executed SQL
queries against the same database used by the API.

## Queries executed

### List all tasks

```sql
SELECT * FROM tasks;
```

This query returned every row stored in the `tasks` table.

### Show completed tasks

```sql
SELECT * FROM tasks
WHERE done = 1;
```

This query returned only the tasks whose `done` value was stored as `1`.

### Count all tasks

```sql
SELECT COUNT(*) AS total_tasks
FROM tasks;
```

This query returned the total number of rows in the `tasks` table.

### Mark every task as completed

```sql
UPDATE tasks
SET done = 1;
```

After saving the database changes, `GET /tasks` immediately returned every
task with `"done": true`.

### Delete all completed tasks

```sql
DELETE FROM tasks
WHERE done = 1;
```

After saving the changes, `GET /tasks` returned an empty array.

This confirmed that DB Browser and the API were both reading from and
writing to the same `tasks.db` file.