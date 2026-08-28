// Province — l'Italia vista dall'alto: dove siamo, dove vendiamo, dove non c'è
// ancora niente.
//
// Ogni riga è una provincia (tutte e 107, vedi lib/province.ts) con:
//   · quanti FORNITORI ATTIVI abbiamo lì (partner `attivo` nel registro);
//   · quanti LEAD / PROSPECT ci sono già in lavorazione;
//   · quanto si è VENDUTO in quella provincia (da Deluxy Orders).
//
// ⚠️ L'elenco comprende **anche le province vuote**: sono il punto della
// schermata. Una vista costruita solo sui dati che abbiamo mostrerebbe dove
// siamo già — che è esattamente l'informazione che non serve per crescere.
//
// Il filtro «Scoperte» toglie le province dove un fornitore attivo c'è già:
// resta l'elenco di dove si vende (o si potrebbe vendere) senza avere nessuno.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { RigaChips } from '@/components/ui';
import { PROVINCE, siglaProvincia, type Provincia } from '@/lib/province';
import { frecciaOrdine, ordinaRighe, useOrdinamento } from '@/lib/ordinamento';
import { fetchTuttiPartner } from '@/lib/anagrafiche';
import { aggiornaCoperturaSalvata, fetchCoperturaSalvata, fetchVenditePerProvincia } from '@/lib/ordini';

type Colonna = 'nome' | 'attivi' | 'lavorazione' | 'torte' | 'fiori' | 'altro' | 'lordo';

type Riga = Provincia & {
  attivi: number;
  lavorazione: number; // prospect, in contatto, in trattativa…
  ordini: number;
  lordo: number;
  // Di che cosa è fatto quel venduto: il fornitore da cercare è un fiorista o
  // una pasticceria a seconda della risposta.
  torte: number;
  fiori: number;
  altro: number;
};

/**
 * I periodi del venduto. **Calcolati nel browser**, mai sul server: su Vercel il
 * runtime è UTC e la mezzanotte italiana sono le 02:00 — due ore di ogni giorno
 * finirebbero nel mese prima senza che niente segnali l'errore.
 *
 * `a` è ESCLUSIVA (Orders filtra `data < a`), quindi si passa il primo giorno
 * del periodo successivo.
 */
type Periodo = 'mese' | 'trimestre' | 'anno' | 'anno-scorso' | 'tutto';

const ETICHETTA_PERIODO: Record<Periodo, string> = {
  mese: 'Questo mese',
  trimestre: 'Trimestre',
  anno: 'Quest’anno',
  'anno-scorso': 'Anno scorso',
  tutto: 'Tutto lo storico',
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function intervallo(p: Periodo): { da?: string; a?: string } {
  const oggi = new Date();
  const anno = oggi.getFullYear();
  if (p === 'tutto') return {};
  if (p === 'mese') {
    return { da: iso(new Date(anno, oggi.getMonth(), 1)), a: iso(new Date(anno, oggi.getMonth() + 1, 1)) };
  }
  if (p === 'trimestre') {
    const primoMese = Math.floor(oggi.getMonth() / 3) * 3;
    return { da: iso(new Date(anno, primoMese, 1)), a: iso(new Date(anno, primoMese + 3, 1)) };
  }
  if (p === 'anno') return { da: iso(new Date(anno, 0, 1)), a: iso(new Date(anno + 1, 0, 1)) };
  return { da: iso(new Date(anno - 1, 0, 1)), a: iso(new Date(anno, 0, 1)) };
}

/** «oggi alle 4:40» / «ieri» / «il 21 ago»: quanto è vecchio il dato che leggi. */
function quandoBreve(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const oggi = new Date();
  const stessoGiorno = d.toDateString() === oggi.toDateString();
  const ieri = new Date(oggi.getTime() - 86400000).toDateString() === d.toDateString();
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (stessoGiorno) return `oggi alle ${ora}`;
  if (ieri) return `ieri alle ${ora}`;
  return `il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${ora}`;
}

/** Gli stati del registro che contano come «fornitore attivo». */
const ATTIVI = new Set(['attivo']);
/** Quelli che contano come lavorazione in corso (non ancora attivi, non persi). */
const FUORI = new Set(['non_interessato', 'dismesso']);

const euro = (n: number) =>
  n >= 1000 ? `${Math.round(n / 1000)}k €` : `${Math.round(n)} €`;

export function CoperturaProvince({ onProvincia }: { onProvincia?: (nome: string) => void }) {
  const router = useRouter();
  // Sul telefono sette colonne a larghezza fissa schiacciano il nome a zero:
  // sotto i 700px le tre di dettaglio (torte/fiori/altro) si nascondono e
  // restano le quattro che rispondono alla domanda della schermata. Il
  // dettaglio per categoria si guarda da schermo largo.
  const { width } = useWindowDimensions();
  const stretto = width < 700;
  const [righe, setRighe] = useState<Riga[]>([]);
  const [soloScoperte, setSoloScoperte] = useState(false);
  const [loading, setLoading] = useState(true);
  const [venditeCollegate, setVenditeCollegate] = useState(true);
  const [registroCompleto, setRegistroCompleto] = useState(true);
  const [senzaProvincia, setSenzaProvincia] = useState<{ ordini: number; lordo: number } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('tutto');
  // Quando è stata calcolata la vista che stai guardando (null = adesso, dal vivo).
  const [aggiornatoIl, setAggiornatoIl] = useState<string | null>(null);
  const [ricalcolo, setRicalcolo] = useState(false);
  // Ordinamento: si parte dal venduto più alto, che è la domanda con cui si
  // apre questa tabella («dove si vende e non abbiamo nessuno?»).
  const { ordine, ordinaPer } = useOrdinamento<Colonna>({ campo: 'lordo', verso: 'desc' }, [
    'attivi',
    'lavorazione',
    'torte',
    'fiori',
    'altro',
    'lordo',
  ]);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      // Le due letture sono indipendenti: se il venduto non è collegato, i
      // partner si vedono lo stesso (e viceversa).
      // ⚠️ PRIMA LA VISTA SALVATA. Il lavoro notturno mette da parte le due
      // risposte lente: il registro (1056 partner, che il client paginava
      // **50 alla volta**, cioè una ventina di andate e ritorno) e il venduto.
      // Leggerle da una tabella è una query sola. Se la vista non c'è ancora
      // — o non ha questo periodo — si ricade sul calcolo dal vivo, e la
      // schermata lo dice invece di far finta di niente.
      const salvata = await fetchCoperturaSalvata().catch(() => null);
      const usaSalvata = Boolean(salvata?.partner && salvata?.vendite[periodo]);
      setAggiornatoIl(usaSalvata ? salvata!.aggiornatoIl : null);
      const [reg, vendite] = usaSalvata
        ? [
            { partner: salvata!.partner as any[], completo: salvata!.completo },
            salvata!.vendite[periodo],
          ]
        : await Promise.all([
            fetchTuttiPartner().catch(() => ({ partner: [], completo: false })),
            fetchVenditePerProvincia(intervallo(periodo)),
          ]);
      setRegistroCompleto(reg.completo);
      setVenditeCollegate(!vendite.nonCollegato);
      setSenzaProvincia(vendite.nonCollegato ? null : vendite.senzaProvincia);

      const attivi = new Map<string, number>();
      const lavorazione = new Map<string, number>();
      for (const p of reg.partner) {
        // La provincia del registro può essere sigla, nome esteso o mancante:
        // se manca si prova con la città, che spesso È un capoluogo.
        const sigla = siglaProvincia(p.provincia) ?? siglaProvincia(p.citta);
        if (!sigla) continue;
        const stato = (p.stato ?? '').toLowerCase();
        if (ATTIVI.has(stato)) attivi.set(sigla, (attivi.get(sigla) ?? 0) + 1);
        else if (!FUORI.has(stato)) lavorazione.set(sigla, (lavorazione.get(sigla) ?? 0) + 1);
      }

      const perProvincia = new Map<
        string,
        { ordini: number; lordo: number; torte: number; fiori: number; altro: number }
      >();
      for (const v of vendite.province) {
        const sigla = siglaProvincia(v.provincia);
        if (!sigla) continue; // valori esteri («ENG»): non sono province italiane
        const gia = perProvincia.get(sigla) ?? { ordini: 0, lordo: 0, torte: 0, fiori: 0, altro: 0 };
        perProvincia.set(sigla, {
          ordini: gia.ordini + v.ordini,
          lordo: gia.lordo + v.lordo,
          torte: gia.torte + (v.torte ?? 0),
          fiori: gia.fiori + (v.fiori ?? 0),
          altro: gia.altro + (v.altro ?? 0),
        });
      }

      setRighe(
        PROVINCE.map((p) => ({
          ...p,
          attivi: attivi.get(p.sigla) ?? 0,
          lavorazione: lavorazione.get(p.sigla) ?? 0,
          ordini: perProvincia.get(p.sigla)?.ordini ?? 0,
          lordo: perProvincia.get(p.sigla)?.lordo ?? 0,
          torte: perProvincia.get(p.sigla)?.torte ?? 0,
          fiori: perProvincia.get(p.sigla)?.fiori ?? 0,
          altro: perProvincia.get(p.sigla)?.altro ?? 0,
        })),
      );
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile caricare i dati.');
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  /** Rifà la vista salvata e ricarica: si usa quando il dato di stanotte non basta. */
  async function ricalcola() {
    if (ricalcolo) return;
    setRicalcolo(true);
    setErrore(null);
    try {
      await aggiornaCoperturaSalvata();
      await carica();
    } catch (e) {
      setErrore((e as Error)?.message ?? 'Ricalcolo non riuscito.');
    } finally {
      setRicalcolo(false);
    }
  }

  const viste = useMemo(() => {
    const f = soloScoperte ? righe.filter((r) => r.attivi === 0) : righe;
    // L'ordine lo sceglie chi guarda (intestazioni premibili). Di default il
    // venduto più alto: è lì che un fornitore mancante costa di più.
    return ordinaRighe(f, ordine, (r, c) => (c === 'nome' ? r.nome : r[c]));
  }, [righe, soloScoperte, ordine]);

  const totali = useMemo(() => {
    const conAttivi = righe.filter((r) => r.attivi > 0).length;
    const scopribili = righe.filter((r) => r.attivi === 0 && r.lordo > 0).length;
    return { conAttivi, scopribili, vuote: righe.filter((r) => !r.attivi && !r.lavorazione && !r.lordo).length };
  }, [righe]);

  return (
    <View style={styles.wrap}>
      <View style={styles.filtri}>
        <Chip label="Tutte" on={!soloScoperte} onPress={() => setSoloScoperte(false)} />
        <Chip label="Scoperte" on={soloScoperte} onPress={() => setSoloScoperte(true)} />
        <Text style={styles.conteggio}>
          {soloScoperte
            ? `${viste.length} province senza un fornitore attivo`
            : `${totali.conAttivi} coperte · ${totali.scopribili} scoperte con vendite · ${totali.vuote} vuote`}
        </Text>
      </View>

      {/* Periodo del VENDUTO. ⚠️ Vale solo per l'ultima colonna: fornitori e
          «in lavorazione» vengono dal registro, che non ha una dimensione
          temporale — cambiando periodo restano uguali, ed è giusto così. */}
      {/* Su mobile la riga scorre (Libro v1.3 §8.9); su desktop va a capo. */}
      <RigaChips style={styles.filtri}>
        {(['mese', 'trimestre', 'anno', 'anno-scorso', 'tutto'] as Periodo[]).map((p) => (
          <Chip key={p} label={ETICHETTA_PERIODO[p]} on={periodo === p} onPress={() => setPeriodo(p)} />
        ))}
      </RigaChips>
      <Text style={styles.notaPeriodo}>
        Il periodo vale per il <Text style={styles.forte}>venduto</Text>: fornitori e «in lav.» vengono
        dal registro e non cambiano.
      </Text>

      {/* Da dove viene il numero che stai guardando: una vista di stanotte o un
          conto fatto adesso. Un dato senza data è un dato di cui non ci si fida. */}
      {!loading ? (
        <View style={styles.rigaVista}>
          <Text style={styles.notaPeriodo}>
            {aggiornatoIl
              ? `Vista salvata, aggiornata ${quandoBreve(aggiornatoIl)}`
              : 'Calcolata adesso (la vista salvata non è ancora pronta per questo periodo)'}
          </Text>
          <Pressable disabled={ricalcolo} onPress={ricalcola} hitSlop={6}>
            <Text style={[styles.linkRicalcola, ricalcolo && { opacity: 0.5 }]}>
              {ricalcolo ? 'Ricalcolo…' : 'Ricalcola adesso'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.caricamento}>
          <ActivityIndicator size="small" color={colors.grigio} />
          <Text style={styles.caricamentoTxt}>
            Carico le 107 province: partner dal registro e venduto da Deluxy Orders…
          </Text>
        </View>
      ) : null}

      {errore ? <Text style={styles.errore}>{errore}</Text> : null}

      {!venditeCollegate ? (
        <Text style={styles.avviso}>
          <Ionicons name="cash-outline" size={13} color={colors.testo} /> I valori di vendita non sono
          collegati: manca la chiave verso Deluxy Orders (o la funzione `ordini` non è ancora deployata).
          Fornitori e prospect qui sotto sono comunque veri.
        </Text>
      ) : null}

      {!registroCompleto ? (
        <Text style={styles.avviso}>
          <Ionicons name="information-circle-outline" size={13} color={colors.testo} /> Il registro ha
          risposto solo con la prima pagina: i conteggi di fornitori e prospect sono parziali. Si risolve
          rilanciando il deploy della funzione `anagrafiche`.
        </Text>
      ) : null}

      {senzaProvincia && senzaProvincia.ordini > 0 ? (
        <Text style={styles.nota}>
          Non compaiono qui {senzaProvincia.ordini.toLocaleString('it-IT')} ordini ({euro(senzaProvincia.lordo)}):
          il loro indirizzo non ha la provincia, e non viene indovinata dal CAP.
        </Text>
      ) : null}

      <View style={styles.tabella}>
        <View style={[styles.riga, styles.intestazione]}>
          {([
            { c: 'nome' as const, label: 'Provincia', stile: styles.cellaNome },
            { c: 'attivi' as const, label: 'Fornit.', stile: styles.cellaNum },
            { c: 'lavorazione' as const, label: 'In lav.', stile: styles.cellaNum },
            ...(stretto
              ? []
              : [
                  { c: 'torte' as const, label: 'Torte', stile: styles.cellaTipo },
                  { c: 'fiori' as const, label: 'Fiori', stile: styles.cellaTipo },
                  { c: 'altro' as const, label: 'Altro', stile: styles.cellaTipo },
                ]),
            { c: 'lordo' as const, label: 'Venduto', stile: styles.cellaEuro },
          ]).map((h) => (
            <Pressable key={h.c} style={h.stile} onPress={() => ordinaPer(h.c)}>
              <Text style={[styles.thTxt, ordine.campo === h.c && styles.thAttiva]}>
                {h.label}
                {frecciaOrdine(ordine, h.c)}
              </Text>
            </Pressable>
          ))}
        </View>
        {viste.map((r) => {
          // Il caso che vale la pena vedere per primo: si vende, ma non abbiamo
          // nessuno che consegni lì.
          const buco = r.attivi === 0 && r.lordo > 0;
          return (
            <Pressable
              key={r.sigla}
              style={[styles.riga, buco && styles.rigaBuco]}
              // La ricerca per zona è la sezione dove si va a cercare chi
              // manca: ci si arriva col nome della provincia già in mano.
              // Dentro Affiliazioni la provincia FILTRA l'elenco lì sotto;
              // da sola, porta alla schermata delle chiamate.
              // ⚠️ Prima passava `?zona=`, che nessuno leggeva: si finiva
              // sull'elenco intero come se il clic non avesse fatto niente.
              onPress={() =>
                onProvincia
                  ? onProvincia(r.nome)
                  : router.push(`/(app)/affiliazioni?cerca=${encodeURIComponent(r.nome)}`)
              }
            >
              <View style={styles.cellaNome}>
                <Text style={styles.nome} numberOfLines={1}>
                  {r.nome} <Text style={styles.sigla}>{r.sigla}</Text>
                </Text>
                <Text style={styles.regione} numberOfLines={1}>
                  {r.regione}
                </Text>
              </View>
              <Text style={[styles.cellaNum, r.attivi ? styles.numOk : styles.numZero]}>{r.attivi || '—'}</Text>
              <Text style={[styles.cellaNum, r.lavorazione ? styles.numLav : styles.numZero]}>
                {r.lavorazione || '—'}
              </Text>
              {/* Le tre sommano esatte al venduto: ogni ordine sta in una sola. */}
              {!stretto ? (
                <>
                  <Text style={styles.cellaTipo}>{r.torte ? euro(r.torte) : '—'}</Text>
                  <Text style={styles.cellaTipo}>{r.fiori ? euro(r.fiori) : '—'}</Text>
                  <Text style={styles.cellaTipo}>{r.altro ? euro(r.altro) : '—'}</Text>
                </>
              ) : null}
              <View style={styles.cellaEuro}>
                <Text style={[styles.euro, buco && styles.euroBuco]}>{r.lordo ? euro(r.lordo) : '—'}</Text>
                {r.ordini ? <Text style={styles.ordini}>{r.ordini} ord.</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.legenda}>
        Le righe evidenziate sono province dove si vende ma non abbiamo nessun fornitore attivo. «In lav.» =
        prospect e trattative già aperte nel registro.
      </Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  cellaTipo: {
    width: 66,
    textAlign: 'right',
    color: colors.testoSoft,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  thAttiva: { color: colors.testo, fontWeight: '700' },
  notaPeriodo: { color: colors.testoSoft, fontSize: 12, marginTop: -2, flex: 1 },
  rigaVista: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkRicalcola: { color: colors.navy, fontSize: 12, fontWeight: '700' },
  forte: { fontWeight: '700', color: colors.testo },
  caricamento: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm },
  caricamentoTxt: { color: colors.testoSoft, fontSize: 13, flex: 1 },
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  filtri: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  conteggio: { color: colors.testoSoft, fontSize: 12.5, flexShrink: 1 },
  errore: { color: colors.errore, fontWeight: '600', fontSize: 13 },
  avviso: {
    color: colors.testo,
    fontSize: 12.5,
    lineHeight: 18,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
  },
  nota: { color: colors.testoSoft, fontSize: 12, lineHeight: 17 },
  tabella: { backgroundColor: colors.bianco, borderRadius: radius.m, borderWidth: 1, borderColor: colors.grigioChiaro, overflow: 'hidden' },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    gap: spacing.sm,
  },
  rigaBuco: { backgroundColor: '#FFF8E6' },
  intestazione: { backgroundColor: colors.sfondo, paddingVertical: 8 },
  thTxt: { color: colors.testoSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  cellaNome: { flex: 1, minWidth: 0 },
  cellaNum: { width: 54, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  cellaEuro: { width: 82, alignItems: 'flex-end' },
  nome: { color: colors.navy, fontWeight: '700', fontSize: 14.5 },
  sigla: { color: colors.grigio, fontWeight: '600', fontSize: 12 },
  regione: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  numOk: { color: colors.successo },
  numLav: { color: colors.blue },
  numZero: { color: colors.grigioChiaro },
  euro: { color: colors.testo, fontWeight: '800', fontSize: 13.5 },
  euroBuco: { color: colors.attenzione },
  ordini: { color: colors.grigio, fontSize: 11 },
  legenda: { color: colors.testoSoft, fontSize: 12, lineHeight: 17 },
});
