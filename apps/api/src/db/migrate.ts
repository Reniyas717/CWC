import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('[Migration] Applying database migrations...');
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
  console.log('[Migration] Database migrations applied successfully.');
}

// Allow standalone execution: node/tsx src/db/migrate.ts
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Migration] Migration failed:', err);
      await pool.end();
      process.exit(1);
    });
}
