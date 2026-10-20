#!/usr/bin/env node
/**
 * Sprawdzamy, czy src/lib/database.types.ts nadąża za schemą w bazie.
 *
 * Plik typów jest kurierowany ręcznie: kolumny mapują na aliasy z `domain/types`
 * (Belt, Role, MemberProfile['membership']), więc proste "przepisz z information_schema"
 * zniszczyłoby te mapowania. Za to sucha zgodność *nazw relacji i kolumn* nadaje się do
 * automatycznego sprawdzenia — i ona realnie rozjeżdża się najczęściej: widok bez kolumny
 * w typach to `SelectQueryError` przy budowaniu bundla, kolumna usunięta z widoku a
 * zostawiona w typach to `undefined` czytany po cichu.
 *
 * Użycie:
 *   npm run db:types            — porównaj typy ze schemą w SUPABASE_DB_URL
 *   npm run db:types -- --emit  — dodatkowo wypisz szkielet relacji z dryfem
 *
 * Bez SUPABASE_DB_URL skrypt kończy pracę kodem 0 i mówi, co dopisać w .env — tak samo
 * jak robią to apply-migrations.mjs i apply-seed.mjs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TYPES_FILE = join(root, 'src', 'lib', 'database.types.ts');

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

if (!env.SUPABASE_DB_URL) {
  console.log('Brak SUPABASE_DB_URL w .env — bez niego nie sprawdzimy, czy typy nadążają za baza.');
  console.log('Connection string: Supabase Dashboard -> Project Settings -> Data API -> Connection string.');
  process.exit(0);
}

const SQL = `
select json_build_object('relations', json_agg(r order by r.name))::text
from (
  select
    t.table_name as name,
    case when t.table_type = 'VIEW' then 'view' else 'table' end as kind,
    coalesce((
      select json_agg(c.column_name::text order by c.ordinal_position)
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.table_name
    ), '[]'::json) as columns
  from information_schema.tables t
  where t.table_schema = 'public'
) r;
`;

function readSchema() {
  const res = spawnSync('psql', [env.SUPABASE_DB_URL, '-At', '-c', SQL], {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: env.PGPASSWORD ?? '' },
  });
  if (res.status !== 0) {
    console.error('Nie udalo sie odczyac schemy przez psql:');
    console.error((res.stderr || res.stdout).trim().split('\n').slice(0, 6).join('\n'));
    process.exit(1);
  }
  return JSON.parse(res.stdout.trim()).relations;
}

/**
 * Indeks znaku `}` zamykającego nawias `{` otwarty w pozycji `open`.
 *
 * W tym pliku nie ma nawiasów klamrowych wewnątrz typów (walidacja idzie przez
 * `Database['public']` z nawiasami kwadratowymi), więc liczenie znaków wystarczy.
 */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Nazwy kolumn z obiektu `Row: { ... }` — działa zarówno w jednym, jak i wielu liniach. */
function rowColumns(body) {
  const rowMatch = body.match(/\bRow: \{/);
  if (!rowMatch) return null;
  const open = body.indexOf('{', rowMatch.index);
  const close = matchBrace(body, open);
  if (close < 0) return null;
  const cols = new Set();
  for (const m of body.slice(open + 1, close).matchAll(/(?:^|[{,;\s])([a-z_][a-z0-9_]*)(\?)?:/g)) {
    cols.add(m[1]);
  }
  return cols;
}

/**
 * Nazwy relacji i kól z sekcji Tables i Views w pliku typów.
 *
 * Functions i Enums pomijamy — sprawdzamy tylko relacje i kolumny, a sygnatury RPC są
 * opisane ręcznie i nie mają odzwierciedlenia w information_schema.
 */
function readTypes() {
  const text = readFileSync(TYPES_FILE, 'utf8');
  const out = { Tables: new Map(), Views: new Map() };

  for (const section of ['Tables', 'Views']) {
    const header = text.match(new RegExp(`^ {4}${section}: \\{`, 'm'));
    if (!header) continue;
    const secOpen = text.indexOf('{', header.index);
    const secClose = matchBrace(text, secOpen);
    if (secClose < 0) continue;
    const body = text.slice(secOpen + 1, secClose);

    for (const m of body.matchAll(/^ {6}([a-z_][a-z0-9_]*): \{$/gm)) {
      const open = body.indexOf('{', m.index + m[0].length - 1);
      const close = matchBrace(body, open);
      if (close < 0) continue;
      out[section].set(m[1], rowColumns(body.slice(open, close)) ?? new Set());
    }
  }
  return out;
}

const schema = readSchema();
const types = readTypes();
const emit = process.argv.includes('--emit');

const drift = [];
for (const rel of schema) {
  const declared = rel.kind === 'view' ? types.Views : types.Tables;
  const wrongSection = rel.kind === 'view' ? types.Tables : types.Views;
  const cols = declared.get(rel.name);

  if (wrongSection.has(rel.name)) {
    drift.push(`${rel.name}: w bazie to ${rel.kind === 'view' ? 'widok' : 'tabel'}, w typach jest w sekcji ${rel.kind === 'view' ? 'Tables' : 'Views'}`);
    continue;
  }
  if (!cols) {
    drift.push(`${rel.name}: relacja jest w bazie, nie ma jej w database.types.ts`);
    continue;
  }
  const db = new Set(rel.columns);
  const missing = rel.columns.filter((c) => !cols.has(c));
  const extra = [...cols].filter((c) => !db.has(c));
  if (missing.length) drift.push(`${rel.name}: kolumny sa w bazie, brakuje ich w typach -> ${missing.join(', ')}`);
  if (extra.length) drift.push(`${rel.name}: typy opisuja kolumny, ktorych w bazie juz nie ma -> ${extra.join(', ')}`);
}

// Relacje opisane w typach, ktorych nie ma w bazie — np. widok usunięty w migracji.
for (const [section, map] of Object.entries(types)) {
  for (const name of map.keys()) {
    if (!schema.some((r) => r.name === name)) {
      drift.push(`${name}: database.types.ts opisuje te relację (sekcja ${section}), a nie ma jej w bazie`);
    }
  }
}

if (!drift.length) {
  console.log(`database.types.ts zgodny z baza (${schema.length} relacji w schemacie public).`);
  process.exit(0);
}

console.log(`Znaleziono ${drift.length} rozbieznosci miedzy baza a src/lib/database.types.ts:\n`);
for (const d of drift) console.log('  - ' + d);

if (emit) {
  console.log('\nSzkielet do wklejenia (typy kolumn uzupelnij recznie aliasami z domain/types):\n');
  for (const rel of schema) {
    if (!drift.some((d) => d.startsWith(rel.name + ':'))) continue;
    console.log(`      ${rel.name}: {`);
    console.log('        Row: {');
    for (const c of rel.columns) console.log(`          ${c}: string; // TODO typ`);
    console.log('        };');
    console.log('        Relationships: [];');
    console.log('      };');
  }
}

process.exit(1);
