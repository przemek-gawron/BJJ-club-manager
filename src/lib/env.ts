import Constants from 'expo-constants';

/**
 * Konfiguracja runtime aplikacji.
 *
 * EXPO_PUBLIC_* sa inlinowane przez Metro w build time. Tryb `demo` laduje dane z in-memory
 * repozytorium, dzieki czemu caly UI i logike domeny da sie uruchomic bez pelnego backendu.
 */
export type ApiMode = 'supabase' | 'demo';

interface ParsedEnv {
  mode: ApiMode;
  supabaseUrl: string;
  supabaseAnonKey: string;
  checkInToken: string;
}

const RAW_TOKEN = 'club-demo-2026';

function read(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parse(): ParsedEnv {
  const url = read('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = read('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const forced = read('EXPO_PUBLIC_API_MODE');

  const mode: ApiMode = forced === 'supabase' || forced === 'demo' ? forced : url && anonKey ? 'supabase' : 'demo';

  return {
    mode,
    supabaseUrl: url ?? '',
    supabaseAnonKey: anonKey ?? '',
    // Nazwa z .env może być w krótszej lub dłuższej formie — wspieramy obie.
    checkInToken: read('EXPO_PUBLIC_CHECKIN_TOKEN') ?? read('EXPO_PUBLIC_CLUB_CHECKIN_TOKEN') ?? RAW_TOKEN,
  };
}

export const env: ParsedEnv = parse();

export const isDemoMode = env.mode === 'demo';

/** Token odczytywany z kodu QR wiszącego przy drzwiach klubu. */
export const CLUB_CHECKIN_TOKEN = env.checkInToken;

/** Ids aplikacji — przydatne w logach i przy debugowaniu na urzadzeniu. */
export const APP_NAME = (Constants.expoConfig?.name as string | undefined) ?? 'BJJ Club Manager';

if (env.mode === 'supabase' && (!env.supabaseUrl || !env.supabaseAnonKey)) {
  // Zabezpieczenie przed polowa skonfigurowanym srodowiskiem — latwiej zobaczyc blad niz dziwic sie 401.
  throw new Error('EXPO_PUBLIC_SUPABASE_URL oraz EXPO_PUBLIC_SUPABASE_ANON_KEY sa wymagane, gdy EXPO_PUBLIC_API_MODE=supabase.');
}
