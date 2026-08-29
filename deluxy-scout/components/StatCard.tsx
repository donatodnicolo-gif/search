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
      <Text style={[styles.label, accent && styles.labelAccent]}>{label}</Text>
      {sub ? <Text style={[styles.sub, accent && styles.labelAccent]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    padding: spacing.lg,
    flexGrow: 1,
    flexBasis: '47%',
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  // Su superficie scura il testo è on-ink (DS): il numero oro era l'accento
  // usato come inchiostro.
  accent: { backgroundColor: colors.ink, borderColor: colors.ink },
  valore: { fontSize: 30, fontWeight: '600', color: colors.navy, letterSpacing: -0.5 },
  valoreAccent: { color: colors.bianco },
  labelAccent: { color: 'rgba(255,255,255,0.72)' },
  label: { fontSize: 13, color: colors.testoSoft, marginTop: 2, fontWeight: '600' },
  sub: { fontSize: 12, color: colors.grigio, marginTop: 4 },
});
