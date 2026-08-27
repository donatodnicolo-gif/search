// Ordini — il punto d'arrivo del funnel: cosa abbiamo CHIUSO davvero.
// Nasce automaticamente dalla trattativa vinta (docs/VISIONE-COMMERCIALE.md);
// qui si segue solo l'incasso: da incassare → incassato (o annullato).
// La pipeline dice quanto stiamo trattando; questa pagina quanto abbiamo chiuso.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { leggiImporto, scriviImporto } from '@/lib/importi';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { Tabella, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { aggiornaOrdine, collegaDocumentoAOrdine, fetchOrdini, inserisciRichiestaPagamento, type OrdineConLuogo } from '@/lib/db';
import { chiediFatturaPerOrdine } from '@/lib/partner';
import { emettiProformaPerOrdine } from '@/lib/documenti';
import { costiPerOrdine, fetchLavori, type LavoroConPreventivi } from '@/lib/preventivi';
import { Foglio } from '@/components/Foglio';
import { avvisa, conferma } from '@/lib/dialoghi';
import { CANALI, LINEE_ATTIVE } from '@/types';

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
  /** I lavori da preventivare: da qui esce il COSTO di ogni ordine. */
  const [lavori, setLavori] = useState<LavoroConPreventivi[]>([]);
  const [loading, setLoading] = useState(true);
  const [statoFiltro, setStatoFiltro] = useState<string | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);
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
  const [modificaPer, setModificaPer] = useState<OrdineConLuogo | null>(null);
  const [bozza, setBozza] = useState<{
    cliente: string;
    descrizione: string;
    valore: string;
    linea: string | null;
    canale: string | null;
  } | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      // I lavori servono al COSTO di ogni ordine (preventivi fornitore). Col
      // suo `catch`: se la tabella non risponde, gli ordini si vedono lo
      // stesso e il costo resta «—».
      const [ord, lav] = await Promise.all([fetchOrdini(), fetchLavori().catch(() => [])]);
      setOrdini(ord);
      setLavori(lav);
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

  /**
   * Quanto ci costa ciascun ordine: dai lavori collegati alla sua trattativa
   * (preventivo SCELTO se c'è, altrimenti il più basso ricevuto).
   *
   * ⚠️ Un ordine senza preventivi non entra nella mappa, e il margine resta
   * «—»: contarlo a costo zero darebbe un margine pari al prezzo pieno.
   */
  const costi = useMemo(() => costiPerOrdine(lavori, ordini), [lavori, ordini]);
  const margineDi = useCallback(
    (o: OrdineConLuogo): number | null => {
      const c = costi.get(o.id);
      if (!c || o.valore == null) return null;
      return Math.round((o.valore - c.costo) * 100) / 100;
    },
    [costi],
  );

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
    { chiave: 'canale', label: 'Canale', width: 68, valore: (o) => o.canale ?? null },
    /**
     * QUANTO CI COSTA, accanto a quanto lo vendiamo (richiesta dell'utente).
     * Il fornitore e il suo preventivo vengono dai lavori collegati alla
     * trattativa: quello SCELTO se c'è, altrimenti il più basso ricevuto.
     */
    {
      chiave: 'fornitore',
      label: 'Fornitore',
      flex: 0.8,
      valore: (o) => costi.get(o.id)?.fornitore ?? null,
    },
    {
      chiave: 'costo',
      label: 'Preventivo',
      width: 104,
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
    {
      chiave: 'margine',
      label: 'Margine',
      width: 112,
      destra: true,
      numerica: true,
      valore: (o) => margineDi(o),
      cella: (o) => {
        const m = margineDi(o);
        // ⚠️ Senza preventivo il margine NON è il prezzo pieno: è sconosciuto.
        // Scriverlo sarebbe il numero più ottimista e più falso che c'è.
        if (m === null) return <Text style={styles.tabData}>—</Text>;
        const perc = o.valore ? Math.round((m / o.valore) * 100) : null;
        return (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.tabValore, m < 0 && styles.margineNegativo]}>{importoBreve(m)}</Text>
            {perc !== null ? (
              <Text style={[styles.tabStima, m < 0 && styles.margineNegativo]}>{perc}%</Text>
            ) : null}
          </View>
        );
      },
    },
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
              {/* FATTURA: il lavoro è finito, si chiede il documento a
                  FINANCE. Non è «incassato» — i soldi arrivano dopo. */}
              {!o.fattura_numero ? (
                <Pressable
                  style={[styles.btnMini, inCorso === o.id && { opacity: 0.5 }]}
                  disabled={inCorso === o.id}
                  onPress={(e: any) => { e?.stopPropagation?.(); chiediFattura(o); }}
                >
                  <Text style={styles.btnMiniTxt}>{inCorso === o.id ? 'Chiedo…' : 'Fattura'}</Text>
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
                  style={[styles.btnMini, inCorso === o.id && { opacity: 0.5 }]}
                  disabled={inCorso === o.id}
                  onPress={(e: any) => { e?.stopPropagation?.(); emettiProforma(o); }}
                  {...({ title: 'Emetti la pro-forma su FINANCE e agganciala a questo ordine' } as any)}
                >
                  <Text style={styles.btnMiniTxt}>{inCorso === o.id ? 'Emetto…' : 'Pro-forma'}</Text>
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
              {/* Correggere e annullare sono icone: si usano di rado e non
                  devono rubare spazio alle azioni di tutti i giorni. */}
              <Pressable
                hitSlop={8}
                onPress={(e: any) => { e?.stopPropagation?.(); apriModifica(o); }}
                accessibilityLabel="Modifica l'ordine"
                {...({ title: "Modifica l'ordine" } as any)}
              >
                <Ionicons name="create-outline" size={16} color={colors.grigio} />
              </Pressable>
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
            <>
              <Pressable style={styles.btnMini} onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'da_incassare'); }}>
                <Text style={styles.btnMiniTxt}>Da incassare</Text>
              </Pressable>
              {/* ⚠️ Anche un ordine incassato o annullato si corregge: un nome
                  sbagliato resta sbagliato nei conti dell'anno. */}
              <Pressable
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
    if (valore !== (modificaPer.valore ?? null)) patch.valore = valore;
    if ((bozza.linea ?? null) !== (modificaPer.linea ?? null)) patch.linea = bozza.linea;
    if ((bozza.canale ?? null) !== (modificaPer.canale ?? null))
      patch.canale = bozza.canale as OrdineConLuogo['canale'];
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
                return {
                  cliente: `Totale · ${righe.length} ordini`,
                  valore: importoBreve(valore),
                  fornitore: conCosto.length ? `su ${conCosto.length} di ${righe.length}` : 'nessun preventivo',
                  costo: conCosto.length ? importoBreve(costo) : '—',
                  margine: conCosto.length ? importoBreve(margine) : '—',
                };
              }}
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
            <Text style={styles.campoAiuto}>
              Negozio collegato: {modificaPer.place_nome} — si cambia dalla sua scheda, non da qui.
            </Text>
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
  tabStima: { color: colors.grigio, fontSize: 10.5 },
  margineNegativo: { color: colors.errore },
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
  docChipCard: { alignSelf: 'flex-start' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12.5 },
  btnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
});
