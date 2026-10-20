#!/usr/bin/env node
/**
 * Zaklada supabase/seed.sql na projekt Supabase.
 *
 * Wymaga SUPABASE_DB_URL w .env (Dashboard -> Data API -> Connection string).
 * Bez psql skrypt wypisuje plik do wklejenia w SQL Editorze.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = join(root, 'supabase', 'seed.sql');

function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };

if (!existsSync(file)) {
  console.error('Brak pliku supabase/seed.sql.');
  process.exit(1);
}

if (!env.SUPABASE_DB_URL) {
  console.log('Brak SUPABASE_DB_URL w .env — wklej zawartość supabase/seed.sql w SQL Editorze projektu.');
  process.exit(0);
}

const sql = readFileSync(file, 'utf8');
const res = spawnSync('psql', [env.SUPABASE_DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], {
  stdio: 'inherit',
  env: { ...process.env, PGPASSWORD: env.PGPASSWORD ?? '' },
});

if (res.status !== 0) {
  console.error('Błąd na seedzie.');
  process.exit(res.status ?? 1);
}
console.log('Seed zatwierdzony.');
