import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';
import type { Database } from '@/lib/database.types';

type Client = SupabaseClient<Database>;

let client: Client | null = null;

/**
 * Leniwy singleton Supabase.
 *
 * Leniwy, bo w trybie demo klucz jest pusty, a `createClient` rzuca na starcie —
 * dzięki temu sam import modułu repozytorium nie wywala aplikacji.
 * Persistencja sesji przez AsyncStorage utrzymuje zalogowanie po restarcie.
 */
export function getSupabase(): Client {
  if (client) return client;
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Brak EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — ustaw EXPO_PUBLIC_API_MODE=demo albo uzupełnij .env');
  }
  client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
