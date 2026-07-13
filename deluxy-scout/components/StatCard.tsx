import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

export function StatCard({
  label,
  valore,
  sub,
  accent,
}: {
  label: string;
  valore: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.card, accent && styles.accent]}>
      <Text style={[styles.valore, accent && styles.valoreAccent]}>{valore}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    flexGrow: 1,
    flexBasis: '47%',
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  accent: { backgroundColor: colors.navy, borderColor: colors.navy },
  valore: { fontSize: 30, fontWeight: '900', color: colors.navy },
  valoreAccent: { color: colors.oro },
  label: { fontSize: 13, color: colors.testoSoft, marginTop: 2, fontWeight: '600' },
  sub: { fontSize: 12, color: colors.grigio, marginTop: 4 },
});
