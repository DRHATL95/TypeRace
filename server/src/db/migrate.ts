import pool from './pool';
import fs from 'fs';
import path from 'path';

export async function runMigrations(): Promise<void> {
  // Ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id      SERIAL PRIMARY KEY,
      name    VARCHAR(255) NOT NULL UNIQUE,
      applied TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');

  // In production the compiled JS lives in dist/db/ but migrations are
  // SQL files copied alongside. Handle both source and dist layouts.
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    console.warn('No migrations directory found, skipping migrations');
    return;
  }

  const { rows: applied } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY id'
  );
  const appliedSet = new Set(applied.map(r => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Applying migration: ${file}`);

    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`  Applied: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`  Failed: ${file}`, err);
      throw err;
    }
  }
}
