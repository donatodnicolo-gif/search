import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EsitoVisita } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * ⚠️ L'esito **cambia lo stato del negozio** (`statoDaEsito` in @/types), e
 * finora i bottoni non lo dicevano: «Non target» lo chiudeva come **Perso** —
 * fuori da tutte le liste di lavoro — e «Chiuso» lo promuoveva a **Cliente**.
 * Due conseguenze grosse dietro due parole che sembrano solo un appunto.
 * Segnalato dall'utente due volte («perché è diventato perso?», 29/07/2026).
 * La conseguenza ora sta scritta sul bottone.
 */
const OPZIONI: { key: EsitoVisita; label: string; effetto: string; colore: string }[] = [
  { key: 'interessato', label: 'Interessato', effetto: 'resta da lavorare', colore: colors.successo },
  { key: 'da_richiamare', label: 'Da richiamare', effetto: 'resta da lavorare', colore: colors.attenzione },
  { key: 'non_target', label: 'Non target', effetto: 'lo chiude come PERSO', colore: colors.grigio },
  { key: 'chiuso', label: 'Chiuso', effetto: 'lo porta a CLIENTE', colore: colors.oro },
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
            <Text style={[styles.effetto, attivo ? styles.effettoOn : { color: o.colore }]} numberOfLines={2}>
              {o.effetto}
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
  txt: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  txtOn: { color: colors.bianco },
  effetto: { fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center', opacity: 0.85 },
  effettoOn: { color: colors.bianco },
});
