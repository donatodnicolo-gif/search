// Selettore MULTIPLO della "tipologia di interesse" = linee Deluxy del negozio.
// Un negozio può interessare più linee. Mostra le linee ATTIVE (regola #2).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LINEE_ATTIVE } from '@/types';
import { colors, radius } from '@/lib/theme';

export function LineaSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (linee: string[]) => void;
}) {
  function toggle(l: string) {
    onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]);
  }
  return (
    <View style={styles.wrap}>
      {LINEE_ATTIVE.map((l) => {
        const on = value.includes(l);
        return (
          <Pressable key={l} onPress={() => toggle(l)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.txt, on && styles.txtOn]}>
              {on ? '✓ ' : ''}
              {l}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.oro, borderColor: colors.oro },
  txt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  txtOn: { color: colors.bianco, fontWeight: '800' },
});
