// Badge priorità in stile DS (pillola con dot + tinta 10%).
// La sigla P1/P2/P3 è affiancata dall'etichetta leggibile ("Alta"…);
// nella variante small resta solo la sigla, il colore fa da guida.
// Dal 07/09/2026 accetta anche P0 (le trattative): stesso vestito, un colore
// in più — il rosso dell'urgenza, che sui negozi e sui task non esiste.
import { StyleSheet, Text, View } from 'react-native';
import type { Priorita, PrioritaDeal } from '@/types';
import { coloreProprita, labelPriorita, radius } from '@/lib/theme';
import { tinta } from '@/components/ui';

export function PriorityBadge({ priorita, small }: { priorita: Priorita | PrioritaDeal; small?: boolean }) {
  const colore = coloreProprita[priorita];
  return (
    <View
      style={[styles.badge, { backgroundColor: tinta(colore) }, small && styles.small]}
      accessibilityLabel={`Priorità ${priorita} · ${labelPriorita[priorita]}`}
      {...({ title: `Priorità ${labelPriorita[priorita].toLowerCase()}` } as any)}
    >
      <View style={[styles.dot, { backgroundColor: colore }]} />
      <Text style={[styles.txt, { color: colore }, small && styles.txtSmall]}>
        {small ? priorita : `${priorita} · ${labelPriorita[priorita]}`}
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
