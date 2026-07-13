import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EsitoVisita } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';

const OPZIONI: { key: EsitoVisita; label: string; colore: string }[] = [
  { key: 'interessato', label: 'Interessato', colore: colors.successo },
  { key: 'da_richiamare', label: 'Da richiamare', colore: colors.attenzione },
  { key: 'non_target', label: 'Non target', colore: colors.grigio },
  { key: 'chiuso', label: 'Chiuso', colore: colors.oro },
];

/** Selettore esito a bottoni grandi (uso con una mano). */
export function EsitoButtons({
  value,
  onChange,
}: {
  value: EsitoVisita | null;
  onChange: (e: EsitoVisita) => void;
}) {
  return (
    <View style={styles.grid}>
      {OPZIONI.map((o) => {
        const attivo = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[
              styles.btn,
              { borderColor: o.colore },
              attivo && { backgroundColor: o.colore },
            ]}
          >
            <Text style={[styles.txt, attivo ? styles.txtOn : { color: o.colore }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  btn: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  txt: { fontSize: 16, fontWeight: '800' },
  txtOn: { color: colors.bianco },
});
