// La TABELLA generica degli elenchi su schermo largo (DS §Tabelle).
//
// Nasce dalla richiesta utente del 25/08/2026: «al posto di schede così ci
// siano tabelle per una visualizzazione ottimale desktop, le schede solo su
// mobile». La prima era TabellaTrattative, scritta a mano; alla seconda
// schermata il copione si ripeteva uguale — intestazioni 12px ordinabili,
// hover leggero, «—» nelle celle vuote, numeri a destra con tabular-nums —
// e dieci copie divergono al primo ritocco. Qui sta la FORMA, una volta;
// le colonne le dichiara la schermata.
//
// Il confine largo/stretto NON si decide qui: la schermata sceglie (di regola
// `useWindowDimensions().width >= 900`, lo stesso confine del drawer) e sotto
// tiene le sue schede. La tabella non ha una versione mobile: sotto i 900px
// semplicemente non si monta.
import { ReactNode, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import { frecciaOrdine, ordinaRighe, useOrdinamento, type Ordine } from '@/lib/ordinamento';

export interface ColonnaTabella<T> {
  /** Identifica la colonna per l'ordinamento. */
  chiave: string;
  label: string;
  /** Larghezza: o flessibile (`flex`) o fissa (`width`). Default flex: 1. */
  flex?: number;
  width?: number;
  /** Sotto questa larghezza una colonna elastica non scende MAI (default 90):
   *  vedi il commento su `stileCol` — la colonna da 14px con le lettere in
   *  verticale non deve ripetersi. */
  minWidth?: number;
  /** Allineata a destra (numeri, date, importi). */
  destra?: boolean;
  /** Ordinamento di partenza decrescente (colonne di numeri/date). */
  numerica?: boolean;
  /** Colonna non ordinabile (es. una colonna di soli badge eterogenei). */
  fissa?: boolean;
  /** Il valore su cui si ordina — e, senza `cella`, quello che si mostra. */
  valore: (r: T) => unknown;
  /** Render della cella quando il testo semplice non basta (badge, due righe…). */
  cella?: (r: T) => ReactNode;
  /** numberOfLines del testo di default (1 se non detto). */
  righe?: number;
}

/**
 * @param azioni  Cerchietti in fondo alla riga (AzioniRiga/IconaAzione): non è
 *                una colonna ordinabile, e i suoi press NON aprono la riga —
 *                IconaAzione ferma già l'evento da sé.
 * @param labelRiga  Cosa fa il tap sulla riga, per il lettore di schermo.
 */
export function Tabella<T>({
  righe,
  colonne,
  chiaveRiga,
  ordineIniziale,
  onRiga,
  labelRiga,
  azioni,
  larghezzaAzioni,
  totali,
}: {
  righe: T[];
  colonne: ColonnaTabella<T>[];
  chiaveRiga: (r: T) => string;
  ordineIniziale: Ordine<string>;
  onRiga?: (r: T) => void;
  labelRiga?: (r: T) => string;
  azioni?: (r: T) => ReactNode;
  /** Larghezza riservata alla colonna azioni (default: si adatta al contenuto). */
  larghezzaAzioni?: number;
  /**
   * I TOTALI in fondo, incolonnati sotto le loro colonne (26/08/2026).
   *
   * Riceve le righe **mostrate** (già filtrate) e torna, per chiave di colonna,
   * il testo da scrivere in fondo. ⚠️ Le righe sono quelle a schermo: un totale
   * che somma anche ciò che il filtro ha tolto direbbe un numero che non
   * corrisponde a niente di visibile.
   */
  totali?: (righe: T[]) => Record<string, string | null | undefined>;
}) {
  const numeriche = useMemo(
    () => colonne.filter((c) => c.numerica).map((c) => c.chiave),
    [colonne],
  );
  const { ordine, ordinaPer } = useOrdinamento<string>(ordineIniziale, numeriche);
  const mappa = useMemo(() => new Map(colonne.map((c) => [c.chiave, c])), [colonne]);
  const ordinate = useMemo(
    () => ordinaRighe(righe, ordine, (r, c) => mappa.get(c)?.valore(r) ?? null),
    [righe, ordine, mappa],
  );

  // ⚠️ minWidth 90, NON 0 (28/08/2026, segnalazione utente con screenshot):
  // con minWidth 0 la colonna elastica paga da sola ogni pixel che le fisse
  // si prendono in più — su Ordini «Cliente» era scesa a ~14px e il testo
  // scendeva in VERTICALE, una lettera per riga. Sotto i 90px una colonna di
  // nomi non è più una colonna: meglio che le fisse sforino (le soglie della
  // schermata le nascondono comunque) che un elenco illeggibile in silenzio.
  const stileCol = (c: ColonnaTabella<T>) =>
    c.width !== undefined
      ? { width: c.width, ...(c.destra ? stiliDestra : null) }
      : { flex: c.flex ?? 1, minWidth: c.minWidth ?? 90, ...(c.destra ? stiliDestra : null) };

  return (
    <View style={styles.card}>
      <View style={[styles.riga, styles.intesta]}>
        {colonne.map((c) => (
          <Pressable
            key={c.chiave}
            style={stileCol(c)}
            disabled={c.fissa}
            onPress={() => ordinaPer(c.chiave)}
            // ⚠️ Il passaggio del mouse SPIEGA (28/08/2026, richiesta
            // dell'utente): un'intestazione cliccabile che non dice cosa fa
            // si scopre solo cliccandola per sbaglio.
            {...({ title: c.fissa ? undefined : `Ordina per ${c.label}` } as any)}
          >
            <Text style={[styles.th, c.destra && styles.thDestra, ordine.campo === c.chiave && styles.thOn]}>
              {c.label}
              {c.fissa ? '' : frecciaOrdine(ordine, c.chiave)}
            </Text>
          </Pressable>
        ))}
        {azioni ? <View style={larghezzaAzioni ? { width: larghezzaAzioni } : null} /> : null}
        {onRiga ? <View style={{ width: 16 }} /> : null}
      </View>
      {ordinate.map((r) => (
        <Pressable
          key={chiaveRiga(r)}
          style={({ hovered }: any) => [styles.riga, hovered && onRiga && styles.rigaHover]}
          onPress={onRiga ? () => onRiga(r) : undefined}
          {...({ title: onRiga && labelRiga ? labelRiga(r) : undefined } as any)}
          disabled={!onRiga}
          accessibilityRole={onRiga ? 'button' : undefined}
          accessibilityLabel={onRiga ? labelRiga?.(r) : undefined}
        >
          {colonne.map((c) => {
            if (c.cella) {
              return (
                <View key={c.chiave} style={stileCol(c)}>
                  {c.cella(r)}
                </View>
              );
            }
            const v = c.valore(r);
            const testo = v === null || v === undefined || v === '' ? '—' : String(v);
            return (
              <Text
                key={c.chiave}
                style={[styles.cella, c.destra && styles.cellaDestra, stileCol(c)]}
                numberOfLines={c.righe ?? 1}
              >
                {testo}
              </Text>
            );
          })}
          {azioni ? (
            <View style={[styles.azioni, larghezzaAzioni ? { width: larghezzaAzioni } : null]}>
              {azioni(r)}
            </View>
          ) : null}
          {onRiga ? <Ionicons name="chevron-forward" size={15} color={colors.grigio} /> : null}
        </Pressable>
      ))}
      {/* I totali: stessa griglia delle righe — stessi `stileCol`, stessi
          spazi finali — o finirebbero sotto la colonna sbagliata, che è il
          modo più veloce di far leggere un numero per un altro. */}
      {totali && ordinate.length ? (
        <View style={[styles.riga, styles.rigaTotali]}>
          {colonne.map((c) => {
            const v = totali(ordinate)[c.chiave];
            return (
              <Text
                key={c.chiave}
                style={[styles.cella, styles.cellaTotale, c.destra && styles.cellaDestra, stileCol(c)]}
                numberOfLines={1}
              >
                {v ?? ''}
              </Text>
            );
          })}
          {azioni ? <View style={larghezzaAzioni ? { width: larghezzaAzioni } : null} /> : null}
          {onRiga ? <View style={{ width: 16 }} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** gg/mm/aa compatto per le colonne data — «—» quando manca o non è una data. */
export function dataBreve(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Importo in colonna: ⚠️ l'it-IT non raggruppa le 4 cifre senza
 *  useGrouping:'always' — «1500» in una colonna di soldi si legge male. */
export function importoBreve(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `€ ${v.toLocaleString('it-IT', { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions)}`;
}

const stiliDestra = { alignItems: 'flex-end' as const };

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    overflow: 'hidden',
    ...shadow.card,
  },
  // ⚠️ COMPATTA (27/08/2026, richiesta dell'utente sulla tabella Ordini). I
  // margini di prima — 16 di padding, 8 di gap, 10 sopra e sotto — su una
  // tabella da nove colonne si sommavano a 96px di ARIA fra le colonne, cioè
  // spazio tolto ai dati e righe più alte del necessario. Qui si guarda un
  // elenco per confrontarlo: più righe stanno a schermo, meglio si confronta.
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  intesta: { backgroundColor: colors.sfondo, paddingVertical: 8 },
  rigaHover: { backgroundColor: colors.fill },
  th: { color: colors.grigio, fontSize: 12, fontWeight: '500' },
  thDestra: { textAlign: 'right' },
  thOn: { color: colors.testo, fontWeight: '700' },
  cella: { color: colors.testo, fontSize: 13, lineHeight: 17 },
  cellaDestra: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  // La riga dei totali: chiusa da una linea più marcata e senza il bordo
  // sotto, così si legge come la fine dell'elenco e non come un'altra riga.
  rigaTotali: { backgroundColor: colors.sfondo, borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.grigioChiaro },
  cellaTotale: { color: colors.testo, fontWeight: '700', fontSize: 13 },
  azioni: { alignItems: 'flex-end' },
});
