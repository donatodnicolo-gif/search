// Trattative: tutte le deal aperte, raggruppate per negozio.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Foglio } from '@/components/Foglio';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { coloreAffiliazione, coloreFase, colors, labelAffiliazione, labelFase, radius, shadow, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { isoOggi, isoTraGiorni } from '@/lib/giorni';
import { leggiImporto, scriviImporto } from '@/lib/importi';
import { TabellaTrattative } from '@/components/TabellaTrattative';
import {
  aggiornaDeal,
  cercaPlaces,
  annullaDeal,
  eliminaDeal,
  ripristinaDeal,
  collegaDocumentoAOrdine,
  creaOrdineDaDeal,
  creaOrdineDaTrattativa,
  fetchContatti,
  fetchTutteTrattative,
  inserisciDeal,
  type PlaceLite,
  type TrattativaConLuogo,
  fetchProfiles,
  nomeDaProfilo,
} from '@/lib/db';
import { aggiornaValoriTrattative, modificaTrattativaHubspot, syncTrattativa } from '@/lib/hubspot';
import { emettiProformaPerOrdine, raccontaEsito } from '@/lib/documenti';
import { env } from '@/lib/env';
import { CANALI, MOTIVI_PERSO, canonizzaLinee, type CanaleTrattativa, type Contact, type DealStage, type MotivoPerso, type StatoAffiliazione } from '@/types';
import { LineaSelector } from '@/components/LineaSelector';
import { Card, EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { OPZIONI_CITTA, passaFiltroCitta } from '@/lib/citta';
import { avvisa, conferma } from '@/lib/dialoghi';
import { PannelloFiltri } from '@/components/PannelloFiltri';

interface Sezione {
  title: string;
  placeId: string;
  data: TrattativaConLuogo[];
}

const FASI: DealStage[] = [
  'appointmentscheduled',
  'decisionmakerboughtin',
  'contractsent',
  'closedwon',
  'closedlost',
];

/**
 * ⭐ IL SOPRA-MENÙ (26/08/2026, richiesta dell'utente): **Aperte · Vinte ·
 * Perse**. È la prima domanda che si fa chi apre questa schermata, e prima
 * stava dentro un pannello dei filtri chiuso, mescolata alle fasi.
 *
 * Le fasi della pipeline — appuntamento fissato, decisore coinvolto, inviata —
 * non sono allo stesso livello: sono **dentro** «Aperte», perché descrivono a
 * che punto è una trattativa che è ancora in gioco. Vinta e persa non sono
 * punti del percorso, sono la fine.
 */
const FASI_APERTE: DealStage[] = ['appointmentscheduled', 'decisionmakerboughtin', 'contractsent'];
type VistaTrattative = 'aperte' | 'vinte' | 'perse' | 'annullate';
const VISTE: { v: VistaTrattative; label: string }[] = [
  { v: 'aperte', label: 'Aperte' },
  { v: 'vinte', label: 'Vinte' },
  { v: 'perse', label: 'Perse' },
  // Quelle messe da parte col cestino: aperte per sbaglio, o non più valide.
  // Non sono cancellate — da qui si rimettono in gioco.
  { v: 'annullate', label: 'Annullate' },
];
/**
 * In quale vista sta una trattativa. ⚠️ L'annullamento viene PRIMA della fase:
 * una trattativa annullata non è più «aperta», e lasciarla anche lì la
 * farebbe contare due volte.
 */
function vistaDi(d: { fase: DealStage; annullata_il?: string | null }): VistaTrattative {
  if (d.annullata_il) return 'annullate';
  return d.fase === 'closedwon' ? 'vinte' : d.fase === 'closedlost' ? 'perse' : 'aperte';
}

// «Oggi» e «fra N giorni» stanno in lib/giorni.ts, in ora LOCALE: con
// toISOString, fra mezzanotte e le due, la data era quella del giorno prima.
const isoOggiTratt = isoOggi;

// Formattazione GG/MM/AAAA.
function formattaData(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

export default function Trattative() {
  const router = useRouter();
  const [deals, setDeals] = useState<TrattativaConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Il sopra-menù: si parte dalle APERTE, che sono il lavoro. Vinte e perse si
  // guardano quando si vuole guardarle.
  const [vista, setVista] = useState<VistaTrattative>('aperte');
  const [faseFiltro, setFaseFiltro] = useState<DealStage | 'tutte'>('tutte');
  const [cittaFiltro, setCittaFiltro] = useState<string | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);
  const [accountFiltro, setAccountFiltro] = useState<string | null>(null);
  const [formAperto, setFormAperto] = useState(false);
  const [editDeal, setEditDeal] = useState<TrattativaConLuogo | null>(null);

  // Arrivo dal bottone «Nuova trattativa» di una scheda (Clienti): il form si
  // apre da solo col negozio già scelto, così non lo si ricerca di nuovo.
  const { nuovoPer, nuovoNome, apri } = useLocalSearchParams<{
    nuovoPer?: string;
    nuovoNome?: string;
    apri?: string;
  }>();
  const placeDaParam = useMemo(
    () =>
      nuovoPer
        ? { id: String(nuovoPer), nome: String(nuovoNome ?? 'Negozio'), indirizzo: null, zona: null }
        : null,
    [nuovoPer, nuovoNome],
  );
  useEffect(() => {
    if (placeDaParam) setFormAperto(true);
  }, [placeDaParam]);

  // Arrivo da fuori (le tessere della Home) su UNA trattativa: si apre la sua
  // scheda. Si aspetta che l'elenco sia carico, se no non c'è niente da trovare.
  // ⚠️ Poi si toglie il parametro dall'URL: se restasse, tornando su Trattative
  // la scheda si riaprirebbe da sola — è la trappola già vista con `nuovoPer`.
  useEffect(() => {
    if (!apri || !deals.length) return;
    const trovata = deals.find((d) => d.id === String(apri));
    if (trovata) setEditDeal(trovata);
    router.replace('/(app)/trattative');
  }, [apri, deals, router]);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setDeals(await fetchTutteTrattative({ includiAnnullate: true }));
    } finally {
      setLoading(false);
    }
  }, []);

  // Best-effort: allinea gli importi da HubSpot (i deal nati da una visita non
  // hanno `amount`; se impostato su HubSpot lo riportiamo qui). Se aggiorna
  // qualcosa, ricarica la lista. Non blocca né segnala errori all'utente.
  const allineaDaHubspot = useCallback(async () => {
    if (!env.hubspotSyncUrl()) return;
    try {
      const { aggiornati } = await aggiornaValoriTrattative();
      if (aggiornati > 0) setDeals(await fetchTutteTrattative({ includiAnnullate: true }));
    } catch {
      /* la lista locale resta valida; si riprova al prossimo accesso */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica().then(allineaDaHubspot);
    }, [carica, allineaDaHubspot]),
  );

  // Quante ce n'è in ciascuna delle tre viste: il numero sta sul sopra-menù,
  // così «Vinte (0)» si vede prima di cliccarci e nessuno pensa a un guasto.
  const conteggi = useMemo(() => {
    const c: Record<VistaTrattative, number> = { aperte: 0, vinte: 0, perse: 0, annullate: 0 };
    for (const d of deals) c[vistaDi(d)]++;
    return c;
  }, [deals]);

  // I sotto-stati di «Aperte», solo quelli che esistono davvero.
  const fasiApertePresenti = useMemo<DealStage[]>(() => {
    const set = new Set(deals.filter((d) => vistaDi(d) === 'aperte').map((d) => d.fase));
    return FASI_APERTE.filter((f) => set.has(f));
  }, [deals]);

  // Tipologie di interesse (linee) presenti fra le trattative.
  const lineePresenti = useMemo(() => {
    const set = new Set<string>();
    for (const d of deals) for (const l of d.linee?.length ? d.linee : d.linea ? [d.linea] : []) set.add(l);
    return [...set].sort();
  }, [deals]);

  // Account presenti fra le trattative (chi segue il cliente, dal registro).
  const accountPresenti = useMemo(
    () => [...new Set(deals.map((d) => d.place_account).filter(Boolean) as string[])].sort(),
    [deals],
  );

  const filtrate = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((d) => {
      // Prima il sopra-menù: aperte / vinte / perse. Poi, dentro le aperte,
      // l'eventuale sotto-stato.
      if (vistaDi(d) !== vista) return false;
      if (vista === 'aperte' && faseFiltro !== 'tutte' && d.fase !== faseFiltro) return false;
      if (!passaFiltroCitta(d.place_zona, cittaFiltro)) return false;
      if (accountFiltro && (d.place_account ?? '') !== accountFiltro) return false;
      if (lineaFiltro) {
        const linee = d.linee?.length ? d.linee : d.linea ? [d.linea] : [];
        if (!linee.includes(lineaFiltro)) return false;
      }
      if (!q) return true;
      return [d.place_nome, d.linea, d.titolo, d.place_account, d.place_zona, labelFase[d.fase]]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [deals, query, vista, faseFiltro, cittaFiltro, accountFiltro, lineaFiltro]);

  const sezioni = useMemo<Sezione[]>(() => {
    const map = new Map<string, Sezione>();
    for (const d of filtrate) {
      // Raggruppa per negozio Scout se collegato, altrimenti per nome.
      const title = d.place_nome ?? 'Senza negozio';
      const key = d.place_id || `nome:${title}`;
      if (!map.has(key)) {
        map.set(key, { title, placeId: d.place_id || '', data: [] });
      }
      map.get(key)!.data.push(d);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [filtrate]);

  const totale = useMemo(
    () => filtrate.reduce((s, d) => s + (d.valore_atteso ?? 0), 0),
    [filtrate],
  );

  // Quanti filtri sono applicati: finisce sul bottone del pannello, così a
  // filtri chiusi una lista ridotta non sembra mai vuota "senza motivo".
  const nFiltriAttivi =
    (faseFiltro !== 'tutte' ? 1 : 0) +
    [cittaFiltro, lineaFiltro, accountFiltro].filter(Boolean).length;
  /**
   * Elimina una trattativa dall'elenco, con la domanda prima: è irreversibile.
   * Stessa azione che c'è in fondo alla scheda — qui si trova senza aprirla.
   */
  /**
   * Il cestino ANNULLA, non cancella (26/08/2026, richiesta dell'utente).
   * La trattativa esce dai conti e va in «Annullate», da dove si rimette in
   * gioco. Cancellarla davvero resta possibile da lì.
   */
  function chiediEliminaDeal(d: TrattativaConLuogo) {
    conferma(
      'Annullare la trattativa?',
      `${d.place_nome ?? 'Trattativa'}${d.titolo ? ` · ${d.titolo}` : ''}. Esce dai conti e va in «Annullate»: da lì puoi rimetterla in gioco.`,
      async () => {
        try {
          await annullaDeal(d.id);
          await carica();
        } catch (e) {
          // L'errore si dice: un annullamento che non è avvenuto e non lo
          // dichiara fa credere che sia sparita, e la si ritrova domani.
          avvisa('Non è stata annullata', (e as Error)?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Annulla la trattativa', distruttivo: true },
    );
  }

  /**
   * ⭐ TRASFORMA IN ORDINE (26/08/2026, richiesta dell'utente: «stessa logica
   * che c'è in richieste clienti»): la trattativa passa sotto Ordini e la
   * pro-forma nasce insieme, agganciata.
   *
   * ⚠️ Serve il valore atteso: un ordine senza importo non si incassa e non si
   * misura. E la trattativa si chiude VINTA — trasformarla in ordine senza
   * chiuderla la lascerebbe in pipeline a contare due volte la stessa vendita.
   */
  function trasformaInOrdine(d: TrattativaConLuogo) {
    if (!d.valore_atteso) {
      avvisa(
        'Manca il valore',
        'Scrivi il valore della trattativa: un ordine senza importo non si incassa e non si misura.',
      );
      return;
    }
    conferma(
      'Trasformare in ordine?',
      `${d.place_nome ?? 'Cliente'} · € ${d.valore_atteso.toLocaleString('it-IT')}.\n\nLa trattativa si chiude VINTA, nasce l'ordine in Ordini e la pro-forma su FINANCE, agganciata.`,
      async () => {
        try {
          const { id: ordineId } = await creaOrdineDaTrattativa({
            id: d.id,
            place_id: d.place_id,
            valore_atteso: d.valore_atteso,
            oggetto: d.oggetto ?? d.titolo ?? null,
            canale: d.canale ?? null,
            linea: d.linee?.length ? d.linee[0] : d.linea,
            place_nome: d.place_nome ?? undefined,
          });
          // Vinta: la pipeline non deve tenersi una vendita già passata a ordine.
          if (d.fase !== 'closedwon') {
            await aggiornaDeal(d.id, { fase: 'closedwon', chiusa_il: isoOggi() });
          }
          // Il documento, dallo stesso posto delle altre strade
          // (lib/documenti.ts): non lancia mai, torna un esito da raccontare.
          {
            const esito = await emettiProformaPerOrdine({
              ordineId,
              cliente: d.place_nome ?? 'Cliente',
              importo: d.valore_atteso,
              causale: d.oggetto ?? d.titolo ?? null,
            });
            await carica();
            const r = raccontaEsito(esito);
            avvisa(
              r.titolo,
              esito.emessa ? r.testo : `L'ordine è in Ordini e la trattativa è vinta. ${r.testo}`,
            );
          }
        } catch (e: any) {
          avvisa('Non è stato creato', (e as Error)?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Trasforma' },
    );
  }

  /** La rimette in gioco: torna nella vista della sua fase. */
  async function ripristina(d: TrattativaConLuogo) {
    try {
      await ripristinaDeal(d.id);
      await carica();
    } catch (e) {
      avvisa('Non è stata ripristinata', (e as Error)?.message ?? 'Riprova.');
    }
  }

  /** La cancellazione VERA: solo da «Annullate», e con la domanda. */
  function chiediCancellaDeal(d: TrattativaConLuogo) {
    conferma(
      'Cancellare per sempre?',
      `${d.place_nome ?? 'Trattativa'}${d.titolo ? ` · ${d.titolo}` : ''}. Questa non si può disfare: sparisce dal database.`,
      async () => {
        try {
          await eliminaDeal(d.id);
          await carica();
        } catch (e) {
          avvisa('Non è stata cancellata', (e as Error)?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Cancella', distruttivo: true },
    );
  }

  function azzeraFiltri() {
    setFaseFiltro('tutte');
    setCittaFiltro(null);
    setLineaFiltro(null);
    setAccountFiltro(null);
  }

  // TABELLA sopra i 900px, SCHEDE raggruppate sotto — lo stesso confine di
  // Affiliazioni: su un monitor le schede non si confrontano (valori e
  // scadenze sparsi), sul telefono sei colonne sono illeggibili.
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;

  // Intro, ricerca e filtri: uguali nelle due viste, definiti una volta sola.
  const intestazione = (
          <View style={styles.headerScroll}>
        <PageIntro testo="Le trattative in corso raggruppate per negozio, da Scout, HubSpot e registro Anagrafiche. Tocca una trattativa per modificarla." />
        {/* L'intestazione segue la larghezza dell'elenco: vedi ordini.tsx. */}
        <View style={[styles.head, aTabella ? contenutoLargo : contenutoCentrato]}>
          {/* IL SOPRA-MENÙ: aperte, vinte, perse. Sempre a schermo — è la prima
              domanda di chi arriva qui, e stava dentro un pannello chiuso. */}
          <View style={styles.viste}>
            {VISTE.map((v) => (
              <Pressable
                key={v.v}
                style={[styles.vista, vista === v.v && styles.vistaOn]}
                onPress={() => {
                  setVista(v.v);
                  // Cambiando vista il sotto-stato non ha più senso: «inviata»
                  // dentro le vinte non filtra niente e farebbe sembrare vuota
                  // una lista che non lo è.
                  setFaseFiltro('tutte');
                }}
              >
                <Text style={[styles.vistaTxt, vista === v.v && styles.vistaTxtOn]}>
                  {v.label} ({conteggi[v.v]})
                </Text>
              </Pressable>
            ))}
          </View>
          {/* I sotto-stati: sono di «Aperte», e solo lì compaiono. */}
          {vista === 'aperte' && fasiApertePresenti.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sottoFiltri}
              keyboardShouldPersistTaps="handled"
            >
              <FiltroChip label="Tutte" on={faseFiltro === 'tutte'} onPress={() => setFaseFiltro('tutte')} />
              {fasiApertePresenti.map((f) => (
                <FiltroChip key={f} label={labelFase[f]} on={faseFiltro === f} onPress={() => setFaseFiltro(f)} />
              ))}
            </ScrollView>
          ) : null}
          {/* La TIPOLOGIA (l'interesse) subito visibile, anche da telefono:
              richiesta dell'utente. Scorre in orizzontale invece di andare a
              capo, così non mangia mezza schermata quando le linee sono nove. */}
          {lineePresenti.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sottoFiltri}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.filtroEtichetta}>Tipologia</Text>
              <FiltroChip label="Tutte" on={!lineaFiltro} onPress={() => setLineaFiltro(null)} />
              {lineePresenti.map((l) => (
                <FiltroChip
                  key={l}
                  label={l}
                  on={lineaFiltro === l}
                  onPress={() => setLineaFiltro((c) => (c === l ? null : l))}
                />
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.sub}>
            {filtrate.length} trattative · valore € {totale.toLocaleString('it-IT')}
          </Text>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Cerca per negozio, linea, fase…"
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {/* Dietro un bottone: 4 righe di filtri aperte occupavano piu di
              una schermata prima della prima trattativa. */}
          <PannelloFiltri attivi={nFiltriAttivi} onAzzera={azzeraFiltri}>
            {/* ⚠️ Le fasi e la tipologia NON stanno più qui: sono salite sopra,
                sempre a schermo. Qui restano i tagli che si usano di rado. */}
            {/* Città: le tre principali + "Altre", come in Target, Clienti e Rubrica. */}
            <View style={styles.filtri}>
              <Text style={styles.filtroEtichetta}>Città</Text>
              {(OPZIONI_CITTA as unknown as string[]).map((c) => (
                <FiltroChip
                  key={c}
                  label={c}
                  on={(cittaFiltro ?? 'Tutte') === c}
                  onPress={() => setCittaFiltro(c === 'Tutte' ? null : c)}
                />
              ))}
            </View>
            {accountPresenti.length ? (
              <View style={styles.filtri}>
                <Text style={styles.filtroEtichetta}>Account</Text>
                <FiltroChip label="Tutti" on={!accountFiltro} onPress={() => setAccountFiltro(null)} />
                {accountPresenti.map((a) => (
                  <FiltroChip
                    key={a}
                    label={a}
                    on={accountFiltro === a}
                    onPress={() => setAccountFiltro((c) => (c === a ? null : a))}
                  />
                ))}
              </View>
            ) : null}
          </PannelloFiltri>
        </View>
          </View>
  );

  const statoVuoto = (
    <EmptyState
      loading={loading}
      icona="briefcase-outline"
      titolo="Nessuna trattativa"
      aiuto="Le trattative nascono da una visita con esito positivo o da qui: crea la prima col bottone in basso."
      azione="Nuova trattativa"
      onAzione={() => setFormAperto(true)}
    />
  );

  return (
    <View style={styles.container}>
      {aTabella ? (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        >
          {intestazione}
          {filtrate.length === 0 ? (
            <Card style={contenutoLargo}>{statoVuoto}</Card>
          ) : (
            <View style={contenutoLargo}>
              <TabellaTrattative
                righe={filtrate}
                ordineFasi={FASI}
                onApri={setEditDeal}
                onNegozio={(id) => router.push(`/(app)/attivita/${id}`)}
                onElimina={chiediEliminaDeal}
                onRipristina={ripristina}
                onOrdine={trasformaInOrdine}
                onCancella={chiediCancellaDeal}
              />
            </View>
          )}
        </ScrollView>
      ) : (
      <SectionList
        sections={sezioni}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.list, contenutoCentrato]}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        // Intro e filtri scorrono con l'elenco: da fissi occupavano meta'
        // schermo e alle trattative restava una finestrella. Elemento e non
        // funzione, se no la ricerca perde il fuoco a ogni lettera.
        ListHeaderComponent={intestazione}
        ListEmptyComponent={statoVuoto}
        renderSectionHeader={({ section }) => {
          const sez = section as Sezione;
          const navigabile = Boolean(sez.placeId);
          return (
            <Pressable
              style={styles.sezioneHead}
              disabled={!navigabile}
              onPress={() => navigabile && router.push(`/(app)/attivita/${sez.placeId}`)}
            >
              <Ionicons name="storefront-outline" size={15} color={colors.testoSoft} />
              <Text numberOfLines={3} style={styles.sezioneTitolo}>{section.title}</Text>
              <Text style={styles.sezioneConteggio}>{section.data.length}</Text>
              {navigabile ? <Ionicons name="chevron-forward" size={15} color={colors.grigio} /> : null}
            </Pressable>
          );
        }}
        renderItem={({ item }) => (
          <RigaDeal
            deal={item}
            onEdit={() => setEditDeal(item)}
            onElimina={() => chiediEliminaDeal(item)}
            onRipristina={() => ripristina(item)}
            onOrdine={() => trasformaInOrdine(item)}
            onCancella={() => chiediCancellaDeal(item)}
          />
        )}
      />
      )}

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova trattativa</Text>
      </Pressable>

      {formAperto ? (
        <TrattativaModal
          placeIniziale={placeDaParam}
          onClose={() => {
            setFormAperto(false);
            // Via il parametro dall'URL: altrimenti tornando qui il form si
            // riaprirebbe da solo sullo stesso negozio.
            if (placeDaParam) router.replace('/(app)/trattative');
          }}
          onSalvata={() => {
            setFormAperto(false);
            if (placeDaParam) router.replace('/(app)/trattative');
            carica();
          }}
        />
      ) : null}

      {editDeal ? (
        <TrattativaModal
          deal={editDeal}
          onClose={() => setEditDeal(null)}
          onSalvata={() => {
            setEditDeal(null);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

function FiltroChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.filtroChip, on && styles.filtroChipOn]} onPress={onPress}>
      <Text style={[styles.filtroChipTxt, on && styles.filtroChipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function RegistroBadge({ stato, partner }: { stato: string; partner?: boolean }) {
  const s = stato as StatoAffiliazione;
  const colore = coloreAffiliazione[s] ?? colors.grigio;
  const label = partner ? 'Partner' : (labelAffiliazione[s] ?? stato);
  return (
    <View style={styles.regBadge}>
      <View style={[styles.regDot, { backgroundColor: colore }]} />
      <Text style={[styles.regTxt, { color: colore }]}>{label}</Text>
    </View>
  );
}

/** Scadenza passata su una trattativa ancora aperta. Confronto con la data
 *  LOCALE — il giorno del calendario di chi guarda, non quello di Greenwich
 *  (lib/giorni.ts). */
function scadutaDeal(deal: TrattativaConLuogo): boolean {
  if (!deal.scadenza || deal.fase === 'closedwon' || deal.fase === 'closedlost') return false;
  return deal.scadenza < isoOggi();
}

/** Da quando è aperta la trattativa. Le righe che arrivano da HubSpot o dal
 *  registro non portano una data, e quelle Scout aperte prima della migrazione
 *  0039 non ce l'hanno: in quei casi si dice che non si sa, non si inventa. */
function dataApertura(deal: TrattativaConLuogo): string {
  if (!deal.created_at) return 'data non registrata';
  const d = new Date(deal.created_at);
  if (isNaN(d.getTime())) return 'data non registrata';
  const giorni = Math.floor((Date.now() - d.getTime()) / 86400000);
  const quando = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
  if (giorni <= 0) return `aperta oggi (${quando})`;
  if (giorni === 1) return `aperta ieri (${quando})`;
  return `aperta il ${quando} · ${giorni} giorni fa`;
}

/**
 * ⚠️ IL CESTINO SULLA RIGA (26/08/2026, segnalato dall'utente: «ho creato per
 * sbaglio due trattative, dai possibilità di eliminare»). Eliminare si poteva
 * già — ma solo aprendo la scheda e scorrendo fino in fondo, e un comando che
 * sta fuori dalla prima schermata è un comando che non c'è.
 *
 * Solo sulle trattative nate in Scout: quelle da HubSpot o dal registro
 * tornerebbero al primo sync, e si chiudono nell'app che le possiede.
 */
function RigaDeal({
  deal,
  onEdit,
  onElimina,
  onRipristina,
  onCancella,
  onOrdine,
}: {
  deal: TrattativaConLuogo;
  onEdit: () => void;
  onElimina: () => void;
  onRipristina?: () => void;
  onCancella?: () => void;
  /** Trasforma la trattativa in ordine (con la domanda: la fa il chiamante). */
  onOrdine?: () => void;
}) {
  const suoDiScout = deal.origine !== 'hubspot' && deal.origine !== 'anagrafiche';
  const annullata = Boolean(deal.annullata_il);
  const lineaTxt = deal.linee?.length ? deal.linee.join(', ') : deal.linea;
  const titolo = deal.titolo ?? lineaTxt ?? 'Trattativa';
  // Tipologia di interesse (linee Deluxy) come tag, quando distinta dal titolo.
  const tipologia = lineaTxt && deal.titolo ? lineaTxt : null;
  const daRegistro = deal.origine === 'anagrafiche';
  return (
    <Pressable style={styles.deal} onPress={onEdit}>
      <View style={styles.dealHead}>
        <Text style={styles.dealLinea} numberOfLines={1}>
          {titolo}
        </Text>
        {deal.valore_atteso ? (
          <Text style={styles.dealValore}>€ {deal.valore_atteso.toLocaleString('it-IT')}</Text>
        ) : (
          <Text style={styles.dealValoreVuoto}>+ valore €</Text>
        )}
        {/* Su una annullata il cestino non serve più: servono le due strade
            che restano — rimetterla in gioco o cancellarla davvero. */}
        {/* TRASFORMA IN ORDINE: su una trattativa viva e con un valore. */}
        {onOrdine && !annullata && deal.fase !== 'closedlost' && deal.valore_atteso ? (
          <Pressable
            hitSlop={8}
            style={styles.iconaAzione}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              onOrdine();
            }}
            accessibilityLabel="Trasforma in ordine"
            {...({ title: 'Trasforma in ordine' } as any)}
          >
            <Ionicons name="receipt-outline" size={16} color={colors.navy} />
          </Pressable>
        ) : null}
        {suoDiScout && annullata ? (
          <>
            <Pressable
              hitSlop={8}
              style={styles.iconaAzione}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                onRipristina?.();
              }}
              accessibilityLabel="Rimetti in gioco la trattativa"
              {...({ title: 'Rimettila in gioco' } as any)}
            >
              <Ionicons name="arrow-undo-outline" size={16} color={colors.navy} />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={styles.iconaAzione}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                onCancella?.();
              }}
              accessibilityLabel="Cancella per sempre la trattativa"
              {...({ title: 'Cancella per sempre' } as any)}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.errore} />
            </Pressable>
          </>
        ) : suoDiScout ? (
          <Pressable
            hitSlop={8}
            style={styles.iconaAzione}
            onPress={(e: any) => {
              // ⚠️ Senza fermare l'evento, il tocco arriva anche alla scheda
              // sotto: si aprirebbe il form insieme alla domanda.
              e?.stopPropagation?.();
              onElimina();
            }}
            accessibilityLabel="Annulla la trattativa"
            {...({ title: 'Annulla la trattativa (va in «Annullate»)' } as any)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.errore} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.dealMetaRow}>
        {/* Fase: dealstage per Scout/HubSpot; stato registro per le righe da Anagrafiche. */}
        {daRegistro ? (
          <RegistroBadge stato={deal.anagrafiche_stato ?? 'in_trattativa'} />
        ) : (
          <StatusBadge small label={labelFase[deal.fase]} colore={coloreFase[deal.fase]} />
        )}
        {tipologia ? (
          <View style={styles.lineaTag}>
            <Text style={styles.lineaTagTxt}>{tipologia}</Text>
          </View>
        ) : null}
        {/* Sui deal mostriamo solo il flag "Partner" (già cliente): gli altri stati
            registro competerebbero con la fase del deal (es. "In trattativa" accanto
            a "Chiusa vinta"). La fase del deal è lo stato di verità della trattativa. */}
        {!daRegistro && deal.is_partner ? <RegistroBadge stato="attivo" partner /> : null}
        {deal.origine === 'hubspot' ? (
          <Text style={styles.origine}>da HubSpot</Text>
        ) : daRegistro ? (
          <Text style={styles.origine}>dal registro</Text>
        ) : deal.hubspot_deal_id ? (
          <Text style={styles.hs}>su HubSpot ✓</Text>
        ) : null}
      </View>
      <View style={styles.ownerRow}>
        <Ionicons name="calendar-outline" size={14} color={colors.grigio} />
        <Text style={styles.dataTxt}>{dataApertura(deal)}</Text>
        {/* La scadenza del follow-up accanto all'apertura: sono le due date che
            servono per decidere se muoversi. Rossa se è passata e la trattativa
            è ancora aperta. */}
        {deal.scadenza ? (
          <>
            <Ionicons
              name="alarm-outline"
              size={14}
              color={scadutaDeal(deal) ? colors.errore : colors.grigio}
              style={{ marginLeft: 6 }}
            />
            <Text style={[styles.dataTxt, scadutaDeal(deal) && styles.dataScaduta]}>
              Scade il {formattaData(deal.scadenza)}
            </Text>
          </>
        ) : null}
        {deal.place_account ? (
          <>
            <Ionicons name="briefcase-outline" size={14} color={colors.grigio} style={{ marginLeft: 6 }} />
            <Text style={styles.dataTxt}>Account: {deal.place_account}</Text>
          </>
        ) : null}
      </View>
      {deal.owner_nome ? (
        <View style={styles.ownerRow}>
          <Ionicons name="person-circle-outline" size={15} color={colors.testoSoft} />
          <Text style={styles.ownerTxt}>{deal.owner_nome}</Text>
        </View>
      ) : null}
      {deal.oggetto ? <Text style={styles.oggettoTxt} numberOfLines={1}>Per: {deal.oggetto}</Text> : null}
      {deal.fase === 'closedlost' && (deal.motivo_perso || deal.riprendere_il) ? (
        <Text style={styles.persaTxt} numberOfLines={1}>
          {deal.motivo_perso ? `Persa per ${labelMotivo(deal.motivo_perso)}` : 'Persa'}
          {deal.riprendere_il ? ` · da riprendere il ${formattaData(deal.riprendere_il)}` : ''}
        </Text>
      ) : null}
      {deal.next_action ? <Text style={styles.nextAction}>Prossima azione: {deal.next_action}</Text> : null}
    </Pressable>
  );
}

function labelMotivo(v: string): string {
  return MOTIVI_PERSO.find((m) => m.valore === v)?.label.toLowerCase() ?? v;
}

// ── Form crea/modifica trattativa (sincronizzato con negozio + contatti) ───────
function TrattativaModal({
  deal,
  placeIniziale,
  onClose,
  onSalvata,
}: {
  deal?: TrattativaConLuogo;
  /** Negozio già scelto: si arriva qui dal bottone «Nuova trattativa» di una
   *  scheda (Clienti), quindi la ricerca del negozio si salta. Resta
   *  cambiabile con l'icona di scambio. */
  placeIniziale?: PlaceLite | null;
  onClose: () => void;
  onSalvata: () => void;
}) {
  const inModifica = !!deal;
  const daRegistro = deal?.origine === 'anagrafiche';
  const [ricerca, setRicerca] = useState('');
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [place, setPlace] = useState<PlaceLite | null>(
    deal
      ? { id: deal.place_id, nome: deal.place_nome ?? 'Negozio', indirizzo: null, zona: null }
      : placeIniziale ?? null,
  );
  const [contatti, setContatti] = useState<Contact[]>([]);
  // In MODIFICA si parte da ciò che è SALVATO — anche niente: preselezionare
  // «Consegne» su una trattativa senza linea faceva vedere nel form un dato
  // che la tabella (onesta) non mostrava. Il default vale solo in CREAZIONE.
  // ⚠️ CANONIZZATE all'apertura (26/08/2026). Una trattativa salvata con un
  // nome vecchio — «Eventi» invece di «Eventi & Catering» — faceva comparire un
  // chip in più nel selettore, perché quello mostra anche i valori scelti che
  // non sono nel catalogo (per non perderli). Risultato: dieci linee dove il
  // catalogo ne ha nove, e due chip che sono la stessa cosa. Ricondotto qui, il
  // valore vecchio si sana da solo al primo salvataggio.
  const [linee, setLinee] = useState<string[]>(
    deal ? canonizzaLinee(deal.linee?.length ? deal.linee : deal.linea ? [deal.linea] : []) : ['Consegne'],
  );
  const [fase, setFase] = useState<DealStage>((deal?.fase as DealStage) ?? 'appointmentscheduled');
  const [valore, setValore] = useState(scriviImporto(deal?.valore_atteso));
  const [nextAction, setNextAction] = useState(deal?.next_action ?? '');
  const [scadenza, setScadenza] = useState<string | null>(deal?.scadenza ?? null);
  const [oggetto, setOggetto] = useState(deal?.oggetto ?? '');
  const [canale, setCanale] = useState<CanaleTrattativa>((deal?.canale as CanaleTrattativa) ?? 'territorio');
  /**
   * ⭐ CHI PORTA AVANTI LA TRATTATIVA (27/08/2026).
   *
   * ⚠️ I venditori si leggono dai PROFILI, non da una lista scritta qui: una
   * lista di nomi nel codice invecchia il giorno che entra qualcuno, e chi
   * entra non compare finche non lo aggiunge uno sviluppatore.
   */
  const [proprietario, setProprietario] = useState<string | null>(deal?.owner ?? null);
  const [venditori, setVenditori] = useState<{ id: string; nome: string | null; email: string | null }[]>([]);
  useEffect(() => {
    let vivo = true;
    fetchProfiles()
      .then((r) => vivo && setVenditori(r))
      .catch(() => vivo && setVenditori([]));
    return () => {
      vivo = false;
    };
  }, []);
  const [motivoPerso, setMotivoPerso] = useState<MotivoPerso | null>((deal?.motivo_perso as MotivoPerso) ?? null);
  const [riprendereIl, setRiprendereIl] = useState<string | null>(deal?.riprendere_il ?? null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carica i contatti del negozio già associato: in modifica quello della deal,
  // in creazione quello passato dalla scheda che ha aperto il form.
  useEffect(() => {
    const id = deal?.place_id ?? placeIniziale?.id;
    if (id) {
      fetchContatti(id).then(setContatti).catch(() => setContatti([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typeahead negozi (solo in creazione, finché non è selezionato un negozio).
  useEffect(() => {
    if (inModifica || place) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        setRisultati(await cercaPlaces(ricerca));
      } catch {
        setRisultati([]);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [ricerca, place, inModifica]);

  async function selezionaPlace(p: PlaceLite) {
    setPlace(p);
    setRisultati([]);
    try {
      setContatti(await fetchContatti(p.id));
    } catch {
      setContatti([]);
    }
  }

  /** Elimina la trattativa, previa conferma: è irreversibile. */
  function chiediElimina() {
    if (!deal || salvando) return;
    conferma(
      'Eliminare la trattativa?',
      `«${deal.place_nome ?? 'Questo negozio'}» torna indietro nel funnel: se ha una visita senza risposta ricompare fra le Visite. L'operazione non si può annullare.`,
      async () => {
        setSalvando(true);
        setErrore(null);
        try {
          await eliminaDeal(deal.id);
          onSalvata();
        } catch (e: any) {
          setErrore(e?.message ?? 'Trattativa non eliminata.');
        } finally {
          setSalvando(false);
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  async function salva() {
    if (!place || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      // ⚠️ 27/08/2026: qui si toglievano punto e virgola, e il campo si riapre
      // PRECOMPILATO col numero del database. Una trattativa da 1.500,50 €
      // mostrava «1500.5» e bastava premere Salva — senza toccare il valore —
      // per scriverci 15005: dieci volte tanto, poi cento, poi mille, e il
      // numero gonfiato finiva in pipeline, nell'ordine della vinta e su
      // HubSpot. Adesso la lettura è quella di lib/importi.ts, provata.
      const valNum = leggiImporto(valore);
      const chiusa = fase === 'closedwon' || fase === 'closedlost';
      const eraChiusa = deal?.fase === 'closedwon' || deal?.fase === 'closedlost';
      const patch = {
        linea: linee[0] ?? null,
        linee,
        fase,
        valore_atteso: valNum,
        next_action: nextAction.trim() || null,
        scadenza,
        oggetto: oggetto.trim() || null,
        canale,
        owner: proprietario,
        // La memoria delle perse: motivo + quando riprovarci. Se la trattativa
        // viene riaperta, la memoria si azzera.
        motivo_perso: fase === 'closedlost' ? motivoPerso : null,
        riprendere_il: fase === 'closedlost' ? riprendereIl : null,
        chiusa_il: chiusa ? (eraChiusa ? deal?.chiusa_il ?? isoOggiTratt() : isoOggiTratt()) : null,
      };

      if (inModifica && deal) {
        if (deal.origine === 'hubspot' && deal.hubspot_deal_id) {
          // Deal HubSpot: modifica su HubSpot (+ mirror locale) via edge function.
          await modificaTrattativaHubspot(deal.hubspot_deal_id, patch);
        } else if (daRegistro) {
          // Riga dal registro: non esiste un deal → creane uno Scout gestibile.
          const nuovo = await inserisciDeal({ place_id: deal.place_id, ...patch });
          if (env.hubspotSyncUrl()) {
            try {
              await syncTrattativa(nuovo.id);
            } catch {
              /* recuperabile al prossimo sync */
            }
          }
        } else {
          // Deal Scout: aggiorna la riga; se già su HubSpot, riporta la modifica.
          await aggiornaDeal(deal.id, patch);
          if (deal.hubspot_deal_id && env.hubspotSyncUrl()) {
            try {
              await modificaTrattativaHubspot(deal.hubspot_deal_id, patch);
            } catch {
              /* la modifica è salva su Supabase; il sync si recupera dopo */
            }
          }
        }
      } else {
        // Creazione.
        const nuovo = await inserisciDeal({ place_id: place.id, ...patch });
        if (env.hubspotSyncUrl()) {
          try {
            await syncTrattativa(nuovo.id);
          } catch {
            /* la trattativa è salva su Supabase; il sync si recupera dopo */
          }
        }
      }
      // La vinta genera l'ordine (idempotente su deal_id): il funnel finisce
      // in un ordine, non in una fase. Best-effort: la vinta resta valida.
      //
      // ⭐ E CON L'ORDINE NASCE LA PRO-FORMA (27/08/2026, richiesta
      // dell'utente: «quando finisce in ordini crea automaticamente la
      // pro-forma»). Era il buco: le altre due strade verso un ordine il
      // documento lo emettevano, questa no — e l'errore era pure ingoiato, così
      // l'ordine compariva in elenco senza documento e senza che nessuno
      // sapesse perché.
      if (fase === 'closedwon' && place) {
        const dealId = inModifica && deal && deal.origine !== 'anagrafiche' ? deal.id : null;
        if (dealId && !dealId.startsWith('hs_')) {
          try {
            const { id: ordineId } = await creaOrdineDaDeal({
              id: dealId,
              place_id: place.id,
              valore_atteso: patch.valore_atteso,
              oggetto: patch.oggetto,
              canale: patch.canale,
              linea: patch.linea,
              place_nome: place.nome,
            });
            const esito = await emettiProformaPerOrdine({
              ordineId,
              cliente: place.nome,
              importo: patch.valore_atteso,
              causale: patch.oggetto,
            });
            // ⚠️ Il documento mancante si DICE. Prima era muto: si scopriva
            // guardando l'elenco degli ordini giorni dopo.
            if (!esito.emessa) {
              avvisa(
                'Trattativa vinta, pro-forma no',
                `L'ordine è in Ordini. Il documento non è stato emesso: ${esito.perche}.\n\nSi emette dal bottone «Pro-forma» sulla riga dell'ordine.`,
              );
            }
          } catch {
            /* l'ordine non è nato: la vinta resta valida, si riprova da Ordini */
          }
        }
      }
      onSalvata();
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  const titoloSheet = !inModifica ? 'Nuova trattativa' : daRegistro ? 'Crea trattativa' : 'Modifica trattativa';
  const labelSalva = !inModifica ? 'Crea trattativa' : daRegistro ? 'Crea trattativa Scout' : 'Salva modifiche';

  return (
    // bloccaSfondo: una trattativa scritta a metà non si chiude col clic fuori;
    // largo perché il form ha molti campi.
    <Foglio titolo={titoloSheet} onClose={onClose} bloccaSfondo largo>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {/* Negozio / contatto */}
            <Text style={styles.campoLabel}>Negozio</Text>
            {place ? (
              <View style={styles.placeSel}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={3} style={styles.placeSelNome}>
                    {place.nome}
                  </Text>
                  {place.indirizzo ? (
                    <Text style={styles.placeSelInd} numberOfLines={1}>
                      {place.indirizzo}
                    </Text>
                  ) : null}
                </View>
                {!inModifica ? (
                  <Pressable
                    onPress={() => {
                      setPlace(null);
                      setContatti([]);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="swap-horizontal" size={20} color={colors.oro} />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={ricerca}
                  onChangeText={setRicerca}
                  placeholder="Cerca negozio per nome o indirizzo…"
                  placeholderTextColor={colors.grigio}
                  autoFocus
                />
                {risultati.map((p) => (
                  <Pressable key={p.id} style={styles.risultato} onPress={() => selezionaPlace(p)}>
                    <Ionicons name="storefront-outline" size={16} color={colors.testoSoft} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={3} style={styles.risNome}>
                        {p.nome}
                      </Text>
                      {p.indirizzo ? (
                        <Text style={styles.risInd} numberOfLines={1}>
                          {p.indirizzo}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </>
            )}

            {/* Contatti sincronizzati */}
            {place ? (
              <View style={styles.contattiBox}>
                <Text style={styles.contattiTitolo}>
                  {contatti.length
                    ? `${contatti.length} contatt${contatti.length === 1 ? 'o' : 'i'} — sincronizzati su HubSpot`
                    : 'Nessun contatto registrato per questo negozio'}
                </Text>
                {contatti.map((c) => (
                  <Text key={c.id} style={styles.contattoRiga} numberOfLines={1}>
                    • {c.nome}
                    {c.ruolo ? ` (${c.ruolo})` : ''}
                    {c.telefono ? ` · ${c.telefono}` : ''}
                    {c.is_decisore ? ' · decisore' : ''}
                  </Text>
                ))}
              </View>
            ) : null}

            {daRegistro ? (
              <Text style={styles.notaRegistro}>
                Dal registro Anagrafiche: salvando crei una trattativa Scout gestibile per questo negozio.
              </Text>
            ) : null}

            {/* Linee (tipologie di interesse) — selezione multipla */}
            <Text style={styles.campoLabel}>Linee (una o più)</Text>
            <LineaSelector value={linee} onChange={setLinee} />

            {/* Per cosa è la trattativa: senza, fra sei mesi nessuno ricorda perché eravamo lì */}
            <Text style={styles.campoLabel}>Oggetto (per cosa è)</Text>
            <TextInput
              style={styles.input}
              value={oggetto}
              onChangeText={setOggetto}
              placeholder="es. consegne weekend, vetrine natalizie…"
              placeholderTextColor={colors.grigio}
            />

            {/* ⭐ CHI LA PORTA AVANTI (27/08/2026). Prima il proprietario si
                vedeva in tabella ma non si poteva cambiare: una trattativa
                passata di mano restava intestata a chi l'aveva aperta, e i
                conti per venditore raccontavano il lavoro di sei mesi fa. */}
            <Text style={styles.campoLabel}>Chi la porta avanti</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, !proprietario && styles.chipOn]}
                onPress={() => setProprietario(null)}
              >
                <Text style={[styles.chipTxt, !proprietario && styles.chipTxtOn]}>Nessuno</Text>
              </Pressable>
              {venditori.map((v) => (
                <Pressable
                  key={v.id}
                  style={[styles.chip, proprietario === v.id && styles.chipOn]}
                  onPress={() => setProprietario(v.id)}
                >
                  <Text style={[styles.chipTxt, proprietario === v.id && styles.chipTxtOn]}>
                    {nomeDaProfilo(v)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sub}>
              ⚠️ Passandola a un collega non potrai più modificarla tu: è quello che «l&apos;ha presa in mano
              lui» vuol dire.
            </Text>

            {/* Canale di acquisizione: quale attività l'ha generata */}
            <Text style={styles.campoLabel}>Canale</Text>
            <View style={styles.chipRow}>
              {CANALI.map((c) => (
                <Pressable
                  key={c.valore}
                  style={[styles.chip, canale === c.valore && styles.chipOn]}
                  onPress={() => setCanale(c.valore)}
                >
                  <Text style={[styles.chipTxt, canale === c.valore && styles.chipTxtOn]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Fase */}
            <Text style={styles.campoLabel}>Fase</Text>
            <View style={styles.chipRow}>
              {FASI.map((f) => (
                <Pressable
                  key={f}
                  style={[styles.chip, fase === f && styles.chipOn]}
                  onPress={() => setFase(f)}
                >
                  <Text style={[styles.chipTxt, fase === f && styles.chipTxtOn]}>{labelFase[f]}</Text>
                </Pressable>
              ))}
            </View>

            {/* Persa: il motivo decide la strategia di ripresa (pipeline differita) */}
            {fase === 'closedlost' ? (
              <>
                <Text style={styles.campoLabel}>Perché è persa?</Text>
                <View style={styles.chipRow}>
                  {MOTIVI_PERSO.map((m) => (
                    <Pressable
                      key={m.valore}
                      style={[styles.chip, motivoPerso === m.valore && styles.chipOn]}
                      onPress={() => {
                        setMotivoPerso(m.valore);
                        // Default di ripresa: 90 giorni, ma un "non target" non si riprende.
                        setRiprendereIl(m.riprendibile ? riprendereIl ?? isoTraGiorni(90) : null);
                      }}
                    >
                      <Text style={[styles.chipTxt, motivoPerso === m.valore && styles.chipTxtOn]}>{m.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.campoLabel}>Quando riprovarci?</Text>
                <View style={styles.chipRow}>
                  <Pressable style={[styles.chip, !riprendereIl && styles.chipOn]} onPress={() => setRiprendereIl(null)}>
                    <Text style={[styles.chipTxt, !riprendereIl && styles.chipTxtOn]}>Mai</Text>
                  </Pressable>
                  {[
                    { label: 'Fra 1 mese', giorni: 30 },
                    { label: 'Fra 3 mesi', giorni: 90 },
                    { label: 'Fra 6 mesi', giorni: 180 },
                  ].map((o) => {
                    const iso = isoTraGiorni(o.giorni);
                    const on = riprendereIl === iso;
                    return (
                      <Pressable key={o.giorni} style={[styles.chip, on && styles.chipOn]} onPress={() => setRiprendereIl(iso)}>
                        <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {riprendereIl ? (
                  <Text style={styles.notaRegistro}>
                    Ricomparirà in Home, sezione «Da riprendere», il {formattaData(riprendereIl)}.
                  </Text>
                ) : null}
              </>
            ) : null}

            {/* Valore */}
            <Text style={styles.campoLabel}>Valore atteso (€)</Text>
            <TextInput
              style={styles.input}
              value={valore}
              onChangeText={setValore}
              placeholder="es. 1500"
              placeholderTextColor={colors.grigio}
              keyboardType="numeric"
            />

            {/* Prossima azione */}
            <Text style={styles.campoLabel}>Prossima azione</Text>
            <TextInput
              style={styles.input}
              value={nextAction}
              onChangeText={setNextAction}
              placeholder="es. Inviare preventivo"
              placeholderTextColor={colors.grigio}
            />

            {/* Scadenza follow-up */}
            <Text style={styles.campoLabel}>Scadenza follow-up</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, !scadenza && styles.chipOn]}
                onPress={() => setScadenza(null)}
              >
                <Text style={[styles.chipTxt, !scadenza && styles.chipTxtOn]}>Nessuna</Text>
              </Pressable>
              {[7, 14, 30].map((g) => {
                const iso = isoTraGiorni(g);
                return (
                  <Pressable
                    key={g}
                    style={[styles.chip, scadenza === iso && styles.chipOn]}
                    onPress={() => setScadenza(iso)}
                  >
                    <Text style={[styles.chipTxt, scadenza === iso && styles.chipTxtOn]}>+{g} giorni</Text>
                  </Pressable>
                );
              })}
            </View>
            {scadenza ? <Text style={styles.scadenzaSel}>Scade il {formattaData(scadenza)}</Text> : null}

            {/* Elimina: solo sulle trattative nate in Scout. Quelle da HubSpot o
                dal registro tornerebbero al primo sync, quindi si chiudono
                nell'app che le possiede. */}
            {inModifica && !daRegistro && deal?.origine !== 'hubspot' ? (
              <Pressable style={styles.elimina} disabled={salvando} onPress={chiediElimina}>
                <Ionicons name="trash-outline" size={16} color={colors.errore} />
                <Text style={styles.eliminaTxt}>Elimina trattativa</Text>
              </Pressable>
            ) : null}

            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          </ScrollView>

          <Pressable
            style={[styles.salva, (!place || salvando) && styles.salvaDisabled]}
            disabled={!place || salvando}
            onPress={salva}
          >
            {salvando ? (
              <ActivityIndicator color={colors.bianco} />
            ) : (
              <Text style={styles.salvaTxt}>{labelSalva}</Text>
            )}
          </Pressable>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  // ⚠️ Il bersaglio è il PADDING, non `hitSlop`: react-native-web scarta quella
  // prop in silenzio, quindi sul sito queste icone-azione erano larghe quanto
  // il glifo (16px). Il padding vale su web e su telefono, e fa anche da
  // distanza fra due icone adiacenti — una delle quali cancella per sempre.
  iconaAzione: { padding: 8, borderRadius: radius.sm },
  head: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    paddingTop: spacing.sm,
  },
  // Il sopra-menù: tre pillole larghe, leggibili col pollice.
  viste: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  vista: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.fill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  vistaOn: { backgroundColor: colors.testo, borderColor: colors.testo },
  vistaTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  vistaTxtOn: { color: colors.bianco },
  sottoFiltri: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  sub: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  search: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  // I filtri vanno a capo invece di scorrere in orizzontale: sul telefono lo
  // scorrimento non si vedeva e le voci restavano tagliate a meta' parola
  // ("Food Suppli…"), quindi non si scoprivano nemmeno.
  filtri: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  filtroChip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filtroChipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  filtroChipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  filtroChipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, paddingBottom: 96 },
  // Annulla il padding del contenitore attorno alla testata (i figli hanno gia'
  // i propri margini e la barra dei filtri va da bordo a bordo).
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  // Assistente AI
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  // Header di gruppo chiaro (DS: nessun header colorato), tap → scheda negozio.
  sezioneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sezioneTitolo: { flex: 1, color: colors.testo, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  sezioneConteggio: {
    color: colors.testoSoft,
    backgroundColor: colors.fill,
    fontWeight: '700',
    fontSize: 12,
    minWidth: 24,
    textAlign: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  deal: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    marginBottom: spacing.xs,
    gap: 6,
  },
  dealHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dealLinea: { flex: 1, fontWeight: '800', color: colors.navy, fontSize: 15 },
  dealValore: { color: colors.goldStrong, fontWeight: '800', fontSize: 15 },
  dealValoreVuoto: { color: colors.grigio, fontWeight: '600', fontSize: 12 },
  dealMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  lineaTag: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '800', fontSize: 12 },
  regBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.sfondo,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  regDot: { width: 7, height: 7, borderRadius: 4 },
  regTxt: { fontWeight: '800', fontSize: 12 },
  hs: { color: colors.successo, fontWeight: '700', fontSize: 12 },
  origine: { color: colors.grigio, fontWeight: '600', fontSize: 12 },
  nextAction: { color: colors.testoSoft, fontSize: 13 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownerTxt: { color: colors.testoSoft, fontSize: 12, fontWeight: '700' },
  dataTxt: { color: colors.grigio, fontSize: 12 },
  oggettoTxt: { color: colors.testoSoft, fontSize: 12.5, fontStyle: 'italic' },
  persaTxt: { color: colors.errore, fontSize: 12, fontWeight: '700' },
  filtroEtichetta: { color: colors.grigio, fontSize: 12, fontWeight: '700', alignSelf: 'center', marginRight: 2 },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 12,
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },

  // Modal / sheet
  // Il padding esterno lo dà il Foglio: qui resta solo il ritmo fra i campi.
  sheetBody: { gap: spacing.xs, paddingBottom: spacing.sm },
  campoLabel: { fontSize: 12, fontWeight: '800', color: colors.testoSoft, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  risultato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: 6,
  },
  risNome: { fontWeight: '700', color: colors.testo, fontSize: 14 },
  risInd: { color: colors.testoSoft, fontSize: 12 },
  placeSel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  placeSelNome: { fontWeight: '800', color: colors.testo, fontSize: 15 },
  placeSelInd: { color: colors.testoSoft, fontSize: 12 },
  contattiBox: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.sm,
    marginTop: 6,
    gap: 2,
  },
  contattiTitolo: { fontSize: 12, fontWeight: '800', color: colors.testoSoft, marginBottom: 2 },
  contattoRiga: { fontSize: 13, color: colors.testo },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  scadenzaSel: { color: colors.goldStrong, fontWeight: '700', fontSize: 12, marginTop: 4 },
  dataScaduta: { color: colors.errore, fontWeight: '700' },
  notaRegistro: {
    color: colors.testoSoft,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    lineHeight: 17,
  },
  errore: { color: colors.errore, fontSize: 13, marginTop: spacing.sm },
  salva: {
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  salvaDisabled: { opacity: 0.4 },
  salvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 16 },
  // Elimina: in fondo al form e defilato — è distruttivo, non deve competere
  // col bottone di salvataggio.
  elimina: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(179,38,30,0.35)',
  },
  eliminaTxt: { color: colors.errore, fontWeight: '700', fontSize: 14 },
});
