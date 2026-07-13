import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * Box "Ipotesi di interesse": linea ipotizzata + aggancio di apertura.
 * In evidenza nella Scheda attività e in cima alla Nuova visita.
 */
export function BoxIpotesi({
  linea,
  aggancio,
}: {
  linea: string | null | undefined;
  aggancio: string | null | undefined;
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.label}>IPOTESI DI INTERESSE</Text>
      <Text style={styles.linea}>{linea ?? 'Da qualificare in visita'}</Text>
      {aggancio ? <Text style={styles.aggancio}>{aggancio}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.oro,
  },
  label: {
    color: colors.oro,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  linea: { color: colors.bianco, fontSize: 18, fontWeight: '700' },
  aggancio: { color: '#D8DCE6', fontSize: 14, marginTop: 4, lineHeight: 20 },
});
