#!/usr/bin/env node
/**
 * Naklada migracje SQL na projekt Supabase bez wymaganego Dockera.
 *
 * Potrzebne zmiane w .env:
 *   SUPABASE_DB_URL  — connection string (Preferences -> Data API -> Connection string)
 *
 * Uzrywamy `psql`, jezeli jest w PATH. Bez psql skrot wypisuje liste plikow do
 * wklejenia w Supabase Dashboard -> SQL Editor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = join(root, 'supabase', 'migrations');

function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

if (!env.SUPABASE_DB_URL) {
  console.log('Brak SUPABASE_DB_URL w .env — odpal ponownie po uzupelnieniu albo wklej ponizsze pliki w SQL Editorze:\n');
  for (const f of files) console.log('  supabase/migrations/' + f);
  process.exit(0);
}

for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8');
  console.log(`-> ${file}`);
  const res = spawnSync('psql', [env.SUPABASE_DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: env.PGPASSWORD ?? '' },
  });
  if (res.status !== 0) {
    console.error(`Blad na migracji ${file}`);
    process.exit(res.status ?? 1);
  }
}
console.log('Migracje zatrasone.');
