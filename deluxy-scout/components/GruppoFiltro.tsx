// Un gruppo di filtri a **scelta multipla**: pillole che si accendono e si
// spengono da sé, e quelle accese valgono in OR.
//
// Sta in un file solo perché era già scritto tre volte — in Clienti, in
// Filters (Mappa/Lista) e in Rubrica — e le tre copie erano già divergenti
// prima ancora di diventare multiple. Stessa storia di CardElenco e
// AzioniRiga: quando una forma compare per la terza volta, la terza è quella
// che va cancellata.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, touchMin } from '@/lib/theme';
import { RigaChips } from './ui';

export function GruppoFiltro({
  titolo,
  valori,
  attivi,
  onTap,
  onTutti,
  label,
  colore,
  etichettaTutti = 'Tutti',
}: {
  titolo: string;
  valori: string[];
  /** I valori spuntati. Vuoto = filtro spento (si vede tutto). */
  attivi: Set<string> | string[];
  onTap: (v: string) => void;
  /** Svuota il gruppo. */
  onTutti: () => void;
  /** Da valore tecnico a etichetta leggibile (mai underscore o sigle nude). */
  label?: (v: string) => string;
  /** Pallino colorato prima del testo (stati, priorità). */
  colore?: (v: string) => string;
  etichettaTutti?: string;
}) {
  if (valori.length === 0) return null;
  const scelti = attivi instanceof Set ? attivi : new Set(attivi);
  const nessuno = scelti.size === 0;

  return (
    <View style={styles.gruppo}>
      <View style={styles.testa}>
        <Text style={styles.titolo}>{titolo}</Text>
        {/* Quanti ne sono spuntati qui: con le pillole che vanno a capo su più
            righe, il conto a colpo d'occhio serve. */}
        {scelti.size > 0 ? <Text style={styles.conto}>{scelti.size}</Text> : null}
      </View>
      {/* Su mobile la riga scorre in orizzontale (Libro v1.3 §8.9). */}
      <RigaChips style={styles.chips}>
        {/* «Tutti» non è un valore fra gli altri: è il modo di svuotare il
            gruppo. Senza, per tornare a vedere tutto bisognerebbe ricordarsi
            cosa si era spuntato e rispegnerlo una voce per volta. */}
        <Pressable onPress={onTutti} style={[styles.chip, nessuno && styles.chipOn]}>
          <Text style={[styles.chipTxt, nessuno && styles.chipTxtOn]} numberOfLines={1}>
            {etichettaTutti}
          </Text>
        </Pressable>
        {valori.map((v) => {
          const on = scelti.has(v);
          return (
            <Pressable key={v} onPress={() => onTap(v)} style={[styles.chip, on && styles.chipOn]}>
              {/* La spunta dice che la pillola è un interruttore: due accese
                  senza segnale sembrano un difetto, non una scelta multipla. */}
              {on ? (
                <Ionicons name="checkmark" size={13} color={colors.bianco} />
              ) : colore ? (
                <View style={[styles.dot, { backgroundColor: colore(v) }]} />
              ) : null}
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>
                {label ? label(v) : v}
              </Text>
            </Pressable>
          );
        })}
      </RigaChips>
    </View>
  );
}

/** Aggiunge o toglie un valore da un filtro tenuto in un Set. */
export function commutaSet(
  imposta: (f: (precedente: Set<string>) => Set<string>) => void,
  valore: string,
) {
  imposta((prev) => {
    const n = new Set(prev);
    if (n.has(valore)) n.delete(valore);
    else n.add(valore);
    return n;
  });
}

const styles = StyleSheet.create({
  gruppo: { marginBottom: 2 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  titolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700' },
  conto: {
    color: colors.bianco,
    backgroundColor: colors.navy,
    fontSize: 10,
    fontWeight: '700',
    minWidth: 16,
    textAlign: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    // In riga: la spunta (o il pallino) sta accanto al testo.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bianco,
    borderColor: colors.grigioChiaro,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    // Bersaglio touch ≥44px (Libro UX cap.10 §1 / WCAG): prima ~31px.
    minHeight: touchMin,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
