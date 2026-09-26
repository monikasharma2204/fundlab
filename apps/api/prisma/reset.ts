/**
 * DESTRUCTIVE: drops the whole schema (tables, ledger, everything) and re-runs migrations.
 * The only way to remove trades, by design — the ledger trigger blocks DELETE.
 * Refuses to run unless you pass --yes.
 */
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { migrate } from './migrate';

neonConfig.webSocketConstructor = ws;

export async function dropSchema(connectionString: string, schema: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid schema name: ${schema}`);
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  const schema = process.env.DB_SCHEMA ?? 'public';
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!process.argv.includes('--yes')) {
    console.error(`This deletes ALL FundLab data in schema "${schema}". Re-run with --yes to confirm.`);
    process.exit(1);
  }
  dropSchema(url, schema)
    .then(() => migrate(url, schema))
    .then(() => console.log(`schema ${schema} reset`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
