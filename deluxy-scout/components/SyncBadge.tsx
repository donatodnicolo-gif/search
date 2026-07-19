import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { tinta } from '@/components/ui';

/** Badge "da sincronizzare" in stile DS (dot + tinta) con il numero di visite in coda. */
export function SyncBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <View style={styles.dot} />
      <Text style={styles.txt}>
        {count === 1 ? '1 visita da sincronizzare' : `${count} visite da sincronizzare`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tinta(colors.attenzione),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.attenzione },
  txt: { color: colors.attenzione, fontWeight: '600', fontSize: 13 },
});
