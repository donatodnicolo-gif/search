// Configurazione Metro (Expo default) con due aggiustamenti per il bundle web:
// 1. @supabase/supabase-js importa in modo opzionale @opentelemetry/api (telemetria),
//    che non usiamo e non è installato → lo rimappiamo a un modulo vuoto (tutte le piattaforme).
// 2. react-native-maps è solo-nativo e non bundlabile per il web. La schermata mappa
//    su web usa `mappa.web.tsx` (senza mappa), ma il file `mappa.tsx` viene comunque
//    incluso dal router: su web risolviamo react-native-maps a "empty" così non rompe.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': require.resolve('./stubs/empty.js'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'react-native-maps' || moduleName.startsWith('react-native-maps/'))) {
    return { type: 'empty' };
  }
  // Delega al resolver di default di Metro/Expo.
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
