// Selettore di periodo condiviso: chip (Oggi/Ieri/7gg/30gg/Personalizzato) e,
// per "Personalizzato", due campi data Da–A. I campi sono CampoData: sul web
// aprono il calendario vero del browser invece di chiedere «AAAA-MM-GG» a mano.
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';
import { CampoData } from '@/components/CampoData';
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
            <CampoData valore={periodo.da ?? null} onCambia={(v) => onChange({ ...periodo, da: v ?? undefined })} placeholder="inizio" />
          </View>
          <View style={styles.campo}>
            <Text style={styles.campoLbl}>A</Text>
            <CampoData valore={periodo.a ?? null} onCambia={(v) => onChange({ ...periodo, a: v ?? undefined })} placeholder="fine" />
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
});
