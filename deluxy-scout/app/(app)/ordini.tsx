// Ordini — il punto d'arrivo del funnel: cosa abbiamo CHIUSO davvero.
// Nasce automaticamente dalla trattativa vinta (docs/VISIONE-COMMERCIALE.md);
// qui si segue solo l'incasso: da incassare → incassato (o annullato).
// La pipeline dice quanto stiamo trattando; questa pagina quanto abbiamo chiuso.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { Tabella, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { aggiornaOrdine, collegaDocumentoAOrdine, fetchOrdini, inserisciRichiestaPagamento, type OrdineConLuogo } from '@/lib/db';
import { chiediFatturaPerOrdine } from '@/lib/partner';
import { Foglio } from '@/components/Foglio';
import { avvisa, conferma } from '@/lib/dialoghi';

const STATI: { valore: OrdineConLuogo['stato']; label: string; colore: string }[] = [
  { valore: 'da_incassare', label: 'Da incassare', colore: '#B7791F' },
  { valore: 'incassato', label: 'Incassato', colore: '#2F7D46' },
  { valore: 'annullato', label: 'Annullato', colore: '#B3261E' },
];
const labelStatoOrdine = Object.fromEntries(STATI.map((s) => [s.valore, s.label]));
const coloreStatoOrdine = Object.fromEntries(STATI.map((s) => [s.valore, s.colore]));

function euro(n: number | null): string {
  return n != null ? `€ ${n.toLocaleString('it-IT')}` : '—';
}
function dataIt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function Ordini() {
  const router = useRouter();
  const [ordini, setOrdini] = useState<OrdineConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statoFiltro, setStatoFiltro] = useState<string | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  /** L'ordine per cui si sta scegliendo la percentuale dell'acconto. */
  const [accontoPer, setAccontoPer] = useState<OrdineConLuogo | null>(null);
  const [percentuale, setPercentuale] = useState(30);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setOrdini(await fetchOrdini());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // Tipologie di interesse presenti fra gli ordini.
  const lineePresenti = useMemo(
    () => [...new Set(ordini.map((o) => o.linea).filter(Boolean) as string[])].sort(),
    [ordini],
  );

  const dati = useMemo(
    () =>
      ordini.filter(
        (o) => (!statoFiltro || o.stato === statoFiltro) && (!lineaFiltro || o.linea === lineaFiltro),
      ),
    [ordini, statoFiltro, lineaFiltro],
  );

  const totali = useMemo(() => {
    const anno = new Date().getFullYear();
    const validi = ordini.filter((o) => o.stato !== 'annullato' && new Date(o.created_at).getFullYear() === anno);
    return {
      chiusoAnno: validi.reduce((s, o) => s + (o.valore ?? 0), 0),
      daIncassare: ordini.filter((o) => o.stato === 'da_incassare').reduce((s, o) => s + (o.valore ?? 0), 0),
    };
  }, [ordini]);

  // Da 900px in su l'elenco è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;

  const colonne: ColonnaTabella<OrdineConLuogo>[] = [
    {
      chiave: 'cliente',
      label: 'Cliente',
      flex: 1.2,
      valore: (o) => o.place_nome ?? o.cliente,
      cella: (o) => (
        <View style={{ gap: 2 }}>
          <Text style={styles.tabNome} numberOfLines={2}>{o.place_nome ?? o.cliente}</Text>
          {o.descrizione ? <Text style={styles.descr} numberOfLines={1}>{o.descrizione}</Text> : null}
          {/* ⚠️ Il documento sta QUI, sotto il nome, non fra le azioni: è
              un'informazione sull'ordine, non un comando. Nella colonna delle
              azioni rubava lo spazio ai bottoni e li mandava a capo. */}
          {o.fattura_numero || o.proforma_numero ? (
            <Pressable
              style={styles.docChip}
              hitSlop={6}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                const link = o.fattura_url || o.proforma_url;
                if (link) Linking.openURL(link);
              }}
              accessibilityLabel="Apri il documento su Deluxy Partner"
              {...({ title: 'Apri il documento su Deluxy Partner' } as any)}
            >
              <Ionicons name="document-text-outline" size={11} color={colors.goldStrong} />
              <Text style={styles.docChipTxt}>{o.fattura_numero || o.proforma_numero}</Text>
            </Pressable>
          ) : null}
        </View>
      ),
    },
    { chiave: 'linea', label: 'Linea', flex: 0.7, valore: (o) => o.linea ?? null },
    { chiave: 'canale', label: 'Canale', width: 80, valore: (o) => o.canale ?? null },
    {
      chiave: 'valore',
      label: 'Valore',
      width: 92,
      destra: true,
      numerica: true,
      valore: (o) => o.valore,
      cella: (o) => <Text style={styles.tabValore}>{importoBreve(o.valore)}</Text>,
    },
    {
      chiave: 'quando',
      label: 'Creato',
      width: 82,
      destra: true,
      numerica: true,
      valore: (o) => o.created_at,
      cella: (o) => <Text style={styles.tabData}>{dataIt(o.created_at)}</Text>,
    },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 108,
      valore: (o) => o.stato,
      cella: (o) => <StatusBadge small label={labelStatoOrdine[o.stato]} colore={coloreStatoOrdine[o.stato]} />,
    },
    {
      chiave: 'azioni',
      label: '',
      width: 268,
      fissa: true,
      valore: () => null,
      cella: (o) => (
        <View style={styles.tabAzioni}>
          {o.stato === 'da_incassare' ? (
            <>
              {/* CHIUDI ORDINE: il lavoro è finito, si chiede la fattura a
                  FINANCE. Non è «incassato» — i soldi arrivano dopo. */}
              {!o.fattura_numero ? (
                <Pressable
                  style={[styles.btnMini, inCorso === o.id && { opacity: 0.5 }]}
                  disabled={inCorso === o.id}
                  onPress={(e: any) => { e?.stopPropagation?.(); chiudiOrdine(o); }}
                >
                  <Text style={styles.btnMiniTxt}>{inCorso === o.id ? 'Chiedo…' : 'Chiudi'}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.btnMini}
                onPress={(e: any) => { e?.stopPropagation?.(); chiediAcconto(o); }}
                {...({ title: 'Chiedi un acconto in percentuale' } as any)}
              >
                <Text style={styles.btnMiniTxt}>Acconto</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'incassato'); }}>
                <Text style={styles.btnTxt}>Incassato</Text>
              </Pressable>
              {/* Annullare è raro e distruttivo: un'icona, non un bottone che
                  compete con le azioni di tutti i giorni. */}
              <Pressable
                hitSlop={8}
                onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'annullato'); }}
                accessibilityLabel="Annulla l'ordine"
                {...({ title: "Annulla l'ordine" } as any)}
              >
                <Ionicons name="close-circle-outline" size={16} color={colors.grigio} />
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.btnMini} onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'da_incassare'); }}>
              <Text style={styles.btnMiniTxt}>Da incassare</Text>
            </Pressable>
          )}
        </View>
      ),
    },
  ];

  /**
   * ⭐ CHIUDI ORDINE (26/08/2026, richiesta dell'utente): il lavoro è finito,
   * si chiede la FATTURA a FINANCE.
   *
   * Se la pro-forma non c'è ancora si emette adesso, poi si conferma — che di
   * là vuol dire «andata a fattura». Il riferimento resta sull'ordine: senza,
   * domani nessuno sa quale fattura è quella di questo lavoro.
   *
   * ⚠️ Chiudere NON è incassare: i soldi arrivano dopo, e «Incassato» resta un
   * gesto a parte. Confonderli farebbe risultare pagato ciò che è solo fatto.
   */
  async function chiudiOrdine(o: OrdineConLuogo) {
    if (inCorso) return;
    if (!o.valore) {
      avvisa('Manca il valore', 'Un ordine senza importo non si fattura: scrivi quanto vale, poi lo si chiude.');
      return;
    }
    conferma(
      'Chiudere l’ordine?',
      `${o.cliente} · ${importoBreve(o.valore)}.\n\n${
        o.proforma_numero
          ? `La pro-forma ${o.proforma_numero} passa a fatturata su FINANCE.`
          : 'Nasce la pro-forma su FINANCE e viene subito confermata (fatturata).'
      }\n\nL’incasso resta un gesto a parte: chiudere non vuol dire pagato.`,
      async () => {
        setInCorso(o.id);
        try {
          const doc = await chiediFatturaPerOrdine({
            cliente: o.cliente,
            importo: o.valore!,
            causale: o.descrizione,
            proformaNumero: o.proforma_numero ?? null,
          });
          await collegaDocumentoAOrdine(o.id, {
            proformaNumero: doc.riferimento,
            proformaUrl: doc.url,
            fatturaNumero: doc.fatturaNumero ?? doc.riferimento,
            fatturaUrl: doc.url,
          });
          await carica();
          avvisa('Ordine chiuso', `${doc.riferimento} è fatturata su Deluxy Partner.`);
        } catch (e: any) {
          // ⚠️ Il messaggio di FINANCE si mostra INTERO: se il cliente là non
          // c'è dice «Partner non trovato» coi candidati, cioè cosa manca e dove.
          avvisa('Non è stato chiuso', e?.message ?? 'Riprova.');
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Chiudi e fattura' },
    );
  }

  /**
   * ⭐ ACCONTO IN PERCENTUALE (26/08/2026, richiesta dell'utente): si chiede
   * una parte adesso, il resto alla consegna.
   *
   * Nasce una richiesta di pagamento in **Pagamenti** con la sua rata: la
   * percentuale si conserva accanto all'importo, così se il valore dell'ordine
   * cambia si sa da dove veniva il numero — un importo secco direbbe solo
   * «300 €» e nessuno saprebbe più che era il 30%.
   */
  function chiediAcconto(o: OrdineConLuogo) {
    if (!o.valore) {
      avvisa('Manca il valore', 'L’acconto è una percentuale dell’ordine: senza importo non si può calcolare.');
      return;
    }
    setAccontoPer(o);
  }

  async function creaAcconto(o: OrdineConLuogo, percentuale: number) {
    const importo = Math.round(((o.valore ?? 0) * percentuale) / 100 * 100) / 100;
    if (!importo) return;
    setInCorso(o.id);
    try {
      await inserisciRichiestaPagamento({
        cliente: o.cliente,
        importo,
        causale: `Acconto ${percentuale}% — ${o.descrizione ?? 'ordine'}`,
        place_id: o.place_id ?? null,
        deal_id: o.deal_id ?? null,
        rate: [
          { etichetta: `Acconto ${percentuale}%`, modo: 'percentuale', percentuale, importo },
          {
            etichetta: 'Saldo',
            modo: 'percentuale',
            percentuale: 100 - percentuale,
            importo: Math.round(((o.valore ?? 0) - importo) * 100) / 100,
          },
        ],
      });
      setAccontoPer(null);
      avvisa('Acconto richiesto', `${importoBreve(importo)} (${percentuale}%) è in Pagamenti, col saldo accanto.`);
    } catch (e: any) {
      avvisa('Non è stato richiesto', e?.message ?? 'Riprova.');
    } finally {
      setInCorso(null);
    }
  }

  async function cambiaStato(o: OrdineConLuogo, stato: OrdineConLuogo['stato']) {
    try {
      await aggiornaOrdine(o.id, {
        stato,
        incassato_il: stato === 'incassato' ? new Date().toISOString().slice(0, 10) : null,
      });
      carica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Aggiornamento non riuscito.');
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.head, contenutoCentrato]}>
        <PageIntro testo="Gli ordini nati dalle trattative vinte. La pipeline dice quanto stai trattando: qui vedi quanto hai chiuso, e cosa resta da incassare." />
        <Text style={styles.sub}>
          Chiuso {new Date().getFullYear()}: <Text style={styles.subForte}>{euro(totali.chiusoAnno)}</Text>
          {'  ·  '}Da incassare: <Text style={styles.subForte}>{euro(totali.daIncassare)}</Text>
        </Text>
        <View style={styles.chips}>
          <Chip label="Tutti" on={!statoFiltro} onPress={() => setStatoFiltro(null)} />
          {STATI.map((s) => (
            <Chip key={s.valore} label={s.label} on={statoFiltro === s.valore} onPress={() => setStatoFiltro((c) => (c === s.valore ? null : s.valore))} />
          ))}
        </View>
        {lineePresenti.length ? (
          <View style={styles.chips}>
            <Text style={styles.gruppoTitolo}>Interessi</Text>
            <Chip label="Tutti" on={!lineaFiltro} onPress={() => setLineaFiltro(null)} />
            {lineePresenti.map((l) => (
              <Chip key={l} label={l} on={lineaFiltro === l} onPress={() => setLineaFiltro((c) => (c === l ? null : l))} />
            ))}
          </View>
        ) : null}
      </View>

      <FlatList
        // In tabella la FlatList riceve UNA riga con l'intero elenco.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(o: any) => (aTabella ? 'tabella' : (o as OrdineConLuogo).id)}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="receipt-outline"
            titolo="Ancora nessun ordine"
            aiuto="Quando chiudi una trattativa come «vinta», l'ordine nasce qui da solo, pronto da seguire fino all'incasso."
            azione="Vai alle Trattative"
            onAzione={() => router.push('/(app)/trattative')}
          />
        }
        renderItem={({ item }) =>
          aTabella ? (
            <Tabella
              righe={item as OrdineConLuogo[]}
              colonne={colonne}
              chiaveRiga={(o) => o.id}
              ordineIniziale={{ campo: 'quando', verso: 'desc' }}
              onRiga={(o) => o.place_id && router.push(`/(app)/attivita/${o.place_id}`)}
              labelRiga={(o) => `Apri la scheda di ${o.place_nome ?? o.cliente}`}
            />
          ) : (
            (() => {
              const o = item as OrdineConLuogo;
              return (
                <View style={styles.card}>
                  <View style={styles.cardHead}>
                    <Pressable style={{ flex: 1 }} onPress={() => o.place_id && router.push(`/(app)/attivita/${o.place_id}`)}>
                      <Text numberOfLines={3} style={styles.nome}>{o.place_nome ?? o.cliente}</Text>
                      {o.descrizione ? <Text style={styles.descr} numberOfLines={1}>{o.descrizione}</Text> : null}
                    </Pressable>
                    <Text style={styles.valore}>{euro(o.valore)}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <StatusBadge small label={labelStatoOrdine[o.stato]} colore={coloreStatoOrdine[o.stato]} />
                    {o.canale ? <Text style={styles.meta}>canale {o.canale}</Text> : null}
                    {o.linea ? <Text style={styles.meta}>{o.linea}</Text> : null}
                    <Text style={styles.meta}>{dataIt(o.created_at)}</Text>
                  </View>
                  {/* Il documento sta con le informazioni, non fra i comandi. */}
                  {o.fattura_numero || o.proforma_numero ? (
                    <Pressable
                      style={styles.docChip}
                      onPress={() => {
                        const link = o.fattura_url || o.proforma_url;
                        if (link) Linking.openURL(link);
                      }}
                      accessibilityLabel="Apri il documento su Deluxy Partner"
                    >
                      <Ionicons name="document-text-outline" size={11} color={colors.goldStrong} />
                      <Text style={styles.docChipTxt}>{o.fattura_numero || o.proforma_numero}</Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.azioni}>
                    {o.stato === 'da_incassare' ? (
                      <>
                        {!o.fattura_numero ? (
                          <Pressable
                            style={[styles.btnGhost, inCorso === o.id && { opacity: 0.5 }]}
                            disabled={inCorso === o.id}
                            onPress={() => chiudiOrdine(o)}
                          >
                            <Text style={styles.btnGhostTxt}>{inCorso === o.id ? 'Chiedo…' : 'Chiudi ordine'}</Text>
                          </Pressable>
                        ) : null}
                        <Pressable style={styles.btnGhost} onPress={() => chiediAcconto(o)}>
                          <Text style={styles.btnGhostTxt}>Acconto %</Text>
                        </Pressable>
                        <Pressable style={styles.btn} onPress={() => cambiaStato(o, 'incassato')}>
                          <Ionicons name="checkmark-circle-outline" size={15} color={colors.bianco} />
                          <Text style={styles.btnTxt}>Incassato</Text>
                        </Pressable>
                        <Pressable style={styles.btnGhost} onPress={() => cambiaStato(o, 'annullato')}>
                          <Text style={styles.btnGhostTxt}>Annulla</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable style={styles.btnGhost} onPress={() => cambiaStato(o, 'da_incassare')}>
                        <Text style={styles.btnGhostTxt}>Riporta a «da incassare»</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })()
          )
        }
      />

      {/* Quanto acconto: le percentuali che si usano davvero, più il campo
          libero. Sotto, l'importo calcolato — perché è quello che il cliente
          leggerà, e va visto prima di chiederlo. */}
      {accontoPer ? (
        <Foglio
          titolo="Chiedi un acconto"
          sottotitolo={`${accontoPer.cliente} · ordine da ${importoBreve(accontoPer.valore)}`}
          onClose={() => setAccontoPer(null)}
        >
          <View style={styles.percRow}>
            {[20, 30, 50, 70].map((p) => (
              <Pressable
                key={p}
                style={[styles.percChip, percentuale === p && styles.percChipOn]}
                onPress={() => setPercentuale(p)}
              >
                <Text style={[styles.percTxt, percentuale === p && styles.percTxtOn]}>{p}%</Text>
              </Pressable>
            ))}
            <TextInput
              style={styles.percInput}
              value={String(percentuale)}
              onChangeText={(v) => {
                const n = Number(v.replace(/[^\d]/g, ''));
                setPercentuale(Number.isFinite(n) && n > 0 && n <= 100 ? n : 0);
              }}
              keyboardType="number-pad"
              placeholder="%"
              placeholderTextColor={colors.grigio}
            />
          </View>
          <Text style={styles.percCalcolo}>
            Acconto: {importoBreve(Math.round(((accontoPer.valore ?? 0) * percentuale) / 100 * 100) / 100)} · saldo{' '}
            {importoBreve(
              Math.round(((accontoPer.valore ?? 0) - ((accontoPer.valore ?? 0) * percentuale) / 100) * 100) / 100,
            )}
          </Text>
          <Pressable
            style={[styles.btn, styles.btnLargo, (!percentuale || inCorso === accontoPer.id) && { opacity: 0.5 }]}
            disabled={!percentuale || inCorso === accontoPer.id}
            onPress={() => creaAcconto(accontoPer, percentuale)}
          >
            <Text style={styles.btnTxt}>Crea la richiesta di pagamento</Text>
          </Pressable>
        </Foglio>
      ) : null}
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
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.sfondo },
  sub: { color: colors.testoSoft, fontSize: 13 },
  subForte: { color: colors.navy, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', marginRight: 2 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  descr: { color: colors.testoSoft, fontSize: 12.5, fontStyle: 'italic', marginTop: 1 },
  valore: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabValore: { color: colors.testo, fontWeight: '700', fontSize: 13.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabAzioni: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 4 },
  // Bottoni piccoli per le azioni secondarie: stessa altezza, meno peso.
  btnMini: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  btnMiniTxt: { color: colors.testo, fontWeight: '700', fontSize: 11.5 },
  docChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  docChipTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 10.5 },
  percRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  percChip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  percChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  percTxt: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  percTxtOn: { color: colors.bianco },
  percInput: { width: 70, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, color: colors.testo, fontSize: 14, textAlign: 'center' },
  percCalcolo: { color: colors.testoSoft, fontSize: 13, marginTop: 4 },
  btnLargo: { marginTop: 8, paddingVertical: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { color: colors.testoSoft, fontSize: 12 },
  // Sul telefono i bottoni vanno a capo invece di stringersi: quattro azioni
  // su una riga sola diventavano illeggibili.
  azioni: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 6, alignItems: 'center' },
  docChipCard: { alignSelf: 'flex-start' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12.5 },
  btnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
});
