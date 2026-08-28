// La vista a TABELLA delle trattative (schermo largo). DS §Tabelle: dentro una
// card, intestazioni 12px non urlate e ordinabili, hover leggero, numeri a
// destra con tabular-nums, «—» nelle celle vuote. Il confine largo/stretto lo
// decide la schermata: qui si disegna e basta.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { coloreAffiliazione, coloreFase, colors, labelAffiliazione, labelFase, radius, shadow, spacing } from '@/lib/theme';
import { StatusBadge } from '@/components/ui';
import { frecciaOrdine, ordinaRighe, useOrdinamento } from '@/lib/ordinamento';
import type { TrattativaConLuogo } from '@/lib/db';
import type { DealStage, StatoAffiliazione } from '@/types';
import { useMemo } from 'react';

type Colonna = 'negozio' | 'trattativa' | 'linea' | 'fase' | 'valore' | 'aperta' | 'scadenza' | 'azione';

/** gg/mm/aa compatto, sia per date pure («2026-09-01») sia per timestamp. */
function dataBreve(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Oggi in AAAA-MM-GG LOCALE: toISOString è UTC e la sera in Italia sposta al
 *  giorno prima — una scadenza di oggi sembrerebbe scaduta dopo le 22. */
function oggiLocale(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TabellaTrattative({
  righe,
  ordineFasi,
  onApri,
  onNegozio,
  onElimina,
  onRipristina,
  onCancella,
  onOrdine,
}: {
  righe: TrattativaConLuogo[];
  /** L'ordine della pipeline: la colonna Fase si ordina per posizione, non per alfabeto. */
  ordineFasi: readonly DealStage[];
  onApri: (d: TrattativaConLuogo) => void;
  onNegozio: (placeId: string) => void;
  /** Annulla la trattativa (con la domanda: la fa il chiamante). Solo su
   *  quelle nate in Scout: le altre tornerebbero al primo sync. */
  onElimina?: (d: TrattativaConLuogo) => void;
  /** Rimette in gioco una annullata. */
  onRipristina?: (d: TrattativaConLuogo) => void;
  /** La cancella per sempre: solo dalle annullate. */
  onCancella?: (d: TrattativaConLuogo) => void;
  /** La trasforma in ordine (con la domanda: la fa il chiamante). */
  onOrdine?: (d: TrattativaConLuogo) => void;
}) {
  // Default: la più RECENTE in cima (richiesta dell'utente, 26/08/2026).
  // Prima ordinava per valore, e con metà delle trattative senza importo la
  // prima riga era una a caso: chi apre questa pagina vuole vedere l'ultima
  // che ha aperto, non la più cara.
  const { ordine, ordinaPer } = useOrdinamento<Colonna>({ campo: 'aperta', verso: 'desc' }, ['valore', 'fase']);
  const ordinate = useMemo(
    () =>
      ordinaRighe(righe, ordine, (d, c) => {
        if (c === 'negozio') return d.place_nome ?? '';
        if (c === 'trattativa') return d.titolo ?? null;
        if (c === 'linea') return (d.linee?.length ? d.linee.join(', ') : d.linea) ?? null;
        if (c === 'fase') return ordineFasi.indexOf(d.fase);
        if (c === 'valore') return d.valore_atteso;
        if (c === 'aperta') return d.created_at ?? null;
        if (c === 'scadenza') return d.scadenza;
        return d.next_action ?? null;
      }),
    [righe, ordine, ordineFasi],
  );

  return (
    <View style={styles.card}>
      <View style={[styles.riga, styles.intesta]}>
        {([
          { c: 'negozio' as const, label: 'Negozio', stile: styles.colNegozio },
          { c: 'trattativa' as const, label: 'Trattativa', stile: styles.colLinea },
          { c: 'linea' as const, label: 'Linea', stile: styles.colTag },
          { c: 'fase' as const, label: 'Fase', stile: styles.colFase },
          { c: 'valore' as const, label: 'Valore', stile: styles.colDx },
          { c: 'aperta' as const, label: 'Aperta', stile: styles.colData },
          { c: 'scadenza' as const, label: 'Scadenza', stile: styles.colData },
          // ⚠️ , non : la cella sotto ha flex 1.2 e
          // l'intestazione aveva flex 1. Due numeri diversi sulla stessa
          // colonna = titoli spostati rispetto ai valori, e con loro tutto
          // quello che veniva dopo. È il disallineamento che si vedeva.
          { c: 'azione' as const, label: 'Prossima azione', stile: styles.colAzione },
        ]).map((h) => (
          <Pressable key={h.c} style={h.stile} onPress={() => ordinaPer(h.c)}>
            <Text style={[styles.th, ordine.campo === h.c && styles.thOn]}>
              {h.label}
              {frecciaOrdine(ordine, h.c)}
            </Text>
          </Pressable>
        ))}
        {/* Lo stesso spazio della cella delle azioni: se qui e là non
            coincidono, i titoli non stanno sopra le loro colonne. */}
        <View style={styles.colAzioni} />
      </View>
      {ordinate.map((d) => {
        // Titolo e linea sono DUE informazioni: il titolo è come si chiama la
        // trattativa (spesso assente sui deal nati da una visita), la linea è
        // il servizio in gioco. Prima stavano fuse in una colonna sola.
        const titoloTxt = d.titolo ?? '—';
        const lineaTxt = (d.linee?.length ? d.linee.join(', ') : d.linea) ?? '—';
        const daRegistro = d.origine === 'anagrafiche';
        const statoReg = (d.anagrafiche_stato ?? 'in_trattativa') as StatoAffiliazione;
        // Scadenza passata su una trattativa ancora aperta: in rosso.
        const scaduta =
          !!d.scadenza && d.scadenza < oggiLocale() && d.fase !== 'closedwon' && d.fase !== 'closedlost';
        return (
          <Pressable
            key={d.id}
            style={({ hovered }: any) => [styles.riga, hovered && styles.rigaHover]}
            onPress={() => onApri(d)}
            accessibilityRole="button"
            accessibilityLabel={`Apri la trattativa di ${d.place_nome ?? 'negozio'}`}
          >
            {/* Il nome apre la SCHEDA del negozio (nelle schede era il clic sul
                titolo del gruppo); il resto della riga apre la trattativa.
                L'evento interno si ferma, o partirebbero tutti e due. */}
            <Pressable
              style={styles.colNegozio}
              disabled={!d.place_id}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                if (d.place_id) onNegozio(d.place_id);
              }}
            >
              <Text style={styles.negozio} numberOfLines={1}>{d.place_nome ?? '—'}</Text>
              {d.place_account ? <Text style={styles.sotto} numberOfLines={1}>{d.place_account}</Text> : null}
            </Pressable>
            <Text style={styles.cellaLinea} numberOfLines={2}>{titoloTxt}</Text>
            <Text style={styles.cellaTag} numberOfLines={2}>{lineaTxt}</Text>
            <View style={styles.colFase}>
              {daRegistro ? (
                <StatusBadge small label={labelAffiliazione[statoReg] ?? statoReg} colore={coloreAffiliazione[statoReg] ?? colors.grigio} />
              ) : (
                <StatusBadge small label={labelFase[d.fase]} colore={coloreFase[d.fase]} />
              )}
            </View>
            <Text style={styles.cellaValore}>
              {/* ⚠️ L'it-IT non raggruppa le 4 cifre senza useGrouping:'always':
                  «1500» in una colonna di importi si legge male. */}
              {d.valore_atteso
                ? `€ ${d.valore_atteso.toLocaleString('it-IT', { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions)}`
                : '—'}
            </Text>
            <Text style={styles.cellaData}>{dataBreve(d.created_at)}</Text>
            <Text style={[styles.cellaData, scaduta && styles.cellaScaduta]}>{dataBreve(d.scadenza)}</Text>
            <Text style={styles.cellaAzione} numberOfLines={2}>{d.next_action || '—'}</Text>
            {/* ⚠️ LE AZIONI IN UNA CELLA A LARGHEZZA FISSA (26/08/2026).
                Prima erano icone sciolte in fondo alla riga: ognuna aggiungeva
                larghezza che l'INTESTAZIONE non aveva, e bastava una riga con
                un'icona in più (quella dell'ordine) perché le colonne si
                spostassero rispetto ai titoli. Righe diverse, allineamenti
                diversi. Ora la cella c'è sempre e misura quanto lo spazio
                lasciato in testa, piena o vuota che sia. */}
            <View style={styles.colAzioni}>
            {/* TRASFORMA IN ORDINE: solo su una trattativa viva e con un valore
                — senza importo non c'è un ordine da fare. */}
            {onOrdine && !d.annullata_il && d.fase !== 'closedlost' && d.valore_atteso ? (
              <Pressable
                style={styles.iconaAzione}
                hitSlop={8}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onOrdine(d);
                }}
                accessibilityLabel={`Trasforma in ordine la trattativa di ${d.place_nome ?? 'negozio'}`}
                {...({ title: 'Trasforma in ordine' } as any)}
              >
                <Ionicons name="receipt-outline" size={19} color={colors.navy} />
              </Pressable>
            ) : null}
            {/* Il cestino sulla riga: eliminare si poteva già, ma solo aprendo
                la scheda e scorrendo in fondo — e un comando fuori dalla prima
                schermata è un comando che non si trova. Solo sulle trattative
                di Scout: HubSpot e registro tornerebbero al primo sync. */}
            {d.annullata_il && d.origine !== 'hubspot' && d.origine !== 'anagrafiche' ? (
              <>
                {onRipristina ? (
                  <Pressable
                    style={styles.iconaAzione}
                    hitSlop={8}
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      onRipristina(d);
                    }}
                    accessibilityLabel={`Rimetti in gioco la trattativa di ${d.place_nome ?? 'negozio'}`}
                    {...({ title: 'Rimettila in gioco' } as any)}
                  >
                    <Ionicons name="arrow-undo-outline" size={19} color={colors.navy} />
                  </Pressable>
                ) : null}
                {onCancella ? (
                  <Pressable
                    style={styles.iconaAzione}
                    hitSlop={8}
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      onCancella(d);
                    }}
                    accessibilityLabel={`Cancella per sempre la trattativa di ${d.place_nome ?? 'negozio'}`}
                    {...({ title: 'Cancella per sempre' } as any)}
                  >
                    <Ionicons name="close-circle-outline" size={15} color={colors.errore} />
                  </Pressable>
                ) : null}
              </>
            ) : onElimina && d.origine !== 'hubspot' && d.origine !== 'anagrafiche' ? (
              <Pressable
                style={styles.iconaAzione}
                hitSlop={8}
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  onElimina(d);
                }}
                accessibilityLabel={`Annulla la trattativa di ${d.place_nome ?? "negozio"}`}
                {...({ title: 'Elimina la trattativa' } as any)}
              >
                <Ionicons name="trash-outline" size={19} color={colors.errore} />
              </Pressable>
            ) : null}
            <Ionicons name="chevron-forward" size={15} color={colors.grigio} />
            </View>
          </Pressable>
        );
      })}

      {/* ⭐ I TOTALI IN FONDO (27/08/2026, richiesta dell'utente: «in tutte le
          tabelle dell'app assicurati ci siano i totali alla fine»).

          ⚠️ Stessa griglia delle righe — stessi stili di colonna, stesso spazio
          finale per le azioni — o i numeri finiscono sotto la colonna sbagliata,
          che è il modo più veloce di far leggere un valore per un altro.

          ⚠️ Somma le righe MOSTRATE, non tutte: un totale che comprende anche
          ciò che il filtro ha tolto direbbe un numero che non corrisponde a
          niente di visibile. E si dice su quante righe è fatto. */}
      {ordinate.length ? (
        <View style={[styles.riga, styles.rigaTotali]}>
          <Text style={[styles.cellaTotale, styles.colNegozio]} numberOfLines={1}>
            Totale · {ordinate.length} {ordinate.length === 1 ? 'trattativa' : 'trattative'}
          </Text>
          <View style={styles.colLinea} />
          <View style={styles.colTag} />
          <View style={styles.colFase} />
          <Text style={[styles.cellaTotale, styles.colDx, { textAlign: 'right' }]} numberOfLines={1}>
            {(() => {
              const somma = ordinate.reduce((t, d) => t + (d.valore_atteso ?? 0), 0);
              const senza = ordinate.filter((d) => d.valore_atteso == null).length;
              // ⚠️ Chi non ha un valore si DICHIARA: sommare zero al posto di
              // «non lo so» fa un totale più basso del vero e nessuno lo sa.
              return somma ? `€ ${somma.toLocaleString('it-IT')}` : '—';
            })()}
          </Text>
          <View style={styles.colData} />
          <View style={styles.colData} />
          <Text style={[styles.cellaTotaleNota, styles.colAzione]} numberOfLines={1}>
            {(() => {
              const senza = ordinate.filter((d) => d.valore_atteso == null).length;
              return senza ? `${senza} senza valore` : '';
            })()}
          </Text>
          <View style={styles.colAzioni} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    overflow: 'hidden',
    ...shadow.card,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  intesta: { backgroundColor: colors.sfondo, paddingVertical: 8 },
  rigaHover: { backgroundColor: 'rgba(120,120,128,0.05)' },
  th: { color: colors.grigio, fontSize: 12, fontWeight: '500' },
  thOn: { color: colors.testo, fontWeight: '700' },
  colNegozio: { flex: 1.3, minWidth: 0 },
  colLinea: { flex: 1, minWidth: 0 },
  colTag: { flex: 0.9, minWidth: 0 },
  colFase: { width: 140 },
  colDx: { width: 90, alignItems: 'flex-end' },
  colData: { width: 76, alignItems: 'flex-end' },
  negozio: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  sotto: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  cellaLinea: { flex: 1, minWidth: 0, color: colors.testo, fontSize: 13, lineHeight: 17 },
  cellaTag: { flex: 0.9, minWidth: 0, color: colors.testoSoft, fontSize: 12.5, lineHeight: 16 },
  cellaValore: {
    width: 90,
    textAlign: 'right',
    color: colors.testo,
    fontWeight: '700',
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  cellaData: {
    width: 76,
    textAlign: 'right',
    color: colors.testoSoft,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  // ⚠️ Stesso flex della cella: se cambia uno, va cambiato l'altro.
  colAzione: { flex: 1.2, minWidth: 0 },
  cellaAzione: { flex: 1.2, minWidth: 0, color: colors.testoSoft, fontSize: 12.5, lineHeight: 16 },
  // Le azioni: larghezza fissa e allineate a destra, così la riga finisce
  // sempre nello stesso punto — con tre icone o con nessuna.
  // ⚠️ Il bersaglio è il PADDING, non hitSlop: react-native-web lo scarta in
  // silenzio, quindi sul sito queste icone erano bersagli da 15px.
  iconaAzione: { padding: 8, borderRadius: radius.s },
  // La riga dei totali: chiusa da una linea più marcata e senza bordo sotto,
  // così si legge come la fine dell'elenco e non come un'altra riga.
  rigaTotali: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
  },
  cellaTotale: { color: colors.testo, fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
  cellaTotaleNota: { color: colors.grigio, fontSize: 12 },
  // 3 cornici da 35 (icona 19 + 8 di padding per lato) + 2 gap da 8 + margine:
  // icone grandi e col tooltip (Libro v1.8 §3, 28/08/2026).
  colAzioni: { width: 124, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  cellaScaduta: { color: colors.errore, fontWeight: '700' },
});
