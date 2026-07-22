// Selettore di periodo condiviso: chip (Oggi/Ieri/7gg/30gg/Personalizzato) e,
// per "Personalizzato", due campi data Da–A (AAAA-MM-GG).
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';
import { OPZIONI_PERIODO, type Periodo } from '@/lib/periodo';

export function PeriodoSelector({
  periodo,
  onChange,
  titolo = 'Periodo',
}: {
  periodo: Periodo;
  onChange: (p: Periodo) => void;
  titolo?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.titolo}>{titolo}</Text>
      <View style={styles.chips}>
        {OPZIONI_PERIODO.map((o) => {
          const on = periodo.tipo === o.tipo;
          return (
            <Text
              key={o.tipo}
              onPress={() => onChange({ ...periodo, tipo: o.tipo })}
              style={[styles.chip, on && styles.chipOn]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          );
        })}
      </View>
      {periodo.tipo === 'custom' ? (
        <View style={styles.customRow}>
          <View style={styles.campo}>
            <Text style={styles.campoLbl}>Da</Text>
            <TextInput
              style={styles.input}
              value={periodo.da ?? ''}
              onChangeText={(t) => onChange({ ...periodo, da: t })}
              placeholder="AAAA-MM-GG"
              placeholderTextColor={colors.grigio}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.campo}>
            <Text style={styles.campoLbl}>A</Text>
            <TextInput
              style={styles.input}
              value={periodo.a ?? ''}
              onChangeText={(t) => onChange({ ...periodo, a: t })}
              placeholder="AAAA-MM-GG"
              placeholderTextColor={colors.grigio}
              autoCapitalize="none"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  titolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.bianco,
    borderColor: colors.grigioChiaro,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    color: colors.navy,
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy, color: colors.bianco },
  customRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  campo: { flex: 1, gap: 2 },
  campoLbl: { color: colors.grigio, fontSize: 11, fontWeight: '700' },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.testo,
  },
});
