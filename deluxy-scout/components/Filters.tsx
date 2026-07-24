import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { StatoPlace } from '@/types';
import { colors, labelStato, radius, spacing } from '@/lib/theme';
import { OPZIONI_CITTA } from '@/lib/citta';

export interface FiltriMappa {
  zona: string | null; // ora è un bucket città: Milano/Roma/Firenze/Altre (null = Tutte)
  priorita: string | null;
  settore: string | null;
  linea: string | null;
  stato: string | null;
  account: string | null; // solo admin: venditore che segue (anagrafiche_account)
  creatore: string | null; // solo admin: chi ha inserito il target (creato_da_nome)
}

export const FILTRI_VUOTI: FiltriMappa = {
  zona: null,
  priorita: null,
  settore: null,
  linea: null,
  stato: null,
  account: null,
  creatore: null,
};

interface Props {
  filtri: FiltriMappa;
  opzioni: { zone: string[]; settori: string[]; linee: string[]; account?: string[]; creatori?: string[] };
  onChange: (f: FiltriMappa) => void;
  admin?: boolean; // mostra i filtri per utente (account, creatore)
  citta?: boolean; // false = nasconde il filtro Città (sulla Mappa è ridondante: hai già cercato l'indirizzo)
}

const PRIORITA = ['P1', 'P2', 'P3'];
const STATI = ['da_visitare', 'visitato', 'cliente', 'perso'];

// Etichette leggibili nei chip (mai valori tecnici con underscore o sigle nude).
const LABEL_PRIORITA: Record<string, string> = { P1: 'P1 · Alta', P2: 'P2 · Media', P3: 'P3 · Bassa' };
const labelChipStato = (v: string) => labelStato[v as StatoPlace] ?? v;

/** Barra filtri orizzontale in cima alla mappa/lista. */
export function Filters({ filtri, opzioni, onChange, admin, citta = true }: Props) {
  function toggle(key: keyof FiltriMappa, val: string) {
    onChange({ ...filtri, [key]: filtri[key] === val ? null : val });
  }
  // Città: "Tutte" azzera il filtro; gli altri impostano il bucket.
  function scegliCitta(v: string) {
    onChange({ ...filtri, zona: v === 'Tutte' ? null : filtri.zona === v ? null : v });
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Gruppo
        titolo="Priorità"
        valori={PRIORITA}
        attivo={filtri.priorita}
        onTap={(v) => toggle('priorita', v)}
        label={(v) => LABEL_PRIORITA[v] ?? v}
      />
      <Gruppo
        titolo="Stato"
        valori={STATI}
        attivo={filtri.stato}
        onTap={(v) => toggle('stato', v)}
        label={labelChipStato}
      />
      {citta ? (
        <Gruppo
          titolo="Città"
          valori={OPZIONI_CITTA as unknown as string[]}
          attivo={filtri.zona ?? 'Tutte'}
          onTap={scegliCitta}
        />
      ) : null}
      <Gruppo titolo="Settore" valori={opzioni.settori} attivo={filtri.settore} onTap={(v) => toggle('settore', v)} />
      {/* Tipologia di interesse: "Tutti" come prima opzione, uniforme in tutta l'app. */}
      <Gruppo
        titolo="Interessi"
        valori={['Tutti', ...opzioni.linee]}
        attivo={filtri.linea ?? 'Tutti'}
        onTap={(v) => onChange({ ...filtri, linea: v === 'Tutti' ? null : filtri.linea === v ? null : v })}
      />
      {admin ? (
        <>
          <Gruppo titolo="Account" valori={opzioni.account ?? []} attivo={filtri.account} onTap={(v) => toggle('account', v)} />
          <Gruppo titolo="Inserito da" valori={opzioni.creatori ?? []} attivo={filtri.creatore} onTap={(v) => toggle('creatore', v)} />
        </>
      ) : null}
    </ScrollView>
  );
}

function Gruppo({
  titolo,
  valori,
  attivo,
  onTap,
  label,
}: {
  titolo: string;
  valori: string[];
  attivo: string | null;
  onTap: (v: string) => void;
  label?: (v: string) => string;
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
                {label ? label(v) : v}
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
