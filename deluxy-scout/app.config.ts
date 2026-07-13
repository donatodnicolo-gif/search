import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Configurazione Expo.
 * I segreti NON stanno qui: vengono letti da variabili d'ambiente (.env in locale,
 * variabili EAS in build) ed esposti a runtime tramite `extra`.
 *
 * Nota di sicurezza: qualunque valore messo in `extra` finisce nel bundle
 * dell'app ed è leggibile sul dispositivo. Per questo la anon key di Supabase
 * (pensata per essere pubblica, protetta da RLS) sta qui, mentre il token
 * HubSpot NON viene mai messo in `extra`: vive solo lato server, dentro la
 * Supabase Edge Function `hubspot-sync`. Vedi README.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Deluxy Scout',
  slug: 'deluxy-scout',
  owner: 'deluxyoff',
  scheme: 'deluxyscout',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    backgroundColor: '#1B2A4A',
    resizeMode: 'contain',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'it.deluxy.scout',
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Deluxy Scout usa la tua posizione per mostrare le attività vicine e registrare il check-in delle visite.',
      NSCameraUsageDescription:
        'Deluxy Scout usa la fotocamera per allegare la foto della vetrina alla visita.',
      NSPhotoLibraryUsageDescription:
        'Deluxy Scout accede alle foto per allegare immagini alla visita.',
    },
  },
  android: {
    package: 'it.deluxy.scout',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1B2A4A',
    },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
    ],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
  plugins: [
    'expo-router',
    'expo-location',
    'expo-image-picker',
    'expo-notifications',
    // Allinea Kotlin al Compose Compiler richiesto da expo-modules-core (fix build SDK 52).
    ['expo-build-properties', { android: { kotlinVersion: '1.9.25' } }],
  ],
  experiments: {
    typedRoutes: true,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    // Valori pubblici (protetti da RLS lato Supabase). Sicuri nel bundle.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Solo per sapere a runtime se la mappa è configurata (la chiave vera è nativa).
    hasGoogleMaps: Boolean(
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
    ),
    // Endpoint della Edge Function che fa da proxy verso HubSpot.
    // Il TOKEN HubSpot NON è qui: sta come secret della Edge Function.
    hubspotSyncUrl: process.env.EXPO_PUBLIC_HUBSPOT_SYNC_URL,
    eas: {
      projectId: '81ab09df-c772-4c2b-b860-c590df0ec789',
    },
  },
});
