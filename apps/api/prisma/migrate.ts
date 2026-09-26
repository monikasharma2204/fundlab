/**
 * Applies prisma/migrations/NNNN_name/migration.sql files in order.
 *
 * Why not `prisma migrate deploy`? It needs a direct TCP connection to
 * Postgres (port 5432). The environment this was built in could only reach
 * Neon over HTTPS/WebSocket, so this runner applies the same SQL files through
 * Neon's WebSocket driver. Each migration runs in its own transaction and is
 * recorded in "_fundlab_migrations", so re-running is safe.
 *
 * Usage: DATABASE_URL=... [DB_SCHEMA=fundlab_test] npm run db:migrate
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

export async function migrate(connectionString: string, schema = 'public', log = console.log) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid schema name: ${schema}`);
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS "_fundlab_migrations" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
    const applied = new Set(
      (await client.query('SELECT name FROM "_fundlab_migrations"')).rows.map((r) => r.name as string),
    );
    const dir = join(__dirname, 'migrations');
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of names) {
      if (applied.has(name)) continue;
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "_fundlab_migrations"(name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        log(`applied ${name} to schema ${schema}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  migrate(url, process.env.DB_SCHEMA ?? 'public')
    .then(() => console.log('migrations up to date'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
