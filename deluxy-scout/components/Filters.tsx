import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

export interface FiltriMappa {
  zona: string | null;
  priorita: string | null;
  settore: string | null;
  linea: string | null;
  stato: string | null;
}

export const FILTRI_VUOTI: FiltriMappa = {
  zona: null,
  priorita: null,
  settore: null,
  linea: null,
  stato: null,
};

interface Props {
  filtri: FiltriMappa;
  opzioni: { zone: string[]; settori: string[]; linee: string[] };
  onChange: (f: FiltriMappa) => void;
}

const PRIORITA = ['P1', 'P2', 'P3'];
const STATI = ['da_visitare', 'visitato', 'cliente', 'perso'];

/** Barra filtri orizzontale in cima alla mappa/lista. */
export function Filters({ filtri, opzioni, onChange }: Props) {
  function toggle(key: keyof FiltriMappa, val: string) {
    onChange({ ...filtri, [key]: filtri[key] === val ? null : val });
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Gruppo titolo="Priorità" valori={PRIORITA} attivo={filtri.priorita} onTap={(v) => toggle('priorita', v)} />
      <Gruppo titolo="Stato" valori={STATI} attivo={filtri.stato} onTap={(v) => toggle('stato', v)} />
      <Gruppo titolo="Zona" valori={opzioni.zone} attivo={filtri.zona} onTap={(v) => toggle('zona', v)} />
      <Gruppo titolo="Settore" valori={opzioni.settori} attivo={filtri.settore} onTap={(v) => toggle('settore', v)} />
      <Gruppo titolo="Linea" valori={opzioni.linee} attivo={filtri.linea} onTap={(v) => toggle('linea', v)} />
    </ScrollView>
  );
}

function Gruppo({
  titolo,
  valori,
  attivo,
  onTap,
}: {
  titolo: string;
  valori: string[];
  attivo: string | null;
  onTap: (v: string) => void;
}) {
  if (valori.length === 0) return null;
  return (
    <View style={styles.gruppo}>
      <Text style={styles.gruppoTitolo}>{titolo}</Text>
      <View style={styles.chips}>
        {valori.map((v) => {
          const on = attivo === v;
          return (
            <TouchableOpacity key={v} onPress={() => onTap(v)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>
                {v}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  gruppo: { marginRight: spacing.md },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    backgroundColor: colors.bianco,
    borderColor: colors.grigioChiaro,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
});
