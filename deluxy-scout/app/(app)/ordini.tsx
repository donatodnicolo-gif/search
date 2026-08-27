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
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { Tabella, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { aggiornaOrdine, collegaDocumentoAOrdine, fetchOrdini, inserisciRichiestaPagamento, type OrdineConLuogo } from '@/lib/db';
import { cercaFattura, cercaFatture, chiediFatturaPerOrdine, type FatturaInElenco } from '@/lib/partner';
import { emettiProformaPerOrdine } from '@/lib/documenti';
import { costiPerOrdine, fetchLavori, type LavoroConPreventivi } from '@/lib/preventivi';
import { aggiornaFornitura, aggiungiFornitura, forniturePerOrdine, rimuoviFornitura, type RigaFornitura } from '@/lib/fornitura';
import { SceltaFornitore, type FornitoreScelto } from '@/components/SceltaFornitore';
import { fetchForniture, salvaNelListino, type Fornitura } from '@/lib/forniture';
import { Foglio } from '@/components/Foglio';
import { avvisa, conferma } from '@/lib/dialoghi';
import { BRAND, brandDi, CANALI, LABEL_CANALE, LINEE_ATTIVE } from '@/types';
import { urlSchedaRegistro } from '@/lib/anagrafiche';

// Colori di stato dai token semantici del DS (Libro UX cap.5): arancione = attende
// un'azione, verde = concluso bene, rosso/neutro = terminato. Prima erano hex
// Material, divergenti dal resto dell'app.
const STATI: { valore: OrdineConLuogo['stato']; label: string; colore: string }[] = [
  { valore: 'da_incassare', label: 'Da incassare', colore: colors.attenzione },
  { valore: 'incassato', label: 'Incassato', colore: colors.successo },
  { valore: 'annullato', label: 'Annullato', colore: colors.grey },
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
  const [bozza, setBozza] = useState<{
    cliente: string;
    descrizione: string;
    valore: string;
    linea: string | null;
    canale: string | null;
    brand: string | null;
    altriCosti: string;
    altriCostiNota: string;
    unita: 'pezzi' | 'giorni' | 'ore' | null;
    quanti: string;
  } | null>(null);

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
        if (statoFiltro && o.stato !== statoFiltro) return false;
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
  const conAltriCosti = useMemo(() => dati.some((o) => o.altri_costi != null), [dati]);
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
  const aTabella = width >= (conAltriCosti ? 1460 : 1360);
  /**
   * Sopra questa misura ci stanno TUTTE le colonne, canale compreso: misurato
   * nel DOM, a 1620 al nome del cliente restano 209px invece dei 111 che
   * avrebbe con la stessa tabella a 1460. Non è una soglia di stile: è il punto
   * in cui rimettere una colonna smette di togliere spazio al dato principale.
   */
  const tutteLeColonne = width >= 1620;

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
    (o: OrdineConLuogo) => lavori.some((l) => l.ordine_id === o.id && l.preventivi.length > 0),
    [lavori],
  );
  const margineDi = useCallback(
    (o: OrdineConLuogo): number | null => {
      const c = costi.get(o.id);
      if (!c || o.valore == null) return null;
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
        .filter((o) => o.stato === 'incassato' && (costi.get(o.id)?.definitivo ?? false))
        .reduce((s, o) => s + (margineDi(o) ?? 0), 0),
      quantiRealizzati: validi.filter(
        (o) => o.stato === 'incassato' && (costi.get(o.id)?.definitivo ?? false),
      ).length,
    };
  }, [ordini, costi, margineDi]);

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
          {o.owner_nome ? <Text style={styles.seguitoDa}>Seguito da {o.owner_nome}</Text> : null}
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
    { chiave: 'linea', label: 'Linea', width: 92, righe: 2, valore: (o) => o.linea ?? null },
    /**
     * ⭐ DI CHE SITO È (27/08/2026, richiesta dell'utente: «metti anche in
     * tabella di che sito è»). Prima si scriveva solo quando NON era deluxy.it
     * — e siccome sono quasi tutti deluxy.it, non si vedeva mai. Decide
     * l'intestazione del documento: saperlo a colpo d'occhio evita di emettere
     * una pro-forma con il logo dell'insegna sbagliata.
     */
    {
      chiave: 'sito',
      label: 'Sito',
      width: 84,
      valore: (o) => brandDi(o),
      cella: (o) => <Text style={styles.sitoTxt} numberOfLines={1}>{brandDi(o)}</Text>,
    },
    /**
     * ⚠️ IL CANALE C'È SEMPRE (27/08/2026, richiesta dell'utente: «nella
     * tabella indica anche il canale da chi arriva»). L'avevo fatto sparire
     * sotto i 1620 per far posto al nome del cliente: era una scelta mia, e
     * l'utente ha detto che quella colonna la vuole. Lo spazio si trova
     * altrove — è per questo che «Linea» e «Fornitore» hanno una misura fissa.
     *
     * ⚠️ Si mostra l'ETICHETTA, non il valore grezzo: nel database c'è `mail`,
     * a schermo va «Mail». E il valore grezzo resta come ripiego, così una riga
     * vecchia con un canale fuori elenco si legge com'è invece di sparire.
     */
    {
      chiave: 'canale',
      label: 'Canale',
      width: 78,
      valore: (o) => (o.canale ? LABEL_CANALE[o.canale] ?? o.canale : null),
    },
    /**
     * QUANTO CI COSTA, accanto a quanto lo vendiamo (richiesta dell'utente).
     * Il fornitore e il suo preventivo vengono dai lavori collegati alla
     * trattativa: quello SCELTO se c'è, altrimenti il più basso ricevuto.
     */
    {
      chiave: 'fornitore',
      label: 'Fornitore',
      width: 96,
      righe: 2,
      valore: (o) => costi.get(o.id)?.fornitore ?? null,
    },
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
      width: 88,
      destra: true,
      numerica: true,
      valore: (o) => costi.get(o.id)?.costo ?? null,
      cella: (o) => {
        const c = costi.get(o.id);
        if (!c) return <Text style={styles.tabData}>—</Text>;
        return (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.tabValore}>{importoBreve(c.costo)}</Text>
            {/* ⚠️ «Scelto» o «il più basso» non sono la stessa cosa: il primo
                è una decisione presa, il secondo una stima che può cambiare. */}
            <Text style={styles.tabStima}>{c.definitivo ? 'scelto' : 'il più basso'}</Text>
          </View>
        );
      },
    },
    /**
     * ⭐ ALTRI COSTI (27/08/2026, richiesta dell'utente: «metti una colonna
     * altri costi sui costi che ci possono essere collegati»).
     *
     * Quelli che non passano da un preventivo fornitore: trasporto, una persona
     * in più, il noleggio, il materiale comprato al volo. Finché non si contano,
     * il margine è più alto di quello vero. Si scrivono dalla modifica
     * dell'ordine, insieme alla nota che dice di cosa sono fatti.
     */
    ...(conAltriCosti
      ? ([
      {
        chiave: 'altri',
        label: 'Altri costi',
        width: 88,
        destra: true,
        numerica: true,
        valore: (o) => o.altri_costi ?? null,
        cella: (o) =>
          o.altri_costi == null ? (
            <Text style={styles.tabData}>—</Text>
          ) : (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.tabValore}>{importoBreve(o.altri_costi)}</Text>
              {o.altri_costi_nota ? (
                <Text style={styles.tabStima} numberOfLines={1}>{o.altri_costi_nota}</Text>
              ) : null}
            </View>
          ),
      },
        ] as ColonnaTabella<OrdineConLuogo>[])
      : []),
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
        const realizzato = o.stato === 'incassato' && (costi.get(o.id)?.definitivo ?? false);
        return (
          <View style={{ alignItems: 'flex-end' }}>
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
      width: 66,
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
      width: 88,
      valore: (o) => o.stato,
      cella: (o) => (
        <View style={{ gap: 2, alignItems: 'flex-start' }}>
          <StatusBadge small label={labelStatoOrdine[o.stato]} colore={coloreStatoOrdine[o.stato]} />
          {o.chiuso_il ? <Text style={styles.tabStima}>pratica chiusa</Text> : null}
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
       */
      width: 206,
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
              accessibilityLabel={o.chiuso_il ? "Riapri l'ordine" : "Chiudi l'ordine"}
              {...({
                title: o.chiuso_il
                  ? 'Riapri la pratica'
                  : 'Chiudi la pratica — fattura emessa o agganciata',
              } as any)}
            >
              <Ionicons
                name={o.chiuso_il ? 'lock-open-outline' : 'lock-closed-outline'}
                size={16}
                color={o.chiuso_il ? colors.goldStrong : colors.grigio}
              />
            </Pressable>
          ) : null}
          {o.stato === 'da_incassare' ? (
            <>
              {/* FATTURA: il lavoro è finito, si chiede il documento a
                  FINANCE. Non è «incassato» — i soldi arrivano dopo. */}
              {!o.fattura_numero ? (
                <Pressable
                  style={[styles.iconaAzione, inCorso === o.id && { opacity: 0.5 }]}
                  disabled={inCorso === o.id}
                  onPress={(e: any) => { e?.stopPropagation?.(); chiediFattura(o); }}
                  accessibilityLabel="Chiedi la fattura a FINANCE"
                  {...({ title: 'Fattura — chiedi il documento a FINANCE (non è l’incasso)' } as any)}
                >
                  <Ionicons name="document-text-outline" size={17} color={colors.navy} />
                </Pressable>
              ) : null}
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
                  {...({ title: 'Pro-forma — emettila su FINANCE e agganciala a questo ordine' } as any)}
                >
                  <Ionicons name="receipt-outline" size={17} color={colors.navy} />
                </Pressable>
              ) : null}
              <Pressable
                style={styles.iconaAzione}
                onPress={(e: any) => { e?.stopPropagation?.(); chiediAcconto(o); }}
                accessibilityLabel="Chiedi un acconto"
                {...({ title: 'Acconto — chiedine uno in percentuale' } as any)}
              >
                <Ionicons name="wallet-outline" size={17} color={colors.navy} />
              </Pressable>
              {/* L'azione di tutti i giorni resta l'unica PIENA: si trova
                  a colpo d'occhio anche fra sei icone. */}
              <Pressable
                style={styles.iconaPiena}
                onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'incassato'); }}
                accessibilityLabel="Segna incassato"
                {...({ title: 'Incassato — i soldi sono arrivati' } as any)}
              >
                <Ionicons name="checkmark" size={17} color={colors.bianco} />
              </Pressable>
              <Pressable
                style={styles.iconaAzione}
                hitSlop={8}
                onPress={(e: any) => { e?.stopPropagation?.(); apriModifica(o); }}
                accessibilityLabel="Modifica l'ordine"
                {...({ title: "Modifica l'ordine" } as any)}
              >
                <Ionicons name="create-outline" size={16} color={colors.grigio} />
              </Pressable>
              <Pressable
                style={styles.iconaAzione}
                hitSlop={8}
                onPress={(e: any) => { e?.stopPropagation?.(); chiediAnnulla(o); }}
                accessibilityLabel="Annulla l'ordine"
                {...({ title: "Annulla l'ordine" } as any)}
              >
                <Ionicons name="close-circle-outline" size={16} color={colors.grigio} />
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
                <Ionicons name="arrow-undo-outline" size={17} color={colors.navy} />
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
                <Ionicons name="create-outline" size={16} color={colors.grigio} />
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
      setAccontoPer(null);
      avvisa('Acconto richiesto', `${importoBreve(importo)} (${percentuale}%) è in Pagamenti, col saldo accanto.`);
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
  function apriChiusura(o: OrdineConLuogo) {
    if (!haFornitura(o)) {
      avvisa(
        'Manca la fornitura',
        'Prima di chiudere bisogna dire chi ha fornito e a quanto: senza, il ricavo entra nei conti e il suo costo no.\n\nSi scrive dalla modifica dell\'ordine, sezione «Fornitura».',
      );
      return;
    }
    setChiusuraPer(o);
  }

  async function riapriOrdine(o: OrdineConLuogo) {
    try {
      await aggiornaOrdine(o.id, { chiuso_il: null });
      carica();
    } catch (e: any) {
      avvisa('Non riaperto', String(e?.message ?? e));
    }
  }

  async function cambiaStato(o: OrdineConLuogo, stato: OrdineConLuogo['stato']) {
    // ⚠️ Il divieto sta QUI, non solo sul bottone: la stessa funzione la
    // chiamano l'icona in tabella e il bottone della scheda, e una regola
    // scritta su uno dei due punti è una regola che si aggira dall'altro.
    if (stato === 'incassato' && !haFornitura(o)) {
      avvisa(
        'Manca la fornitura',
        'Prima di segnare incassato bisogna dire chi ha fornito e a quanto: senza, il ricavo entra nei conti e il suo costo no — e il margine di questo ordine è un numero inventato.\n\nSi scrive dalla modifica dell\'ordine, sezione «Fornitura».',
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
        {/* ⭐ IL PERIODO (27/08/2026): quattro scorciatoie, non un
            calendario. La domanda vera e quella di tutti i giorni — «come sta
            andando questo mese?» — e per farsela non si deve scegliere due
            date. */}
        <View style={styles.chips}>
          <Text style={styles.gruppoTitolo}>Pratica</Text>
          <Chip label="Tutti" on={chiusura === 'tutti'} onPress={() => setChiusura('tutti')} />
          <Chip label="Da chiudere" on={chiusura === 'aperti'} onPress={() => setChiusura('aperti')} />
          <Chip label="Chiusi" on={chiusura === 'chiusi'} onPress={() => setChiusura('chiusi')} />
        </View>
        <View style={styles.chips}>
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
        </View>
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
                  fornitore: conCosto.length ? `su ${conCosto.length} di ${righe.length}` : 'nessun preventivo',
                  costo: conCosto.length ? importoBreve(costo) : '—',
                  altri: conCosto.length && altri ? importoBreve(altri) : '—',
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
                    <StatusBadge small label={labelStatoOrdine[o.stato]} colore={coloreStatoOrdine[o.stato]} />
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
                        <Pressable style={styles.btnGhost} onPress={() => apriChiusura(o)}>
                          <Ionicons name="lock-closed-outline" size={15} color={colors.navy} />
                          <Text style={styles.btnGhostTxt}>Chiudi</Text>
                        </Pressable>
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

      {modificaPer && bozza ? (
        <Foglio
          titolo="Modifica l'ordine"
          sottotitolo={`Creato il ${dataIt(modificaPer.created_at)} · ${labelStatoOrdine[modificaPer.stato]}`}
          bloccaSfondo
          onClose={() => {
            setModificaPer(null);
            setBozza(null);
          }}
        >
          <Text style={styles.campoLabel}>Cliente *</Text>
          <TextInput
            style={styles.campo}
            value={bozza.cliente}
            onChangeText={(v) => setBozza({ ...bozza, cliente: v })}
            placeholder="Chi compra"
            placeholderTextColor={colors.grigio}
          />
          {/* ⚠️ Il nome del NEGOZIO non si tocca da qui: appartiene alla sua
              scheda, e riscriverlo sull'ordine farebbe due nomi diversi per la
              stessa attività. Qui si corregge solo come si chiama sull'ordine. */}
          {modificaPer.place_nome ? (
            <View style={styles.rigaNegozio}>
              <Text style={[styles.campoAiuto, { flex: 1 }]}>
                Negozio collegato: {modificaPer.place_nome} — si cambia dalla sua scheda, non da qui.
              </Text>
              {/* ⭐ 27/08/2026, richiesta dell'utente: «metti link per aprire i
                  dati del cliente in anagrafica». La domanda che segue «chi è
                  questo cliente?» è sempre la stessa — P.IVA, sede, referenti —
                  e la risposta sta in un'altra app: senza il link si copiava il
                  nome e lo si cercava a mano.
                  ⚠️ Compare solo se il negozio È nel registro: un link che
                  porta a una scheda inesistente fa credere che il dato ci sia. */}
              {urlSchedaRegistro(modificaPer.place_anagrafiche_id) ? (
                <Pressable
                  style={styles.linkRegistro}
                  onPress={() => Linking.openURL(urlSchedaRegistro(modificaPer.place_anagrafiche_id)!)}
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

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    // «tutto risponde» (Libro UX cap.3): la pillola reagisce alla pressione.
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.6 }]}>
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
  const [trovata, setTrovata] = useState<Awaited<ReturnType<typeof cercaFattura>> | null>(null);
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
  const [criterio, setCriterio] = useState<'cliente' | 'importo' | 'numero'>('cliente');
  const [q, setQ] = useState(ordine.place_nome ?? ordine.cliente);
  const [elenco, setElenco] = useState<FatturaInElenco[] | null>(null);
  const [erroreRicerca, setErroreRicerca] = useState<string | null>(null);

  /** Cambiando criterio si riparte: il valore di prima non vuol dire più
   *  niente, e lasciarlo lì farebbe cercare «TBF Limited Srl» come importo. */
  function scegliCriterio(c: 'cliente' | 'importo' | 'numero') {
    setCriterio(c);
    setElenco(null);
    setTrovata(null);
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
    setTrovata(null);
    setErroreRicerca(null);
    try {
      if (criterio === 'numero') {
        setTrovata(await cercaFattura(testo));
        return;
      }
      const imp = criterio === 'importo' ? leggiImporto(testo) : null;
      if (criterio === 'importo' && imp == null) {
        setErroreRicerca(`«${testo}» non è un importo. Scrivilo come 2.720,00.`);
        return;
      }
      const r = await cercaFatture(
        criterio === 'importo' ? { importo: imp } : { cliente: testo },
      );
      if (!r.ok) setErroreRicerca(r.errore ?? 'Ricerca non riuscita.');
      else setElenco(r.fatture);
    } finally {
      setCerco(false);
    }
  }

  async function agganciaRiga(f: FatturaInElenco) {
    if (!f.numero) {
      avvisa('Fattura senza numero', 'Questa fattura non ha ancora un numero su FINANCE: si aggancia quando ce l\'ha.');
      return;
    }
    setInCorso('aggancia');
    try {
      await collegaDocumentoAOrdine(ordine.id, { fatturaNumero: f.numero });
      await aggiornaOrdine(ordine.id, { chiuso_il: new Date().toISOString() });
      onFatto();
    } catch (e: any) {
      avvisa('Non agganciata', String(e?.message ?? e));
    } finally {
      setInCorso(null);
    }
  }

  const giaFatturato = Boolean(ordine.fattura_numero);

  async function verifica() {
    const n = numero.trim();
    if (!n || cerco) return;
    setCerco(true);
    setTrovata(null);
    try {
      setTrovata(await cercaFattura(n));
    } finally {
      setCerco(false);
    }
  }

  async function chiudi(conNota: string) {
    setInCorso(conNota);
    try {
      await aggiornaOrdine(ordine.id, { chiuso_il: new Date().toISOString() });
      onFatto();
    } catch (e: any) {
      avvisa('Non chiuso', String(e?.message ?? e));
    } finally {
      setInCorso(null);
    }
  }

  async function agganciaEChiudi() {
    if (!trovata?.trovata) return;
    setInCorso('aggancia');
    try {
      await collegaDocumentoAOrdine(ordine.id, { fatturaNumero: trovata.numero ?? numero.trim() });
      await aggiornaOrdine(ordine.id, { chiuso_il: new Date().toISOString() });
      onFatto();
    } catch (e: any) {
      avvisa('Non agganciata', String(e?.message ?? e));
    } finally {
      setInCorso(null);
    }
  }

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
      await aggiornaOrdine(ordine.id, { chiuso_il: new Date().toISOString() });
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
      {giaFatturato ? (
        <>
          <Text style={styles.campoAiuto}>
            Questo ordine ha già la fattura {ordine.fattura_numero}. Non c&apos;è altro da fare: si può chiudere.
          </Text>
          <Pressable
            style={[styles.btn, styles.btnLargo, inCorso === 'gia' && { opacity: 0.5 }]}
            disabled={!!inCorso}
            onPress={() => chiudi('gia')}
          >
            <Text style={styles.btnTxt}>Chiudi l&apos;ordine</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.campoLabel}>Cerca la fattura su FINANCE</Text>
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
              ? "L'importo si confronta sia col totale sia con l'imponibile, a un euro di tolleranza: l'IVA fa ballare i centesimi."
              : criterio === 'cliente'
                ? 'Basta una parte del nome. È già compilato con il cliente di questo ordine.'
                : 'Il numero come lo scrive FINANCE, per esempio 181/2026.'}
          </Text>

          {erroreRicerca ? <Text style={styles.chiusuraNo}>{erroreRicerca}</Text> : null}

          {trovata ? (
            trovata.trovata ? (
              <Pressable style={styles.fattRiga} disabled={!!inCorso} onPress={agganciaEChiudi}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.fattNumero} numberOfLines={1}>
                    {trovata.numero ?? q.trim()} · {trovata.partner?.nome ?? '—'}
                  </Text>
                  <Text style={styles.fattMeta} numberOfLines={1}>
                    {trovata.totale != null ? importoBreve(trovata.totale) : 'importo non indicato'}
                    {trovata.pagata ? ' · pagata' : trovata.scaduta ? ' · scaduta' : ' · non pagata'}
                  </Text>
                </View>
                <Ionicons name="link-outline" size={17} color={colors.navy} />
              </Pressable>
            ) : (
              <Text style={styles.chiusuraNo}>{trovata.motivo ?? 'Nessuna fattura con questo numero.'}</Text>
            )
          ) : null}

          {elenco ? (
            elenco.length ? (
              <View style={{ gap: 6 }}>
                {/* ⚠️ Si SCEGLIE, non si aggancia da soli: due clienti con un
                    nome simile, o due ordini dello stesso mese con lo stesso
                    importo, sono la normalità — e agganciare la prima riga
                    sbaglierebbe due pratiche insieme. */}
                {elenco.map((f) => (
                  <Pressable key={f.id} style={styles.fattRiga} disabled={!!inCorso} onPress={() => agganciaRiga(f)}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.fattNumero} numberOfLines={1}>
                        {f.numero ?? 'senza numero'} · {f.partner?.nome ?? '—'}
                      </Text>
                      <Text style={styles.fattMeta} numberOfLines={1}>
                        {importoBreve(f.totale)} ({importoBreve(f.imponibile)} + IVA {f.aliquotaIva}%)
                        {f.emissione ? ` · ${f.emissione}` : ` · ${f.mese}/${f.anno}`}
                        {f.pagata ? ' · pagata' : ' · non pagata'}
                        {f.combacia === 'imponibile' ? " · combacia con l'imponibile" : ''}
                      </Text>
                    </View>
                    <Ionicons name="link-outline" size={17} color={colors.navy} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.campoAiuto}>
                Nessuna fattura con questi dati. Può darsi che non sia ancora stata emessa: qui sotto c&apos;è come
                farla.
              </Text>
            )
          ) : null}

          <Text style={[styles.campoLabel, { marginTop: 10 }]}>Oppure emettila adesso</Text>
          <Pressable
            style={[styles.btnGhostLargo, inCorso === 'emetti' && { opacity: 0.5 }]}
            disabled={!!inCorso}
            onPress={emettiEChiudi}
          >
            <Ionicons name="document-text-outline" size={16} color={colors.navy} />
            <Text style={styles.btnGhostLargoTxt}>
              {inCorso === 'emetti' ? 'Emetto…' : 'Emetti la fattura su FINANCE e chiudi'}
            </Text>
          </Pressable>

          {/* ⚠️ NON C'È «chiudi senza fattura» (regola dell'utente, 27/08/2026:
              «non può essere chiuso senza fattura»). Un ordine chiuso senza
              documento è un ricavo senza carta: la scorciatoia l'avevo messa io,
              e una scorciatoia che si può prendere si prende. */}
          <Text style={styles.campoAiuto}>
            Un ordine non si chiude senza fattura: senza documento resta un ricavo senza carta.
          </Text>
        </>
      )}
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
      ) : (
        // ⚠️ Non è un vuoto qualsiasi: senza fornitura l'ordine non si può
        // chiudere, ed è meglio saperlo adesso che davanti al bottone spento.
        <Text style={styles.fornVuoto}>
          Nessun fornitore indicato. Serve prima di poter segnare l&apos;ordine come incassato: senza, il ricavo
          entra nei conti e il suo costo no.
        </Text>
      )}

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
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco,
  },
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
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
  head: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.sfondo },
  sub: { color: colors.testoSoft, fontSize: 13 },
  subForte: { color: colors.navy, fontWeight: '800' },
  subNota: { color: colors.grigio, fontWeight: '400' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', marginRight: 2 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minHeight: touchMin, justifyContent: 'center' },
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
  sitoTxt: { color: colors.testoSoft, fontSize: 11.5, fontWeight: '600' },
  brandTxt: { color: colors.goldStrong, fontSize: 10.5, fontWeight: '700' },
  riepilogoMobile: { paddingBottom: 8 },
  riepilogoTxt: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '700' },
  // ⚠️ Cornice da 5, non da 7 (27/08/2026): con l'undicesima colonna servivano
  // pixel, e la regola è quella detta dall'utente — si stringe la cornice dei
  // bottoni, non il loro numero. Le azioni restano SEI.
  iconaAzione: { padding: 5, borderRadius: radius.sm },
  // L'azione di tutti i giorni: l'unica piena, si trova a colpo d'occhio.
  iconaPiena: { padding: 5, borderRadius: radius.sm, backgroundColor: colors.ink },
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
  docChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  docChipTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 10.5 },
  percRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  percChip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, minHeight: touchMin, justifyContent: 'center' },
  percChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  percTxt: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  percTxtOn: { color: colors.bianco },
  percInput: { width: 70, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, color: colors.testo, fontSize: 14, textAlign: 'center' },
  percCalcolo: { color: colors.testoSoft, fontSize: 13, marginTop: 4 },
  btnLargo: { marginTop: 8, paddingVertical: 12 },
  // Il form di modifica dentro il foglio (DS §Campi).
  campoLabel: { color: colors.navy, fontWeight: '700', fontSize: 13, marginTop: spacing.sm },
  campo: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, backgroundColor: colors.bianco, paddingHorizontal: 12, paddingVertical: 9, color: colors.testo, fontSize: 14, marginTop: 4 },
  campoAlto: { minHeight: 64, textAlignVertical: 'top' },
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
  erroreCard: { backgroundColor: colors.erroreSoft, borderWidth: 1, borderColor: colors.errore, borderRadius: radius.lg, padding: spacing.md, gap: 8 },
  erroreTesta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  erroreTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  erroreTxt: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  btnRiprova: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: touchMin },
  btnRiprovaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
});
