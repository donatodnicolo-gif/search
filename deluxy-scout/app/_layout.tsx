// CSS globale (solo web; no-op su nativo). tokens.css PRIMA: definisce le var(--…)
// del Design System nel DOM; global.css aggiunge il reset moderno (focus, scrollbar…).
import './tokens.css';
import './global.css';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { avviaAutoFlush } from '@/lib/syncQueue';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  useEffect(() => {
    // Appena torna la rete, prova a svuotare la coda offline (Fase 3/4).
    const stop = avviaAutoFlush();
    return stop;
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" backgroundColor={colors.navy} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Loading sobrio (DS: niente spinner giganti): indicatore piccolo + testo.
export function Loader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.sfondo }}>
      <ActivityIndicator size="small" color={colors.testoSoft} />
      <Text style={{ color: colors.testoSoft, fontSize: 14 }}>Caricamento…</Text>
    </View>
  );
}
