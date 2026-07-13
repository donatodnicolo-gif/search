import { StyleSheet, Text, View } from 'react-native';
import type { Priorita } from '@/types';
import { colors, coloreProprita, radius } from '@/lib/theme';

export function PriorityBadge({ priorita, small }: { priorita: Priorita; small?: boolean }) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: coloreProprita[priorita] },
        small && styles.small,
      ]}
    >
      <Text style={[styles.txt, small && styles.txtSmall]}>{priorita}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  txt: { color: colors.bianco, fontWeight: '800', fontSize: 13 },
  txtSmall: { fontSize: 11 },
});
