import { demoApi } from './demo/repository';
import { env } from '@/lib/env';
import type { ClubApi } from './api';

/**
 * Wybór implementacji na starcie aplikacji.
 *
 * `supabase/repository` ładowany jest leniwie: jego moduł tworzy klient Supabasa
 * z URL-em z otoczenia, a w trybie demo klucz pusty — ładowanie go zawsze
 * kończyłoby się wyjątkiem na starcie aplikacji.
 */
function resolveApi(): ClubApi {
  if (env.mode !== 'supabase') return demoApi;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { supabaseApi } = require('./supabase/repository') as typeof import('./supabase/repository');
  return supabaseApi;
}

export const api: ClubApi = resolveApi();

export type { ClubApi } from './api';
