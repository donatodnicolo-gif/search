// Ordini — il punto d'arrivo del funnel: cosa abbiamo CHIUSO davvero.
// Nasce automaticamente dalla trattativa vinta (docs/VISIONE-COMMERCIALE.md);
// qui si segue solo l'incasso: da incassare → incassato (o annullato).
// La pipeline dice quanto stiamo trattando; questa pagina quanto abbiamo chiuso.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, touchMin, contenutoCentrato, contenutoExtraLargo } from '@/lib/theme';
import { leggiImporto, scriviImporto } from '@/lib/importi';
import { EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
import { PannelloFiltri } from '@/components/PannelloFiltri';
import { Tabella, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { aggiornaOrdine, chiediEvasione, chiudiOrdine, collegaDocumentoAOrdine, duplicaOrdine, fetchOrdini, leggiImpostazioni, inserisciRichiestaPagamento, type OrdineConLuogo } from '@/lib/db';
import { cercaFatture, chiediFatturaPerOrdine, documentoProforma, type FatturaInElenco } from '@/lib/partner';
import { scaricaPdfProforma } from '@/lib/stampa';
import { fetchTemplate, type TemplateDocumento } from '@/lib/template-documento';
import { emettiProformaPerOrdine } from '@/lib/documenti';
import { costiPerOrdine, fetchLavori, type LavoroConPreventivi } from '@/lib/preventivi';
import { aggiornaFornitura, aggiungiFornitura, forniturePerOrdine, rimuoviFornitura, type RigaFornitura } from '@/lib/fornitura';
import { SceltaFornitore, type FornitoreScelto } from '@/components/SceltaFornitore';
import { SceltaCliente } from '@/components/SceltaCliente';
import { fetchForniture, salvaNelListino, type Fornitura } from '@/lib/forniture';
import { Foglio } from '@/components/Foglio';
import { avvisa, conferma } from '@/lib/dialoghi';
import { BRAND, brandDi, CANALI, LABEL_CANALE, LINEE_ATTIVE } from '@/types';
import { datiSocietariRegistro, urlSchedaRegistro } from '@/lib/anagrafiche';
import { fetchProfiles } from '@/lib/db';

// Colori di stato dai token semantici del DS (Libro UX cap.5): arancione = attende
// un'azione, verde = concluso bene, rosso/neutro = terminato. Prima erano hex
// Material, divergenti dal resto dell'app.
const STATI: { valore: OrdineConLuogo['stato']; label: string; colore: string }[] = [
  { valore: 'da_incassare', label: 'Da incassare', colore: colors.attenzione },
  { valore: 'incassato', label: 'Incassato', colore: colors.successo },
  { valore: 'annullato', label: 'Annullato', colore: colors.grey },
];
const labelStatoOrdine = Object.fromEntries(STATI.map((s) => [s.valore, s.label]));

/**
 * ⭐ LO STATO DELLA PRATICA (28/08/2026, richiesta dell'utente: «va messo lo
 * stato dell'ordine: Bozza, Annullato, Chiuso, Incassato»).
 *
 * Sono QUATTRO parole per DUE fatti — la pratica (bozza/chiusa/annullata) e i
 * soldi (incassati o no) — piegati in una scala sola:
 *   Annullato  → la pratica non è successa: vince su tutto;
 *   Incassato  → i soldi sono arrivati: è la fine buona, chiusa o no;
 *   Chiuso     → pratica finita, incasso ancora da vedere;
 *   Bozza      → tutto ancora aperto.
 */
/**
 * ⚠️ Le pillole del filtro parlano LA STESSA scala della colonna Stato
 * (28/08/2026, richiesta dell'utente: «metti anche Chiusi tra i filtri»).
 * Prima filtravano sul vecchio stato a tre valori: «Chiuso» in tabella non era
 * filtrabile, e un filtro che non sa dire quello che la colonna mostra fa
 * cercare a occhio.
 */
const FILTRI_PRATICA: { valore: string; chip: string }[] = [
  { valore: 'Bozza', chip: 'Bozze' },
  { valore: 'Chiuso', chip: 'Chiusi' },
  { valore: 'Incassato', chip: 'Incassati' },
  { valore: 'Annullato', chip: 'Annullati' },
];

function statoPratica(o: { stato: string; chiuso_il?: string | null }): { label: string; colore: string } {
  if (o.stato === 'annullato') return { label: 'Annullato', colore: colors.grigio };
  if (o.stato === 'incassato') return { label: 'Incassato', colore: colors.successo };
  if (o.chiuso_il) return { label: 'Chiuso', colore: colors.testo };
  return { label: 'Bozza', colore: colors.goldStrong };
}
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
  /** I lavori da preventivare: da qui esce il COSTO di ogni ordine. */
  const [lavori, setLavori] = useState<LavoroConPreventivi[]>([]);
  const [loading, setLoading] = useState(true);
  // ⚠️ Un fallimento non è una lista vuota (Libro UX cap.6, legge 9): senza
  // questo stato, se `fetchOrdini` andava giù la pagina mostrava «Ancora nessun
  // ordine» — cioè diceva che non ce n'erano invece che «non li ho potuti
  // leggere». È l'errore che le sorelle (preventivi, richieste, pagamenti)
  // gestiscono già e questa no.
  const [errore, setErrore] = useState<string | null>(null);
  const [statoFiltro, setStatoFiltro] = useState<string | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);
  /**
   * ⭐ IL PERIODO (27/08/2026, richiesta dell'utente: «consenti di filtrare per
   * periodo con filtri veloci: mese corrente, scorso, trimestre, anno»).
   *
   * ⚠️ I confini si calcolano sull'ora LOCALE, non in UTC: un ordine creato
   * alle 23:30 del 31 agosto, letto con i confini UTC, finisce a settembre — e
   * il conto del mese non torna con quello che si vede in elenco. È la stessa
   * trappola già pagata su «oggi».
   */
  const [periodo, setPeriodo] = useState<'tutti' | 'mese' | 'scorso' | 'trimestre' | 'anno'>('tutti');
  /**
   * ⭐ APERTI / CHIUSI (27/08/2026, richiesta dell'utente: «metti tra i filtri
   * anche ordini chiusi»).
   *
   * ⚠️ È un filtro SUO, accanto allo stato, non una voce dentro quello: chiuso
   * e incassato sono due domande diverse, e metterli nella stessa fila avrebbe
   * fatto credere che si escludano — mentre un ordine incassato E chiuso è il
   * caso normale.
   */
  const [chiusura, setChiusura] = useState<'tutti' | 'aperti' | 'chiusi'>('tutti');
  const [inCorso, setInCorso] = useState<string | null>(null);
  /** L'ordine per cui si sta scegliendo la percentuale dell'acconto. */
  const [accontoPer, setAccontoPer] = useState<OrdineConLuogo | null>(null);
  const [percentuale, setPercentuale] = useState(30);
  /**
   * ⭐ MODIFICA DELL'ORDINE (26/08/2026, richiesta dell'utente: «consenti
   * modifica degli ordini»).
   *
   * Fin qui di un ordine si poteva cambiare solo lo STATO: un valore sbagliato
   * o una descrizione da correggere obbligavano ad annullarlo e rifarlo — e un
   * ordine annullato resta nell'elenco a dire una cosa che non è successa.
   */
  /**
   * ⭐ CHIUDERE L'ORDINE (27/08/2026, richiesta dell'utente: «oltre a incassato
   * ci deve essere un bottone per chiudere l'ordine; una volta chiuso si
   * propone l'aggancio con fatture già presenti in finance o se non c'è nessuna
   * fattura si procede con l'emissione»).
   *
   * ⚠️ Chiuso ≠ incassato. Incassato parla dei SOLDI, chiuso della PRATICA:
   * fornitura registrata, fattura emessa o agganciata, niente più da fare.
   * Succedono nell'ordine che capita — acconto incassato e pratica aperta, o
   * pratica chiusa e incasso a 60 giorni — e per questo sono due campi, non
   * uno stato in più.
   */
  const [chiusuraPer, setChiusuraPer] = useState<OrdineConLuogo | null>(null);
  const [modificaPer, setModificaPer] = useState<OrdineConLuogo | null>(null);
  /** L'ordine per cui si sta chiedendo l'evasione alle consegne (migr. 0099). */
  const [evasionePer, setEvasionePer] = useState<OrdineConLuogo | null>(null);
  /** La legenda delle icone: chiusa di default, si apre da «Legenda». */
  const [legenda, setLegenda] = useState(false);
  const [bozza, setBozza] = useState<{
    cliente: string;
    /** Il negozio a cui l'ordine è legato: si può CAMBIARE (28/08/2026). */
    placeId: string | null;
    placeAnagraficheId: string | null;
    descrizione: string;
    valore: string;
    linea: string | null;
    canale: string | null;
    brand: string | null;
    altriCosti: string;
    altriCostiNota: string;
    unita: 'pezzi' | 'giorni' | 'ore' | null;
    quanti: string;
    owner: string | null;
  } | null>(null);
  /**
   * ⭐ CHI HA SEGUITO L'ORDINE (27/08/2026, richiesta dell'utente: «manca la
   * scelta di chi ha seguito l'ordine»).
   *
   * ⚠️ I venditori si leggono dai PROFILI, non da una lista scritta qui: una
   * lista di nomi nel codice non vede chi entra domani.
   */
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

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      // I lavori servono al COSTO di ogni ordine (preventivi fornitore). Col
      // suo `catch`: se la tabella non risponde, gli ordini si vedono lo
      // stesso e il costo resta «—».
      const [ord, lav] = await Promise.all([fetchOrdini(), fetchLavori().catch(() => [])]);
      setOrdini(ord);
      setLavori(lav);
    } catch (e: any) {
      // ⚠️ Se sono gli ORDINI a non caricare non si finge una lista vuota: si
      // dice cosa è andato storto e si offre «Riprova». Il messaggio di
      // PostgREST si mostra così com'è quando non è tecnico, altrimenti una
      // frase leggibile.
      setErrore(String(e?.message ?? '') || 'Non è stato possibile caricare gli ordini.');
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

  /** I due estremi del periodo scelto, in ora locale. */
  const finestra = useMemo(() => {
    const ora = new Date();
    const a = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate() + 1); // domani a mezzanotte
    if (periodo === 'mese') return { da: new Date(ora.getFullYear(), ora.getMonth(), 1), a };
    if (periodo === 'scorso') {
      return {
        da: new Date(ora.getFullYear(), ora.getMonth() - 1, 1),
        // ⚠️ «Mese scorso» finisce dove comincia questo: se arrivasse fino a
        // oggi conterebbe due mesi e si chiamerebbe come uno.
        a: new Date(ora.getFullYear(), ora.getMonth(), 1),
      };
    }
    if (periodo === 'trimestre') {
      const inizio = Math.floor(ora.getMonth() / 3) * 3;
      return { da: new Date(ora.getFullYear(), inizio, 1), a };
    }
    if (periodo === 'anno') return { da: new Date(ora.getFullYear(), 0, 1), a };
    return null;
  }, [periodo]);

  const dati = useMemo(
    () =>
      ordini.filter((o) => {
        if (statoFiltro && statoPratica(o).label !== statoFiltro) return false;
        if (lineaFiltro && o.linea !== lineaFiltro) return false;
        if (chiusura === 'aperti' && o.chiuso_il) return false;
        if (chiusura === 'chiusi' && !o.chiuso_il) return false;
        if (finestra) {
          const q = new Date(o.created_at);
          if (isNaN(q.getTime()) || q < finestra.da || q >= finestra.a) return false;
        }
        return true;
      }),
    [ordini, statoFiltro, lineaFiltro, chiusura, finestra],
  );


  /**
   * ⚠️ LA SOGLIA NON È 900 (27/08/2026). Questa tabella ha dieci colonne, e
   * settecento pixel se ne vanno in colonne a larghezza fissa: sotto la misura
   * qui sotto — meno la sidebar, che si prende 265px — non c'è lo spazio per
   * mostrarle senza schiacciare il nome del cliente a pochi pixel o tagliare
   * via le azioni.
   *
   * Sotto questa misura si vedono le SCHEDE, che sono complete e leggibili:
   * meglio una scheda intera che una tabella mutilata. È lo stesso motivo per
   * cui esistono le due viste. Quanto vale esattamente sta in `aTabella`, in
   * un punto solo: scritta anche qui, la misura si sarebbe scordata di
   * cambiare insieme alle colonne.
   */
  const { width } = useWindowDimensions();
  /**
   * ⚠️ La colonna «Altri costi» compare SOLO se qualcuno ne ha scritti. Una
   * colonna di soli «—» costa 94px di larghezza a una tabella che ne ha già
   * dieci, e li toglie al nome del cliente — che è il dato per cui si guarda la
   * riga. Finché la funzione non si usa, la tabella resta quella di prima.
   */

  /**
   * ⚠️ E LA SOGLIA SI ALZA CON LE COLONNE. 1280 era la misura giusta per
   * NOVE; con «Sito» diventano dieci e con «Altri costi» undici, e alla stessa
   * larghezza al Cliente restavano una settantina di pixel — una tabella che
   * tecnicamente entra e praticamente non si legge, visto che il nome del
   * cliente è il dato per cui si guarda la riga.
   *
   * Sotto la soglia si vedono le SCHEDE, che dicono le stesse cose per esteso
   * — sito compreso, o la richiesta «metti anche in tabella di che sito è»
   * sarebbe stata esaudita solo su uno schermo grande.
   */
  /**
   * ⚠️ SOGLIA UNICA E PIÙ BASSA (28/08/2026). Otto colonne + azioni:
   * 92+80+120+92+74+84+96 = 638 di fisse, 353 di azioni, ~180 minimi al
   * cliente, ~40 di spazi → la tabella respira già a 1240. Prima, con
   * tredici colonne, serviva un 1633 che quasi nessuno schermo ha — e sotto
   * soglia le fisse si schiacciavano in briciole.
   */
  const aTabella = width >= 1205;
  /**
   * Sopra questa misura ci stanno TUTTE le colonne, canale compreso: misurato
   * nel DOM, a 1649 al nome del cliente restano 209px invece dei 111 che
   * avrebbe con la stessa tabella a 1489 (misura del 27/08; le soglie sono poi
   * salite di 48 con le icone grandi del 28/08). Non è una soglia di stile: è il punto
   * in cui rimettere una colonna smette di togliere spazio al dato principale.
   */


  /**
   * Quanto ci costa ciascun ordine: dai lavori collegati alla sua trattativa
   * (preventivo SCELTO se c'è, altrimenti il più basso ricevuto).
   *
   * ⚠️ Un ordine senza preventivi non entra nella mappa, e il margine resta
   * «—»: contarlo a costo zero darebbe un margine pari al prezzo pieno.
   */
  const costi = useMemo(() => costiPerOrdine(lavori, ordini), [lavori, ordini]);
  /**
   * ⚠️ IL MARGINE TOGLIE ANCHE GLI ALTRI COSTI (27/08/2026). Una colonna che
   * mostra un costo senza sottrarlo racconta due numeri che non tornano fra
   * loro, ed è peggio che non avere la colonna.
   *
   * Qui `null` vuol dire «non ce ne sono», non «non lo so»: un costo che
   * nessuno ha scritto è un costo che non c'è, e contarlo zero non gonfia
   * niente. Il VALORE invece resta un'altra storia — lì zero mentirebbe, ed è
   * il motivo per cui senza valore il margine è «—».
   */


  const altriCostiDi = (o: OrdineConLuogo): number => o.altri_costi ?? 0;
  /**
   * ⭐ LA FORNITURA È OBBLIGATORIA PRIMA DI CHIUDERE (27/08/2026, richiesta
   * dell'utente: «la fornitura va indicata obbligatoria prima di mettere
   * l'ordine come chiuso»).
   *
   * ⚠️ Obbligatoria QUI e non alla creazione: un ordine nasce da solo da una
   * trattativa vinta o da una richiesta, e in quel momento il fornitore non si
   * sa ancora. Un vincolo a monte avrebbe spento il funnel per far rispettare
   * una regola che riguarda la fine, non l'inizio. Si incassa quando si sa
   * quanto è costata — altrimenti si registra un ricavo senza il suo costo, e
   * il margine di quell'ordine è un numero inventato.
   */
  const haFornitura = useCallback(
    // ⚠️ «Senza fornitura» (migr. 0105) soddisfa l'obbligo: è la dichiarazione
    // esplicita che quest'ordine non ha costi di fornitura (es. una quota di
    // affiliazione) — l'alternativa era inventarsi un fornitore finto per
    // aggirare il vincolo, che è peggio del vincolo.
    (o: OrdineConLuogo) =>
      Boolean(o.senza_fornitura) || lavori.some((l) => l.ordine_id === o.id && l.preventivi.length > 0),
    [lavori],
  );
  /**
   * Il costo dell'ordine è DEFINITIVO? Tre casi, in ordine di forza:
   * fornitura registrata (decide `costiPerOrdine`), dichiarato senza fornitura
   * (il costo è zero per dichiarazione, non per dimenticanza), nessuno dei due
   * (il margine resta una stima o un «—»). ⚠️ Se esistono preventivi veri,
   * VINCONO sul flag: un costo reale batte una dichiarazione vecchia.
   */
  const costoDefinitivo = useCallback(
    (o: OrdineConLuogo): boolean => {
      const c = costi.get(o.id);
      return c ? c.definitivo : Boolean(o.senza_fornitura);
    },
    [costi],
  );
  const margineDi = useCallback(
    (o: OrdineConLuogo): number | null => {
      if (o.valore == null) return null;
      const c = costi.get(o.id);
      // Senza preventivi il margine resta «—»… salvo dichiarazione esplicita:
      // lì il costo di fornitura È zero, e il margine è valore − altri costi.
      if (!c) {
        if (!o.senza_fornitura) return null;
        return Math.round((o.valore - (o.altri_costi ?? 0)) * 100) / 100;
      }
      return Math.round((o.valore - c.costo - (o.altri_costi ?? 0)) * 100) / 100;
    },
    [costi],
  );

  /**
   * ⚠️ STA QUI, DOPO `costi` e `margineDi`, e non più in cima: il totale del
   * margine realizzato li legge entrambi. Messo sopra, il file compilava per
   * caso finché non gli serviva davvero un valore — e poi smetteva.
   */
  const totali = useMemo(() => {
    const anno = new Date().getFullYear();
    const validi = ordini.filter((o) => o.stato !== 'annullato' && new Date(o.created_at).getFullYear() === anno);
    return {
      chiusoAnno: validi.reduce((s, o) => s + (o.valore ?? 0), 0),
      daIncassare: ordini.filter((o) => o.stato === 'da_incassare').reduce((s, o) => s + (o.valore ?? 0), 0),
      // ⚠️ Il margine REALIZZATO dell'anno: solo gli ordini incassati e col
      // costo definitivo. Un margine «totale» che sommasse anche le stime
      // sarebbe il numero che si guarda per primo e quello che si scopre falso
      // per ultimo — e la sua base (quali ordini) non si vedrebbe.
      margineRealizzato: validi
        .filter((o) => o.stato === 'incassato' && costoDefinitivo(o))
        .reduce((s, o) => s + (margineDi(o) ?? 0), 0),
      quantiRealizzati: validi.filter((o) => o.stato === 'incassato' && costoDefinitivo(o)).length,
    };
  }, [ordini, costoDefinitivo, margineDi]);

  const colonne: ColonnaTabella<OrdineConLuogo>[] = [
    {
      chiave: 'cliente',
      label: 'Cliente',
      // ⚠️ L'UNICA colonna elastica, ed è voluto (misurato il 27/08/2026).
      // Quando erano elastiche anche Linea e Fornitore si dividevano lo spazio
      // in proporzione: al cliente ne toccava il 57%, cioè 56px, e agli altri
      // due venti pixel a testa — tre colonne illeggibili invece di una larga e
      // due strette ma stabili. Chi ha un testo corto prende una misura fissa;
      // quello che cresce è il nome, che è il dato per cui si guarda la riga.
      flex: 1,
      valore: (o) => o.place_nome ?? o.cliente,
      cella: (o) => (
        <View style={{ gap: 2 }}>
          <Text style={styles.tabNome} numberOfLines={2}>{o.place_nome ?? o.cliente}</Text>
          {o.descrizione ? <Text style={styles.descr} numberOfLines={1}>{o.descrizione}</Text> : null}
          {/* ⭐ CHI L'HA SEGUITO (27/08/2026, richiesta dell'utente: «per ogni
              trattativa e ordine poi indica anche chi è che l'ha seguita»).
              ⚠️ Sta QUI e non in una colonna sua, e la ragione è misurata: con
              tredici colonne al nome del cliente restavano 69px. Un nome corto
              sotto il nome del cliente costa zero larghezza e si legge nello
              stesso sguardo — una colonna in più li avrebbe resi illeggibili
              tutti e due.
              ⚠️ Quando manca non si scrive niente: un ordine senza proprietario
              è un fatto (nato da un import o da un cron), e attribuirlo a chi
              guarda sarebbe la bugia più comoda. */}
          {/* ⚠️ SITO e CANALE stanno QUI, non in due colonne (28/08/2026,
              segnalazione dell'utente: «la tabella è ancora un disastro»).
              Con TREDICI colonne le fisse venivano schiacciate in briciole —
              «W…», «Ang ol…» — e ogni icona nuova peggiorava. Sono contesto
              del cliente: una riga sotto il nome costa zero larghezza e si
              legge nello stesso sguardo. Niente è stato tolto: è stato
              AVVICINATO. */}
          <Text style={styles.seguitoDa} numberOfLines={1}>
            {brandDi(o)}
            {o.canale ? ` · ${LABEL_CANALE[o.canale] ?? o.canale}` : ''}
          </Text>
          {o.owner_nome ? <Text style={styles.seguitoDa}>Seguito da {o.owner_nome}</Text> : null}
          {/* ⚠️ Il riferimento sta sulla RIGA, non solo nel foglio: è il numero
              che si copia nel DDT della consegna, e chi lo cerca sta guardando
              l'elenco — non ha voglia di aprire cinque ordini per trovarlo. */}
          <ChipRiferimento rif={o.riferimento} />
          {/* ⚠️ Il documento sta QUI, sotto il nome, non fra le azioni: è
              un'informazione sull'ordine, non un comando. Nella colonna delle
              azioni rubava lo spazio ai bottoni e li mandava a capo. */}
          {/* ⭐ CHE DOCUMENTO È (28/08/2026, richiesta dell'utente: «se
              l'ordine è stato chiuso con fattura indicalo chiaramente»).

              ⚠️ Prima la pillola scriveva il numero e basta: «PF 2/2026» e
              «600/2026» avevano lo stesso aspetto, e una pratica chiusa con
              una PRO-FORMA sembrava fatturata. Sono due cose diverse — la
              pro-forma è una richiesta di pagamento, la fattura è il
              documento fiscale — e la differenza si vede solo se è scritta. */}
          {o.fattura_numero ? (
            <Pressable
              style={[styles.docChip, styles.docChipFattura]}
              hitSlop={6}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                scaricaFattura(o);
              }}
              accessibilityLabel={`Scarica la fattura ${o.fattura_numero}`}
              {...({ title: 'Scarica la fattura (PDF da Fatture in Cloud)' } as any)}
            >
              <Ionicons name="receipt" size={11} color={colors.bianco} />
              <Text style={[styles.docChipTxt, styles.docChipTxtFattura]}>Fattura {o.fattura_numero}</Text>
              <Ionicons name="download-outline" size={11} color={colors.bianco} />
            </Pressable>
          ) : o.proforma_numero ? (
            <Pressable
              style={styles.docChip}
              hitSlop={6}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                scaricaProforma(o);
              }}
              accessibilityLabel={`Scarica la pro-forma ${o.proforma_numero}`}
              {...({ title: 'Scarica la pro-forma (stampa da Scout) — non è la fattura' } as any)}
            >
              <Ionicons name="document-text-outline" size={11} color={colors.goldStrong} />
              <Text style={styles.docChipTxt}>Pro-forma {o.proforma_numero}</Text>
            </Pressable>
          ) : null}
        </View>
      ),
    },
    { chiave: 'linea', label: 'Linea', width: 92, righe: 2, valore: (o) => o.linea ?? null },
    /**
     * ⚠️ SITO, CANALE e FORNITORE non sono più colonne (28/08/2026): il sito
     * e il canale vivono sotto il nome del cliente, il fornitore dentro la
     * colonna del costo — dov'è la cifra di cui è l'autore. Con tredici
     * colonne le fisse si schiacciavano in briciole.
     */
    /**
     * ⚠️ L'ORDINE DELLE COLONNE DEL DENARO È QUELLO CHIESTO DALL'UTENTE
     * (27/08/2026): valore → preventivo → altri costi → margine → % margine.
     *
     * Non è una preferenza estetica: è la SEQUENZA DEL CONTO. Si legge quanto
     * si vende, quanto si paga, e solo dopo quello che resta — e chi la legge
     * può rifare la sottrazione con l'occhio, senza saltare da una parte
     * all'altra della riga. Prima il margine stava PRIMA del valore da cui si
     * ricava.
     */
    {
      chiave: 'valore',
      label: 'Valore',
      width: 80,
      destra: true,
      numerica: true,
      valore: (o) => o.valore,
      cella: (o) => <Text style={styles.tabValore}>{importoBreve(o.valore)}</Text>,
    },
    {
      chiave: 'costo',
      label: 'Preventivo',
      width: 120,
      destra: true,
      numerica: true,
      valore: (o) => costi.get(o.id)?.costo ?? (o.senza_fornitura ? 0 : null),
      cella: (o) => {
        const c = costi.get(o.id);
        // ⚠️ «Senza fornitura» NON è «—»: il trattino dice «non lo so», qui il
        // costo è dichiarato inesistente — e la differenza è tutto il flag.
        if (!c && o.senza_fornitura) {
          return (
            <View
              style={{ alignItems: 'flex-end' }}
              {...({ title: 'Dichiarato senza costi di fornitura (es. quota di affiliazione)' } as any)}
            >
              <Text style={styles.tabValore}>{importoBreve(0)}</Text>
              <Text style={styles.tabStima} numberOfLines={1}>senza fornitura</Text>
              {o.altri_costi != null ? (
                <Text style={styles.tabStima} numberOfLines={1}>+ {importoBreve(o.altri_costi)} altri</Text>
              ) : null}
            </View>
          );
        }
        if (!c) return <Text style={styles.tabData}>—</Text>;
        return (
          <View
            style={{ alignItems: 'flex-end' }}
            {...({
              title: c.definitivo
                ? 'Scelto: la fornitura è decisa — questo è il costo vero'
                : 'Il più basso fra i preventivi ricevuti: una stima, può cambiare',
            } as any)}
          >
            <Text style={styles.tabValore}>{importoBreve(c.costo)}</Text>
            {/* ⚠️ «Scelto» o «il più basso» non sono la stessa cosa: il primo
                è una decisione presa, il secondo una stima che può cambiare.
                E il FORNITORE sta qui, accanto alla sua cifra. */}
            <Text style={styles.tabStima} numberOfLines={1}>
              {c.fornitore ? `${c.fornitore} · ` : ''}{c.definitivo ? 'scelto' : 'il più basso'}
            </Text>
            {o.altri_costi != null ? (
              <Text style={styles.tabStima} numberOfLines={1}>+ {importoBreve(o.altri_costi)} altri</Text>
            ) : null}
          </View>
        );
      },
    },
    // Gli ALTRI COSTI non hanno più una colonna condizionale: stanno sotto il
    // preventivo («+ € X altri»), nel margine c'erano già. Una colonna che
    // appare e scompare a seconda dei dati cambiava la soglia della tabella.
    {
      chiave: 'margine',
      label: 'Margine',
      width: 92,
      destra: true,
      numerica: true,
      valore: (o) => margineDi(o),
      cella: (o) => {
        const m = margineDi(o);
        // ⚠️ Senza preventivo il margine NON è il prezzo pieno: è sconosciuto.
        // Scriverlo sarebbe il numero più ottimista e più falso che c'è.
        if (m === null) return <Text style={styles.tabData}>—</Text>;
        /**
         * ⚠️ REALIZZATO o STIMATO, ed è una differenza che conta (27/08/2026,
         * richiesta dell'utente: «indica poi in tabella ordini il margine
         * realizzato»).
         *
         * Realizzato vuol dire due cose insieme: l'ordine è INCASSATO — i soldi
         * sono arrivati — e il costo è DEFINITIVO, cioè la fornitura è stata
         * registrata e non è più «il preventivo più basso ricevuto». Basta che
         * ne manchi una perché il numero sia ancora una previsione, e chiamarlo
         * realizzato vorrebbe dire mettere in cassa un margine che può ancora
         * cambiare.
         */
        const realizzato = o.stato === 'incassato' && costoDefinitivo(o);
        return (
          <View
            style={{ alignItems: 'flex-end' }}
            {...({
              title: realizzato
                ? 'Realizzato: ordine incassato E fornitura scelta — il margine è un fatto'
                : 'Stimato: manca l’incasso o il fornitore è ancora «il più basso» — può cambiare',
            } as any)}
          >
            <Text style={[styles.tabValore, m < 0 && styles.margineNegativo]}>{importoBreve(m)}</Text>
            <Text style={[styles.tabStima, m < 0 && styles.margineNegativo]}>
              {realizzato ? 'realizzato' : 'stimato'}
            </Text>
          </View>
        );
      },
    },
    /**
     * ⭐ LA PERCENTUALE DI MARGINE, colonna sua (27/08/2026, richiesta
     * dell'utente: «valore, preventivo, margine e % margine»).
     *
     * ⚠️ La sua BASE è il valore, ed è la colonna che si legge quattro posti
     * più a sinistra, nella stessa riga: una percentuale la cui base non sta a
     * schermo è un numero giusto che sembra sbagliato. Prima stava dentro la
     * didascalia del margine, dove non si poteva né ordinare né confrontare —
     * ed è proprio ordinando per questa che si vede quale lavoro rende.
     *
     * ⚠️ Senza valore non c'è percentuale: dividere per zero, o per un valore
     * sconosciuto, darebbe un numero inventato. Si scrive «—», che è vero.
     */
    {
      chiave: 'percentuale',
      label: '% Margine',
      width: 74,
      destra: true,
      numerica: true,
      valore: (o) => {
        const m = margineDi(o);
        return m !== null && o.valore ? Math.round((m / o.valore) * 1000) / 10 : null;
      },
      cella: (o) => {
        const m = margineDi(o);
        if (m === null || !o.valore) return <Text style={styles.tabData}>—</Text>;
        const perc = Math.round((m / o.valore) * 100);
        return (
          <Text style={[styles.tabValore, m < 0 && styles.margineNegativo]}>{perc}%</Text>
        );
      },
    },
    {
      chiave: 'quando',
      label: 'Creato',
      // ⚠️ 84 e non 66 (28/08/2026, segnalazione dell'utente: «le date sono
      // sotto margine invece che in una colonna a sé»): a 66 la data andava a
      // capo o si incollava alla colonna prima, e la testata sembrava di
      // un'altra colonna.
      width: 84,
      destra: true,
      numerica: true,
      valore: (o) => o.created_at,
      cella: (o) => <Text style={styles.tabData}>{dataIt(o.created_at)}</Text>,
    },
    {
      chiave: 'stato',
      // ⚠️ Sotto il badge dello stato c'è la pratica: «incassato» e «chiuso»
      // sono due risposte a due domande diverse, e una riga che mostra solo la
      // prima fa credere che non ci sia altro da fare.
      label: 'Stato',
      width: 96,
      valore: (o) => statoPratica(o).label,
      cella: (o) => (
        <View
          style={{ gap: 2, alignItems: 'flex-start' }}
          {...({
            title:
              statoPratica(o).label === 'Bozza'
                ? 'Bozza: pratica aperta, il numero SCOUT arriva alla chiusura'
                : statoPratica(o).label === 'Chiuso'
                  ? 'Chiuso: pratica finita con documento — l’incasso è a parte'
                  : statoPratica(o).label === 'Incassato'
                    ? 'Incassato: i soldi sono arrivati'
                    : 'Annullato: la pratica non è successa',
          } as any)}
        >
          <StatusBadge small label={statoPratica(o).label} colore={statoPratica(o).colore} />
          {/* «Chiuso» senza soldi: si dice che l'incasso manca, o la scala a
              quattro parole nasconderebbe proprio la cosa da fare. */}
          {statoPratica(o).label === 'Chiuso' && o.stato === 'da_incassare' ? (
            <Text style={styles.tabStima}>da incassare</Text>
          ) : null}
          {/* ⚠️ «Chiusa il 28/08» non dice la cosa che serve: chiusa CON CHE
              COSA (28/08/2026, richiesta dell'utente: «se l'ordine è stato
              chiuso con fattura indicalo chiaramente»). Una pratica chiusa
              con una PRO-FORMA non è fatturata, e leggerla come fatturata fa
              dare per incassabile un ricavo che allo SDI non è mai partito. */}
          {o.chiuso_il ? (
            <Text style={[styles.tabStima, o.fattura_numero && styles.tabChiusaFattura]}>
              {o.fattura_numero
                ? 'chiusa con fattura'
                : o.proforma_numero
                  ? 'chiusa con pro-forma'
                  : 'chiusa senza documento'}{' '}
              il {new Date(o.chiuso_il).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </Text>
          ) : null}
        </View>
      ),
    },
    {
      chiave: 'azioni',
      label: '',
      /**
       * ⚠️ COMPATTA (27/08/2026, richiesta dell'utente: «tabella deve essere
       * compatta»). Prima erano quattro pillole di testo più due icone: ~360px
       * di larghezza per riga, cioè un terzo della tabella speso in bottoni.
       *
       * Le azioni sono le STESSE SEI: non se ne toglie nessuna per fare spazio
       * — si stringe la cornice, non il loro numero. Diventano icone con
       * l'etichetta al passaggio del mouse e per il lettore di schermo, che è
       * la stessa parola di prima.
       */
      /**
       * ⚠️ 206 NON è un numero tondo: è il conto, e va rifatto ogni volta che
       * si aggiunge un'azione. SETTE icone da 17 con cornice da 5 per lato fanno
       * 7×27 = 189, più sei spazi da 2 = 201, più cinque di margine perché una
       * misura esatta al pixel non ha dove andare se un carattere rende mezzo
       * pixel più largo — e questa riga NON VA A CAPO: quello che avanza esce
       * dalla colonna.
       *
       * Erano sei fino al 27/08/2026; il lucchetto della chiusura è il settimo,
       * ed è uscito dal ramo «da incassare» per essere visibile sempre.
       *
       * ⚠️ 28/08/2026: il furgone dell'EVASIONE è l'ottavo, e il conto è stato
       * rifatto — 8×27 = 216, più sette spazi da 2 = 230, più 5 di margine =
       * 235. Le tre soglie della tabella sono salite dello stesso numero
       * (1460→1489, 1360→1389, 1620→1649): allargare una colonna senza alzare
       * la soglia stringe tutte le altre proprio alla larghezza in cui la
       * tabella era già al limite.
       *
       * ⚠️ 28/08/2026 sera, regola dell'utente (Libro v1.8): «icone troppo
       * piccole» — cornici 27→33 (icona 19 + 7 di padding per lato). Conto
       * rifatto: 8×33 = 264, più sette spazi da 2 = 278, più 5 di margine =
       * 283. Le soglie salgono di altri 48: 1489→1537, 1389→1437, 1649→1697.
       *
       * ⚠️ 28/08/2026, poco dopo: lo SCARICO DELLA FATTURA è il nono, e
       * compare solo dove una fattura c'è davvero. Conto rifatto con le
       * cornici da 33: 9×33 = 297, più otto spazi da 2 = 313, più 5 di
       * margine = 318. Soglie di nuovo su di 35: 1537→1572, 1437→1472,
       * 1697→1732.
       *
       * ⚠️ 28/08/2026, sera: DUPLICA è la decima, e sta su TUTTI gli ordini.
       * 10×33 = 330, più nove spazi da 2 = 348, più 5 = 353.
       *
       * ⚠️ 28/08/2026, notte: la FATTURA è tornata UN'icona sola (vuota =
       * chiedi, oro = scarica): l'icona download separata è sparita. Massimo
       * nove icone insieme: 9×33 = 297, più otto spazi da 2 = 313, più 5 =
       * 318 — e la soglia della tabella scende con lei (1240→1205).
       */
      width: 318,
      fissa: true,
      valore: () => null,
      cella: (o) => (
        <View style={styles.tabAzioni}>
          {/* ⚠️ IL LUCCHETTO STA FUORI DAL RAMO (27/08/2026, segnalazione
              dell'utente: «il lucchetto per chiudere ordine deve essere
              visibile anche qui»). L'avevo messo accanto alla spunta
              «incassato», che vive solo nel ramo «da incassare»: su un ordine
              GIÀ incassato spariva — cioè proprio su quelli che si devono
              chiudere. Chiudere la pratica non dipende da dove sono i soldi.

              Resta fuori solo l'annullato: una pratica che non è successa non
              si chiude, si lascia com'è. */}
          {o.stato !== 'annullato' ? (
            <Pressable
              style={styles.iconaAzione}
              hitSlop={8}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                if (o.chiuso_il) riapriOrdine(o);
                else apriChiusura(o);
              }}
              accessibilityLabel={o.chiuso_il ? "Pratica chiusa — riapri" : "Chiudi la pratica"}
              {...({
                title: o.chiuso_il
                  ? 'Riapri la pratica'
                  : 'Chiudi la pratica — fattura emessa o agganciata',
              } as any)}
            >
              <Ionicons
                /* ⭐ LA CHIUSURA È LA V (28/08/2026, richiesta dell'utente:
                    «la chiusura dell'ordine sarebbe più chiara con la V»).
                    Il lucchetto diceva «bloccato», non «finito». Vuota = da
                    chiudere; piena e oro = chiusa (e il tocco riapre). */
                name={o.chiuso_il ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={19}
                color={o.chiuso_il ? colors.goldStrong : colors.navy}
              />
            </Pressable>
          ) : null}
          {/* ⭐ L'EVASIONE (28/08/2026, richiesta dell'utente: «metti richiesta
              evasione di un ordine dopo la chiusura che manda all'app delivery
              le informazioni per l'inserimento»).

              ⚠️ Appare SOLO a pratica chiusa, e non è una restrizione
              burocratica: prima l'ordine è una bozza senza numero, e la
              richiesta arriverebbe alle consegne senza il riferimento da
              scrivere nel DDT — cioè senza il modo di sapere a cosa lega la
              consegna che sta inserendo.

              ⚠️ Quando è già stata mandata l'icona resta e diventa piena: si
              può rimandare (l'indirizzo cambia, la data slitta), ma si vede a
              colpo d'occhio che qualcosa era già partito. */}
          {/* ⭐ DUPLICA (28/08/2026): su TUTTI gli ordini, anche annullati e
              chiusi — è chiesto proprio per rifare un ordine annullato per
              errore. Nasce una bozza; niente numero, documenti o fornitura. */}
          <Pressable
            style={styles.iconaAzione}
            hitSlop={8}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              duplica(o);
            }}
            accessibilityLabel={`Duplica l'ordine ${o.riferimento ?? o.cliente} come bozza`}
            {...({ title: 'Duplica come bozza — per rifare un ordine sbagliato o annullato' } as any)}
          >
            <Ionicons name="copy-outline" size={19} color={colors.navy} />
          </Pressable>
          {/* ⭐ FATTURA: SEMPRE LA STESSA ICONA, il colore dice lo stato
              (28/08/2026, richiesta dell'utente: «al posto di cambiarla con
              download metti sempre la stessa icona ma colorata»). Vuota e blu
              = chiedila; piena e oro = c'è, e il tocco la SCARICA. La regola è
              quella di portafoglio e furgone: un concetto, un simbolo — il
              colore racconta. */}
          {o.stato !== 'annullato' ? (
            <Pressable
              style={styles.iconaAzione}
              hitSlop={8}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                if (o.fattura_numero) scaricaFattura(o);
                else chiediFattura(o);
              }}
              accessibilityLabel={o.fattura_numero ? `Scarica la fattura ${o.fattura_numero}` : 'Chiedi la fattura a FINANCE'}
              {...({
                title: o.fattura_numero
                  ? `Fattura ${o.fattura_numero} emessa — tocca per scaricare il PDF`
                  : 'FATTURA — chiedi il documento fiscale a FINANCE (non è l’incasso)',
              } as any)}
            >
              <Ionicons
                name={o.fattura_numero ? 'receipt' : 'receipt-outline'}
                size={19}
                color={o.fattura_numero ? colors.goldStrong : colors.navy}
              />
            </Pressable>
          ) : null}
          {o.chiuso_il ? (
            <Pressable
              style={styles.iconaAzione}
              hitSlop={8}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                apriEvasione(o);
              }}
              accessibilityLabel="Chiedi l'evasione alle consegne"
              {...({
                title: o.evasione_richiesta_il
                  ? `Evasione già chiesta il ${dataIt(o.evasione_richiesta_il)} — si può rimandare`
                  : 'Chiedi l’evasione: manda alle consegne i dati per inserire il servizio',
              } as any)}
            >
              <Ionicons
                name={o.evasione_richiesta_il ? 'car' : 'car-outline'}
                size={19}
                color={o.evasione_richiesta_il ? colors.goldStrong : colors.navy}
              />
            </Pressable>
          ) : null}
          {o.stato === 'da_incassare' ? (
            <>
              {/* La fattura vive nell'icona UNICA più a sinistra (vuota =
                  chiedi, oro = scarica): qui non si ripete. */}
              {/* ⭐ LA PRO-FORMA CHE NON C'È (27/08/2026). Ogni ordine nasce
                  con la sua pro-forma, ma se FINANCE non risponde — o se il
                  cliente là non esiste ancora — l'ordine resta senza. Prima
                  l'unico modo di rimediare era rifare l'ordine: adesso il
                  bottone compare SOLO su chi il documento non ce l'ha, e sparisce
                  appena arriva. */}
              {!o.proforma_numero && !o.fattura_numero ? (
                <Pressable
                  style={[styles.iconaAzione, inCorso === o.id && { opacity: 0.5 }]}
                  disabled={inCorso === o.id}
                  onPress={(e: any) => { e?.stopPropagation?.(); emettiProforma(o); }}
                  accessibilityLabel="Emetti la pro-forma"
                  {...({ title: 'PRO-FORMA — emettila su FINANCE e agganciala a questo ordine' } as any)}
                >
                  {/* La stessa icona della pillola «Pro-forma». Quando la PF
                      c'è, quest'icona non compare: c'è la pillola che scarica
                      — e la fattura ha già la sua icona unica. */}
                  <Ionicons name="document-text-outline" size={19} color={colors.navy} />
                </Pressable>
              ) : null}
              <Pressable
                style={styles.iconaAzione}
                onPress={(e: any) => { e?.stopPropagation?.(); chiediAcconto(o); }}
                accessibilityLabel={o.acconto_richiesto_il ? `Acconto del ${o.acconto_percento}% già richiesto` : "Chiedi un acconto"}
                {...({
                  title: o.acconto_richiesto_il
                    ? `Acconto del ${o.acconto_percento}% richiesto il ${dataIt(o.acconto_richiesto_il)}`
                    : 'Acconto — chiedine uno in percentuale',
                } as any)}
              >
                {/* ⭐ ACCESA quando l'acconto è stato chiesto (28/08/2026,
                    richiesta dell'utente): piena e oro — è uno stato, non un
                    invito, come il lucchetto della pratica chiusa. */}
                <Ionicons
                  name={o.acconto_richiesto_il ? 'wallet' : 'wallet-outline'}
                  size={19}
                  color={o.acconto_richiesto_il ? colors.goldStrong : colors.navy}
                />
              </Pressable>
              {/* L'azione di tutti i giorni resta l'unica PIENA: si trova
                  a colpo d'occhio anche fra sei icone. */}
              <Pressable
                style={styles.iconaPiena}
                onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'incassato'); }}
                accessibilityLabel="Segna incassato"
                {...({ title: 'Segna INCASSATO — i soldi sono arrivati' } as any)}
              >
                {/* ⚠️ Era la V bianca su nero: ma la V ora è la CHIUSURA, e due
                    V con due significati si scambiano. L'incasso è denaro:
                    banconote. */}
                <Ionicons name="cash-outline" size={19} color={colors.bianco} />
              </Pressable>
              <Pressable
                style={styles.iconaAzione}
                hitSlop={8}
                onPress={(e: any) => { e?.stopPropagation?.(); apriModifica(o); }}
                accessibilityLabel="Modifica l'ordine"
                {...({ title: "Modifica l'ordine" } as any)}
              >
                <Ionicons name="create-outline" size={19} color={colors.grigio} />
              </Pressable>
              <Pressable
                style={styles.iconaAzione}
                hitSlop={8}
                onPress={(e: any) => { e?.stopPropagation?.(); chiediAnnulla(o); }}
                accessibilityLabel="Annulla l'ordine"
                {...({ title: "Annulla l'ordine" } as any)}
              >
                <Ionicons name="close-circle-outline" size={19} color={colors.grigio} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={styles.iconaAzione}
                onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'da_incassare'); }}
                accessibilityLabel="Riporta a da incassare"
                {...({ title: 'Riportalo fra quelli da incassare' } as any)}
              >
                <Ionicons name="arrow-undo-outline" size={19} color={colors.navy} />
              </Pressable>
              {/* ⚠️ Anche un ordine incassato o annullato si corregge: un nome
                  sbagliato resta sbagliato nei conti dell'anno. */}
              <Pressable
                style={styles.iconaAzione}
                hitSlop={8}
                onPress={(e: any) => { e?.stopPropagation?.(); apriModifica(o); }}
                accessibilityLabel="Modifica l'ordine"
                {...({ title: "Modifica l'ordine" } as any)}
              >
                <Ionicons name="create-outline" size={19} color={colors.grigio} />
              </Pressable>
            </>
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
   * ⚠️ Fatturare NON è incassare: i soldi arrivano dopo, e «Incassato» resta
   * un gesto a parte. Confonderli farebbe risultare pagato ciò che è solo
   * fatturato. Il bottone si chiama «Fattura» (26/08 sera, richiesta
   * dell'utente: prima diceva «Chiudi», che non diceva cosa succedeva).
   */
  /**
   * ⭐ SCARICA LA FATTURA (28/08/2026, richiesta dell'utente: «permetti di
   * scaricare la fattura anche da questa app direttamente»).
   *
   * ⚠️ **Il link può non esserci, e non è un guasto.** Le fatture agganciate
   * prima di oggi hanno il numero ma non l'indirizzo del PDF: FINANCE lo
   * mandava già e Scout lo buttava via. Qui, se manca, si va a RIPRENDERLO dal
   * numero e lo si SCRIVE sull'ordine — così la volta dopo è immediato.
   *
   * ⚠️ Se non si trova si dice perché. Aprire una pagina vuota, o non fare
   * niente al tocco, sono i due modi peggiori di rispondere «non ce l'ho».
   */
  /**
   * ⭐ LA PRO-FORMA SI SCARICA DA QUI (28/08/2026, richiesta dell'utente:
   * «consenti il download direttamente da app di questa pro-forma senza
   * aprire finance»). La pagina di FINANCE è dietro login (verificato: 307 →
   * /login): si chiedono i DATI all'API e si impagina con il template del
   * brand, che è di Scout. La finestra ha «Stampa / Salva PDF».
   */
  /**
   * ⭐ AGGIORNA LA PRO-FORMA (28/08/2026, richiesta dell'utente: «metti un
   * pulsante che chieda l'aggiornamento della pro-forma»).
   *
   * ⚠️ FINANCE non modifica un documento emesso (la sua API cambia solo lo
   * stato): «aggiornare» vuol dire EMETTERE una pro-forma nuova con i dati di
   * adesso — valore, causale, brand — e agganciare quella all'ordine. È anche
   * giusto così: il documento vecchio è già stato visto da qualcuno, e
   * riscriverlo sotto lo stesso numero renderebbe vere due versioni.
   *
   * ⚠️ La vecchia RESTA su FINANCE, e l'avviso lo dice col numero: annullarla
   * è un'azione di là, di chi possiede il documento.
   */
  function aggiornaProforma(o: OrdineConLuogo) {
    if (!o.valore) {
      avvisa('Manca il valore', "Senza l'importo la pro-forma nuova non si può emettere: scrivilo e riprova.");
      return;
    }
    conferma(
      'Aggiornare la pro-forma?',
      `Viene emessa una pro-forma NUOVA con i dati attuali (${importoBreve(o.valore)} + IVA) e agganciata all'ordine. La ${o.proforma_numero} resta su FINANCE: se non vale più, va annullata di là.`,
      async () => {
        setInCorso(o.id);
        try {
          const esito = await emettiProformaPerOrdine({
            ordineId: o.id,
            cliente: o.place_nome ?? o.cliente,
            importo: o.valore,
            causale: o.descrizione,
            brand: brandDi(o),
            accontoPercento: o.acconto_percento ?? null,
          });
          if (!esito.emessa) {
            avvisa('Pro-forma non aggiornata', esito.perche ?? 'FINANCE non ha risposto.');
            return;
          }
          await carica();
          // ⚠️ Anche la SCHEDA APERTA si aggiorna (28/08/2026, segnalazione
          // dell'utente: «aggiornando pro-forma poi qui rimane il nome della
          // vecchia»). `carica()` rinfresca la lista sotto, ma `modificaPer` è
          // la fotografia scattata all'apertura del foglio: senza questa riga
          // il bottone continuava a offrire di aggiornare un documento che
          // era appena stato sostituito.
          setModificaPer((cur) =>
            cur && cur.id === o.id
              ? { ...cur, proforma_numero: esito.riferimento, proforma_url: esito.url ?? cur.proforma_url }
              : cur,
          );
          avvisa('Pro-forma aggiornata', `Ora l'ordine porta la ${esito.riferimento}. La vecchia ${o.proforma_numero ?? ''} resta su FINANCE.`);
        } catch (e: any) {
          avvisa('Pro-forma non aggiornata', String(e?.message ?? e));
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Emetti la nuova' },
    );
  }

  async function scaricaProforma(o: OrdineConLuogo) {
    if (!o.proforma_numero) return;
    setInCorso(o.id);
    try {
      const [doc, templates, dest] = await Promise.all([
        documentoProforma(o.proforma_numero),
        fetchTemplate().catch(() => [] as TemplateDocumento[]),
        // I dati societari del CLIENTE: vivono nel registro, non su FINANCE.
        o.place_anagrafiche_id ? datiSocietariRegistro(o.place_anagrafiche_id) : Promise.resolve(null),
      ]);
      // Il template del brand dell'ordine; senza, il predefinito; senza
      // NESSUN template — al 28/08 la tabella era VUOTA, ed è per questo che
      // la prima copia è uscita col solo «Deluxy Srl» — si ripiega sui dati
      // aziendali delle Impostazioni: veri, non inventati.
      const marca = brandDi(o);
      const t =
        templates.find((x) => x.attivo && (x.brand ?? '').trim().toLowerCase() === marca.trim().toLowerCase()) ??
        templates.find((x) => x.predefinito) ??
        templates.find((x) => x.attivo) ??
        null;
      let intestazione;
      if (t) {
        intestazione = {
          ragioneSociale: t.ragione_sociale,
          indirizzo: t.indirizzo ?? '',
          piva: t.piva ?? '',
          rea: t.rea ?? '',
          contatti: t.contatti ?? '',
          logoDataUrl: t.logo_data_url ?? '',
          iban: t.iban ?? '',
          intestatarioConto: t.intestatario_conto ?? '',
          modalitaPagamento: t.modalita_pagamento ?? '',
          banca: t.banca ?? '',
          bic: t.bic ?? '',
          disclaimer: t.disclaimer ?? '',
        };
      } else {
        const imp = await leggiImpostazioni([
          'azienda.ragione_sociale', 'azienda.indirizzo', 'azienda.cap_citta', 'azienda.piva',
          'azienda.pec', 'banca.iban', 'banca.intestatario', 'banca.istituto', 'banca.bic',
        ]);
        intestazione = {
          ragioneSociale: imp['azienda.ragione_sociale'] || 'Deluxy Srl',
          indirizzo: [imp['azienda.indirizzo'], imp['azienda.cap_citta']].filter(Boolean).join(' · '),
          piva: imp['azienda.piva'] || '',
          contatti: imp['azienda.pec'] ? `PEC ${imp['azienda.pec']}` : '',
          iban: imp['banca.iban'] || '',
          intestatarioConto: imp['banca.intestatario'] || '',
          banca: imp['banca.istituto'] || '',
          bic: imp['banca.bic'] || '',
        };
      }
      const nomeFile = await scaricaPdfProforma(doc, intestazione, dest ?? { nome: doc.partner?.nome ?? o.cliente });
      avvisa('Pro-forma scaricata', `${nomeFile} è nei tuoi Download.`);
    } catch (e: any) {
      avvisa('Pro-forma non scaricata', String(e?.message ?? e));
    } finally {
      setInCorso(null);
    }
  }

  async function scaricaFattura(o: OrdineConLuogo) {
    if (o.fattura_url) {
      Linking.openURL(o.fattura_url);
      return;
    }
    if (!o.fattura_numero) return;
    setInCorso(o.id);
    try {
      // ⚠️ IL NUMERO SI SPEZZA: sull'ordine è scritto «600/2026», ma la
      // ricerca su Fatture in Cloud vuole il numero NUDO e l'anno a parte.
      // Misurato il 28/08/2026 sulla 600 di TBF: «600» torna la fattura col
      // link, «600/2026» torna zero risultati — e lo scarico avrebbe detto
      // «il PDF non è disponibile» su una fattura che c'è.
      const [soloNumero, soloAnno] = o.fattura_numero.split('/');
      const esito = await cercaFatture({
        numero: soloNumero,
        anno: soloAnno ? Number(soloAnno) : null,
        tipo: 'invoice',
      });
      // ⚠️ Si prende quella col NUMERO UGUALE, non la prima dell'elenco: una
      // ricerca per numero può tornare anche i simili, e aprire la fattura di
      // un altro cliente è peggio che non aprirne nessuna.
      const trovata = (esito.fatture ?? []).find((f) => (f.numero ?? '') === o.fattura_numero);
      if (!trovata?.url) {
        avvisa(
          'Il PDF non è disponibile',
          esito.ok
            ? `La fattura ${o.fattura_numero} risulta agganciata, ma Fatture in Cloud non dà un link al documento. Si apre da FINANCE.`
            : `Non sono riuscito a chiederlo a FINANCE: ${esito.errore ?? 'nessuna risposta'}.`,
        );
        return;
      }
      // Si scrive sull'ordine: la seconda volta non deve rifare il giro.
      await collegaDocumentoAOrdine(o.id, { fatturaUrl: trovata.url });
      Linking.openURL(trovata.url);
      await carica();
    } catch (e: any) {
      avvisa('Non sono riuscito ad aprirla', String(e?.message ?? e));
    } finally {
      setInCorso(null);
    }
  }

  async function chiediFattura(o: OrdineConLuogo) {
    if (inCorso) return;
    if (!o.valore) {
      avvisa('Manca il valore', 'Un ordine senza importo non si fattura: scrivi quanto vale, poi si emette il documento.');
      return;
    }
    conferma(
      'Emettere la fattura?',
      `${o.cliente} · ${importoBreve(o.valore)}.\n\n${
        o.proforma_numero
          ? `La pro-forma ${o.proforma_numero} passa a fatturata su FINANCE.`
          : 'Nasce la pro-forma su FINANCE e viene subito confermata (fatturata).'
      }\n\nL’incasso resta un gesto a parte: fatturato non vuol dire pagato.`,
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
          avvisa('Fattura emessa', `${doc.riferimento} è fatturata su Deluxy Partner. L’incasso resta da segnare qui.`);
        } catch (e: any) {
          // ⚠️ Il messaggio di FINANCE si mostra INTERO: se il cliente là non
          // c'è dice «Partner non trovato» coi candidati, cioè cosa manca e dove.
          avvisa('Fattura non emessa', e?.message ?? 'Riprova.');
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Emetti la fattura' },
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
      // ⚠️ L'ordine RICORDA l'acconto (28/08/2026): senza questa riga né
      // l'icona né la pro-forma potevano sapere che era stato chiesto.
      await aggiornaOrdine(o.id, {
        acconto_percento: percentuale,
        acconto_richiesto_il: new Date().toISOString(),
      });
      await carica();
      setAccontoPer(null);
      avvisa('Acconto richiesto', `${importoBreve(importo)} (${percentuale}%) è in Pagamenti, col saldo accanto. L'icona del portafoglio resta accesa sull'ordine.`);
    } catch (e: any) {
      avvisa('Non è stato richiesto', e?.message ?? 'Riprova.');
    } finally {
      setInCorso(null);
    }
  }

  /**
   * ⭐ EMETTE LA PRO-FORMA che manca (27/08/2026).
   *
   * Ogni ordine nasce con la sua — è la regola, e adesso vale su tutte e tre le
   * strade che portano a un ordine. Ma FINANCE può non rispondere, o il cliente
   * può non esistere ancora di là: in quel caso l'ordine nasce comunque (non si
   * perde una vendita perché un registro è giù) e resta senza documento. Da qui
   * si rimedia, senza rifare l'ordine.
   */
  async function emettiProforma(o: OrdineConLuogo) {
    if (inCorso) return;
    conferma(
      'Emettere la pro-forma?',
      `${o.cliente} · ${importoBreve(o.valore)}.\n\nNasce su FINANCE in bozza e resta agganciata a questo ordine. L'invio al cliente si fa di là.`,
      async () => {
        setInCorso(o.id);
        try {
          const esito = await emettiProformaPerOrdine({
            ordineId: o.id,
            cliente: o.cliente,
            importo: o.valore,
            causale: o.descrizione,
            brand: brandDi(o),
            accontoPercento: o.acconto_percento ?? null,
          });
          await carica();
          if (esito.emessa) {
            avvisa('Pro-forma emessa', `${esito.riferimento} è agganciata all'ordine.`);
          } else {
            avvisa('Non è stata emessa', `${esito.perche}.`);
          }
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Emetti' },
    );
  }

  /** Apre il foglio di modifica con i valori di adesso già dentro. */
  function apriModifica(o: OrdineConLuogo) {
    setModificaPer(o);
    setBozza({
      cliente: o.cliente ?? '',
      placeId: o.place_id ?? null,
      placeAnagraficheId: o.place_anagrafiche_id ?? null,
      descrizione: o.descrizione ?? '',
      // ⚠️ La virgola italiana: si scrive «1.250,50», non «1250.50».
      valore: scriviImporto(o.valore),
      linea: o.linea ?? null,
      canale: o.canale ?? null,
      brand: brandDi(o),
      altriCosti: scriviImporto(o.altri_costi),
      altriCostiNota: o.altri_costi_nota ?? '',
      unita: o.unita ?? null,
      quanti: o.quantita != null ? String(o.quantita) : '',
      owner: o.owner ?? null,
    });
  }

  /**
   * Salva le modifiche. ⚠️ Si mandano SOLO i campi davvero cambiati: una PATCH
   * completa riscriverebbe anche quelli che nessuno ha toccato, e basta un
   * campo non mostrato nel form per cancellarlo in silenzio.
   */
  async function salvaModifica() {
    if (!modificaPer || !bozza) return;
    const nome = bozza.cliente.trim();
    if (!nome) {
      avvisa('Manca il cliente', "Un ordine senza il nome di chi compra non si ritrova più: scrivi chi è.");
      return;
    }
    // «1.250,50» → 1250.5 (lib/importi.ts). Se il campo è vuoto il valore
    // torna sconosciuto (null), che NON è zero: zero direbbe «venduto a niente».
    const vuoto = !bozza.valore.trim();
    const valore = vuoto ? null : leggiImporto(bozza.valore);
    if (!vuoto && (valore === null || valore < 0)) {
      avvisa('Valore non valido', `«${bozza.valore}» non è un importo. Scrivilo come 1.250,50.`);
      return;
    }
    const patch: Parameters<typeof aggiornaOrdine>[1] = {};
    if (nome !== (modificaPer.cliente ?? '')) patch.cliente = nome;
    // ⚠️ Il LEGAME col negozio viaggia solo se è cambiato davvero: mandarlo
    // sempre riscriverebbe la colonna a ogni salvataggio, e un giorno con il
    // valore sbagliato di una bozza rimasta indietro.
    if ((bozza.placeId ?? null) !== (modificaPer.place_id ?? null)) patch.place_id = bozza.placeId ?? null;
    const descr = bozza.descrizione.trim() || null;
    if (descr !== (modificaPer.descrizione ?? null)) patch.descrizione = descr;
    /**
     * ⚠️ IL VALORE È SEMPRE IL TOTALE (27/08/2026, richiesta dell'utente: «le
     * opzioni di valore e se sono riferite a quantità, giorno o ora mettile
     * anche qui»). Con l'unità scelta, il numero scritto sopra è il prezzo di
     * UNA e il totale è il prodotto: margine, conti dell'anno, percentuale e
     * pro-forma leggono `valore`, e mettendoci l'unitario un ordine da «45 ×
     * 30» varrebbe 45 anche sul documento mandato al cliente.
     */
    const q = bozza.quanti.trim() ? Number(bozza.quanti.replace(',', '.')) : null;
    const aUnita = bozza.unita && valore != null && q != null && Number.isFinite(q) && q > 0;
    const totale = aUnita ? Math.round(valore! * q! * 100) / 100 : valore;
    if (totale !== (modificaPer.valore ?? null)) patch.valore = totale;
    const unitario = aUnita ? valore : null;
    if (unitario !== (modificaPer.valore_unitario ?? null)) patch.valore_unitario = unitario;
    if ((aUnita ? q : null) !== (modificaPer.quantita ?? null)) patch.quantita = aUnita ? q : null;
    if ((aUnita ? bozza.unita : null) !== (modificaPer.unita ?? null)) patch.unita = aUnita ? bozza.unita : null;
    // ⚠️ Scegliendo qui si segna anche che la scelta è DI UNA PERSONA: da quel
    // momento vince su quella della trattativa (migr. 0091).
    if ((bozza.owner ?? null) !== (modificaPer.owner ?? null)) {
      patch.owner = bozza.owner;
      patch.owner_scelto = true;
    }
    if ((bozza.linea ?? null) !== (modificaPer.linea ?? null)) patch.linea = bozza.linea;
    if ((bozza.canale ?? null) !== (modificaPer.canale ?? null))
      patch.canale = bozza.canale as OrdineConLuogo['canale'];
    if ((bozza.brand ?? null) !== brandDi(modificaPer)) patch.brand = bozza.brand;
    // ⚠️ Vuoto = «non ce ne sono», e si scrive null: zero e null qui dicono la
    // stessa cosa nel margine, ma null non fa comparire «€ 0» in tabella su
    // ogni ordine che non ha costi extra.
    const altri = bozza.altriCosti.trim() ? leggiImporto(bozza.altriCosti) : null;
    if (bozza.altriCosti.trim() && altri === null) {
      avvisa('Altri costi non capiti', `«${bozza.altriCosti}» non è un importo. Scrivilo come 1.250,50.`);
      return;
    }
    if (altri !== (modificaPer.altri_costi ?? null)) patch.altri_costi = altri;
    const nota = bozza.altriCostiNota.trim() || null;
    if (nota !== (modificaPer.altri_costi_nota ?? null)) patch.altri_costi_nota = nota;
    if (!Object.keys(patch).length) {
      setModificaPer(null);
      setBozza(null);
      return;
    }

    const salva = async () => {
      setInCorso(modificaPer.id);
      try {
        await aggiornaOrdine(modificaPer.id, patch);
        setModificaPer(null);
        setBozza(null);
        await carica();
      } catch (e: any) {
        avvisa('Non è stato salvato', e?.message ?? 'Riprova.');
      } finally {
        setInCorso(null);
      }
    };

    /**
     * ⚠️ IL DOCUMENTO GIÀ EMESSO NON SI CORREGGE DA SOLO. Se cambia il valore
     * di un ordine che ha già una fattura (o una pro-forma) su FINANCE, quel
     * documento resta con l'importo vecchio: la modifica qui NON arriva di là.
     * Non si vieta — vietare spinge solo a rifare l'ordine da capo — ma si
     * dice, perché il documento è quello che il cliente ha in mano.
     */
    const doc = modificaPer.fattura_numero || modificaPer.proforma_numero;
    if (doc && patch.valore !== undefined) {
      conferma(
        'Il documento resta com’è',
        `${doc} su FINANCE tiene l'importo vecchio (${importoBreve(modificaPer.valore)}): questa modifica non arriva di là. Va corretto anche lì, o i due numeri diranno cose diverse.`,
        salva,
        { testoConferma: 'Salvo lo stesso' },
      );
      return;
    }
    await salva();
  }

  /**
   * ⚠️ ANNULLARE CHIEDE (27/08/2026). Era l'unico gesto pesante della pagina
   * senza conferma: partiva dritto da un'icona di 16px che sta a 6px da
   * «Modifica», l'azione più usata della riga. Tutte le altre operazioni serie
   * — Fattura, Pro-forma, la modifica di un ordine già fatturato — la conferma
   * ce l'avevano. Si dice anche che è reversibile: è vero, e sapere che si può
   * tornare indietro fa parte della decisione.
   */
  function chiediAnnulla(o: OrdineConLuogo) {
    conferma(
      "Annullare l'ordine?",
      `${o.cliente} · ${importoBreve(o.valore)}.\n\nEsce dal «Chiuso ${new Date().getFullYear()}» e dal «Da incassare». Si può rimettere in gioco dal bottone «Da incassare».`,
      () => cambiaStato(o, 'annullato'),
      { testoConferma: 'Annulla ordine', distruttivo: true },
    );
  }

  /**
   * ⚠️ IL DIVIETO VALE ANCHE QUI, ed è il posto per cui era nato (richiesta
   * dell'utente: «la fornitura va indicata obbligatoria prima di mettere
   * l'ordine come chiuso»). Chiudere senza sapere quanto è costato vuol dire
   * archiviare un ricavo senza il suo costo: il margine di quell'ordine resta
   * un numero inventato, e nessuno ci tornerà più sopra.
   */
  /** Duplica come BOZZA: si conferma prima, e si dice cosa NON viene copiato. */
  function duplica(o: OrdineConLuogo) {
    conferma(
      "Duplicare l'ordine?",
      `${o.riferimento ?? o.cliente}: nasce una copia in BOZZA con cliente, valore, linea e FORNITURA (fornitori e prezzi compresi). Non si copiano numero, documenti ed evasione — la copia si chiude come un ordine nuovo.`,
      async () => {
        setInCorso(o.id);
        try {
          await duplicaOrdine(o);
          await carica();
          avvisa('Ordine duplicato', "La copia è in cima all'elenco, in bozza: si completa e si chiude come un ordine nuovo.");
        } catch (e: any) {
          avvisa('Non duplicato', String(e?.message ?? e));
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Duplica' },
    );
  }

  function apriEvasione(o: OrdineConLuogo) {
    // ⚠️ La condizione è la stessa che applica il server: qui si risparmia un
    // giro, ma il NO vero lo dice la funzione — un controllo che vive solo nel
    // browser è un controllo che non c'è.
    if (!o.chiuso_il) {
      avvisa(
        'La pratica non è ancora chiusa',
        "L'evasione si chiede dopo la chiusura: prima l'ordine è una bozza e non ha il numero da scrivere nel DDT della consegna.",
      );
      return;
    }
    setEvasionePer(o);
  }

  function apriChiusura(o: OrdineConLuogo) {
    if (!haFornitura(o)) {
      avvisa(
        'Manca la fornitura',
        'Prima di chiudere bisogna dire chi ha fornito e a quanto: senza, il ricavo entra nei conti e il suo costo no.\n\nSi scrive dalla modifica dell\'ordine, sezione «Fornitura» — e se quest\'ordine non ha costi di fornitura (es. una quota di affiliazione), lì c\'è la spunta «Senza fornitura».',
      );
      return;
    }
    setChiusuraPer(o);
  }

  /**
   * ⭐ RIAPRIRE UN ORDINE CHIUSO (27/08/2026, richiesta dell'utente).
   *
   * ⚠️ SI CHIEDE PRIMA. Riaprire era già possibile — lo stesso lucchetto —
   * ma succedeva al primo clic, in silenzio: una pratica chiusa si riapriva
   * per sbaglio e nessuno se ne accorgeva, perché a schermo cambiava solo
   * un'icona. Chiudere costa tre passaggi; disfare non può costarne mezzo.
   *
   * ⚠️ La FATTURA resta agganciata. Riaprire vuol dire «c'è ancora da fare
   * qualcosa», non «quel documento non esiste»: staccarla farebbe sparire un
   * collegamento vero, e per rimetterlo bisognerebbe ricercarla.
   */
  function riapriOrdine(o: OrdineConLuogo) {
    const quando = o.chiuso_il ? new Date(o.chiuso_il).toLocaleDateString('it-IT') : null;
    conferma(
      "Riaprire l'ordine?",
      `${o.place_nome ?? o.cliente}${quando ? ` — chiuso il ${quando}` : ''}.\n\nTorna fra le pratiche da chiudere. ${
        o.fattura_numero
          ? `La fattura ${o.fattura_numero} resta collegata: riaprire non la cancella.`
          : 'Non ha documenti collegati.'
      }`,
      async () => {
        try {
          await aggiornaOrdine(o.id, { chiuso_il: null });
          carica();
        } catch (e: any) {
          avvisa('Non riaperto', String(e?.message ?? e));
        }
      },
      { testoConferma: 'Riapri' },
    );
  }

  async function cambiaStato(o: OrdineConLuogo, stato: OrdineConLuogo['stato']) {
    // ⚠️ Il divieto sta QUI, non solo sul bottone: la stessa funzione la
    // chiamano l'icona in tabella e il bottone della scheda, e una regola
    // scritta su uno dei due punti è una regola che si aggira dall'altro.
    if (stato === 'incassato' && !haFornitura(o)) {
      avvisa(
        'Manca la fornitura',
        'Prima di segnare incassato bisogna dire chi ha fornito e a quanto: senza, il ricavo entra nei conti e il suo costo no — e il margine di questo ordine è un numero inventato.\n\nSi scrive dalla modifica dell\'ordine, sezione «Fornitura» — e se quest\'ordine non ha costi di fornitura (es. una quota di affiliazione), lì c\'è la spunta «Senza fornitura».',
      );
      return;
    }
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
      {/* ⚠️ L'intestazione segue la LARGHEZZA DELL'ELENCO (27/08/2026): con un
          cap da 760 sopra una tabella da 1180, entrambi centrati, titolo e
          filtri partivano 210px dentro il bordo della tabella e sembravano di
          un altro blocco. È lo schema che Richieste Clienti applicava già. */}
      <View style={[styles.head, aTabella ? contenutoExtraLargo : contenutoCentrato]}>
        <PageIntro
          dentroUnBloccoSpaziato
          testo="Gli ordini nati dalle trattative vinte. La pipeline dice quanto stai trattando: qui vedi quanto hai chiuso, e cosa resta da incassare."
        />
        <Text style={styles.sub}>
          Chiuso {new Date().getFullYear()}: <Text style={styles.subForte}>{euro(totali.chiusoAnno)}</Text>
          {'  ·  '}Da incassare: <Text style={styles.subForte}>{euro(totali.daIncassare)}</Text>
          {totali.quantiRealizzati ? (
            <>
              {'  ·  '}Margine realizzato:{' '}
              <Text style={styles.subForte}>{euro(totali.margineRealizzato)}</Text>
              <Text style={styles.subNota}> (su {totali.quantiRealizzati} ordini incassati)</Text>
            </>
          ) : null}
        </Text>
        {/* ⭐ LA LEGENDA DELLE ICONE (28/08/2026, richiesta dell'utente:
            «rivedi tutte le icone... metti poi una legenda»). Chiusa di
            default: chi le conosce non deve scavalcarla ogni giorno. Solo
            dove c'è la tabella — sul telefono i bottoni hanno la parola. */}
        {aTabella ? (
          <View>
            <Pressable style={styles.legendaToggle} onPress={() => setLegenda((v) => !v)} hitSlop={6}>
              <Ionicons name={legenda ? 'chevron-up' : 'help-circle-outline'} size={15} color={colors.grigio} />
              <Text style={styles.legendaToggleTxt}>{legenda ? 'Chiudi la legenda' : 'Legenda delle icone'}</Text>
            </Pressable>
            {legenda ? (
              <View style={styles.legenda}>
                {(
                  [
                    ['checkmark-circle-outline', 'Chiudi la pratica', 'piena e oro = chiusa; il tocco riapre'],
                    ['cash-outline', 'Segna incassato', 'i soldi sono arrivati (bottone nero)'],
                    ['receipt-outline', 'Fattura', 'vuota = chiedila a FINANCE; piena e oro = tocca per scaricare il PDF'],
                    ['document-text-outline', 'Emetti la pro-forma', 'la richiesta di pagamento'],
                    ['wallet-outline', 'Chiedi un acconto', 'piena e oro = già richiesto'],
                    ['car-outline', 'Richiedi l’evasione', 'piena e oro = già richiesta; solo a pratica chiusa'],
                    ['copy-outline', 'Duplica come bozza', 'per rifare un ordine sbagliato'],
                    ['create-outline', 'Modifica l’ordine', 'valore, cliente, fornitura, pro-forma'],
                    ['close-circle-outline', 'Annulla l’ordine', 'la pratica non è successa'],
                    ['arrow-undo-outline', 'Riporta a da incassare', 'toglie l’incasso segnato per sbaglio'],
                  ] as [string, string, string][]
                ).map(([icona, nome, nota]) => (
                  <View key={nome} style={styles.legendaRiga}>
                    <Ionicons name={icona as any} size={16} color={colors.navy} />
                    <Text style={styles.legendaNome}>{nome}</Text>
                    <Text style={styles.legendaNota} numberOfLines={1}>{nota}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Zona filtri al Libro v1.2 §8 (28/08, segnalazione utente: 4 gruppi
            sempre aperti ≈ 300px, il 37-40% di un telefono). La dimensione
            PRIMARIA — lo stato dell'incasso, quella che si cambia più volte al
            giorno — resta fuori come riga a sé; Interessi, Pratica e Periodo
            sono l'eccedenza e stanno dietro «Filtri (N)», chiuso di default. */}
        <PannelloFiltri
          dentroUnBloccoSpaziato
          primaria={
            <>
              <Chip label="Tutti" title="Tutti gli ordini, in qualunque stato" on={!statoFiltro} onPress={() => setStatoFiltro(null)} />
              {FILTRI_PRATICA.map((s) => (
                <Chip
                  key={s.valore}
                  label={s.chip}
                  title={
                    s.valore === 'Bozza'
                      ? 'Pratiche ancora aperte: senza numero e senza documento'
                      : s.valore === 'Chiuso'
                        ? 'Pratiche finite (con documento), soldi ancora da incassare'
                        : s.valore === 'Incassato'
                          ? 'I soldi sono arrivati'
                          : 'Ordini annullati: la pratica non è successa'
                  }
                  on={statoFiltro === s.valore}
                  onPress={() => setStatoFiltro((c) => (c === s.valore ? null : s.valore))}
                />
              ))}
            </>
          }
          attivi={(lineaFiltro ? 1 : 0) + (chiusura !== 'tutti' ? 1 : 0) + (periodo !== 'tutti' ? 1 : 0)}
          onAzzera={() => {
            setLineaFiltro(null);
            setChiusura('tutti');
            setPeriodo('tutti');
          }}
          risultati={dati.length}
        >
          {lineePresenti.length ? (
            <RigaChips style={styles.chips}>
              <Text style={styles.gruppoTitolo}>Interessi</Text>
              <Chip label="Tutti" on={!lineaFiltro} onPress={() => setLineaFiltro(null)} />
              {lineePresenti.map((l) => (
                <Chip key={l} label={l} on={lineaFiltro === l} onPress={() => setLineaFiltro((c) => (c === l ? null : l))} />
              ))}
            </RigaChips>
          ) : null}
          {/* ⭐ IL PERIODO (27/08/2026): quattro scorciatoie, non un
              calendario. La domanda vera e quella di tutti i giorni — «come sta
              andando questo mese?» — e per farsela non si deve scegliere due
              date. */}
          <RigaChips style={styles.chips}>
            <Text style={styles.gruppoTitolo}>Pratica</Text>
            <Chip label="Tutti" on={chiusura === 'tutti'} onPress={() => setChiusura('tutti')} />
            <Chip label="Da chiudere" on={chiusura === 'aperti'} onPress={() => setChiusura('aperti')} />
            <Chip label="Chiusi" on={chiusura === 'chiusi'} onPress={() => setChiusura('chiusi')} />
          </RigaChips>
          <RigaChips style={styles.chips}>
            <Text style={styles.gruppoTitolo}>Periodo</Text>
            {([
              { v: 'tutti', l: 'Sempre' },
              { v: 'mese', l: 'Questo mese' },
              { v: 'scorso', l: 'Mese scorso' },
              { v: 'trimestre', l: 'Trimestre' },
              { v: 'anno', l: 'Anno' },
            ] as const).map((o) => (
              <Chip key={o.v} label={o.l} on={periodo === o.v} onPress={() => setPeriodo(o.v)} />
            ))}
          </RigaChips>
        </PannelloFiltri>
      </View>

      <FlatList
        /**
         * ⚠️ IL TOTALE DEL FILTRO ANCHE SUL TELEFONO (27/08/2026). La riga dei
         * totali è una prop della tabella, quindi sotto i 900px non c'era
         * niente: filtrando «Gifting» dal telefono non si vedeva né quante
         * righe fossero né quanto valessero, mentre da monitor sì. I due numeri
         * in testa non rispondono a quella domanda — dichiarano un'altra base
         * (l'anno, e lo stato «da incassare») e non seguono i filtri, ed è
         * giusto così.
         */
        ListHeaderComponent={
          !aTabella && dati.length ? (
            <View style={styles.riepilogoMobile}>
              <Text style={styles.riepilogoTxt}>
                {dati.length} {dati.length === 1 ? 'ordine' : 'ordini'}
                {statoFiltro || lineaFiltro ? ' nel filtro' : ''} ·{' '}
                {importoBreve(dati.reduce((s, o) => s + (o.valore ?? 0), 0))}
              </Text>
            </View>
          ) : null
        }
        // In tabella la FlatList riceve UNA riga con l'intero elenco.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(o: any) => (aTabella ? 'tabella' : (o as OrdineConLuogo).id)}
        contentContainerStyle={[styles.list, aTabella ? contenutoExtraLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          errore ? (
            // Errore ≠ vuoto (Libro UX cap.6): card rossa + «Riprova», non la
            // schermata che dice «non ce ne sono».
            <View style={styles.erroreCard}>
              <View style={styles.erroreTesta}>
                <Ionicons name="warning-outline" size={16} color={colors.errore} />
                <Text style={styles.erroreTitolo}>Gli ordini non si sono caricati</Text>
              </View>
              <Text style={styles.erroreTxt}>{errore}</Text>
              <Pressable
                style={({ pressed }) => [styles.btnRiprova, pressed && { opacity: 0.6 }]}
                onPress={carica}
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare gli ordini"
              >
                <Ionicons name="refresh" size={15} color={colors.bianco} />
                <Text style={styles.btnRiprovaTxt}>Riprova</Text>
              </Pressable>
            </View>
          ) : (
            <EmptyState
              loading={loading}
              icona="receipt-outline"
              titolo="Ancora nessun ordine"
              aiuto="Quando chiudi una trattativa come «vinta», l'ordine nasce qui da solo, pronto da seguire fino all'incasso."
              azione="Vai alle Trattative"
              onAzione={() => router.push('/(app)/trattative')}
            />
          )
        }
        renderItem={({ item }) =>
          aTabella ? (
            <Tabella
              righe={item as OrdineConLuogo[]}
              colonne={colonne}
              chiaveRiga={(o) => o.id}
              ordineIniziale={{ campo: 'quando', verso: 'desc' }}
              // ⭐ LA RIGA APRE L'ORDINE (27/08/2026, richiesta dell'utente: «al
              // click sulla riga della tabella deve aprire il dettaglio
              // dell'ordine non l'anagrafica»). Prima portava alla scheda del
              // negozio: da un elenco di ORDINI ci si aspetta l'ordine.
              onRiga={(o) => apriModifica(o)}
              labelRiga={(o) => `Apri l'ordine di ${o.place_nome ?? o.cliente}`}
              /**
               * I totali in fondo (richiesta dell'utente). Sono quelli delle
               * righe A SCHERMO: cambiando filtro cambiano, e devono — un
               * totale che somma anche ciò che è filtrato via non corrisponde
               * a niente di visibile.
               *
               * ⚠️ Preventivo e margine sommano SOLO gli ordini che un
               * preventivo ce l'hanno, e il conto lo dice («su 3 di 4»):
               * senza, il margine totale sembrerebbe riferito a tutto
               * l'elenco quando riguarda solo una parte.
               */
              totali={(righe) => {
                // ⚠️ LA BASE È UNA SOLA (corretto il 27/08/2026). Prima bastava
                // `costi.has(o.id)`, e un ordine col preventivo ma SENZA valore
                // — caso che la modifica dell'ordine permette apposta —
                // entrava nel conto: il suo costo si sommava per intero mentre
                // il suo margine, sconosciuto, veniva contato zero. La riga dei
                // totali smetteva di tornare con se stessa (Margine ≠ Valore −
                // Preventivo) proprio dove il conto «su N di M» prometteva il
                // contrario. Un margine sconosciuto non è un margine nullo:
                // l'ordine esce dalla base, e il conto lo dichiara.
                const conCosto = righe.filter((o) => costi.has(o.id) && o.valore != null);
                const valore = righe.reduce((s, o) => s + (o.valore ?? 0), 0);
                const costo = conCosto.reduce((s, o) => s + (costi.get(o.id)?.costo ?? 0), 0);
                const margine = conCosto.reduce((s, o) => s + (margineDi(o) ?? 0), 0);
                // ⚠️ Gli altri costi si sommano sulla STESSA base del margine
                // (`conCosto`), non su tutte le righe: sono un addendo di quel
                // conto, e sommarli su una base più larga farebbe una riga di
                // totali che non torna con se stessa — Margine ≠ Valore −
                // Preventivo − Altri costi — proprio dove sta scritto su
                // quanti ordini è fatta.
                const altri = conCosto.reduce((s, o) => s + altriCostiDi(o), 0);
                return {
                  cliente: `Totale · ${righe.length} ordini`,
                  valore: importoBreve(valore),
                  // ⚠️ Il conto della base e gli altri costi stanno nella
                  // COLONNA DEL COSTO, che è dove quei numeri vivono ora.
                  costo: conCosto.length
                    ? `${importoBreve(costo + altri)} su ${conCosto.length} di ${righe.length}`
                    : 'nessun preventivo',
                  margine: conCosto.length ? importoBreve(margine) : '—',
                  // ⚠️ La percentuale del TOTALE si calcola sul valore degli ordini
                  // che hanno un costo (`conCosto`), non su tutti: dividere il
                  // margine di venti ordini per il valore di cinquanta darebbe una
                  // marginalità falsa, e più bassa del vero.
                  percentuale: (() => {
                    if (!conCosto.length) return '—';
                    const base = conCosto.reduce((s, o) => s + (o.valore ?? 0), 0);
                    return base ? `${Math.round((margine / base) * 100)}%` : '—';
                  })(),
                };
              }}
            />
          ) : (
            (() => {
              const o = item as OrdineConLuogo;
              return (
                <View style={styles.card}>
                  <View style={styles.cardHead}>
                    <Pressable style={{ flex: 1 }} onPress={() => apriModifica(o)} accessibilityLabel={`Modifica l'ordine di ${o.place_nome ?? o.cliente}`}>
                      <Text numberOfLines={3} style={styles.nome}>{o.place_nome ?? o.cliente}</Text>
                      {o.descrizione ? <Text style={styles.descr} numberOfLines={1}>{o.descrizione}</Text> : null}
                    </Pressable>
                    <Text style={styles.valore}>{euro(o.valore)}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <StatusBadge small label={statoPratica(o).label} colore={statoPratica(o).colore} />
                    {o.canale ? <Text style={styles.meta}>canale {o.canale}</Text> : null}
                    {o.linea ? <Text style={styles.meta}>{o.linea}</Text> : null}
                    {/* ⚠️ Il sito sta anche QUI, non solo in tabella: sotto la
                        soglia la tabella non si monta, e senza questa riga la
                        risposta a «di che sito è» sparirebbe con lei. */}
                    <Text style={styles.meta}>{brandDi(o)}</Text>
                    {o.altri_costi != null ? (
                      <Text style={styles.meta}>
                        + {importoBreve(o.altri_costi)} di altri costi
                        {o.altri_costi_nota ? ` (${o.altri_costi_nota})` : ''}
                      </Text>
                    ) : null}
                    <Text style={styles.meta}>{dataIt(o.created_at)}</Text>
                  </View>
                  <ChipRiferimento rif={o.riferimento} />
                  {/* Il costo e il margine anche sul telefono: senza, da qui
                      si vedrebbe solo quanto si incassa e mai quanto resta. */}
                  {(() => {
                    const c = costi.get(o.id);
                    const m = margineDi(o);
                    if (!c) return null;
                    return (
                      <Text style={styles.meta} numberOfLines={2}>
                        {c.fornitore} · {importoBreve(c.costo)} ({c.definitivo ? 'scelto' : 'il più basso'})
                        {m !== null ? ` · margine ${importoBreve(m)}` : ''}
                      </Text>
                    );
                  })()}
                  {/* Il documento sta con le informazioni, non fra i comandi —
                      e dice CHE COS'È: fattura o pro-forma non sono la stessa
                      cosa, e sul telefono il numero da solo non lo suggerisce. */}
                  {o.fattura_numero ? (
                    <Pressable
                      style={[styles.docChip, styles.docChipFattura]}
                      onPress={() => scaricaFattura(o)}
                      accessibilityLabel={`Scarica la fattura ${o.fattura_numero}`}
                    >
                      <Ionicons name="receipt" size={11} color={colors.bianco} />
                      <Text style={[styles.docChipTxt, styles.docChipTxtFattura]}>
                        Fattura {o.fattura_numero}
                      </Text>
                      <Ionicons name="download-outline" size={11} color={colors.bianco} />
                    </Pressable>
                  ) : o.proforma_numero ? (
                    <Pressable
                      style={styles.docChip}
                      onPress={() => scaricaProforma(o)}
                      accessibilityLabel={`Scarica la pro-forma ${o.proforma_numero}`}
                    >
                      <Ionicons name="document-text-outline" size={11} color={colors.goldStrong} />
                      <Text style={styles.docChipTxt}>Pro-forma {o.proforma_numero}</Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.azioni}>
                    {o.stato === 'da_incassare' ? (
                      <>
                        {!o.fattura_numero ? (
                          <Pressable
                            style={[styles.btnGhost, inCorso === o.id && { opacity: 0.5 }]}
                            disabled={inCorso === o.id}
                            onPress={() => chiediFattura(o)}
                          >
                            <Text style={styles.btnGhostTxt}>{inCorso === o.id ? 'Chiedo…' : 'Fattura'}</Text>
                          </Pressable>
                        ) : null}
                        {!o.proforma_numero && !o.fattura_numero ? (
                          <Pressable
                            style={[styles.btnGhost, inCorso === o.id && { opacity: 0.5 }]}
                            disabled={inCorso === o.id}
                            onPress={() => emettiProforma(o)}
                          >
                            <Text style={styles.btnGhostTxt}>{inCorso === o.id ? 'Emetto…' : 'Pro-forma'}</Text>
                          </Pressable>
                        ) : null}
                        <Pressable style={styles.btnGhost} onPress={() => chiediAcconto(o)}>
                          <Text style={styles.btnGhostTxt}>Acconto %</Text>
                        </Pressable>
                        <Pressable style={styles.btn} onPress={() => cambiaStato(o, 'incassato')}>
                          <Ionicons name="checkmark-circle-outline" size={15} color={colors.bianco} />
                          <Text style={styles.btnTxt}>Incassato</Text>
                        </Pressable>
                        {/* Anche sulla scheda: sotto la soglia la tabella non
                            si monta, e la chiusura sarebbe esistita solo su
                            schermo grande. */}
                        <Pressable
                          style={styles.btnGhost}
                          onPress={() => (o.chiuso_il ? riapriOrdine(o) : apriChiusura(o))}
                        >
                          <Ionicons
                            name={o.chiuso_il ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
                            size={15}
                            color={colors.navy}
                          />
                          <Text style={styles.btnGhostTxt}>{o.chiuso_il ? 'Riapri' : 'Chiudi'}</Text>
                        </Pressable>
                        <Pressable style={styles.btnGhost} onPress={() => duplica(o)}>
                          <Ionicons name="copy-outline" size={15} color={colors.navy} />
                          <Text style={styles.btnGhostTxt}>Duplica</Text>
                        </Pressable>
                        {/* Sul telefono l'evasione è un bottone con la parola
                            scritta: un furgoncino da solo, senza la colonna
                            delle azioni a fargli da contesto, non si capisce. */}
                        {o.chiuso_il ? (
                          <Pressable style={styles.btnGhost} onPress={() => apriEvasione(o)}>
                            <Ionicons
                              name={o.evasione_richiesta_il ? 'car' : 'car-outline'}
                              size={15}
                              color={o.evasione_richiesta_il ? colors.goldStrong : colors.navy}
                            />
                            <Text style={styles.btnGhostTxt}>
                              {o.evasione_richiesta_il ? 'Evasione chiesta' : 'Evasione'}
                            </Text>
                          </Pressable>
                        ) : null}
                        <Pressable style={styles.btnGhost} onPress={() => apriModifica(o)}>
                          <Text style={styles.btnGhostTxt}>Modifica</Text>
                        </Pressable>
                        <Pressable style={styles.btnGhost} onPress={() => cambiaStato(o, 'annullato')}>
                          <Text style={styles.btnGhostTxt}>Annulla</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable style={styles.btnGhost} onPress={() => cambiaStato(o, 'da_incassare')}>
                          <Text style={styles.btnGhostTxt}>Riporta a «da incassare»</Text>
                        </Pressable>
                        <Pressable style={styles.btnGhost} onPress={() => apriModifica(o)}>
                          <Text style={styles.btnGhostTxt}>Modifica</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })()
          )
        }
      />

      {/* MODIFICA DELL'ORDINE: si correggono i campi che l'ordine ha davvero —
          chi compra, cos'è, quanto vale, linea e canale. Lo STATO non sta qui:
          ha i suoi bottoni, e mescolarlo a un form lo farebbe cambiare per
          sbaglio insieme a una correzione di battitura. */}
      {chiusuraPer ? (
        <ChiusuraOrdine
          ordine={chiusuraPer}
          onClose={() => setChiusuraPer(null)}
          onFatto={() => {
            setChiusuraPer(null);
            carica();
          }}
        />
      ) : null}

      {evasionePer ? (
        <RichiestaEvasione
          ordine={evasionePer}
          onClose={() => setEvasionePer(null)}
          onFatto={() => {
            setEvasionePer(null);
            carica();
          }}
        />
      ) : null}

      {modificaPer && bozza ? (
        <Foglio
          titolo={modificaPer.riferimento ? `Ordine ${modificaPer.riferimento}` : "Modifica l'ordine"}
          sottotitolo={`Creato il ${dataIt(modificaPer.created_at)} · ${labelStatoOrdine[modificaPer.stato]}`}
          bloccaSfondo
          onClose={() => {
            setModificaPer(null);
            setBozza(null);
          }}
        >
          {/* ⚠️ Il riferimento in cima e COPIABILE: il foglio è il posto da
              cui si va ad aprire la consegna, ed è lì che serve avere il numero
              del DDT sotto il dito. Non è un campo: non si modifica (il
              database rifiuta), quindi non ha una casella. */}
          <View style={styles.rifRiga}>
            {modificaPer.riferimento ? (
              <>
                <ChipRiferimento rif={modificaPer.riferimento} grande />
                <Text style={styles.rifNota}>da scrivere come DDT sulla consegna in app delivery</Text>
              </>
            ) : (
              /* ⚠️ Si DICE perché non c'è. Un campo vuoto senza spiegazione
                 sembra un dato perso; qui è la regola: finché la pratica non è
                 chiusa l'ordine è una bozza e il numero non esiste ancora. */
              <Text style={styles.rifNota}>
                Bozza · il numero d'ordine (SCOUT…) si assegna alla chiusura della pratica
              </Text>
            )}
          </View>

          {/* ⭐ La pro-forma dell'ordine: da qui si AGGIORNA (se il valore è
              cambiato, o se è nata con la regola IVA vecchia). */}
          {modificaPer.proforma_numero ? (
            <View style={styles.rifRiga}>
              <Pressable
                style={styles.btnGhost}
                disabled={inCorso === modificaPer.id}
                onPress={() => aggiornaProforma(modificaPer)}
              >
                <Ionicons name="refresh-outline" size={15} color={colors.navy} />
                <Text style={styles.btnGhostTxt}>
                  {inCorso === modificaPer.id ? 'Emetto…' : `Aggiorna la pro-forma ${modificaPer.proforma_numero}`}
                </Text>
              </Pressable>
              <Text style={styles.rifNota}>ne esce una nuova coi dati attuali; la vecchia resta su FINANCE</Text>
            </View>
          ) : null}

          <Text style={styles.campoLabel}>Cliente *</Text>
          <TextInput
            style={styles.campo}
            value={bozza.cliente}
            onChangeText={(v) => setBozza({ ...bozza, cliente: v })}
            placeholder="Chi compra"
            placeholderTextColor={colors.grigio}
          />
          {/* ⭐ CAMBIARE CLIENTE (28/08/2026, richiesta dell'utente: «dai
              possibilità di cercare un altro cliente»).

              ⚠️ Restano due cose diverse, e la distinzione vale: il NOME del
              negozio appartiene alla sua scheda (riscriverlo qui farebbe due
              nomi per la stessa attività), ma il LEGAME appartiene all'ordine —
              e un ordine attaccato al cliente sbagliato, fino a ieri, non si
              correggeva da nessuna parte. */}
          <SceltaCliente
            attuale={{
              nome: bozza.cliente,
              placeId: bozza.placeId,
              anagraficheId: bozza.placeAnagraficheId,
            }}
            onScegli={(c) =>
              setBozza({
                ...bozza,
                // Il nome segue il negozio: lasciare quello vecchio su un
                // legame nuovo farebbe una riga che dice un'azienda e ne indica
                // un'altra.
                cliente: c.nome,
                placeId: c.placeId,
                placeAnagraficheId: c.anagraficheId,
              })
            }
          />
          {modificaPer.place_nome || bozza.placeId ? (
            <View style={styles.rigaNegozio}>
              <Text style={[styles.campoAiuto, { flex: 1 }]}>
                {bozza.placeId === modificaPer.place_id
                  ? `Negozio collegato: ${modificaPer.place_nome}`
                  : bozza.placeId
                    ? `Nuovo negozio: ${bozza.cliente} — si applica al salvataggio`
                    : 'Nessun negozio collegato — si applica al salvataggio'}
              </Text>
              {/* ⭐ 27/08/2026, richiesta dell'utente: «metti link per aprire i
                  dati del cliente in anagrafica». La domanda che segue «chi è
                  questo cliente?» è sempre la stessa — P.IVA, sede, referenti —
                  e la risposta sta in un'altra app: senza il link si copiava il
                  nome e lo si cercava a mano.
                  ⚠️ Compare solo se il negozio È nel registro: un link che
                  porta a una scheda inesistente fa credere che il dato ci sia. */}
              {urlSchedaRegistro(bozza.placeAnagraficheId) ? (
                <Pressable
                  style={styles.linkRegistro}
                  onPress={() => Linking.openURL(urlSchedaRegistro(bozza.placeAnagraficheId)!)}
                  accessibilityLabel="Apri la scheda del cliente in Anagrafiche"
                >
                  <Ionicons name="open-outline" size={14} color={colors.navy} />
                  <Text style={styles.linkRegistroTxt}>Apri in Anagrafiche</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.campoLabel}>Descrizione</Text>
          <TextInput
            style={[styles.campo, styles.campoAlto]}
            value={bozza.descrizione}
            onChangeText={(v) => setBozza({ ...bozza, descrizione: v })}
            placeholder="Cosa comprende l'ordine"
            placeholderTextColor={colors.grigio}
            multiline
          />

          <Text style={styles.campoLabel}>Valore</Text>
          <TextInput
            style={styles.campo}
            value={bozza.valore}
            onChangeText={(v) => setBozza({ ...bozza, valore: v })}
            placeholder="es. 1.250,50"
            placeholderTextColor={colors.grigio}
            inputMode="decimal"
          />
          <Text style={styles.campoAiuto}>
            Lasciandolo vuoto il valore torna sconosciuto (non zero). Il margine si ricalcola da solo sul
            preventivo del fornitore.
          </Text>

          {/* ⭐ IL VALORE A UNITÀ (27/08/2026): le stesse opzioni dei preventivi,
              dall'altra parte del conto — là quanto ci costa, qui quanto lo
              vendiamo. Facoltative: senza scelta il numero sopra è il totale. */}
          <Text style={styles.campoLabel}>Il valore è… (facoltativo)</Text>
          <View style={styles.chipsForm}>
            {([
              { v: 'pezzi', l: 'a pezzo / a persona' },
              { v: 'giorni', l: 'al giorno' },
              { v: 'ore', l: "all'ora" },
            ] as const).map((o) => (
              <Pressable
                key={o.v}
                style={[styles.chip, bozza.unita === o.v && styles.chipOn]}
                onPress={() => setBozza({ ...bozza, unita: bozza.unita === o.v ? null : o.v })}
              >
                <Text style={[styles.chipTxt, bozza.unita === o.v && styles.chipTxtOn]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>

          {bozza.unita ? (
            <>
              <Text style={styles.campoLabel}>
                {bozza.unita === 'pezzi' ? 'Quante persone / pezzi' : bozza.unita === 'giorni' ? 'Quanti giorni' : 'Quante ore'}
              </Text>
              <TextInput
                style={styles.campo}
                value={bozza.quanti}
                onChangeText={(v) => setBozza({ ...bozza, quanti: v })}
                placeholder={bozza.unita === 'pezzi' ? 'es. 30' : bozza.unita === 'giorni' ? 'es. 3' : 'es. 8'}
                placeholderTextColor={colors.grigio}
                inputMode="decimal"
              />
              {/* ⚠️ Il totale si VEDE prima di salvare: è quello che finisce nel
                  margine, nei conti dell'anno e sul documento del cliente. Un
                  conto fatto dall'app e mai mostrato è un conto che nessuno
                  controlla. */}
              {(() => {
                const u = bozza.valore.trim() ? leggiImporto(bozza.valore) : null;
                const q = bozza.quanti.trim() ? Number(bozza.quanti.replace(',', '.')) : null;
                if (u == null || q == null || !Number.isFinite(q) || q <= 0) {
                  return (
                    <Text style={styles.campoAiuto}>
                      Scrivi sopra il prezzo di una unità e qui quante ne sono: il totale lo calcola l&apos;app.
                    </Text>
                  );
                }
                return (
                  <Text style={styles.campoAiuto}>
                    {scriviImporto(u)} × {q} ={' '}
                    <Text style={{ fontWeight: '800' }}>€ {scriviImporto(Math.round(u * q * 100) / 100)}</Text> — è
                    questo che finisce nel margine e sul documento.
                  </Text>
                );
              })()}
            </>
          ) : null}

          {/* ⭐ LA FORNITURA (27/08/2026, richiesta dell'utente: «possibilità di
              scelta di uno o più fornitori (integrata ricerca con anagrafiche)
              e per ogni fornitore il prezzo del servizio fornito con
              possibilità di inserire come nota che cosa ha fornito»).

              ⚠️ Sta PRIMA degli altri costi perché è il costo principale: gli
              altri costi sono quello che avanza, non il grosso. E sta qui, non
              in una schermata a parte, perché è la domanda che ci si fa mentre
              si guarda l'ordine — «quanto mi è costato?». */}
          <BloccoFornitura
            ordine={modificaPer}
            righe={forniturePerOrdine(lavori, modificaPer.id)}
            onCambiato={carica}
          />

          {/* ⭐ ALTRI COSTI (27/08/2026, richiesta dell'utente: «metti una
              colonna altri costi sui costi che ci possono essere collegati»).
              Quelli che non passano da un preventivo fornitore: trasporto,
              una persona in più, il noleggio, il materiale comprato al volo.
              ⚠️ Il margine LI TOGLIE: è detto sotto al campo, perché un costo
              scritto qui cambia un numero che si legge altrove. */}
          <Text style={styles.campoLabel}>Altri costi</Text>
          <TextInput
            style={styles.campo}
            value={bozza.altriCosti}
            onChangeText={(v) => setBozza({ ...bozza, altriCosti: v })}
            placeholder="es. 120,00"
            placeholderTextColor={colors.grigio}
            inputMode="decimal"
          />
          <TextInput
            style={styles.campo}
            value={bozza.altriCostiNota}
            onChangeText={(v) => setBozza({ ...bozza, altriCostiNota: v })}
            placeholder="Di cosa sono fatti (trasporto, personale…)"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.campoAiuto}>
            Costi collegati che non passano da un preventivo fornitore. Il margine li sottrae.
          </Text>

          <Text style={styles.campoLabel}>Linea</Text>
          <View style={styles.chipsForm}>
            {LINEE_ATTIVE.map((l) => (
              <Pressable
                key={l}
                style={[styles.chip, bozza.linea === l && styles.chipOn]}
                onPress={() => setBozza({ ...bozza, linea: bozza.linea === l ? null : l })}
              >
                <Text style={[styles.chipTxt, bozza.linea === l && styles.chipTxtOn]}>{l}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.campoLabel}>Canale</Text>
          <View style={styles.chipsForm}>
            {CANALI.map((c) => (
              <Pressable
                key={c.valore}
                style={[styles.chip, bozza.canale === c.valore && styles.chipOn]}
                onPress={() => setBozza({ ...bozza, canale: bozza.canale === c.valore ? null : c.valore })}
              >
                <Text style={[styles.chipTxt, bozza.canale === c.valore && styles.chipTxtOn]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* ⭐ CON QUALE INSEGNA SI VENDE (27/08/2026, richiesta dell'utente:
              «fai indicare anche il brand per cui è la pro-forma, default
              deluxy»). Non è un'etichetta: decide l'INTESTAZIONE del documento
              — logo, ragione sociale, IBAN — che FINANCE tiene una per brand.
              Prima usciva sempre quella predefinita, quindi al cliente di Cake
              Design arrivava un foglio intestato Deluxy.
              ⚠️ Non si può togliere: una vendita è sempre di qualcuno. Chi non
              sceglie resta su Deluxy. */}
          {/* ⚠️ Si chiama «Sito», come la colonna in tabella (27/08/2026). Lo
              stesso dato con due nomi — «Sito» di là, «Brand della pro-forma»
              di qua — è un dato che si cerca e non si trova: chi voleva
              cambiare il sito di un ordine non riconosceva questo campo. */}
          <Text style={styles.campoLabel}>Chi ha seguito l&apos;ordine</Text>
          <View style={styles.chipsForm}>
            {venditori.map((v) => (
              <Pressable
                key={v.id}
                style={[styles.chip, bozza.owner === v.id && styles.chipOn]}
                onPress={() => setBozza({ ...bozza, owner: bozza.owner === v.id ? null : v.id })}
              >
                <Text style={[styles.chipTxt, bozza.owner === v.id && styles.chipTxtOn]}>
                  {v.nome?.trim() || v.email || v.id.slice(0, 6)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.campoAiuto}>
            Finché non lo scegli qui, vale chi ha seguito la trattativa da cui l&apos;ordine è nato. Scegliendolo,
            comanda questa scelta.
          </Text>

          <Text style={styles.campoLabel}>Sito (decide l&apos;intestazione del documento)</Text>
          <View style={styles.chipsForm}>
            {BRAND.map((b) => (
              <Pressable
                key={b}
                style={[styles.chip, bozza.brand === b && styles.chipOn]}
                onPress={() => setBozza({ ...bozza, brand: b })}
              >
                <Text style={[styles.chipTxt, bozza.brand === b && styles.chipTxtOn]}>{b}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.campoAiuto}>
            Decide logo e dati societari del documento. Se la pro-forma è già stata emessa, cambiarlo qui
            non la rifà: il documento va rifatto da FINANCE.
          </Text>

          <Pressable
            style={[styles.btn, styles.btnLargo, inCorso === modificaPer.id && { opacity: 0.5 }]}
            disabled={inCorso === modificaPer.id}
            onPress={salvaModifica}
          >
            <Text style={styles.btnTxt}>{inCorso === modificaPer.id ? 'Salvo…' : 'Salva le modifiche'}</Text>
          </Pressable>
        </Foglio>
      ) : null}

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

function Chip({ label, on, onPress, title }: { label: string; on: boolean; onPress: () => void; title?: string }) {
  return (
    // «tutto risponde» (Libro UX cap.3): la pillola reagisce alla pressione.
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.6 }]}
      // Il tooltip va FRA LE PROP: come figlio, React rifiuta lo spread —
      // ed è esattamente l'errore che ha fermato la build (28/08/2026).
      {...({ title } as any)}
    >
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * LA FORNITURA DI UN ORDINE: chi ha fornito, a quanto, che cosa.
 *
 * ⚠️ Non è una tabella nuova: ogni riga è un LAVORO dell'ordine col suo
 * fornitore scelto (vedi lib/fornitura.ts). Così il costo che si scrive qui è
 * lo stesso che il margine sottrae e che la colonna Preventivo mostra — invece
 * di essere un secondo costo che nessuno somma con il primo.
 */
/**
 * LA CHIUSURA DI UN ORDINE, e la domanda che la accompagna: questa vendita è
 * già fatturata?
 *
 * Tre strade, e sono tre perché la realtà ne ha tre:
 *  1. la fattura ESISTE già di là — si scrive il numero, l'app la VERIFICA su
 *     FINANCE e la aggancia. ⚠️ Si verifica, non si crede: un numero scritto a
 *     mano e mai controllato dichiara fatturato un ordine con un riferimento
 *     che non esiste, e non se ne accorge nessuno.
 *  2. non esiste — si emette, con la strada che l'app ha già.
 *  3. non serve (fattura fuori app, cliente privato, nota di credito) — si
 *     chiude lo stesso, ma la scelta è esplicita e scritta.
 */
function ChiusuraOrdine({
  ordine,
  onClose,
  onFatto,
}: {
  ordine: OrdineConLuogo;
  onClose: () => void;
  onFatto: () => void;
}) {
  const [numero, setNumero] = useState('');
  const [cerco, setCerco] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  /**
   * ⭐ CERCARE PER RAGIONE SOCIALE E IMPORTO (27/08/2026, richiesta
   * dell'utente: «la ricerca della fattura va fatta per ragione sociale,
   * importo oltre che per numero»).
   *
   * ⚠️ Il numero, quando si chiude un ordine, quasi nessuno ce l'ha: si sa chi
   * è il cliente e quanto vale. Partire dal numero voleva dire chiedere per
   * primo l'unico dato che manca — quindi i due campi partono già COMPILATI
   * con quello che l'ordine sa, e basta premere Cerca.
   */
  /**
   * ⚠️ UN CRITERIO PER VOLTA (correzione dell'utente, 27/08/2026: «sono tutte
   * opzioni differenti non vanno insieme, l'importo non va legato al nome»).
   *
   * Li avevo messi in AND — nome E importo insieme — e sbagliavo: chi cerca per
   * importo spesso NON sa il nome esatto, ed è per questo che cerca per
   * importo. Chiedere due certezze per trovarne una vuol dire non trovare mai
   * niente. Il campo è uno, e cambia significato col criterio scelto.
   */
  /**
   * ⭐ FATTURA o RICEVUTA (27/08/2026, richiesta dell'utente: «metti come
   * opzione RICEVUTA invece che fattura»).
   *
   * ⚠️ Non è un'etichetta: su Fatture in Cloud sono DUE ELENCHI diversi, e
   * cercare una ricevuta fra le fatture non la trova — il vuoto poi si legge
   * come «non esiste» e si finisce per emetterne una seconda.
   */
  const [documento, setDocumento] = useState<'invoice' | 'receipt'>('invoice');
  const [criterio, setCriterio] = useState<'cliente' | 'importo' | 'numero'>('cliente');
  const [q, setQ] = useState(ordine.place_nome ?? ordine.cliente);
  const [elenco, setElenco] = useState<FatturaInElenco[] | null>(null);
  const [erroreRicerca, setErroreRicerca] = useState<string | null>(null);

  /** Cambiando criterio si riparte: il valore di prima non vuol dire più
   *  niente, e lasciarlo lì farebbe cercare «TBF Limited Srl» come importo. */
  function scegliCriterio(c: 'cliente' | 'importo' | 'numero') {
    setCriterio(c);
    setElenco(null);
    setErroreRicerca(null);
    setQ(
      c === 'cliente'
        ? ordine.place_nome ?? ordine.cliente
        : c === 'importo'
          ? ordine.valore != null
            ? scriviImporto(ordine.valore)
            : ''
          : '',
    );
  }

  async function cerca() {
    const testo = q.trim();
    if (!testo || cerco) return;
    setCerco(true);
    setElenco(null);
    setErroreRicerca(null);
    try {
      const imp = criterio === 'importo' ? leggiImporto(testo) : null;
      if (criterio === 'importo' && imp == null) {
        setErroreRicerca(`«${testo}» non è un importo. Scrivilo come 2.720,00.`);
        return;
      }
      // ⚠️ Tutti e tre i criteri passano dalla stessa strada: le fatture stanno
      // su Fatture in Cloud, che cerca da se' su nome e numero. Prima il
      // numero passava da una rotta diversa che guardava un'ALTRA tabella —
      // quella delle fatture ai partner — e rispondeva «non trovata» su una
      // fattura che esisteva.
      const base =
        criterio === 'importo'
          ? { importo: imp }
          : criterio === 'numero'
            ? { numero: testo }
            : { cliente: testo };
      const r = await cercaFatture({ ...base, tipo: documento });
      if (!r.ok) setErroreRicerca(r.errore ?? 'Ricerca non riuscita.');
      else setElenco(r.fatture);
    } finally {
      setCerco(false);
    }
  }

  /**
   * ⭐ PIÙ FATTURE PER UN ORDINE (27/08/2026, richiesta dell'utente: «consenti
   * di selezionare più fatture, prima di dare ok la somma delle fatture
   * selezionate deve essere pari al valore dell'ordine»).
   *
   * Succede davvero: un evento fatturato in due tranche, un acconto e un saldo.
   * Agganciarne una sola su due voleva dire dichiarare fatturato per intero un
   * ordine che lo era a metà.
   */
  const [scelte, setScelte] = useState<FatturaInElenco[]>([]);

  function commuta(f: FatturaInElenco) {
    setScelte((s) => (s.some((x) => x.id === f.id) ? s.filter((x) => x.id !== f.id) : [...s, f]));
  }

  /**
   * ⚠️ SI CONFRONTA SOLO L'IMPONIBILE (27/08/2026, detto dall'utente: «i valori
   * che inserisco io sono senza iva»).
   *
   * Prima accettavo anche la somma dei TOTALI, per non essere rigido con un
   * ordine registrato IVA inclusa. Era una gentilezza che poteva far danno: due
   * fatture il cui LORDO somma per caso al valore netto dell'ordine avrebbero
   * fatto accendere il bottone, e l'ordine si sarebbe chiuso con le fatture
   * sbagliate. Quando la regola è nota, una seconda strada non è tolleranza: è
   * un modo in più di sbagliare senza accorgersene.
   *
   * Il totale con IVA resta a schermo, ma come informazione — non come criterio.
   */
  const TOLLERANZA = 1;
  const sommaImponibile = scelte.reduce((s, f) => s + (f.imponibile ?? 0), 0);
  const sommaTotale = scelte.reduce((s, f) => s + (f.totale ?? 0), 0);
  const atteso = ordine.valore ?? null;
  const quadra = atteso != null && Math.abs(sommaImponibile - atteso) <= TOLLERANZA;
  const scarto = atteso == null ? null : Math.round((sommaImponibile - atteso) * 100) / 100;

  async function agganciaScelte() {
    const numeri = scelte.map((f) => f.numero).filter(Boolean) as string[];
    if (numeri.length !== scelte.length) {
      avvisa(
        'Una fattura è senza numero',
        'Una delle selezionate non ha ancora un numero su Fatture in Cloud: si aggancia quando ce l\'ha.',
      );
      return;
    }
    setInCorso('aggancia');
    try {
      // ⚠️ Il link è quello della PRIMA fattura, come `fattura_numero`: sono
      // la coppia che il resto dell'app legge quando ne mostra una sola. Le
      // altre restano in `fatture`, e chi le vuole tutte le apre da FINANCE.
      await collegaDocumentoAOrdine(ordine.id, {
        fatture: numeri,
        ...(scelte[0]?.url ? { fatturaUrl: scelte[0].url } : {}),
      });
      await chiudiOrdine(ordine.id);
      onFatto();
    } catch (e: any) {
      avvisa('Non agganciate', String(e?.message ?? e));
    } finally {
      setInCorso(null);
    }
  }

  /**
   * ⚠️ NIENTE RAMO SPECIALE PER «ha già una fattura» (27/08/2026, domanda
   * dell'utente: «dove devo cliccare per cercare le altre fatture?» — da
   * nessuna parte, ed era il difetto).
   *
   * Quel ramo mostrava solo «c'è già la 600/2026, si può chiudere»: toglieva la
   * ricerca, quindi non si potevano aggiungere le altre, e soprattutto
   * SCAVALCAVA il controllo della somma — chiudeva con una fattura sola senza
   * verificare che coprisse il valore. Due strade per la stessa decisione, e
   * quella corta non applicava la regola.
   *
   * Ora la strada è una: le fatture già collegate si RICARICANO da FINANCE e
   * partono selezionate, così il conto le comprende e si può aggiungerne
   * altre.
   */
  const [gia, setGia] = useState<'carico' | 'fatto'>('carico');
  const collegate = ordine.fatture?.length
    ? ordine.fatture
    : ordine.fattura_numero
      ? [ordine.fattura_numero]
      : [];
  useEffect(() => {
    let vivo = true;
    if (!collegate.length) {
      setGia('fatto');
      return;
    }
    (async () => {
      const trovate: FatturaInElenco[] = [];
      for (const n of collegate) {
        const r = await cercaFatture({ numero: n });
        // ⚠️ Si prende quella col numero ESATTO: cercando «600/2026» FIC può
        // tornare anche la 1600/2026, e pre-selezionare la fattura sbagliata
        // sarebbe peggio che non pre-selezionarne nessuna.
        const esatta = r.fatture.find((f) => f.numero === n);
        if (esatta) trovate.push(esatta);
      }
      if (!vivo) return;
      setScelte(trovate);
      setGia('fatto');
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * ⚠️ NON C'È PIÙ UNA `chiudi()` SENZA CONTROLLI (27/08/2026). Serviva al ramo
   * «ha già una fattura», che è stato tolto: chiudeva senza verificare che le
   * fatture coprissero il valore dell'ordine. Una funzione del genere lasciata
   * lì è la scorciatoia che al prossimo ritocco qualcuno ricollega — e la
   * regola («la somma deve essere pari al valore») tornerebbe aggirabile.
   *
   * L'unica chiusura passa da `agganciaScelte`, che il controllo lo fa.
   */

  async function emettiEChiudi() {
    if (ordine.valore == null) {
      avvisa('Manca il valore', 'Senza il valore dell\'ordine non si può emettere una fattura: si scrive dalla modifica.');
      return;
    }
    setInCorso('emetti');
    try {
      const esito = await chiediFatturaPerOrdine({
        cliente: ordine.place_nome ?? ordine.cliente,
        importo: ordine.valore,
        causale: ordine.descrizione,
        proformaNumero: ordine.proforma_numero,
      });
      await collegaDocumentoAOrdine(ordine.id, {
        proformaNumero: esito.riferimento,
        proformaUrl: esito.url,
        ...(esito.fatturaNumero ? { fatturaNumero: esito.fatturaNumero } : {}),
      });
      await chiudiOrdine(ordine.id);
      onFatto();
    } catch (e: any) {
      // ⚠️ Il messaggio di FINANCE si mostra INTERO: «Partner non trovato» coi
      // candidati dice cosa fare, «non riuscito» manda a indovinare.
      avvisa('Fattura non emessa', String(e?.message ?? e));
    } finally {
      setInCorso(null);
    }
  }

  return (
    <Foglio
      titolo="Chiudi l'ordine"
      sottotitolo={`${ordine.place_nome ?? ordine.cliente} · ${euro(ordine.valore)}. Chiudere vuol dire: pratica finita. L'incasso è un'altra cosa.`}
      onClose={onClose}
    >
      {collegate.length ? (
        <Text style={styles.campoAiuto}>
          {gia === 'carico'
            ? `Carico da FINANCE ${collegate.length === 1 ? 'la fattura già collegata' : 'le fatture già collegate'}…`
            : scelte.length
              ? `Già collegate e selezionate: ${scelte.map((f) => f.numero).join(', ')}. Cercane altre qui sotto se ne mancano.`
              : `Le fatture collegate (${collegate.join(', ')}) non si trovano più su Fatture in Cloud: cercale qui sotto.`}
        </Text>
      ) : null}

      <>
          <Text style={styles.campoLabel}>Che documento cerchi</Text>
          <View style={styles.chipsForm}>
            {([
              { v: 'invoice', l: 'Fattura' },
              { v: 'receipt', l: 'Ricevuta' },
            ] as const).map((o) => (
              <Pressable
                key={o.v}
                style={[styles.chip, documento === o.v && styles.chipOn]}
                onPress={() => {
                  setDocumento(o.v);
                  setElenco(null);
                  setErroreRicerca(null);
                }}
              >
                <Text style={[styles.chipTxt, documento === o.v && styles.chipTxtOn]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.campoLabel}>Come cercarlo</Text>
          <View style={styles.chipsForm}>
            {([
              { v: 'cliente', l: 'Per ragione sociale' },
              { v: 'importo', l: 'Per importo' },
              { v: 'numero', l: 'Per numero' },
            ] as const).map((o) => (
              <Pressable
                key={o.v}
                style={[styles.chip, criterio === o.v && styles.chipOn]}
                onPress={() => scegliCriterio(o.v)}
              >
                <Text style={[styles.chipTxt, criterio === o.v && styles.chipTxtOn]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.campo, { flex: 1 }]}
              value={q}
              onChangeText={setQ}
              placeholder={
                criterio === 'cliente'
                  ? 'Ragione sociale'
                  : criterio === 'importo'
                    ? 'Importo — es. 2.720,00'
                    : 'Numero — es. 181/2026'
              }
              placeholderTextColor={colors.grigio}
              inputMode={criterio === 'importo' ? 'decimal' : 'text'}
              autoCapitalize={criterio === 'numero' ? 'none' : 'sentences'}
            />
            <Pressable
              style={[styles.btnCerca, (!q.trim() || cerco) && { opacity: 0.5 }]}
              disabled={!q.trim() || cerco}
              onPress={cerca}
            >
              <Text style={styles.btnCercaTxt}>{cerco ? 'Cerco…' : 'Cerca'}</Text>
            </Pressable>
          </View>
          <Text style={styles.campoAiuto}>
            {criterio === 'importo'
              ? "Si cerca sull'imponibile (i valori degli ordini sono senza IVA), ma anche sul totale, per trovarla lo stesso se hai in mente la cifra lorda."
              : criterio === 'cliente'
                ? 'Basta una parte del nome. È già compilato con il cliente di questo ordine.'
                : 'Il numero come lo scrive FINANCE, per esempio 181/2026.'}
          </Text>

          {erroreRicerca ? <Text style={styles.chiusuraNo}>{erroreRicerca}</Text> : null}

          {elenco ? (
            elenco.length ? (
              <View style={{ gap: 6 }}>
                {/* ⚠️ Si SCEGLIE, non si aggancia da soli: due clienti con un
                    nome simile, o due ordini dello stesso mese con lo stesso
                    importo, sono la normalità — e agganciare la prima riga
                    sbaglierebbe due pratiche insieme. */}
                {elenco.map((f) => {
                  const presa = scelte.some((x) => x.id === f.id);
                  return (
                  <Pressable
                    key={f.id}
                    style={[styles.fattRiga, presa && styles.fattRigaPresa]}
                    disabled={!!inCorso}
                    onPress={() => commuta(f)}
                  >
                    <Ionicons
                      name={presa ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={presa ? colors.navy : colors.grigio}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.fattNumero} numberOfLines={1}>
                        {f.numero ?? 'senza numero'} · {f.partner?.nome ?? '—'}
                      </Text>
                      <Text style={styles.fattMeta} numberOfLines={1}>
                        {importoBreve(f.totale)} ({importoBreve(f.imponibile)} + IVA {f.aliquotaIva}%)
                        {f.emissione ? ` · ${f.emissione}` : ` · ${f.mese}/${f.anno}`}
                        {f.pagata ? ' · pagata' : ' · non pagata'}
                        {f.combacia === 'totale' ? ' · trovata per il totale con IVA, non per l\'imponibile' : ''}
                      </Text>
                    </View>
                  </Pressable>
                  );
                })}

                {/* ⚠️ IL CONTO SI VEDE MENTRE SI SCEGLIE, non dopo aver premuto:
                    dire «non quadra» a cose fatte obbliga a rifare la selezione
                    a indovinare. Qui si legge quanto manca, riga per riga. */}
                {scelte.length ? (
                  <View style={[styles.sommaRiga, quadra ? styles.sommaOk : styles.sommaNo]}>
                    <Ionicons
                      name={quadra ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                      size={16}
                      color={quadra ? '#2F7D46' : colors.attenzione}
                    />
                    <Text style={[styles.sommaTxt, { color: quadra ? '#2F7D46' : colors.attenzione }]}>
                      {scelte.length} {scelte.length === 1 ? 'fattura' : 'fatture'} ·{' '}
                      {importoBreve(sommaImponibile)} imponibile ({importoBreve(sommaTotale)} con IVA)
                      {atteso == null
                        ? " — l'ordine non ha un valore, quindi non c'è niente da far quadrare"
                        : quadra
                          ? ` — quadra col valore dell'ordine (${importoBreve(atteso)}, senza IVA)`
                          : ` — ${scarto! > 0 ? 'in più' : 'mancano'} ${importoBreve(Math.abs(scarto!))} sui ${importoBreve(atteso)} dell'ordine, che è senza IVA`}
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  style={[styles.btn, styles.btnLargo, (!quadra || !!inCorso) && { opacity: 0.45 }]}
                  disabled={!quadra || !!inCorso}
                  onPress={agganciaScelte}
                >
                  <Text style={styles.btnTxt}>
                    {inCorso === 'aggancia'
                      ? 'Aggancio…'
                      : quadra
                        ? `Aggancia ${scelte.length === 1 ? 'la fattura' : `le ${scelte.length} fatture`} e chiudi`
                        : "La somma degli imponibili deve essere pari al valore dell'ordine"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.campoAiuto}>
                Nessuna fattura con questi dati. Può darsi che non sia ancora stata emessa: qui sotto c&apos;è come
                farla.
              </Text>
            )
          ) : null}

          {/* ⚠️ IL BOTTONE DICEVA «Emetti la fattura» E FACEVA UNA PRO-FORMA
              (28/08/2026, segnalazione dell'utente: «vedo ancora il simbolo di
              emissione fattura ma dovrebbe essere stata emessa»).

              L'ordine SCOUT002 era chiuso con PF 2/2026 — una pro-forma — e
              l'icona «emetti fattura» sulla riga continuava a comparire: era
              corretta, la fattura non era mai stata emessa. A mentire era
              l'etichetta del bottone. Una richiesta di pagamento e un
              documento fiscale non sono la stessa cosa, e chiamarli con lo
              stesso nome fa credere chiuso un giro che è a metà. */}
          <Text style={[styles.campoLabel, { marginTop: 10 }]}>Oppure emetti adesso la pro-forma</Text>
          <Pressable
            style={[styles.btnGhostLargo, inCorso === 'emetti' && { opacity: 0.5 }]}
            disabled={!!inCorso}
            onPress={emettiEChiudi}
          >
            <Ionicons name="document-text-outline" size={16} color={colors.navy} />
            <Text style={styles.btnGhostLargoTxt}>
              {inCorso === 'emetti' ? 'Emetto…' : 'Emetti la PRO-FORMA su FINANCE e chiudi'}
            </Text>
          </Pressable>

          {/* ⚠️ NON C'È «chiudi senza fattura» (regola dell'utente, 27/08/2026:
              «non può essere chiuso senza fattura»). Un ordine chiuso senza
              documento è un ricavo senza carta: la scorciatoia l'avevo messa io,
              e una scorciatoia che si può prendere si prende. */}
          <Text style={styles.campoAiuto}>
            Un ordine non si chiude senza documento — fattura o ricevuta: senza, resta un ricavo senza carta.
          </Text>
          <Text style={styles.campoAiuto}>
            La pro-forma è la richiesta di pagamento, non il documento fiscale: la fattura si emette dopo, dal
            bottone «Fattura» sulla riga dell&apos;ordine.
          </Text>
      </>
    </Foglio>
  );
}

function BloccoFornitura({
  ordine,
  righe,
  onCambiato,
}: {
  ordine: OrdineConLuogo;
  righe: RigaFornitura[];
  onCambiato: () => void;
}) {
  const [apri, setApri] = useState(false);
  const [chi, setChi] = useState<FornitoreScelto | null>(null);
  const [quanto, setQuanto] = useState('');
  const [cosa, setCosa] = useState('');
  const [salvo, setSalvo] = useState(false);
  /**
   * ⭐ RICHIAMARE UNA FORNITURA GIÀ IN APP (27/08/2026, richiesta dell'utente:
   * «permetti di richiamare anche le forniture già in app»).
   *
   * Il listino delle forniture — cosa fa un fornitore e a quanto — è già
   * caricato: ribattere qui a mano un prezzo che sta già scritto di là vuol
   * dire due numeri per la stessa cosa, e quello sbagliato è sempre il secondo.
   *
   * ⚠️ Il prezzo richiamato si può CORREGGERE prima di salvare: il listino dice
   * quanto costa di norma, l'ordine dice quanto è costato davvero. Copiarlo
   * senza poterlo toccare avrebbe trasformato un riferimento in un dogma.
   */
  /**
   * ⚠️ La stessa spunta di /preventivi (27/08/2026, «sistema il buco»): anche
   * qui si impara un prezzo, e anche qui restava attaccato a un ordine solo.
   * Accesa di default, ma non quando la fornitura è stata RICHIAMATA dal
   * listino — quella ci è già dentro, e rimetterla creerebbe la riga doppia
   * che `salvaNelListino` poi si rifiuta di scrivere.
   */
  const [alListino, setAlListino] = useState(true);
  const [listino, setListino] = useState<Fornitura[]>([]);
  const [cercaListino, setCercaListino] = useState('');
  const [caricoListino, setCaricoListino] = useState(false);
  /**
   * ⭐ «SENZA FORNITURA» (migr. 0105, richiesta dell'utente 28/08/2026:
   * «inserisci un flag Senza Fornitura per le fatture che non hanno costi,
   * esempio affiliazioni»). La dichiarazione esplicita che quest'ordine non ha
   * costi di fornitura: soddisfa l'obbligo prima di chiudere/incassare e rende
   * il margine = valore − altri costi.
   *
   * ⚠️ Si scrive SUBITO sul database (non al salvataggio del foglio): il
   * divieto di incassare legge l'ordine, non la bozza del form — una spunta
   * rimasta solo a schermo lascerebbe il bottone «Incassato» spento senza un
   * perché. Ottimistica con rollback, come le altre azioni di stato.
   */
  const [senzaForn, setSenzaForn] = useState(Boolean(ordine.senza_fornitura));
  const [salvoFlag, setSalvoFlag] = useState(false);
  async function toggleSenzaFornitura() {
    if (salvoFlag) return;
    const nuovo = !senzaForn;
    setSenzaForn(nuovo);
    setSalvoFlag(true);
    try {
      await aggiornaOrdine(ordine.id, { senza_fornitura: nuovo });
      onCambiato();
    } catch (e: any) {
      setSenzaForn(!nuovo);
      avvisa('Non salvato', String(e?.message ?? e));
    } finally {
      setSalvoFlag(false);
    }
  }

  useEffect(() => {
    if (!apri || listino.length || caricoListino) return;
    setCaricoListino(true);
    fetchForniture()
      .then(setListino)
      .catch(() => setListino([]))
      .finally(() => setCaricoListino(false));
  }, [apri, listino.length, caricoListino]);

  const daListino = useMemo(() => {
    const q = cercaListino.trim().toLowerCase();
    if (!q) return [];
    return listino
      .filter((f) =>
        [f.fornitore, f.titolo, f.descrizione, f.linea]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [listino, cercaListino]);

  function richiama(f: Fornitura) {
    setChi({ nome: f.fornitore, anagraficheId: f.fornitore_anagrafiche_id ?? null, email: null });
    setQuanto(f.prezzo != null ? scriviImporto(f.prezzo) : '');
    setCosa(f.titolo);
    setCercaListino('');
    setAlListino(false);
  }

  async function aggiungi() {
    if (salvo) return;
    if (!chi) {
      avvisa('Manca il fornitore', 'Scegli chi ha fornito: un prezzo senza il nome di chi l\'ha fatto non si può né confrontare né richiamare.');
      return;
    }
    // ⚠️ Il prezzo scritto male FERMA il salvataggio, non diventa null: qui
    // null vuol dire «non lo so ancora», e un costo buttato in silenzio fa
    // sembrare l'ordine più redditizio di quanto sia.
    const n = quanto.trim() ? leggiImporto(quanto) : null;
    if (quanto.trim() && n === null) {
      avvisa('Prezzo non capito', `«${quanto}» non è un importo. Scrivilo come 1.250,50.`);
      return;
    }
    setSalvo(true);
    try {
      await aggiungiFornitura({
        ordineId: ordine.id,
        placeId: ordine.place_id ?? null,
        linea: ordine.linea ?? null,
        fornitore: chi.nome,
        anagraficheId: chi.anagraficheId,
        email: chi.email,
        importo: n,
        nota: cosa.trim() || null,
      });
      // Best-effort col suo catch: se il listino rifiuta, la fornitura
      // dell'ordine resta — è quella che conta per il margine.
      if (alListino && chi) {
        await salvaNelListino({
          fornitore: chi.nome,
          fornitoreAnagraficheId: chi.anagraficheId,
          titolo: cosa.trim() || `Fornitura di ${chi.nome}`,
          linea: ordine.linea ?? null,
          prezzo: n,
          provenienza: `da un ordine di ${ordine.place_nome ?? ordine.cliente}`,
        }).catch(() => undefined);
      }
      // ⚠️ Una fornitura VERA smentisce il «senza fornitura»: il flag si
      // spegne da solo, se no l'ordine direbbe due cose opposte insieme.
      if (senzaForn) {
        setSenzaForn(false);
        await aggiornaOrdine(ordine.id, { senza_fornitura: false }).catch(() => undefined);
      }
      setChi(null);
      setQuanto('');
      setCosa('');
      setApri(false);
      onCambiato();
    } catch (e: any) {
      avvisa('Non è stata salvata', String(e?.message ?? e));
    } finally {
      setSalvo(false);
    }
  }

  function togli(r: RigaFornitura) {
    conferma(
      'Togliere questa fornitura?',
      `${r.fornitore}${r.importo != null ? ` · ${importoBreve(r.importo)}` : ''}. Esce dal costo dell'ordine, quindi il margine cambia.`,
      async () => {
        try {
          await rimuoviFornitura(r.lavoroId);
          onCambiato();
        } catch (e: any) {
          avvisa('Non è stata tolta', String(e?.message ?? e));
        }
      },
      { testoConferma: 'Togli', distruttivo: true },
    );
  }

  const totale = righe.reduce((s, r) => s + (r.importo ?? 0), 0);

  return (
    <>
      <Text style={styles.campoLabel}>Fornitura</Text>

      {righe.length ? (
        <View style={{ gap: 6 }}>
          {righe.map((r) => (
            <View key={r.lavoroId} style={styles.fornRiga}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.fornNome} numberOfLines={1}>{r.fornitore}</Text>
                {r.nota ? <Text style={styles.fornNota} numberOfLines={2}>{r.nota}</Text> : null}
              </View>
              <Text style={styles.fornPrezzo}>{r.importo != null ? importoBreve(r.importo) : '—'}</Text>
              <Pressable onPress={() => togli(r)} hitSlop={8} accessibilityLabel={`Togli ${r.fornitore}`}>
                <Ionicons name="close-circle-outline" size={18} color={colors.grigio} />
              </Pressable>
            </View>
          ))}
          <Text style={styles.campoAiuto}>
            Costo della fornitura: {importoBreve(totale)} · {righe.length}{' '}
            {righe.length === 1 ? 'fornitore' : 'fornitori'}. Il margine lo sottrae.
          </Text>
        </View>
      ) : senzaForn ? (
        <Text style={styles.campoAiuto}>
          Ordine dichiarato senza fornitura: nessun costo da registrare, il margine è il valore (meno gli
          eventuali altri costi). Si può chiudere e incassare.
        </Text>
      ) : (
        // ⚠️ Non è un vuoto qualsiasi: senza fornitura l'ordine non si può
        // chiudere, ed è meglio saperlo adesso che davanti al bottone spento.
        <Text style={styles.fornVuoto}>
          Nessun fornitore indicato. Serve prima di poter segnare l&apos;ordine come incassato: senza, il ricavo
          entra nei conti e il suo costo no.
        </Text>
      )}

      {/* La spunta vive solo finché non ci sono fornitori: con una riga vera
          la dichiarazione non ha più senso (e i costi reali comunque vincono). */}
      {righe.length === 0 ? (
        <Pressable
          style={[styles.spuntaRiga, salvoFlag && { opacity: 0.5 }]}
          disabled={salvoFlag}
          onPress={toggleSenzaFornitura}
          accessibilityLabel="Senza fornitura"
          {...({ title: 'Quest’ordine non ha costi di fornitura (es. quota di affiliazione)' } as any)}
        >
          <Ionicons
            name={senzaForn ? 'checkbox' : 'square-outline'}
            size={19}
            color={senzaForn ? colors.navy : colors.grigio}
          />
          <Text style={styles.spuntaTxt}>
            Senza fornitura — quest&apos;ordine non ha costi di fornitura (es. quota di affiliazione).
          </Text>
        </Pressable>
      ) : null}

      {apri ? (
        <View style={styles.fornForm}>
          {/* ⚠️ Il richiamo sta PRIMA di tutto: è la strada corta, e una strada
              corta messa in fondo non la prende nessuno. */}
          <Text style={styles.campoLabel}>Richiama dal listino forniture</Text>
          <TextInput
            style={styles.campo}
            value={cercaListino}
            onChangeText={setCercaListino}
            placeholder={caricoListino ? 'Carico il listino…' : 'Cerca fra le forniture già caricate…'}
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
          />
          {daListino.map((f) => (
            <Pressable key={f.id} style={styles.listinoRiga} onPress={() => richiama(f)}>
              <Ionicons name="cube-outline" size={15} color={colors.navy} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.listinoTitolo} numberOfLines={1}>{f.titolo}</Text>
                <Text style={styles.listinoMeta} numberOfLines={1}>
                  {f.fornitore}
                  {f.prezzo != null ? ` · ${importoBreve(f.prezzo)}` : ' · prezzo non indicato'}
                  {f.prezzo_note ? ` · ${f.prezzo_note}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
          {cercaListino.trim() && !daListino.length && !caricoListino ? (
            <Text style={styles.campoAiuto}>Niente nel listino con questo nome: scrivilo a mano qui sotto.</Text>
          ) : null}

          <Text style={styles.campoLabel}>Chi ha fornito</Text>
          <SceltaFornitore valore={chi} onScegli={setChi} autoFocus />

          <Text style={styles.campoLabel}>Quanto ci è costato</Text>
          <TextInput
            style={styles.campo}
            value={quanto}
            onChangeText={setQuanto}
            placeholder="es. 1.250,50 — vuoto se non lo sai ancora"
            placeholderTextColor={colors.grigio}
            inputMode="decimal"
          />

          <Text style={styles.campoLabel}>Che cosa ha fornito</Text>
          <TextInput
            style={styles.campo}
            value={cosa}
            onChangeText={setCosa}
            placeholder="es. allestimento floreale sala, 30 centrotavola"
            placeholderTextColor={colors.grigio}
          />

          <Pressable style={styles.spuntaRiga} onPress={() => setAlListino(!alListino)}>
            <Ionicons
              name={alListino ? 'checkbox' : 'square-outline'}
              size={19}
              color={alListino ? colors.navy : colors.grigio}
            />
            <Text style={styles.spuntaTxt}>
              Salva anche nel listino Forniture — così la prossima volta questo prezzo si ritrova.
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={[styles.btnFornSalva, salvo && { opacity: 0.5 }]} disabled={salvo} onPress={aggiungi}>
              <Text style={styles.btnFornSalvaTxt}>{salvo ? 'Salvo…' : 'Aggiungi la fornitura'}</Text>
            </Pressable>
            <Pressable style={styles.btnFornAnnulla} onPress={() => setApri(false)}>
              <Text style={styles.btnFornAnnullaTxt}>Annulla</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.btnFornAggiungi} onPress={() => setApri(true)}>
          <Ionicons name="add" size={16} color={colors.navy} />
          <Text style={styles.btnFornAggiungiTxt}>Aggiungi un fornitore</Text>
        </Pressable>
      )}
    </>
  );
}

/**
 * ⭐ LA RICHIESTA DI EVASIONE (28/08/2026, richiesta dell'utente: «metti
 * richiesta evasione di un ordine dopo la chiusura che manda all'app delivery
 * le informazioni per l'inserimento»).
 *
 * ⚠️ **CHIEDE QUELLO CHE L'ORDINE NON SA.** Una consegna sulla piattaforma
 * pretende quando, a chi e dove: l'ordine ha solo il cliente e cosa è stato
 * venduto. Questi tre campi sono OBBLIGATORI qui e obbligatori nella funzione,
 * perché una richiesta senza indirizzo costringe chi la riceve a rincorrere
 * chi l'ha scritta — ed è la strada per cui un valet parte per il posto
 * sbagliato.
 *
 * ⚠️ **SI PUÒ RIMANDARE.** La data slitta, l'indirizzo cambia: quello che si
 * era mandato ricompare precompilato (`evasione_dati`), così si corregge un
 * campo invece di riscrivere tutto — e non si ricostruisce a memoria.
 */
function RichiestaEvasione({
  ordine,
  onClose,
  onFatto,
}: {
  ordine: OrdineConLuogo;
  onClose: () => void;
  onFatto: () => void;
}) {
  const g = ordine.evasione_dati ?? null;
  const [quando, setQuando] = useState(g?.data_servizio ?? '');
  const [oraDa, setOraDa] = useState(g?.ora_da ?? '');
  const [oraA, setOraA] = useState(g?.ora_a ?? '');
  const [destinatario, setDestinatario] = useState(g?.destinatario ?? ordine.place_nome ?? ordine.cliente ?? '');
  const [indirizzo, setIndirizzo] = useState(g?.indirizzo ?? '');
  const [citofono, setCitofono] = useState(g?.citofono ?? '');
  const [telefono, setTelefono] = useState(g?.telefono ?? '');
  const [ritiro, setRitiro] = useState(g?.ritiro ?? '');
  const [cosa, setCosa] = useState(g?.cosa ?? ordine.descrizione ?? '');
  const [note, setNote] = useState(g?.note ?? '');
  const [inCorso, setInCorso] = useState(false);

  const pronta = !!quando.trim() && !!destinatario.trim() && !!indirizzo.trim();

  async function manda() {
    if (!pronta || inCorso) return;
    setInCorso(true);
    try {
      const esito = await chiediEvasione(ordine.id, {
        data_servizio: quando.trim(),
        ora_da: oraDa.trim(),
        ora_a: oraA.trim(),
        destinatario: destinatario.trim(),
        indirizzo: indirizzo.trim(),
        citofono: citofono.trim(),
        telefono: telefono.trim(),
        ritiro: ritiro.trim(),
        cosa: cosa.trim(),
        note: note.trim(),
      });
      // ⚠️ Si dice DOVE è arrivata davvero. «Mandata» e basta farebbe credere
      // che sia nella sezione Richieste della piattaforma anche quando è
      // partita una mail perché la piattaforma non l'ha presa — e nessuno
      // andrebbe a inserirla a mano.
      if (esito.canale === 'piattaforma') {
        avvisa(
          esito.giaEsistente ? 'Richiesta già in coda' : 'Richiesta mandata',
          esito.giaEsistente
            ? `Per ${ordine.riferimento} c'era già una richiesta nella sezione Richieste della piattaforma: è la stessa, non se ne crea una seconda.`
            : `È nella sezione Richieste della piattaforma: l'ufficio la legge e inserisce il servizio.`,
        );
      } else {
        avvisa(
          'Mandata per mail, non alla piattaforma',
          `La piattaforma non l'ha presa (${esito.motivoRipiego ?? 'motivo non riportato'}), quindi è partita una mail${
            esito.ripiego ? ' a tutta la squadra, perché non c\'è un indirizzo delle consegne impostato' : ` a ${esito.a.join(', ')}`
          }. Va inserita a mano.`,
        );
      }
      onFatto();
    } catch (e: any) {
      avvisa('Richiesta non partita', String(e?.message ?? e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Foglio
      titolo={`Chiedi l'evasione · ${ordine.riferimento ?? ''}`}
      sottotitolo={`${ordine.place_nome ?? ordine.cliente}. Va alle consegne, che inseriscono il servizio sulla piattaforma.`}
      bloccaSfondo
      onClose={onClose}
    >
      {ordine.evasione_richiesta_il ? (
        <View style={styles.rifRiga}>
          <Text style={styles.rifNota}>
            Già chiesta il {dataIt(ordine.evasione_richiesta_il)} · qui sotto c'è quello che era stato mandato
          </Text>
        </View>
      ) : null}

      <Text style={styles.campoLabel}>Data del servizio *</Text>
      <TextInput
        style={styles.campo}
        value={quando}
        onChangeText={setQuando}
        placeholder="es. 12/09/2026"
        placeholderTextColor={colors.grigio}
      />

      <View style={styles.evasioneRiga}>
        <View style={styles.evasioneMezzo}>
          <Text style={styles.campoLabel}>Dalle</Text>
          <TextInput style={styles.campo} value={oraDa} onChangeText={setOraDa} placeholder="09:00" placeholderTextColor={colors.grigio} />
        </View>
        <View style={styles.evasioneMezzo}>
          <Text style={styles.campoLabel}>Alle</Text>
          <TextInput style={styles.campo} value={oraA} onChangeText={setOraA} placeholder="13:00" placeholderTextColor={colors.grigio} />
        </View>
      </View>

      <Text style={styles.campoLabel}>Destinatario *</Text>
      <TextInput style={styles.campo} value={destinatario} onChangeText={setDestinatario} placeholder="Nome e cognome, o l'insegna" placeholderTextColor={colors.grigio} />

      <Text style={styles.campoLabel}>Indirizzo di consegna *</Text>
      <TextInput style={styles.campo} value={indirizzo} onChangeText={setIndirizzo} placeholder="Via, numero, città" placeholderTextColor={colors.grigio} />

      <View style={styles.evasioneRiga}>
        <View style={styles.evasioneMezzo}>
          <Text style={styles.campoLabel}>Citofono</Text>
          <TextInput style={styles.campo} value={citofono} onChangeText={setCitofono} placeholderTextColor={colors.grigio} />
        </View>
        <View style={styles.evasioneMezzo}>
          <Text style={styles.campoLabel}>Telefono</Text>
          <TextInput style={styles.campo} value={telefono} onChangeText={setTelefono} placeholder="per il valet" placeholderTextColor={colors.grigio} />
        </View>
      </View>

      <Text style={styles.campoLabel}>Ritiro presso</Text>
      <TextInput style={styles.campo} value={ritiro} onChangeText={setRitiro} placeholder="il fornitore, se il valet deve passare a prendere" placeholderTextColor={colors.grigio} />

      <Text style={styles.campoLabel}>Cosa</Text>
      <TextInput style={styles.campo} value={cosa} onChangeText={setCosa} placeholder="cosa va consegnato" placeholderTextColor={colors.grigio} />

      <Text style={styles.campoLabel}>Note</Text>
      <TextInput style={[styles.campo, styles.campoAlto]} value={note} onChangeText={setNote} multiline placeholder="tutto quello che serve a chi consegna" placeholderTextColor={colors.grigio} />

      {/* ⚠️ Si dice PRIMA che il numero va nel DDT: chi manda la richiesta deve
          sapere cosa sta chiedendo, non scoprirlo dalla mail che riceve. */}
      <Text style={styles.rifNota}>
        Nella richiesta va anche {ordine.riferimento}, da scrivere nel campo DDT della consegna.
      </Text>

      <Pressable
        style={[styles.btn, styles.btnLargo, (!pronta || inCorso) && { opacity: 0.5 }]}
        disabled={!pronta || inCorso}
        onPress={manda}
      >
        <Text style={styles.btnTxt}>{inCorso ? 'Mando…' : "Manda alle consegne"}</Text>
      </Pressable>
      {!pronta ? (
        <Text style={styles.rifNota}>
          Servono data, destinatario e indirizzo: senza, la consegna non si può inserire.
        </Text>
      ) : null}
    </Foglio>
  );
}

/**
 * ⭐ IL RIFERIMENTO DELL'ORDINE, in una pillola che si COPIA (migr. 0095).
 *
 * Richiesta dell'utente (28/08/2026): il progressivo «deve essere messo come
 * ddt all'interno dell'app delivery». Cioè: qualcuno lo legge qui e lo scrive
 * là. Un testo da ribattere a mano si sbaglia — e un DDT sbagliato lega la
 * consegna all'ordine di un altro; quindi si tocca e finisce negli appunti.
 *
 * ⚠️ Sul web gli appunti passano da `navigator.clipboard`, che esiste solo in
 * HTTPS. Se non c'è, la pillola resta e mostra comunque il numero: si legge e
 * si ribatte. Sparire sarebbe peggio.
 */
function ChipRiferimento({ rif, grande }: { rif?: string | null; grande?: boolean }) {
  const [copiato, setCopiato] = useState(false);
  if (!rif) return null;
  const copia = () => {
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.clipboard?.writeText) {
        nav.clipboard.writeText(rif);
        setCopiato(true);
        setTimeout(() => setCopiato(false), 1600);
      }
    } catch {
      // niente: il numero resta leggibile a schermo
    }
  };
  return (
    <Pressable
      style={[styles.rifChip, grande && styles.rifChipGrande]}
      hitSlop={6}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        copia();
      }}
      accessibilityLabel={`Copia il riferimento ${rif}, da scrivere come DDT sulla consegna`}
      {...({ title: 'Copia: va scritto come DDT sulla consegna in app delivery' } as any)}
    >
      <Ionicons name={copiato ? 'checkmark' : 'copy-outline'} size={grande ? 13 : 10.5} color={colors.grigio} />
      <Text style={[styles.rifChipTxt, grande && styles.rifChipTxtGrande]}>{copiato ? 'copiato' : rif}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Bersaglio touch ≥44px (Libro UX cap.10 §1 / WCAG) sui bottoni e chip di
  // questa pagina, che reimplementa gli stili in locale invece di usare `Btn`.
  btnCerca: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: touchMin, justifyContent: 'center' },
  btnCercaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 13 },
  btnGhostLargo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco,
    borderRadius: radius.pill, paddingVertical: 12, minHeight: touchMin,
  },
  btnGhostLargoTxt: { color: colors.navy, fontWeight: '700', fontSize: 13.5 },
  fattRiga: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: radius.m, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco,
  },
  fattRigaPresa: { borderColor: colors.navy, backgroundColor: colors.sfondo },
  sommaRiga: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.m, borderWidth: 1,
  },
  sommaOk: { borderColor: '#2F7D46', backgroundColor: colors.bianco },
  sommaNo: { borderColor: colors.attenzione, backgroundColor: colors.bianco },
  sommaTxt: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  fattNumero: { color: colors.testo, fontSize: 13.5, fontWeight: '700' },
  fattMeta: { color: colors.grigio, fontSize: 11.5, lineHeight: 16 },
  chiusuraNo: { color: colors.errore, fontSize: 13, lineHeight: 18 },
  spuntaRiga: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  spuntaTxt: { flex: 1, color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  listinoRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  listinoTitolo: { color: colors.testo, fontSize: 13.5, fontWeight: '700' },
  listinoMeta: { color: colors.grigio, fontSize: 11.5, lineHeight: 16 },
  fornRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  fornNome: { color: colors.testo, fontSize: 14, fontWeight: '700' },
  fornNota: { color: colors.grigio, fontSize: 12, lineHeight: 16, marginTop: 1 },
  fornPrezzo: { color: colors.testo, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  fornVuoto: { color: colors.attenzione, fontSize: 12.5, lineHeight: 18 },
  fornForm: {
    gap: 6,
    padding: 10,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.sfondo,
    marginTop: 6,
  },
  btnFornAggiungi: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginTop: 2 },
  btnFornAggiungiTxt: { color: colors.navy, fontWeight: '700', fontSize: 13.5 },
  btnFornSalva: { flex: 1, backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 10, minHeight: touchMin, alignItems: 'center', justifyContent: 'center' },
  btnFornSalvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 13.5 },
  btnFornAnnulla: { paddingVertical: 10, paddingHorizontal: 14, minHeight: touchMin, justifyContent: 'center' },
  btnFornAnnullaTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13.5 },
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.sfondo },
  sub: { color: colors.testoSoft, fontSize: 13 },
  subForte: { color: colors.navy, fontWeight: '800' },
  subNota: { color: colors.grigio, fontWeight: '400' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', marginRight: 2 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minHeight: touchMin, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  card: { backgroundColor: colors.bianco, borderRadius: radius.m, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.lg, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  descr: { color: colors.testoSoft, fontSize: 12.5, fontStyle: 'italic', marginTop: 1 },
  valore: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabStima: { color: colors.grigio, fontSize: 10.5 },
  margineNegativo: { color: colors.errore },
  tabValore: { color: colors.testo, fontWeight: '700', fontSize: 13.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  // ⚠️ IL BERSAGLIO È IL PADDING, NON hitSlop (27/08/2026): react-native-web
  // NON implementa hitSlop — la prop viene scartata in silenzio da View —
  // quindi sul sito il bersaglio era esattamente il glifo, 16px. hitSlop resta
  // per iOS/Android, dove funziona; il padding vale su tutte e due.
  rigaNegozio: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkRegistro: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  linkRegistroTxt: { color: colors.navy, fontWeight: '700', fontSize: 12.5 },
  seguitoDa: { color: colors.grigio, fontSize: 11, lineHeight: 15 },
  brandTxt: { color: colors.goldStrong, fontSize: 10.5, fontWeight: '700' },
  riepilogoMobile: { paddingBottom: 8 },
  riepilogoTxt: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '700' },
  // ⚠️ Cornice da 5, non da 7 (27/08/2026): con l'undicesima colonna servivano
  // pixel, e la regola è quella detta dall'utente — si stringe la cornice dei
  // bottoni, non il loro numero. Le azioni restano SEI.
  // ⚠️ 28/08/2026, regola dell'utente (Libro v1.8 §3): le icone erano 16-17px
  // in cornici da 27 — «troppo piccole». Ora 19px in cornici da 33 (7 di
  // padding per lato): più leggibili e più facili da beccare col mouse.
  iconaAzione: { padding: 7, borderRadius: radius.s },
  // L'azione di tutti i giorni: l'unica piena, si trova a colpo d'occhio.
  iconaPiena: { padding: 7, borderRadius: radius.s, backgroundColor: colors.ink },
  // Le sei azioni su UNA riga, senza andare a capo: la colonna è dimensionata
  // su di loro, quindi il wrap non serve più — ed era lui a far cambiare posto
  // al bottone principale da una riga all'altra.
  tabAzioni: { flexDirection: 'row', alignItems: 'center', gap: 2, justifyContent: 'flex-end' },
  // Bottoni piccoli per le azioni secondarie: stessa altezza, meno peso.
  btnMini: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  btnMiniTxt: { color: colors.testo, fontWeight: '700', fontSize: 11.5 },
  // ⚠️ `alignSelf: 'flex-start'` (27/08/2026): senza, il contenitore è
  // `stretch` e la pillola si stirava a tutta la larghezza — un badge che
  // diventa una fascia dorata, sia nella scheda sia nella colonna Cliente.
  // La pillola del riferimento: grigia e neutra, perché è un'ETICHETTA, non
  // uno stato né un documento. L'oro qui griderebbe più della fattura.
  rifRiga: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  legendaToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', paddingVertical: 4 },
  legendaToggleTxt: { color: colors.grigio, fontSize: 12, fontWeight: '600' },
  legenda: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 24,
  },
  legendaRiga: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, minWidth: 300 },
  legendaNome: { color: colors.testo, fontSize: 12.5, fontWeight: '700' },
  legendaNota: { color: colors.grigio, fontSize: 12, flexShrink: 1 },
  rifNota: { color: colors.grigio, fontSize: 12, flexShrink: 1 },
  rifChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.sfondo, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  rifChipGrande: { paddingHorizontal: 9, paddingVertical: 4, gap: 5 },
  rifChipTxt: { color: colors.grigio, fontWeight: '700', fontSize: 10, fontVariant: ['tabular-nums'] },
  rifChipTxtGrande: { fontSize: 12.5, color: colors.testo },
  docChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  docChipTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 10.5 },
  // La fattura è piena e scura, la pro-forma è chiara: si distinguono di
  // spalle, senza leggere il numero.
  docChipFattura: { backgroundColor: colors.ink, borderWidth: 0 },
  // «chiusa con fattura» si legge più scuro: è lo stato che chiude davvero
  // la pratica, e distinguerlo a colpo d'occhio è il punto della riga.
  tabChiusaFattura: { color: colors.testo, fontWeight: '700' },
  docChipTxtFattura: { color: colors.bianco },
  percRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  percChip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, minHeight: touchMin, justifyContent: 'center' },
  percChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  percTxt: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  percTxtOn: { color: colors.bianco },
  percInput: { width: 70, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.m, paddingHorizontal: 10, paddingVertical: 8, color: colors.testo, fontSize: 14, textAlign: 'center' },
  percCalcolo: { color: colors.testoSoft, fontSize: 13, marginTop: 4 },
  btnLargo: { marginTop: 8, paddingVertical: 12 },
  // Il form di modifica dentro il foglio (DS §Campi).
  campoLabel: { color: colors.navy, fontWeight: '700', fontSize: 13, marginTop: spacing.sm },
  campo: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.m, backgroundColor: colors.bianco, paddingHorizontal: 12, paddingVertical: 9, color: colors.testo, fontSize: 14, marginTop: 4 },
  campoAlto: { minHeight: 64, textAlignVertical: 'top' },
  // Due campi corti sulla stessa riga (dalle/alle, citofono/telefono): stanno
  // insieme perche si leggono insieme, e a schermo stretto vanno a capo da soli.
  evasioneRiga: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  evasioneMezzo: { flexGrow: 1, flexBasis: 140 },
  campoAiuto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  chipsForm: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { color: colors.testoSoft, fontSize: 12 },
  // Sul telefono i bottoni vanno a capo invece di stringersi: quattro azioni
  // su una riga sola diventavano illeggibili.
  azioni: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 6, alignItems: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, minHeight: touchMin },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12.5 },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, minHeight: touchMin },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  // Errore di caricamento (Libro UX cap.6): card rossa con «Riprova».
  erroreCard: { backgroundColor: colors.erroreSoft, borderWidth: 1, borderColor: colors.errore, borderRadius: radius.l, padding: spacing.lg, gap: 8 },
  erroreTesta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  erroreTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  erroreTxt: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  btnRiprova: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: touchMin },
  btnRiprovaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
});
