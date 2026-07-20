// Badge priorità in stile DS (pillola con dot + tinta 10%).
// La sigla P1/P2/P3 è affiancata dall'etichetta leggibile ("Alta"…);
// nella variante small resta solo la sigla, il colore fa da guida.
import { StyleSheet, Text, View } from 'react-native';
import type { Priorita } from '@/types';
import { coloreProprita, radius } from '@/lib/theme';
import { tinta } from '@/components/ui';

const LABEL: Record<Priorita, string> = { P1: 'Alta', P2: 'Media', P3: 'Bassa' };

export function PriorityBadge({ priorita, small }: { priorita: Priorita; small?: boolean }) {
  const colore = coloreProprita[priorita];
  return (
    <View style={[styles.badge, { backgroundColor: tinta(colore) }, small && styles.small]}>
      <View style={[styles.dot, { backgroundColor: colore }]} />
      <Text style={[styles.txt, { color: colore }, small && styles.txtSmall]}>
        {small ? priorita : `${priorita} · ${LABEL[priorita]}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  txt: { fontWeight: '700', fontSize: 12 },
  txtSmall: { fontSize: 11 },
});
