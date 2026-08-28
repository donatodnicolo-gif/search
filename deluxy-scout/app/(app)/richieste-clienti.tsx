// RICHIESTE CLIENTI — le richieste saltuarie che arrivano al commerciale.
//
// Decisione dell'utente (26/08/2026): «il commerciale deve avere per le
// richieste saltuarie un applicativo dove inserirle e richiedere a FINANCE la
// fattura». Prima non c'era, e le due strade possibili erano tutte e due
// sbagliate: aprire una trattativa (la pipeline si riempie di evasioni e la
// stessa vendita vale due volte) o usare le richieste di pagamento (sono
// l'anello DOPO, e pretendono un importo che qui spesso ancora non c'è).
//
// ⚠️ Qui non si misura niente. Il registro dei risultati è FINANCE: da qui si
// CHIEDE il documento (pro-forma) e si tiene il suo riferimento — numero e
// link — mai una copia dei suoi importi.
//
// ⚠️ La pro-forma in FINANCE si emette a un PARTNER risolto per NOME: se il
// cliente là non c'è, il servizio risponde «Partner non trovato» con i
// candidati simili. Quell'errore si mostra per intero invece di tradurlo in un
// generico «non riuscito»: dice esattamente cosa manca e dove.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, shadow, spacing, touchMin, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { leggiImportoPositivo, scriviImporto } from '@/lib/importi';
import { EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
import { Foglio } from '@/components/Foglio';
import { CampoData } from '@/components/CampoData';
import { Tabella, dataBreve, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { avvisa, conferma } from '@/lib/dialoghi';
import {
  aggiornaRichiestaCliente,
  cercaPlaces,
  collegaDocumentoAOrdine,
  collegaPreventivoARichiesta,
  creaOrdineDaRichiesta,
  fetchLeads,
  leadDiventaRichiesta,
  collegaProformaARichiesta,
  creaRichiestaCliente,
  eliminaRichiestaCliente,
  fetchRichiesteCliente,
  type PlaceLite,
} from '@/lib/db';
import { creaPreventivoDaRichiesta, creaProformaDaRichiesta, esitoPreventivo } from '@/lib/partner';
import { emettiProformaPerOrdine, raccontaEsito } from '@/lib/documenti';
import { cercaNellaMiaCasella, fetchCorpoMail, importaRichiesteDaMail, type MiaMail } from '@/lib/mail';
import { analizzaMessaggioLead } from '@/lib/lead-parse';
import { urlMessaggioAiMail } from '@/lib/aimail';
import {
  LABEL_CANALE_RICHIESTA,
  LABEL_STATO_RICHIESTA,
  type CanaleRichiesta,
  type Lead,
  type RichiestaCliente,
  type StatoRichiestaCliente,
  type TipologiaRichiesta,
  LINEE_ATTIVE,
} from '@/types';

const CANALI: CanaleRichiesta[] = ['mail', 'telefono', 'whatsapp', 'di_persona', 'web', 'altro'];
const TIPOLOGIE: TipologiaRichiesta[] = ['b2b', 'maison'];
/**
 * ⭐ LA LINEA DI BUSINESS (27/08/2026, richiesta dell'utente: «serve la linea di
 * business di richiesta»).
 *
 * Stesso vocabolario di trattative e ordini — è LINEE_ATTIVE, non un elenco
 * scritto qui: due liste di linee divergono al primo ritocco, e da lì «Gifting»
 * e «Regali» diventano due conti separati della stessa cosa.
 */
const LABEL_TIPOLOGIA: Record<TipologiaRichiesta, string> = {
  b2b: 'B2B (ricorrente)',
  maison: 'Maison (nuovo)',
};
/**
 * ⭐ LE QUATTRO VISTE (26/08/2026, richiesta dell'utente: «indica anche lo
 * stato — aperto, trasformato in ordine, perso, annullato (se cestino)»).
 *
 * Gli stati interni sono di più — una richiesta può essere nuova, col
 * preventivo fuori, o col prezzo concordato — ma da fuori sono tutti la stessa
 * cosa: **aperta**, cioè da lavorare. Le altre tre sono i modi in cui finisce.
 */
type VistaRichiesta = 'aperte' | 'in_ordine' | 'perse' | 'annullate';
const VISTE_RICHIESTA: { v: VistaRichiesta; label: string }[] = [
  { v: 'aperte', label: 'Aperte' },
  { v: 'in_ordine', label: 'In ordine' },
  { v: 'perse', label: 'Perse' },
  { v: 'annullate', label: 'Annullate' },
];
function vistaDiRichiesta(s: StatoRichiestaCliente): VistaRichiesta {
  if (s === 'annullata') return 'annullate';
  if (s === 'persa') return 'perse';
  // «fatturata» è un ordine arrivato in fondo: sta con gli ordini, non fra il
  // lavoro da fare.
  if (s === 'in_ordine' || s === 'fatturata') return 'in_ordine';
  return 'aperte';
}

const COLORE_STATO: Record<StatoRichiestaCliente, string> = {
  nuova: colors.oro,
  // Il preventivo è FUORI: la palla è del cliente, e si vede a colpo d'occhio
  // che non è più roba da lavorare ma da sollecitare.
  preventivo_inviato: colors.blue,
  concordata: colors.blue,
  in_ordine: colors.successo,
  fatturata: colors.successo,
  persa: colors.grigio,
  annullata: colors.grigio,
};

/** La regola sta in lib/importi.ts, una volta sola e provata: era ricopiata in
 *  cinque schermate, e in tre di quelle era sbagliata in due modi diversi. */
const leggiImporto = leggiImportoPositivo;

export default function RichiesteClienti() {
  // Da 900px in su l'elenco è una tabella (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [righe, setRighe] = useState<RichiestaCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [formAperto, setFormAperto] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaRichiesta>('aperte');
  const [query, setQuery] = useState('');
  const [importando, setImportando] = useState(false);
  /**
   * ⭐ MODIFICA DELLA RICHIESTA (27/08/2026, richiesta dell'utente: «al click
   * su riga permetti modifica della richiesta cliente»).
   *
   * Fin qui una richiesta si poteva solo far avanzare di stato o eliminare: un
   * importo sbagliato o una descrizione da correggere obbligavano a cancellarla
   * e riscriverla — e con lei se ne andavano la data, la nota e il legame con
   * la mail da cui era nata.
   */
  const [modificaPer, setModificaPer] = useState<RichiestaCliente | null>(null);
  const router = useRouter();

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setRighe(await fetchRichiesteCliente());
    } catch (e: any) {
      setErrore(e?.message ?? 'Elenco non caricato.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  /**
   * Legge la posta commerciale e ne tira fuori le richieste dei CLIENTI.
   *
   * È lo stesso import delle Richieste Web — una casella sola, un giro solo —
   * ma il conto che interessa qui è l'altro: quante mail erano di clienti che
   * abbiamo già e sono diventate richieste da prezzare invece di trattative
   * (regola del binario). Le altre restano di là, e lo si dice: un import che
   * non racconta dove sono finite le mail sembra averle perse.
   */
  async function importaDallaPosta() {
    if (importando) return;
    setImportando(true);
    try {
      const esito = await importaRichiesteDaMail();
      await carica();
      const nate = esito.richiesteCliente;
      const altrove = esito.trattativeAgganciate + esito.trattativeConNegozioNuovo;
      avvisa(
        nate ? 'Richieste importate' : 'Nessuna richiesta di clienti',
        [
          nate
            ? `${nate} ${nate === 1 ? 'richiesta è arrivata' : 'richieste sono arrivate'} qui, da clienti che abbiamo già.`
            : `Nessuna delle ${esito.lette} mail lette era di un cliente già nostro.`,
          altrove
            ? `${altrove} ${altrove === 1 ? 'era di qualcuno di nuovo ed è diventata una trattativa' : 'erano di contatti nuovi e sono diventate trattative'}: le trovi in Richieste Web.`
            : '',
          esito.rimasteInCoda ? `${esito.rimasteInCoda} sono rimaste in coda da qualificare a mano.` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
    } catch (e: any) {
      avvisa('Importazione non riuscita', e?.message ?? 'Riprova più tardi.');
    } finally {
      setImportando(false);
    }
  }

  const conteggi = useMemo(() => {
    const c: Record<VistaRichiesta, number> = { aperte: 0, in_ordine: 0, perse: 0, annullate: 0 };
    for (const r of righe) c[vistaDiRichiesta(r.stato)]++;
    return c;
  }, [righe]);

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtrate = righe.filter((r) => {
      if (vistaDiRichiesta(r.stato) !== vista) return false;
      if (!q) return true;
      return [r.cliente, r.descrizione, r.nota, r.proforma_numero, r.preventivo_numero]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // ⚠️ PRIMA QUELLE CHE SCADONO PRIMA (27/08/2026). La tabella parte ordinata
    // per «serve entro» — perché è quello l'ordine giusto per lavorarle — ma il
    // ramo a SCHEDE, cioè il telefono, mostrava l'ordine del database
    // (inserimento, dal più recente): dal telefono la richiesta che scade
    // domani stava in fondo, e lì non c'è nessuna intestazione da toccare per
    // riordinare. Ora i due rami partono uguali.
    // Chi non ha una data va in fondo: «non lo so» non è «scade fra molto».
    return [...filtrate].sort((a, b) => {
      if (a.serve_entro === b.serve_entro) return 0;
      if (!a.serve_entro) return 1;
      if (!b.serve_entro) return -1;
      return a.serve_entro < b.serve_entro ? -1 : 1;
    });
  }, [righe, vista, query]);

  /**
   * Chiede il PREVENTIVO a FINANCE: l'offerta da mandare al cliente, che poi
   * l'accetta o la rifiuta. È il primo dei due documenti della catena
   * (preventivo → pro-forma → fattura) decisa il 26/08/2026.
   */
  async function chiediPreventivo(r: RichiestaCliente) {
    if (inCorso) return;
    if (!r.importo) {
      avvisa(
        'Manca l’importo',
        'Il preventivo è un prezzo: scrivi l’importo nella richiesta, poi lo si può chiedere a FINANCE.',
      );
      return;
    }
    conferma(
      'Chiedere il preventivo a FINANCE?',
      `Per «${r.cliente}», ${importoBreve(r.importo)} — ${r.descrizione}.\n\nNasce in bozza su Deluxy Partner: l’invio al cliente resta un’azione di FINANCE.`,
      async () => {
        setInCorso(r.id);
        try {
          const pv = await creaPreventivoDaRichiesta({
            cliente: r.cliente,
            importo: r.importo!,
            causale: r.descrizione,
            validoFino: r.serve_entro,
          });
          await collegaPreventivoARichiesta(r.id, pv.riferimento, pv.url);
          await carica();
          avvisa('Preventivo creato', `${pv.riferimento} è in bozza su Deluxy Partner.`);
        } catch (e: any) {
          // ⚠️ Il messaggio del servizio si mostra INTERO: se il cliente là non
          // c'è, dice «Partner non trovato» e i candidati simili — cioè
          // esattamente cosa manca e dove.
          avvisa('Preventivo non creato', e?.message ?? 'Riprova.');
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Chiedi il preventivo' },
    );
  }

  /**
   * ⭐ TRASFORMA IN ORDINE (26/08/2026, richiesta dell'utente): la richiesta
   * passa sotto Ordini — dove si guarda cosa c'è da consegnare e da incassare —
   * e il documento nasce insieme.
   *
   * Se la pro-forma non c'è ancora, si chiede adesso a FINANCE e si aggancia a
   * tutti e due: alla richiesta e all'ordine. Se c'è già, l'ordine la eredita
   * invece di chiederne una seconda — due documenti per una vendita sarebbero
   * due volte lo stesso incasso.
   */
  async function trasformaInOrdine(r: RichiestaCliente) {
    if (inCorso) return;
    if (!r.importo) {
      avvisa(
        'Manca l’importo',
        'Un ordine senza valore non si incassa e non si misura: scrivi il prezzo concordato, poi si trasforma.',
      );
      return;
    }
    conferma(
      'Trasformare in ordine?',
      `«${r.cliente}» · ${importoBreve(r.importo)}.\n\nLa richiesta passa sotto Ordini${
        r.proforma_numero ? ` con la pro-forma ${r.proforma_numero} già agganciata` : ', e la pro-forma nasce adesso su FINANCE'
      }.`,
      async () => {
        setInCorso(r.id);
        try {
          const { id: ordineId } = await creaOrdineDaRichiesta(r);
          // Il documento: se manca, si chiede ora. ⚠️ Best-effort — l'ordine è
          // già nato, e un registro che non risponde non deve farlo perdere.
          if (!r.proforma_numero) {
            // Stesso posto delle altre due strade (lib/documenti.ts): non
            // lancia mai e torna un esito da raccontare. Si dice ESATTAMENTE
            // cosa è riuscito e cosa no — «non riuscito» su un'operazione a
            // metà manda a cercare nel posto sbagliato.
            const esito = await emettiProformaPerOrdine({
              ordineId,
              cliente: r.cliente,
              importo: r.importo,
              causale: r.descrizione,
              scadenza: r.serve_entro,
            });
            // Il riferimento va anche sulla RICHIESTA: da lì si riapre il
            // documento senza passare dall'ordine.
            if (esito.emessa && esito.riferimento) {
              await collegaProformaARichiesta(r.id, esito.riferimento, esito.url ?? '');
            }
            await carica();
            const t = raccontaEsito(esito);
            avvisa(t.titolo, t.testo);
            return;
          }
          await carica();
          avvisa('Ordine creato', `È in Ordini, con la pro-forma ${r.proforma_numero} agganciata.`);
        } catch (e: any) {
          avvisa('Non è stato creato', e?.message ?? 'Riprova.');
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Trasforma' },
    );
  }

  /** L'esito del preventivo: lo dice il cliente, noi lo registriamo di là. */
  async function esitoDelPreventivo(r: RichiestaCliente, accettato: boolean) {
    if (inCorso || !r.preventivo_numero) return;
    setInCorso(r.id);
    try {
      await esitoPreventivo(r.preventivo_numero, accettato ? 'accettata' : 'rifiutata');
      // Accettato = prezzo concordato, si può chiedere la fattura. Rifiutato =
      // persa, e il perché si scrive nella nota.
      await aggiornaRichiestaCliente(r.id, { stato: accettato ? 'concordata' : 'persa' });
      await carica();
    } catch (e: any) {
      avvisa('Esito non registrato', e?.message ?? 'Riprova.');
    } finally {
      setInCorso(null);
    }
  }

  /**
   * Chiede il documento a FINANCE: nasce la pro-forma, e sulla richiesta resta
   * il riferimento. Serve l'importo — senza, non c'è niente da fatturare, e
   * mandare zero sarebbe emettere un documento sbagliato.
   */
  async function chiediFattura(r: RichiestaCliente) {
    if (inCorso) return;
    if (!r.importo) {
      avvisa(
        'Manca l’importo',
        'Prima si concorda il prezzo con il cliente: scrivilo nella richiesta, poi si può chiedere il documento a FINANCE.',
      );
      return;
    }
    conferma(
      'Chiedere la pro-forma a FINANCE?',
      `Per «${r.cliente}», ${importoBreve(r.importo)} — ${r.descrizione}.\n\nIl documento nasce in bozza su Deluxy Partner: l’invio al cliente resta un’azione di FINANCE.`,
      async () => {
        setInCorso(r.id);
        try {
          const pf = await creaProformaDaRichiesta({
            cliente: r.cliente,
            importo: r.importo!,
            causale: r.descrizione,
            scadenza: r.serve_entro,
          });
          await collegaProformaARichiesta(r.id, pf.riferimento, pf.url);
          await carica();
          avvisa('Pro-forma creata', `${pf.riferimento} è in bozza su Deluxy Partner.`);
        } catch (e: any) {
          // ⚠️ Il messaggio del servizio si mostra INTERO: «Partner non trovato»
          // con i candidati dice cosa fare, «non riuscito» manda a indovinare.
          avvisa('Pro-forma non creata', String(e?.message ?? e));
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Chiedi il documento' },
    );
  }

  async function cambiaStato(r: RichiestaCliente, stato: StatoRichiestaCliente) {
    const prima = righe;
    setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, stato } : x)));
    try {
      await aggiornaRichiestaCliente(r.id, { stato });
    } catch (e: any) {
      // Rollback: una riga che cambia da sola e poi torna al ricaricamento fa
      // credere fatta una cosa che non è successa.
      setRighe(prima);
      avvisa('Stato non aggiornato', String(e?.message ?? e));
    }
  }

  function elimina(r: RichiestaCliente) {
    conferma(
      'Eliminare la richiesta?',
      `«${r.descrizione}» di ${r.cliente} sparisce da qui. Se hai già chiesto la pro-forma, quella resta su Deluxy Partner e va annullata di là.`,
      async () => {
        const prima = righe;
        setRighe((cur) => cur.filter((x) => x.id !== r.id));
        try {
          await eliminaRichiestaCliente(r.id);
        } catch (e: any) {
          setRighe(prima);
          avvisa('Non eliminata', String(e?.message ?? e));
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  /**
   * TRE AZIONI, non nove (26/08/2026, richiesta dell'utente: «deve rimanere
   * solo trasforma in ordine, persa e cestino»).
   *
   * Preventivo, esito del preventivo e fattura erano quattro bottoni in fila su
   * ogni riga: una barra di comandi al posto di un elenco di lavoro. Il
   * documento adesso lo chiede l'ORDINE — che è dove il denaro vive — e qui
   * resta la sola decisione di chi guarda: la porto avanti, l'ho persa, o non
   * doveva esistere.
   */
  const azioniDi = (r: RichiestaCliente) => (
    <View style={styles.azioni}>
      {r.ordine_id ? (
        <Pressable
          style={styles.btnGhost}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            router.push('/(app)/ordini');
          }}
        >
          <Text style={styles.btnGhostTxt}>Vedi l'ordine</Text>
        </Pressable>
      ) : r.stato !== 'persa' && r.stato !== 'annullata' ? (
        <Pressable
          style={[styles.btn, inCorso === r.id && styles.btnOff]}
          disabled={inCorso === r.id}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            trasformaInOrdine(r);
          }}
        >
          <Text style={styles.btnTxt}>Trasforma in ordine</Text>
        </Pressable>
      ) : null}
      {r.stato !== 'persa' && r.stato !== 'annullata' && !r.ordine_id ? (
        <Pressable
          style={styles.btnGhost}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            cambiaStato(r, 'persa');
          }}
        >
          <Text style={styles.btnGhostTxt}>Persa</Text>
        </Pressable>
      ) : null}
      {/* Il cestino ANNULLA (0076): la richiesta esce di scena ma resta, e da
          «Annullate» si rimette in gioco. Cancellarla per sempre si può da lì. */}
      {r.stato === 'annullata' ? (
        <Pressable
          hitSlop={8}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            cambiaStato(r, 'nuova');
          }}
          accessibilityLabel="Rimetti in gioco la richiesta"
          {...({ title: 'Rimettila in gioco' } as any)}
        >
          <Ionicons name="arrow-undo-outline" size={16} color={colors.navy} />
        </Pressable>
      ) : (
        <Pressable
          hitSlop={8}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            cambiaStato(r, 'annullata');
          }}
          accessibilityLabel="Annulla la richiesta"
          {...({ title: 'Annulla (va in «Annullate»)' } as any)}
        >
          <Ionicons name="trash-outline" size={16} color={colors.errore} />
        </Pressable>
      )}
      {r.stato === 'annullata' ? (
        <Pressable
          hitSlop={8}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            elimina(r);
          }}
          accessibilityLabel="Cancella per sempre la richiesta"
          {...({ title: 'Cancella per sempre' } as any)}
        >
          <Ionicons name="close-circle-outline" size={16} color={colors.errore} />
        </Pressable>
      ) : null}
    </View>
  );

  const colonne: ColonnaTabella<RichiestaCliente>[] = [
    {
      chiave: 'cliente',
      label: 'Cliente',
      flex: 1,
      valore: (r) => r.cliente,
      cella: (r) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {r.cliente}
        </Text>
      ),
    },
    { chiave: 'descrizione', label: 'Cosa chiede', flex: 1.6, righe: 2, valore: (r) => r.descrizione },
    // ⚠️ Larghezza fissa e due righe: «Eventi & Catering» non entra in una riga
    // sola, e una colonna elastica qui ruberebbe spazio al nome del cliente.
    { chiave: 'linea', label: 'Linea', width: 92, righe: 2, valore: (r) => r.linea ?? null },
    {
      chiave: 'importo',
      label: 'Importo',
      width: 96,
      destra: true,
      numerica: true,
      valore: (r) => r.importo,
      cella: (r) => (
        <Text style={[styles.tabImporto, !r.importo && styles.tabMuto]}>
          {r.importo ? importoBreve(r.importo) : 'da concordare'}
        </Text>
      ),
    },
    { chiave: 'canale', label: 'Arrivata', width: 92, valore: (r) => LABEL_CANALE_RICHIESTA[r.canale] },
    {
      chiave: 'serve',
      label: 'Serve entro',
      width: 92,
      destra: true,
      numerica: true,
      valore: (r) => r.serve_entro,
      cella: (r) => <Text style={styles.tabData}>{dataBreve(r.serve_entro)}</Text>,
    },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 132,
      valore: (r) => r.stato,
      cella: (r) => (
        <View style={styles.badgeCol}>
          <StatusBadge small label={LABEL_STATO_RICHIESTA[r.stato]} colore={COLORE_STATO[r.stato]} />
          <Text style={styles.tabTipologia}>{LABEL_TIPOLOGIA[r.tipologia]}</Text>
        </View>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        <View style={styles.headerScroll}>
          {/* ⚠️ Corta di proposito (26/08 sera, «sistema css»): tre righe di
              testo denso a tutta larghezza spingevano l'elenco sotto la piega
              e non erano allineate alla tabella. Il perché della schermata sta
              nell'intestazione del file, non addosso a chi ci lavora ogni
              giorno. */}
          <PageIntro testo="Le richieste dei clienti che abbiamo già: arrivano dalla posta e dall'app consegne, o si scrivono qui. Si prezzano e si trasformano in ordine." />
        </View>

        {/* IMPORTA DALLA POSTA (richiesta dell'utente, 26/08/2026). È lo stesso
            giro delle Richieste Web — si legge commerciale@deluxy.it — ma qui
            interessa l'altra metà: le mail di chi è GIÀ cliente non aprono una
            trattativa, diventano richieste da prezzare. Il bottone sta anche
            qui perché è qui che si va a cercarle. */}
        <Pressable
          style={[styles.btnImporta, importando && { opacity: 0.5 }]}
          disabled={importando}
          onPress={importaDallaPosta}
        >
          <Ionicons name="mail-outline" size={15} color={colors.navy} />
          <Text style={styles.btnImportaTxt}>
            {importando ? 'Leggo la posta…' : 'Importa dalla posta commerciale'}
          </Text>
        </Pressable>

        {/* RICERCA E FILTRI (26/08 sera, richiesta dell'utente). Il conto sul
            filtro serve a vedere «Perse (0)» prima di cliccarci: una lista
            vuota senza il numero sembra un guasto. */}
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per cliente, cosa chiede, nota…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {/* Su mobile la riga scorre (Libro v1.3 §8.9); su desktop va a capo. */}
        <RigaChips style={styles.chipsRiga}>
          {VISTE_RICHIESTA.map((v) => (
            <Pressable
              key={v.v}
              style={[styles.chip, vista === v.v && styles.chipOn]}
              onPress={() => setVista(v.v)}
            >
              <Text style={[styles.chipTxt, vista === v.v && styles.chipTxtOn]}>
                {v.label} ({conteggi[v.v]})
              </Text>
            </Pressable>
          ))}
        </RigaChips>

        {errore ? (
          <Text style={styles.errore}>
            <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
          </Text>
        ) : null}

        {!loading && !dati.length ? (
          <EmptyState
            loading={false}
            icona="reader-outline"
            titolo={righe.length ? 'Nessuna richiesta aperta' : 'Nessuna richiesta'}
            aiuto="Quando un cliente chiede una fornitura una tantum, scrivila qui col bottone in basso: resta fuori dalla pipeline e diventa una pro-forma quando il prezzo è concordato."
            azione="Nuova richiesta"
            onAzione={() => setFormAperto(true)}
          />
        ) : aTabella ? (
          <Tabella
            righe={dati}
            colonne={colonne}
            chiaveRiga={(r) => r.id}
            ordineIniziale={{ campo: 'serve', verso: 'asc' }}
            onRiga={(r) => setModificaPer(r)}
            labelRiga={(r) => `Modifica la richiesta di ${r.cliente}`}
            azioni={azioniDi}
            larghezzaAzioni={252}
          />
        ) : (
          dati.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.nome} numberOfLines={2}>
                  {r.cliente}
                </Text>
                <StatusBadge small label={LABEL_STATO_RICHIESTA[r.stato]} colore={COLORE_STATO[r.stato]} />
              </View>
              <Text style={styles.descrizione} numberOfLines={3}>
                {r.descrizione}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {r.importo ? importoBreve(r.importo) : 'importo da concordare'} · {LABEL_CANALE_RICHIESTA[r.canale]}
                {r.serve_entro ? ` · entro il ${dataBreve(r.serve_entro)}` : ''}
              </Text>
              {azioniDi(r)}
            </View>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)} accessibilityLabel="Nuova richiesta">
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova richiesta</Text>
      </Pressable>

      {modificaPer ? (
        <ModificaRichiesta
          r={modificaPer}
          onClose={() => setModificaPer(null)}
          onSalvata={() => {
            setModificaPer(null);
            carica();
          }}
        />
      ) : null}

      {formAperto ? (
        <NuovaRichiestaModal
          onClose={() => setFormAperto(false)}
          onCreata={() => {
            setFormAperto(false);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

// ── Il form: cliente, cosa chiede, quanto (se già si sa) ─────────────────────
function NuovaRichiestaModal({ onClose, onCreata }: { onClose: () => void; onCreata: () => void }) {
  const [ricerca, setRicerca] = useState('');
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [scelto, setScelto] = useState<PlaceLite | null>(null);
  // ⚠️ Il nome resta scrivibile anche senza aggancio: un cliente può non essere
  // ancora in Scout, e bloccare l'inserimento su questo vorrebbe dire perdere
  // la richiesta (o inventare una scheda per far contento il form).
  const [cliente, setCliente] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [canale, setCanale] = useState<CanaleRichiesta>('mail');
  const [linea, setLinea] = useState<string | null>(null);
  const [tipologia, setTipologia] = useState<TipologiaRichiesta>('b2b');
  const [serveEntro, setServeEntro] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  /**
   * ⭐ LA RICHIESTA PRESA DALLA MAIL (26/08/2026, segnalato dall'utente:
   * «manca possibilità di richiamare la richiesta dalla mail»).
   *
   * Le mail della casella commerciale sono già in coda — in Richieste Web —
   * ma da qui non si potevano riprendere: chi scriveva a mano la richiesta di
   * un cliente ricopiava quello che il cliente aveva già scritto, e la mail
   * restava in coda a sembrare non lavorata.
   *
   * Si mostrano solo le richieste ancora «nuove»: quelle già lavorate hanno
   * generato qualcosa, e riprenderle sarebbe farle contare due volte.
   */
  const [mailInCoda, setMailInCoda] = useState<Lead[]>([]);
  const [daMail, setDaMail] = useState<Lead | null>(null);
  const [elencoMail, setElencoMail] = useState(false);
  /** La mail della propria casella da cui nasce la richiesta, se c'è. */
  const [mailScelta, setMailScelta] = useState<MiaMail | null>(null);
  /** L'ultima mail di cui si è chiesto il corpo: la risposta che arriva dopo
   *  averne scelta un'altra non deve più scrivere niente. */
  const mailInCorso = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchLeads()
      .then((l) => vivo && setMailInCoda(l.filter((x) => x.stato === 'nuovo')))
      .catch(() => vivo && setMailInCoda([]));
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * ⭐ LA PROPRIA CASELLA (26/08/2026, richiesta dell'utente: «dai la
   * possibilità all'utente di ricercare tra le proprie mail quelle della
   * propria casella mail»).
   *
   * Le mail in coda sono solo quelle arrivate a commerciale@ e già importate.
   * Ma una richiesta può essere arrivata sulla posta personale di chi la sta
   * scrivendo — e allora la si cerca lì, invece di ricopiarla a mano.
   *
   * ⚠️ La casella è sempre la propria: la decide la Edge dal token.
   */
  const [cercaMail, setCercaMail] = useState('');
  const [mieMail, setMieMail] = useState<MiaMail[]>([]);
  const [cercandoMail, setCercandoMail] = useState(false);
  const [erroreMail, setErroreMail] = useState<string | null>(null);

  async function cercaNellaCasella() {
    if (cercandoMail) return;
    setCercandoMail(true);
    setErroreMail(null);
    try {
      setMieMail(await cercaNellaMiaCasella(cercaMail.trim(), 25));
    } catch (e: any) {
      setMieMail([]);
      setErroreMail(e?.message ?? 'Casella non raggiungibile.');
    } finally {
      setCercandoMail(false);
    }
  }

  /** Riempie il form con una mail della propria casella. */
  async function prendiDaMiaMail(m: MiaMail) {
    setDaMail(null);
    setElencoMail(false);
    setCanale('mail');
    setMailScelta(m);
    mailInCorso.current = m.id;
    if (!nota.trim()) setNota(`Ha scritto ${[m.da, m.email].filter(Boolean).join(' · ')}`);
    if (!cliente.trim()) {
      setCliente(m.da);
      setRicerca(m.da);
    }
    // Il testo INTERO, non l'anteprima: è quello che si legge nella scheda, e
    // due righe di anteprima non dicono cosa il cliente ha chiesto.
    if (!descrizione.trim()) {
      const anteprima = (m.anteprima ?? '').trim().slice(0, 500);
      setDescrizione(anteprima);
      try {
        const { testo } = await fetchCorpoMail(m.id);
        if (!testo.trim()) return;
        // ⚠️ FRA LA RICHIESTA E LA RISPOSTA PASSA UN SECONDO, e in quel secondo
        // l'utente può aver cominciato a correggere il testo — o aver scelto
        // un'altra mail. Prima si riscriveva il campo senza guardare: quello
        // che aveva appena digitato spariva, e sotto un'intestazione che
        // diceva «mail 2» poteva restare il corpo della mail 1. Si scrive solo
        // se questa è ancora la mail scelta E se nel campo c'è ancora
        // esattamente l'anteprima che ci abbiamo messo NOI.
        if (mailInCorso.current !== m.id) return;
        setDescrizione((attuale) => (attuale === anteprima ? testo.trim().slice(0, 500) : attuale));
      } catch {
        /* resta l'anteprima: meglio di niente, ed è dichiarata dall'origine */
      }
    }
  }

  /** Riempie il form con quello che il cliente ha scritto. */
  function prendiDaMail(l: Lead) {
    const info = analizzaMessaggioLead(l.nome, l.messaggio);
    setDaMail(l);
    setElencoMail(false);
    setCanale('mail');
    // ⚠️ Il testo pulito, non l'estratto grezzo della notifica: è quello che
    // si legge nella scheda della richiesta, e dev'essere leggibile.
    if (!descrizione.trim()) setDescrizione((info.testo || l.messaggio || '').trim().slice(0, 500));
    // Il nome NON si sovrascrive se c'è già un cliente scelto: chi scrive è
    // una persona, il cliente è l'azienda — e l'azienda vince.
    if (!scelto && !cliente.trim()) {
      setCliente(info.persona || l.nome);
      setRicerca(info.persona || l.nome);
    }
    const chi = [info.persona || l.nome, info.email || l.contatto].filter(Boolean).join(' · ');
    if (!nota.trim() && chi) setNota(`Ha scritto ${chi}`);
  }

  useEffect(() => {
    let vivo = true;
    const q = ricerca.trim();
    if (q.length < 2) {
      setRisultati([]);
      return;
    }
    const t = setTimeout(() => {
      cercaPlaces(q, 8)
        .then((r) => vivo && setRisultati(r))
        .catch(() => vivo && setRisultati([]));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [ricerca]);

  const valido = cliente.trim().length > 0 && descrizione.trim().length > 0;

  async function salva() {
    if (!valido || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      const creata = await creaRichiestaCliente({
        place_id: scelto?.id ?? null,
        cliente: cliente.trim(),
        descrizione: descrizione.trim(),
        importo: leggiImporto(importo),
        canale,
        linea,
        tipologia,
        serve_entro: serveEntro,
        nota: nota.trim() || null,
        // Se arriva da una mail, la richiesta se lo ricorda: il link per
        // rileggerla e l'id, che impedisce di prenderla una seconda volta.
        // Vale sia per la coda delle Richieste Web sia per la propria casella.
        mail_ref: daMail?.mail_ref ?? mailScelta?.id ?? null,
        origine: daMail || mailScelta ? 'scout-mail' : 'commerciale',
        riferimento_esterno: daMail?.id ?? null,
      });
      // E la mail esce dalla coda, ricordando cosa ha generato. Best-effort:
      // la richiesta è già salvata, ed è il pezzo che conta.
      if (daMail) await leadDiventaRichiesta(daMail.id, creata.id, scelto?.id ?? null);
      onCreata();
    } catch (e: any) {
      setErrore(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Foglio
      titolo="Nuova richiesta"
      sottotitolo="Una richiesta una tantum di un cliente che abbiamo già. Non apre una trattativa."
      onClose={onClose}
      bloccaSfondo
      largo
    >
      <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: 8 }}>
        {/* ARRIVA DA UNA MAIL? Prima di scrivere a mano quello che il cliente
            ha già scritto, si prende la sua mail dalla coda. */}
        {daMail ? (
          <View style={styles.mailPresa}>
            <Ionicons name="mail-open-outline" size={15} color={colors.navy} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.mailPresaNome} numberOfLines={1}>
                Dalla mail di {analizzaMessaggioLead(daMail.nome, daMail.messaggio).persona || daMail.nome}
              </Text>
              <Text style={styles.mailPresaNota} numberOfLines={1}>
                Salvando, esce dalla coda delle Richieste Web
              </Text>
            </View>
            {daMail.mail_ref ? (
              <Pressable
                hitSlop={8}
                onPress={() => Linking.openURL(urlMessaggioAiMail(daMail.mail_ref!))}
                accessibilityLabel="Apri la mail in AI Mail"
              >
                <Ionicons name="open-outline" size={17} color={colors.navy} />
              </Pressable>
            ) : null}
            <Pressable hitSlop={8} onPress={() => setDaMail(null)} accessibilityLabel="Non prenderla dalla mail">
              <Ionicons name="close-circle-outline" size={18} color={colors.grigio} />
            </Pressable>
          </View>
        ) : mailScelta ? (
          <View style={styles.mailPresa}>
            <Ionicons name="mail-open-outline" size={15} color={colors.navy} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.mailPresaNome} numberOfLines={1}>
                Dalla tua casella · {mailScelta.da}
              </Text>
              <Text style={styles.mailPresaNota} numberOfLines={1}>
                {mailScelta.oggetto || 'Senza oggetto'}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => Linking.openURL(urlMessaggioAiMail(mailScelta.id))}
              accessibilityLabel="Apri la mail in AI Mail"
            >
              <Ionicons name="open-outline" size={17} color={colors.navy} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => setMailScelta(null)} accessibilityLabel="Non prenderla dalla mail">
              <Ionicons name="close-circle-outline" size={18} color={colors.grigio} />
            </Pressable>
          </View>
        ) : (
          <>
            {mailInCoda.length ? (
              <Pressable style={styles.btnDaMail} onPress={() => setElencoMail((v) => !v)}>
                <Ionicons name="mail-outline" size={15} color={colors.navy} />
                <Text style={styles.btnDaMailTxt}>
                  {elencoMail ? 'Chiudi l’elenco' : `Prendila da una mail in coda (${mailInCoda.length})`}
                </Text>
              </Pressable>
            ) : null}

            {/* …e la propria casella: una richiesta può essere arrivata sulla
                posta personale di chi la sta scrivendo. */}
            <View style={styles.riga2}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={cercaMail}
                onChangeText={setCercaMail}
                placeholder="Cerca nelle tue mail (oggetto, mittente, testo)…"
                placeholderTextColor={colors.grigio}
                autoCapitalize="none"
                onSubmitEditing={cercaNellaCasella}
                returnKeyType="search"
              />
              <Pressable
                style={[styles.btnDaMail, { paddingHorizontal: 14 }, cercandoMail && { opacity: 0.5 }]}
                disabled={cercandoMail}
                onPress={cercaNellaCasella}
              >
                <Ionicons name="search-outline" size={15} color={colors.navy} />
                <Text style={styles.btnDaMailTxt}>{cercandoMail ? 'Cerco…' : 'Cerca'}</Text>
              </Pressable>
            </View>
            {erroreMail ? <Text style={styles.nota}>{erroreMail}</Text> : null}
            {mieMail.length ? (
              <View style={{ gap: 6 }}>
                {mieMail.slice(0, 12).map((m) => (
                  <Pressable key={m.id} style={styles.risultato} onPress={() => prendiDaMiaMail(m)}>
                    <Ionicons name="mail-outline" size={15} color={colors.navy} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.risultatoNome} numberOfLines={1}>
                        {m.da}
                        {m.oggetto ? ` · ${m.oggetto}` : ''}
                      </Text>
                      <Text style={styles.risultatoInd} numberOfLines={1}>
                        {(m.anteprima ?? '').slice(0, 90) || 'Nessuna anteprima'}
                      </Text>
                    </View>
                    <Text style={styles.risultatoInd}>{dataBreve(m.data)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {elencoMail ? (
              <View style={{ gap: 6 }}>
                {mailInCoda.slice(0, 12).map((l) => {
                  const info = analizzaMessaggioLead(l.nome, l.messaggio);
                  return (
                    <Pressable key={l.id} style={styles.risultato} onPress={() => prendiDaMail(l)}>
                      <Ionicons name="mail-outline" size={15} color={colors.navy} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.risultatoNome} numberOfLines={1}>
                          {info.persona || l.nome}
                          {info.email ? ` · ${info.email}` : ''}
                        </Text>
                        <Text style={styles.risultatoInd} numberOfLines={1}>
                          {(info.testo || l.messaggio || 'Nessun testo').slice(0, 90)}
                        </Text>
                      </View>
                      <Text style={styles.risultatoInd}>{dataBreve(l.created_at)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </>
        )}

        <Text style={styles.campoLabel}>Cliente</Text>
        {scelto ? (
          <View style={styles.sceltoRiga}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sceltoNome} numberOfLines={2}>
                {scelto.nome}
              </Text>
              {scelto.indirizzo ? (
                <Text style={styles.sceltoInd} numberOfLines={1}>
                  {scelto.indirizzo}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                setScelto(null);
                setRicerca('');
              }}
              hitSlop={8}
              accessibilityLabel="Cambia cliente"
            >
              <Ionicons name="swap-horizontal" size={20} color={colors.oro} />
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={ricerca}
              onChangeText={(v) => {
                setRicerca(v);
                setCliente(v);
              }}
              placeholder="Cerca fra i clienti, o scrivi il nome…"
              placeholderTextColor={colors.grigio}
              autoFocus
            />
            {risultati.map((p) => (
              <Pressable
                key={p.id}
                style={styles.risultato}
                onPress={() => {
                  setScelto(p);
                  setCliente(p.nome);
                }}
              >
                <Ionicons name="storefront-outline" size={15} color={colors.navy} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.risultatoNome} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  {p.indirizzo ? (
                    <Text style={styles.risultatoInd} numberOfLines={1}>
                      {p.indirizzo}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
            {ricerca.trim().length >= 2 && !risultati.length ? (
              <Text style={styles.nota}>
                Nessun cliente con questo nome in Scout: la richiesta si salva lo stesso col nome scritto qui sopra.
              </Text>
            ) : null}
          </>
        )}

        <Text style={styles.campoLabel}>Cosa chiede</Text>
        <TextInput
          style={[styles.input, styles.inputAlto]}
          value={descrizione}
          onChangeText={setDescrizione}
          placeholder="Es. catering per 40 persone, sede di Milano"
          placeholderTextColor={colors.grigio}
          multiline
        />

        <Text style={styles.campoLabel}>Importo concordato (facoltativo)</Text>
        <TextInput
          style={styles.input}
          value={importo}
          onChangeText={setImporto}
          placeholder="es. 1.500 — si può lasciare vuoto e scriverlo dopo"
          placeholderTextColor={colors.grigio}
          keyboardType="numeric"
        />

        <Text style={styles.campoLabel}>Com’è arrivata</Text>
        <View style={styles.chips}>
          {CANALI.map((c) => (
            <Chip key={c} label={LABEL_CANALE_RICHIESTA[c]} on={canale === c} onPress={() => setCanale(c)} />
          ))}
        </View>

        <Text style={styles.campoLabel}>Linea di business</Text>
        <View style={styles.chips}>
          {LINEE_ATTIVE.map((l) => (
            <Chip key={l} label={l} on={linea === l} onPress={() => setLinea(linea === l ? null : l)} />
          ))}
        </View>
        <Text style={styles.nota}>
          Su quale linea si vende. Viaggia nell&apos;ordine che nasce da qui: senza, l&apos;ordine resta fuori dai
          conti per linea.
        </Text>

        <Text style={styles.campoLabel}>Tipologia (per il budget)</Text>
        <View style={styles.chips}>
          {TIPOLOGIE.map((t) => (
            <Chip key={t} label={LABEL_TIPOLOGIA[t]} on={tipologia === t} onPress={() => setTipologia(t)} />
          ))}
        </View>

        <Text style={styles.campoLabel}>Serve entro (facoltativo)</Text>
        <CampoData valore={serveEntro} onCambia={setServeEntro} />

        <Text style={styles.campoLabel}>Note (facoltativo)</Text>
        <TextInput
          style={[styles.input, styles.inputAlto]}
          value={nota}
          onChangeText={setNota}
          placeholder="Quello che serve ricordare: condizioni, referente, vincoli…"
          placeholderTextColor={colors.grigio}
          multiline
        />

        {errore ? <Text style={styles.errore}>{errore}</Text> : null}

        <Pressable style={[styles.btnSalva, (!valido || salvando) && styles.btnOff]} disabled={!valido || salvando} onPress={salva}>
          {salvando ? (
            <ActivityIndicator color={colors.bianco} size="small" />
          ) : (
            <Text style={styles.btnSalvaTxt}>Salva la richiesta</Text>
          )}
        </Pressable>
      </ScrollView>
    </Foglio>
  );
}

/**
 * IL FOGLIO DI MODIFICA di una richiesta (27/08/2026).
 *
 * ⚠️ QUI NON SI CAMBIA LO STATO, di proposito. Gli stati di una richiesta si
 * muovono dalle azioni della riga perché ognuna fa anche ALTRO — registrare
 * l'esito di un preventivo su FINANCE, far nascere l'ordine — e una fila di
 * chip che scrivesse la sola colonna `stato` scavalcherebbe quel lavoro
 * lasciando i due sistemi a raccontare due storie diverse.
 *
 * ⚠️ E non si tocca il NEGOZIO collegato: il suo nome appartiene alla sua
 * scheda. Qui si corregge solo come si chiama su questa richiesta.
 */
function ModificaRichiesta({
  r,
  onClose,
  onSalvata,
}: {
  r: RichiestaCliente;
  onClose: () => void;
  onSalvata: () => void;
}) {
  const [cliente, setCliente] = useState(r.cliente);
  const [descrizione, setDescrizione] = useState(r.descrizione);
  const [importo, setImporto] = useState(scriviImporto(r.importo));
  const [canale, setCanale] = useState<CanaleRichiesta>(r.canale);
  const [linea, setLinea] = useState<string | null>(r.linea ?? null);
  const [tipologia, setTipologia] = useState<TipologiaRichiesta>(r.tipologia);
  const [serveEntro, setServeEntro] = useState<string | null>(r.serve_entro);
  const [nota, setNota] = useState(r.nota ?? '');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    if (salvando) return;
    if (!cliente.trim() || !descrizione.trim()) {
      setErrore('Servono il cliente e cosa chiede.');
      return;
    }
    // ⚠️ Vuoto = «non ancora concordato», e si scrive null. Un importo scritto
    // male, invece, FERMA il salvataggio: mandarlo a null lo cancellerebbe in
    // silenzio, e da lì esce una pro-forma senza prezzo.
    let valore: number | null = null;
    if (importo.trim()) {
      valore = leggiImportoPositivo(importo);
      if (valore === null) {
        setErrore(`«${importo}» non è un importo. Scrivilo come 1.500,50.`);
        return;
      }
    }
    setSalvando(true);
    setErrore(null);
    try {
      await aggiornaRichiestaCliente(r.id, {
        cliente: cliente.trim(),
        descrizione: descrizione.trim(),
        importo: valore,
        canale,
        linea,
        tipologia,
        serve_entro: serveEntro,
        nota: nota.trim() || null,
      });
      onSalvata();
    } catch (e: any) {
      setErrore(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Foglio
      titolo="Modifica la richiesta"
      sottotitolo="Si correggono i dati della richiesta. Lo stato si muove dalle azioni della riga."
      onClose={onClose}
      bloccaSfondo
      largo
    >
      <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: 8 }}>
        {/* ⚠️ IL DOCUMENTO GIÀ EMESSO NON SI CORREGGE DA QUI. Cambiare l'importo
            dopo la pro-forma lascia il cliente con in mano un numero e noi con
            un altro: è detto PRIMA di scriverlo, non dopo. */}
        {r.fattura_numero || r.proforma_numero ? (
          <Text style={styles.nota}>
            Attenzione: per questa richiesta esiste già{' '}
            {r.fattura_numero ? `la fattura ${r.fattura_numero}` : `la pro-forma ${r.proforma_numero}`}. Cambiando
            l'importo qui, quel documento resta com'è: va corretto su FINANCE.
          </Text>
        ) : null}

        <Text style={styles.campoLabel}>Cliente</Text>
        <TextInput
          style={styles.input}
          value={cliente}
          onChangeText={setCliente}
          placeholder="Nome del cliente"
          placeholderTextColor={colors.grigio}
        />
        {r.place_id ? (
          <Text style={styles.nota}>
            Collegata a un cliente di Scout: il nome della sua scheda si cambia di là, qui solo come si chiama su
            questa richiesta.
          </Text>
        ) : null}

        <Text style={styles.campoLabel}>Cosa chiede</Text>
        <TextInput
          style={[styles.input, styles.inputAlto]}
          value={descrizione}
          onChangeText={setDescrizione}
          placeholder="Es. catering per 40 persone, sede di Milano"
          placeholderTextColor={colors.grigio}
          multiline
        />

        <Text style={styles.campoLabel}>Importo concordato (facoltativo)</Text>
        <TextInput
          style={styles.input}
          value={importo}
          onChangeText={setImporto}
          placeholder="es. 1.500,50 — vuoto = ancora da concordare"
          placeholderTextColor={colors.grigio}
          inputMode="decimal"
        />

        <Text style={styles.campoLabel}>Com'è arrivata</Text>
        <View style={styles.chips}>
          {CANALI.map((c) => (
            <Chip key={c} label={LABEL_CANALE_RICHIESTA[c]} on={canale === c} onPress={() => setCanale(c)} />
          ))}
        </View>

        <Text style={styles.campoLabel}>Linea di business</Text>
        <View style={styles.chips}>
          {LINEE_ATTIVE.map((l) => (
            <Chip key={l} label={l} on={linea === l} onPress={() => setLinea(linea === l ? null : l)} />
          ))}
        </View>
        <Text style={styles.nota}>
          Su quale linea si vende. Viaggia nell&apos;ordine che nasce da qui: senza, l&apos;ordine resta fuori dai
          conti per linea.
        </Text>

        <Text style={styles.campoLabel}>Tipologia (per il budget)</Text>
        <View style={styles.chips}>
          {TIPOLOGIE.map((t) => (
            <Chip key={t} label={LABEL_TIPOLOGIA[t]} on={tipologia === t} onPress={() => setTipologia(t)} />
          ))}
        </View>

        <Text style={styles.campoLabel}>Serve entro (facoltativo)</Text>
        <CampoData valore={serveEntro} onCambia={setServeEntro} />

        <Text style={styles.campoLabel}>Note (facoltativo)</Text>
        <TextInput
          style={[styles.input, styles.inputAlto]}
          value={nota}
          onChangeText={setNota}
          placeholder="Quello che serve ricordare: condizioni, referente, vincoli…"
          placeholderTextColor={colors.grigio}
          multiline
        />

        {errore ? <Text style={styles.errore}>{errore}</Text> : null}

        <Pressable style={[styles.btnSalva, salvando && styles.btnOff]} disabled={salvando} onPress={salva}>
          {salvando ? (
            <ActivityIndicator color={colors.bianco} size="small" />
          ) : (
            <Text style={styles.btnSalvaTxt}>Salva le modifiche</Text>
          )}
        </Pressable>
      </ScrollView>
    </Foglio>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.sm },
  btnImporta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    borderRadius: radius.pill,
    paddingVertical: 9,
    marginBottom: spacing.sm,
  },
  btnImportaTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  search: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.m, paddingHorizontal: 12, paddingVertical: 10, color: colors.testo, fontSize: 14 },
  chipsRiga: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingBottom: 2 },
  btnDaMail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingVertical: 9 },
  btnDaMailTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  mailPresa: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.fill, borderRadius: radius.m, padding: 10 },
  mailPresaNome: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  mailPresaNota: { color: colors.testoSoft, fontSize: 12 },
  riga2: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  filtro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filtroTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  errore: {
    color: colors.errore,
    fontWeight: '600',
    fontSize: 13,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    padding: spacing.lg,
  },
  // Schede (telefono)
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nome: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  descrizione: { color: colors.testo, fontSize: 13.5, lineHeight: 18 },
  meta: { color: colors.testoSoft, fontSize: 12.5 },
  // Tabella (desktop)
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabImporto: { color: colors.testo, fontWeight: '700', fontSize: 13.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabMuto: { color: colors.grigio, fontWeight: '600', fontSize: 12 },
  tabTipologia: { color: colors.grigio, fontSize: 11, fontWeight: '600' },
  badgeCol: { gap: 3, alignItems: 'flex-start' },
  // Azioni
  azioni: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minWidth: 118, minHeight: touchMin, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12 },
  btnOff: { opacity: 0.45 },
  btnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12 },
  pfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pfChipTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  // Form
  campoLabel: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  inputAlto: { minHeight: 76, textAlignVertical: 'top' },
  nota: { color: colors.grigio, fontSize: 12.5, lineHeight: 17 },
  risultato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.s,
    backgroundColor: colors.sfondo,
  },
  risultatoNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  risultatoInd: { color: colors.testoSoft, fontSize: 12 },
  sceltoRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.sfondo,
    borderRadius: radius.m,
    padding: spacing.lg,
  },
  sceltoNome: { color: colors.navy, fontWeight: '700', fontSize: 15 },
  sceltoInd: { color: colors.testoSoft, fontSize: 12.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minHeight: touchMin, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  btnSalva: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  btnSalvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  fab: {
    position: 'absolute',
    right: spacing.xxl,
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
});
