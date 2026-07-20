// Client Supabase: DB, auth e storage. URL e anon key da variabili d'ambiente.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const supabase = createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // In React Native non c'è URL di redirect da parsare.
    detectSessionInUrl: false,
  },
});
