// Riga espandibile "Registro Anagrafiche": mostra on-demand i dati LIVE del
// registro (via AnagraficaRegistroCard compatta). Self-contained (stato proprio),
// e ferma la propagazione così, dentro una card cliccabile, il toggle non
// scatena la navigazione della card.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { AnagraficaRegistroCard } from '@/components/AnagraficaRegistroCard';

export function RegistroExpandable({ nome, citta }: { nome: string; citta?: string | null }) {
  const [apri, setApri] = useState(false);
  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.toggle}
        hitSlop={6}
        onPress={(e) => {
          (e as any)?.stopPropagation?.();
          setApri((v) => !v);
        }}
      >
        <Ionicons name="library-outline" size={15} color={colors.oro} />
        <Text style={styles.txt}>Registro Anagrafiche</Text>
        <Ionicons name={apri ? 'chevron-up' : 'chevron-down'} size={15} color={colors.grigio} />
      </Pressable>
      {apri ? <AnagraficaRegistroCard nome={nome} citta={citta} compatta /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txt: { flex: 1, color: colors.navy, fontWeight: '600', fontSize: 13 },
});
