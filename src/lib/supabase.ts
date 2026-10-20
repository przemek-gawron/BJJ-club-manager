import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Singleton Supabase client.
 * Persistencja sesji przez AsyncStorage (open universal), zeby user zostal zalogowany po restarcie aplikacji.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
