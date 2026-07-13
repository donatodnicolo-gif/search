import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/lib/theme';

/** Badge "da sincronizzare" con il numero di visite in coda. */
export function SyncBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.txt}>
        {count} da sincronizzare
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.attenzione,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: 'center',
  },
  txt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
});
