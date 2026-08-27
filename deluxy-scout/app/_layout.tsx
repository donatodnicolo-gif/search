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
import { DialoghiHost } from '@/lib/dialoghi';
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
        {/* Gli header dell'app sono BIANCHI (headerStyle: colors.bianco in
            (app)/_layout) e le schermate hanno sfondo chiaro: la barra di stato
            va SCURA, o su iOS ora/batteria restano invisibili (Libro UX cap.10 §8,
            bug osservato 28/08/2026). `backgroundColor` vale solo su Android. */}
        <StatusBar style="dark" backgroundColor={colors.bianco} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
        {/* Avvisi e conferme in stile DS (sul web): vedi lib/dialoghi. */}
        <DialoghiHost />
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
