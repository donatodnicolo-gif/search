// Accesso centralizzato e tipizzato alle variabili di configurazione (da app.config.ts → extra).
import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  hubspotSyncUrl?: string;
  hasGoogleMaps?: boolean;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Config mancante: ${name}. Controlla il file .env (vedi .env.example) e riavvia con "expo start -c".`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => required(extra.supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required(extra.supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  // Può essere assente: la sync HubSpot è opzionale e degrada senza rompere l'app.
  hubspotSyncUrl: (): string | null => extra.hubspotSyncUrl ?? null,
  // True se sono configurate le chiavi Google Maps (altrimenti la mappa mostra un segnaposto).
  hasGoogleMaps: (): boolean => Boolean(extra.hasGoogleMaps),
};
