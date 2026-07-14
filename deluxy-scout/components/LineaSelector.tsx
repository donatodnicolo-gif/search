// Selettore della "tipologia di interesse" = linea Deluxy del negozio.
// Mostra le linee ATTIVE (le standby non sono ipotesi primaria, regola #2).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LINEE_ATTIVE } from '@/types';
import { colors, radius } from '@/lib/theme';

export function LineaSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (linea: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      {LINEE_ATTIVE.map((l) => {
        const on = value === l;
        return (
          <Pressable key={l} onPress={() => onChange(l)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.txt, on && styles.txtOn]}>{l}</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.oro, borderColor: colors.oro },
  txt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  txtOn: { color: colors.navy, fontWeight: '800' },
});
