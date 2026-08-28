import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Contact, Deal, Place, Priorita, Task, Visit } from '@/types';
import { canonizzaLinee } from '@/types';
import { colors, labelFase, labelStato, radius, spacing, touchMin } from '@/lib/theme';
import { COLORE_A_RISCHIO, COLORE_PERSO, LABEL_A_RISCHIO, LABEL_LIVELLO, LABEL_PERSO, aRischio, coloreLivello, ePerso, livelloDi } from '@/lib/livelli';
import { StatusBadge } from '@/components/ui';
import { aggiornaNascosto, aggiornaPlace, completaTask, eliminaPlace, fetchAziendeScartate, fetchContatti, fetchContattiScartati, fetchDealPlace, fetchPlace, fetchTaskPlace, fetchVisitePlace, inserisciContatto, scartaAzienda, scartaContatto, sincronizzaPlaceRegistro, trovaDuplicati } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { avvisa, conferma } from '@/lib/dialoghi';
import {
  COLORE_VERDETTO,
  fetchCoppieDuplicate,
  ignoraCoppia,
  unisciCoppia,
  avvisoRegistro,
  type CoppiaDuplicata,
  type VerdettoDuplicato,
} from '@/lib/riconciliazione';
import { urlNavigazione } from '@/lib/nav';
import { cercaContattiHubspot, dealsPerPlace, type ContattoAI, type MatchAI } from '@/lib/hubspot';
import { env } from '@/lib/env';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { TaskFormModal } from '@/components/TaskFormModal';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';
import { AnagraficaRegistroCard } from '@/components/AnagraficaRegistroCard';
import { FinanceCard } from '@/components/FinanceCard';
import { EntitaCard } from '@/components/EntitaCard';
import { MailContattoCard } from '@/components/MailContattoCard';
import { Loader } from '../../_layout';

// Etichette leggibili per l'esito visita (mai il valore tecnico con underscore).
const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_target: 'Non target',
  chiuso: 'Chiuso',
};

// Mappa gli interessi del registro (chiavi) alle linee di Scout (label). Serve
// finché i due cataloghi non sono allineati; a valle diventa identità.
const REGISTRO_A_LINEA: Record<string, string> = {
  consegne: 'Consegne',
  affiliazione: 'Affiliazioni',
  affiliazioni: 'Affiliazioni',
  gifting: 'Gifting',
  catering: 'Eventi & Catering',
  eventi: 'Eventi & Catering',
  'eventi & catering': 'Eventi & Catering',
  pr_activation: 'Concierge',
  in_store: 'Clientelling',
  vendor: 'Food Supplier',
  reseller: 'Re-seller',
  're-seller': 'Re-seller',
};
function lineeDaRegistro(interessi: string[]): string[] {
  const out = new Set<string>();
  for (const i of interessi) out.add(REGISTRO_A_LINEA[i.trim().toLowerCase()] ?? i);
  return [...out];
}
const stessaTipologia = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Una segnalazione di doppione nella scheda: da dove arriva, e quale scheda resta. */
interface Segnalazione {
  altroId: string;
  altroNome: string;
  altroMeta: string;
  tieneId: string;
  togliId: string;
  /** true = resta la scheda aperta; false = resta l'altra (lo decide la Riconciliazione). */
  restaQui: boolean;
  verdetto?: VerdettoDuplicato;
  metri?: number | null;
}

export default function SchedaAttivita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<Place | null>(null);
  // Tipologia di interesse: modificabile con bottone Salva (aggiorna Scout + registro).
  const [linee, setLinee] = useState<string[]>([]);
  const [lineeSalvate, setLineeSalvate] = useState<string[]>([]);
  const [salvandoLinee, setSalvandoLinee] = useState(false);
  const utenteHaEditato = useRef(false);
  const registroApplicato = useRef(false);
  const [contatti, setContatti] = useState<Contact[]>([]);
  const [visite, setVisite] = useState<Visit[]>([]);
  const [deal, setDeal] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchAI, setMatchAI] = useState<MatchAI | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchErrore, setMatchErrore] = useState<string | null>(null);
  const [scartati, setScartati] = useState<string[]>([]);
  const [aziendeScartate, setAziendeScartate] = useState<string[]>([]);
  const [taskAperto, setTaskAperto] = useState(false);
  const [taskPlace, setTaskPlace] = useState<Task[]>([]);
  const [taskInModifica, setTaskInModifica] = useState<Task | null>(null);
  const [duplicati, setDuplicati] = useState<Place[]>([]);
  // Le coppie che la RICONCILIAZIONE propone per questo negozio: stessa fonte
  // della schermata /riconciliazione (`coppie_duplicate`), non una seconda
  // regola. Due regole diverse per la stessa domanda finiscono per rispondere
  // in modo diverso, ed è già successo: la scheda cercava per indirizzo/nome e
  // scartava le nascoste, quindi il doppione «Amir» (dove la scheda buona era
  // proprio quella nascosta, e cliente) non lo segnalava nessuna delle due.
  const [coppie, setCoppie] = useState<CoppiaDuplicata[]>([]);
  const [unendo, setUnendo] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [mailAperta, setMailAperta] = useState(false);
  const { session } = useAuth();

  // Conciliazione: cerca nella copia locale HubSpot azienda/contatti del negozio,
  // escludendo le aziende già rifiutate e i contatti "non pertinenti".
  async function eseguiMatch(p: Place, scartatiIds: string[], escludiAziende: string[]) {
    setMatchErrore(null);
    setMatchAI(null);
    setMatchLoading(true);
    try {
      const r = await cercaContattiHubspot(p.nome, p.indirizzo, escludiAziende);
      setMatchAI({ ...r, contatti: r.contatti.filter((c) => !scartatiIds.includes(c.hubspot_contact_id)) });
    } catch (e) {
      setMatchErrore((e as Error).message);
    } finally {
      setMatchLoading(false);
    }
  }

  const carica = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // #1: reset del match quando cambia negozio (niente risultato "bloccato").
    setMatchAI(null);
    setMatchErrore(null);
    setMatchLoading(false);
    const [p, c, v, d, sc, az, tk] = await Promise.all([
      fetchPlace(id),
      fetchContatti(id),
      fetchVisitePlace(id),
      fetchDealPlace(id),
      fetchContattiScartati(id),
      fetchAziendeScartate(id),
      fetchTaskPlace(id).catch(() => []),
    ]);
    setPlace(p);
    setTaskPlace(tk);
    // Tipologia di interesse: parte dal valore salvato; il registro (Anagrafiche)
    // può poi sovrascriverlo come default finché l'utente non modifica a mano.
    const inizLinee = canonizzaLinee(p?.linee_ipotizzate ?? (p?.linea_ipotizzata ? [p.linea_ipotizzata] : []));
    setLinee(inizLinee);
    setLineeSalvate(inizLinee);
    utenteHaEditato.current = false;
    registroApplicato.current = false;
    setContatti(c);
    setVisite(v);
    setScartati(sc);
    setAziendeScartate(az);
    // Sync inverso: se HubSpot è configurato, prova ad allineare i deal.
    let deals = d;
    if (env.hubspotSyncUrl() && p?.hubspot_company_id) {
      try {
        deals = await dealsPerPlace(id);
      } catch {
        /* offline o non configurato: usa i deal locali */
      }
    }
    setDeal(deals);
    setLoading(false);
    // Possibili duplicati. Due fonti che si completano: la Riconciliazione
    // (coordinate + nome, vede anche le schede nascoste) e la ricerca locale
    // per indirizzo/nome, che copre i negozi senza posizione.
    setDuplicati(p ? await trovaDuplicati(p).catch(() => []) : []);
    setCoppie(
      p
        ? await fetchCoppieDuplicate()
            .then((tutte) => tutte.filter((c) => c.tiene_id === p.id || c.togli_id === p.id))
            .catch(() => [])
        : [],
    );
    // #2: se il negozio è già abbinato a un'azienda HubSpot, mostra subito i contatti.
    if (p?.hubspot_company_id) eseguiMatch(p, sc, az);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // Unisci un duplicato in QUESTO target: i dati del duplicato passano qui e il
  // duplicato viene eliminato. Operazione distruttiva → chiede conferma.
  /**
   * Le segnalazioni di questa scheda: prima le coppie della Riconciliazione
   * (che sanno anche CHI deve restare), poi quelle trovate solo qui.
   *
   * ⚠️ La direzione conta. Prima il bottone era sempre «Unisci qui», cioè la
   * scheda aperta vinceva sempre: aprendo il doppione vuoto si sarebbe
   * cancellata la scheda buona. Ora chi resta lo dice la Riconciliazione (chi
   * ha più lavoro addosso, e il cliente vince su tutto), e il bottone lo scrive.
   */
  const segnalazioni = useMemo<Segnalazione[]>(() => {
    if (!place) return [];
    const out: Segnalazione[] = [];
    const visti = new Set<string>();
    for (const c of coppie) {
      const suo = c.tiene_id === place.id;
      const altroId = suo ? c.togli_id : c.tiene_id;
      visti.add(altroId);
      out.push({
        altroId,
        altroNome: suo ? c.togli : c.tiene,
        altroMeta: (suo ? c.indirizzo_togli : c.indirizzo_tiene) ?? c.citta ?? '',
        tieneId: c.tiene_id,
        togliId: c.togli_id,
        restaQui: suo,
        verdetto: c.verdetto,
        metri: c.metri,
      });
    }
    for (const d of duplicati) {
      if (visti.has(d.id)) continue;
      out.push({
        altroId: d.id,
        altroNome: d.nome,
        altroMeta: [d.indirizzo, labelStato[d.stato]].filter(Boolean).join(' · '),
        tieneId: place.id,
        togliId: d.id,
        restaQui: true,
      });
    }
    return out;
  }, [place, coppie, duplicati]);

  /** Toglie la segnalazione dalle due liste: la coppia è stata chiusa. */
  function chiudiSegnalazione(altroId: string) {
    setCoppie((l) => l.filter((c) => c.tiene_id !== altroId && c.togli_id !== altroId));
    setDuplicati((l) => l.filter((x) => x.id !== altroId));
  }

  function unisciSegnalazione(s: Segnalazione) {
    if (!place || unendo) return;
    const resta = s.restaQui ? place.nome : s.altroNome;
    const sparisce = s.restaQui ? s.altroNome : place.nome;
    conferma(
      'Unire le due schede?',
      'Resta «' + resta + '». Contatti, visite, trattative e task di «' + sparisce + '» passano lì, e «' + sparisce +
        '» viene eliminata.' +
        (s.restaQui ? '' : '\n\nÈ questa scheda a sparire: ti porto su quella che resta.') +
        '\n\nSe il doppione è anche nel registro Anagrafiche, vengono unite pure lì (la scheda scartata viene archiviata, non cancellata).',
      async () => {
        setUnendo(true);
        try {
          const esito = await unisciCoppia(s.tieneId, s.togliId);
          const nota = avvisoRegistro(esito);
          if (nota) avvisa(nota.titolo, nota.testo);
          chiudiSegnalazione(s.altroId);
          // Se è questa scheda a sparire, restarci mostrerebbe un negozio che
          // non esiste più.
          if (!s.restaQui) router.replace(`/(app)/attivita/${s.tieneId}`);
          else await carica();
        } catch (e) {
          avvisa('Unione non riuscita', (e as Error)?.message ?? 'Riprova.');
        } finally {
          setUnendo(false);
        }
      },
      { testoConferma: 'Unisci', distruttivo: true },
    );
  }

  /** «Non è un doppione»: la coppia non viene più proposta, né qui né in Riconciliazione. */
  async function nonEDoppione(s: Segnalazione) {
    if (!place) return;
    chiudiSegnalazione(s.altroId);
    try {
      await ignoraCoppia(place.id, s.altroId);
    } catch {
      /* riprova al prossimo caricamento */
    }
  }

  // Cambia la priorità direttamente dalla scheda (aggiornamento ottimistico).
  async function cambiaPriorita(p: Priorita) {
    if (!place || place.priorita === p) return;
    const prec = place.priorita;
    setPlace({ ...place, priorita: p });
    try {
      await aggiornaPlace(place.id, { priorita: p });
    } catch {
      setPlace((pl) => (pl ? { ...pl, priorita: prec } : pl));
    }
  }

  // Nascondi un target dal suggerimento (stesso "occhio barrato" della lista Target).
  async function nascondiDuplicato(dup: Place) {
    setDuplicati((lista) => lista.filter((x) => x.id !== dup.id));
    try {
      await aggiornaNascosto(dup.id, true);
    } catch {
      /* riprova al prossimo caricamento */
    }
  }

  // Ricarica i soli task del negozio (dopo creazione/modifica/completamento).
  // Recapiti "principali" del negozio: il primo contatto che ne ha uno.
  // Decidono quali azioni rapide sono accese (chiama/whatsapp/email).
  const telefonoPrincipale = useMemo(
    () => contatti.find((c) => c.telefono && !c.archiviato)?.telefono ?? null,
    [contatti],
  );
  const emailPrincipale = useMemo(
    () => contatti.find((c) => c.email && !c.archiviato)?.email ?? null,
    [contatti],
  );

  const ricaricaTask = useCallback(async () => {
    if (!id) return;
    setTaskPlace(await fetchTaskPlace(id).catch(() => []));
  }, [id]);

  // Segna un task come completato / da fare (aggiornamento ottimistico).
  async function toggleTask(t: Task) {
    const completata = !t.completata;
    setTaskPlace((lista) => lista.map((x) => (x.id === t.id ? { ...x, completata } : x)));
    try {
      await completaTask(t.id, completata);
      ricaricaTask();
    } catch {
      // Ripristina in caso di errore.
      setTaskPlace((lista) => lista.map((x) => (x.id === t.id ? { ...x, completata: !completata } : x)));
    }
  }

  // #3: marca un contatto come "non pertinente" e nascondilo (per sempre).
  async function scarta(c: ContattoAI) {
    if (!place) return;
    setScartati((s) => [...s, c.hubspot_contact_id]);
    setMatchAI((m) =>
      m ? { ...m, contatti: m.contatti.filter((x) => x.hubspot_contact_id !== c.hubspot_contact_id) } : m,
    );
    try {
      await scartaContatto(place.id, c.hubspot_contact_id);
    } catch {
      /* riprova al prossimo caricamento */
    }
  }

  // Rifiuta TUTTA l'associazione azienda↔negozio (non solo un contatto).
  async function rimuoviAzienda() {
    if (!place || !matchAI?.match) return;
    const cid = matchAI.match.hubspot_company_id;
    setAziendeScartate((a) => [...a, cid]);
    setMatchAI(null);
    setPlace((pl) => (pl ? { ...pl, hubspot_company_id: null, hubspot_ha_contatto: false, hubspot_deal_aperta: false } : pl));
    try {
      await scartaAzienda(place.id, cid);
    } catch {
      /* riprova al prossimo caricamento */
    }
  }

  async function importaContattoAI(c: ContattoAI) {
    if (!place) return;
    try {
      await inserisciContatto({
        place_id: place.id,
        nome: c.nome || 'Contatto',
        ruolo: c.ruolo,
        telefono: c.telefono,
        email: c.email,
        is_decisore: false,
      });
      setContatti(await fetchContatti(place.id));
      setMatchAI((m) =>
        m ? { ...m, contatti: m.contatti.filter((x) => x.hubspot_contact_id !== c.hubspot_contact_id) } : m,
      );
    } catch {
      /* ignora: riprova */
    }
  }

  // Default dal registro: quando la card Anagrafiche carica gli interessi, li
  // usa come tipologia di default — ma SOLO se l'utente non ha ancora toccato la
  // selezione e una volta sola per negozio. Imposta `linee` (ciò che si vede)
  // lasciando `lineeSalvate` al valore di Scout: se differiscono, compare il
  // bottone Salva per allineare Scout e Anagrafiche.
  const defaultDaRegistro = useCallback((interessi: string[]) => {
    if (utenteHaEditato.current || registroApplicato.current) return;
    const mappate = lineeDaRegistro(interessi);
    if (!mappate.length) return;
    registroApplicato.current = true;
    setLinee((att) => (stessaTipologia(att, mappate) ? att : mappate));
  }, []);

  // L'utente cambia la selezione a mano: aggiorna solo lo stato locale (il
  // salvataggio verso Scout + registro avviene col bottone Salva).
  const cambiaLinee = useCallback((nuove: string[]) => {
    utenteHaEditato.current = true;
    setLinee(nuove);
  }, []);

  const lineeDaSalvare = !stessaTipologia(linee, lineeSalvate);

  /**
   * Il livello del rapporto — la stessa parola che usano tutte le liste
   * (Selezionato · Lead · Prospect · Cliente · Dormiente · Perso).
   *
   * Prima qui compariva lo **stato di pipeline** (`labelStato`), che ha solo 4
   * valori e nessuno che voglia dire «nuovo»: un negozio appena creato leggeva
   * «Da visitare», e uno segnato perso leggeva «Perso» senza dire da dove
   * venisse. Segnalato dall'utente il 29/07/2026 («perché esce perso? l'ho
   * appena creato»).
   *
   * ⚠️ `contattato` qui è approssimato alle **visite**: chiamate e
   * `contatti_avviati` non sono caricati in questa schermata. Al massimo un
   * Lead si mostra come Selezionato — mai il contrario.
   */
  const livello = useMemo(
    () =>
      place
        ? livelloDi(
            place,
            contatti.length > 0,
            visite.length > 0,
            deal.some((d) => d.fase !== 'closedwon' && d.fase !== 'closedlost'),
          )
        : null,
    [place, contatti, visite, deal],
  );

  /** Il negozio è segnato come chiuso? (non è un livello: è un segno addosso) */
  const perso = Boolean(place && ePerso(place));

  /**
   * Da dove viene un rapporto chiuso: si legge, non si indovina.
   *
   * ⚠️ Distingue anche **chi può correggerlo**. Se la causa è il registro
   * Anagrafiche (`anagrafiche_stato`), da Scout non si sistema: quel campo lo
   * scrive l'altra app, e un bottone qui cambierebbe `places.stato` senza
   * togliere il badge — un no-op che sembra un'azione riuscita.
   */
  const perche: { testo: string; correggibileQui: boolean } | null = useMemo(() => {
    if (!place || (!perso && livello !== 'dormiente')) return null;
    if (place.anagrafiche_stato === 'non_interessato')
      return { testo: 'Lo dice il registro Anagrafiche: «non interessato».', correggibileQui: false };
    if (place.anagrafiche_stato === 'dismesso')
      return { testo: 'Lo dice il registro Anagrafiche: «dismesso».', correggibileQui: false };
    if (place.stato === 'perso') {
      return {
        testo: visite.some((v) => v.esito === 'non_target')
          ? 'Da una visita chiusa con esito «non è un target».'
          : 'Lo stato del negozio è «perso»: da una visita «non è un target», o scelto a mano in Modifica.',
        correggibileQui: true,
      };
    }
    return null;
  }, [place, livello, perso, visite]);

  /**
   * È mio? Cioè: l'ho creato io. `creato_da` è NULL sui record storici (import
   * da terminale, scoperta Google): senza creatore non c'è nessun «solo il
   * creatore» da applicare, e il bottone non compare a nessuno.
   */
  const mio = Boolean(place?.creato_da && place.creato_da === session?.user?.id);

  async function elimina() {
    if (!place) return;
    conferma(
      `Elimino «${place.nome}»?`,
      'Spariscono anche i suoi contatti, le visite, le trattative, le chiamate e le iscrizioni alle sequenze. ' +
        'Non si torna indietro. Il registro Anagrafiche resta com’è.',
      async () => {
        setEliminando(true);
        try {
          await eliminaPlace(place.id);
          router.replace('/(app)/lista');
        } catch (e) {
          avvisa('Non è stato eliminato', (e as Error)?.message ?? 'Riprova.');
        } finally {
          setEliminando(false);
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  /**
   * Toglie il segno «Perso»: il negozio torna in gioco.
   *
   * ⚠️ **Non lo declassa a Selezionato**, anche se scrive `stato_affiliazione`.
   * Il livello si ricalcola dai dati (lib/livelli.ts): un lead con una persona
   * in rubrica resta un Lead. Il bottone prima si chiamava «Riportalo fra i
   * Selezionati» e prometteva una retrocessione che non avveniva — segnalato
   * dall'utente il 29/07/2026 («è un lead che ho creato io»).
   */
  async function riapri() {
    if (!place) return;
    try {
      await aggiornaPlace(place.id, { stato: 'da_visitare', stato_affiliazione: 'selezionato' });
      setPlace({ ...place, stato: 'da_visitare', stato_affiliazione: 'selezionato' });
      sincronizzaPlaceRegistro(place.id).catch(() => {});
    } catch (e) {
      avvisa('Non è stato possibile riaprirlo', (e as Error)?.message ?? 'Riprova.');
    }
  }

  // Non proporre "+ Aggiungi" per contatti che abbiamo GIÀ in rubrica locale:
  // confronto per telefono, email o nome normalizzati (così "Ivan Arioli" e il
  // suggerimento HubSpot con lo stesso numero non risultano come nuovo contatto).
  const contattiDaAggiungere = (matchAI?.contatti ?? []).filter((c) => {
    const tel = (c.telefono ?? '').replace(/\D/g, '');
    const mail = (c.email ?? '').trim().toLowerCase();
    const nome = (c.nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return !contatti.some((x) => {
      if (tel && (x.telefono ?? '').replace(/\D/g, '') === tel) return true;
      if (mail && (x.email ?? '').trim().toLowerCase() === mail) return true;
      if (nome && (x.nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === nome) return true;
      return false;
    });
  });

  // Salva la tipologia: la scrive su Scout e la propaga al registro Anagrafiche
  // (sincronizzaPlaceRegistro → upsert_partner con gli interessi).
  async function salvaTipologia() {
    if (!place || salvandoLinee) return;
    const primaria = linee[0] ?? null;
    setSalvandoLinee(true);
    try {
      await aggiornaPlace(place.id, { linee_ipotizzate: linee, linea_ipotizzata: primaria });
      setPlace({ ...place, linee_ipotizzate: linee, linea_ipotizzata: primaria });
      setLineeSalvate(linee);
      // Propaga al registro (best-effort: se offline, resta salvato in Scout).
      try {
        await sincronizzaPlaceRegistro(place.id);
      } catch {
        /* registro non raggiungibile: la tipologia è comunque salvata in Scout */
      }
    } catch (e) {
      avvisa('Salvataggio non riuscito', (e as Error)?.message ?? 'Riprova.');
    } finally {
      setSalvandoLinee(false);
    }
  }

  if (loading) return <Loader />;
  if (!place) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Attività non trovata.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: place.nome }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <View style={styles.prioRow}>
            {(['P1', 'P2', 'P3'] as Priorita[]).map((p) => (
              <Pressable key={p} onPress={() => cambiaPriorita(p)} style={place.priorita === p ? undefined : styles.prioOff} accessibilityLabel={`Priorità ${p}`}>
                <PriorityBadge priorita={p} small />
              </Pressable>
            ))}
          </View>
          {livello ? (
            <StatusBadge small label={LABEL_LIVELLO[livello]} colore={coloreLivello(livello)} />
          ) : null}
          {perso ? <StatusBadge small label={LABEL_PERSO} colore={COLORE_PERSO} /> : null}
          {place && aRischio(place) ? (
            <StatusBadge small label={LABEL_A_RISCHIO} colore={COLORE_A_RISCHIO} />
          ) : null}
        </View>
        <Text style={styles.nome}>{place.nome}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[place.indirizzo, place.categoria, place.zona].filter(Boolean).join(' · ')}
        </Text>
        {/* Lo stato di pipeline resta visibile, ma sotto: dice a che punto è il
            lavoro sul campo, non a che punto è il rapporto. */}
        <Text style={styles.stato}>Percorso: {labelStato[place.stato]}</Text>
        {perche ? (
          <View style={styles.perche}>
            <Text style={styles.percheTxt}>
              <Ionicons name="information-circle-outline" size={13} color={colors.testoSoft} /> {perche.testo}
            </Text>
            {perche.correggibileQui ? (
              <>
                <Text style={styles.percheTxt}>
                  Togliendolo il negozio torna in gioco e resta al livello che ha: un lead con una persona in rubrica
                  resta un Lead.
                </Text>
                <Pressable style={styles.btnRiapri} onPress={riapri}>
                  <Text style={styles.btnRiapriTxt}>Togli il segno «Perso»</Text>
                </Pressable>
              </>
            ) : (
              // Il campo lo possiede l'altra app: un bottone qui cambierebbe
              // `places.stato` senza togliere il badge, e sembrerebbe riuscito.
              <Text style={styles.percheTxt}>
                Questo stato arriva dal registro Anagrafiche e da qui non si cambia: va corretto lì, poi Scout si
                riallinea.
              </Text>
            )}
          </View>
        ) : null}

        {/* Le azioni SUBITO sotto il nome: la scheda serve a vendere, non a leggere. */}
        <View style={styles.azioniGrid}>
          <AzioneRapida icona="walk-outline" label="Visita" primaria onPress={() => router.push(`/(app)/visita/${place.id}`)} />
          <AzioneRapida
            icona="call-outline"
            label="Chiama"
            disabled={!telefonoPrincipale}
            onPress={() => telefonoPrincipale && Linking.openURL(`tel:${telefonoPrincipale}`)}
          />
          <AzioneRapida
            icona="logo-whatsapp"
            label="WhatsApp"
            disabled={!telefonoPrincipale}
            onPress={() => telefonoPrincipale && Linking.openURL(`https://wa.me/${telefonoPrincipale.replace(/[^0-9]/g, '')}`)}
          />
          {/* Mail = lo stesso percorso delle liste (script dalla libreria o
              «Nuova mail»), non più `mailto:`. Con mailto la mail usciva dal
              client di posta del telefono: nessuna traccia in Scout, il negozio
              non diventava Lead e la copia non finiva in «Inviata». */}
          <AzioneRapida
            icona="mail-outline"
            label="Email"
            disabled={!emailPrincipale}
            onPress={() => setMailAperta(true)}
          />
          <AzioneRapida icona="checkbox-outline" label="Task" onPress={() => { setTaskInModifica(null); setTaskAperto(true); }} />
          <AzioneRapida icona="person-add-outline" label="Contatto" onPress={() => router.push(`/(app)/contatto/${place.id}`)} />
          {/* ⚠️ Corretto il 26/08/2026: portava all'ELENCO di tutte le
              trattative, senza dire a chi apparteneva la scheda da cui si
              arrivava — e chi voleva aprirne una per QUESTO negozio doveva
              ricercarlo. Ora apre il form già intestato, come fa Clienti. */}
          <AzioneRapida
            icona="briefcase-outline"
            label="Trattativa"
            onPress={() =>
              router.push({
                pathname: '/(app)/trattative',
                params: { nuovoPer: place.id, nuovoNome: place.nome },
              })
            }
          />
          <AzioneRapida
            icona="navigate-outline"
            label="Naviga"
            onPress={() => Linking.openURL(urlNavigazione({ lat: place.lat, lng: place.lng }))}
          />
          <AzioneRapida icona="create-outline" label="Modifica" onPress={() => router.push(`/(app)/modifica/${place.id}`)} />
        </View>

        {/* Possibili doppioni. Stessa fonte della Riconciliazione, più la
            ricerca locale per i negozi senza posizione. Chi resta lo decide la
            Riconciliazione, non «la scheda che stai guardando». */}
        {segnalazioni.length ? (
          <View style={styles.dupBox}>
            <Text style={styles.dupTitolo}>
              <Ionicons name="git-merge-outline" size={14} color={colors.attenzione} />{' '}
              {segnalazioni.length === 1 ? 'Possibile doppione' : `Possibili doppioni (${segnalazioni.length})`}
            </Text>
            <Text style={styles.dupAiuto}>
              Unendo, i dati passano alla scheda che resta e l’altra viene eliminata. Se non sono lo stesso
              negozio, «Non è un doppione» chiude la segnalazione anche in Riconciliazione.
            </Text>
            {segnalazioni.map((s) => (
              <View key={s.altroId} style={styles.dupRow}>
                <View style={styles.dupRowTop}>
                  <Pressable style={{ flex: 1 }} onPress={() => router.push(`/(app)/attivita/${s.altroId}`)}>
                    <Text numberOfLines={3} style={styles.dupNome}>{s.altroNome}</Text>
                    <Text style={styles.dupMeta} numberOfLines={2}>
                      {[s.altroMeta, s.metri != null ? `${s.metri} m` : null].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.dupMeta} numberOfLines={1}>
                      {s.restaQui ? 'Resta questa scheda' : `Resta «${s.altroNome}»`}
                    </Text>
                  </Pressable>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {s.verdetto ? (
                      <StatusBadge small label={s.verdetto} colore={COLORE_VERDETTO[s.verdetto]} />
                    ) : null}
                    <Pressable
                      style={[styles.btnUnisci, unendo && { opacity: 0.5 }]}
                      onPress={() => unisciSegnalazione(s)}
                      disabled={unendo}
                    >
                      {unendo ? (
                        <ActivityIndicator size="small" color={colors.bianco} />
                      ) : (
                        <Text style={styles.btnUnisciTxt}>{s.restaQui ? 'Unisci qui' : 'Unisci là'}</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
                <View style={styles.dupAzioni}>
                  <Pressable hitSlop={6} onPress={() => nonEDoppione(s)}>
                    <Text style={styles.dupAzione}>Non è un doppione</Text>
                  </Pressable>
                  <Text style={styles.dupSep}>·</Text>
                  <Pressable hitSlop={6} onPress={() => nascondiDuplicato({ id: s.altroId } as Place)}>
                    <Text style={styles.dupAzione}>Nascondi da target</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <AnagraficaRegistroCard nome={place.nome} citta={place.zona} onInteressi={defaultDaRegistro} />

        {/* FINANCE: fatturato + andamento del cliente (solo per clienti/partner). */}
        <View style={{ marginTop: spacing.lg }}>
          <FinanceCard nomeCliente={place.nome} mostra={place.stato === 'cliente' || place.anagrafiche_stato === 'attivo'} />
        </View>

        {/* ⭐ L'ENTITÀ, accanto al fatturato del singolo negozio: «CHANEL» sono
            tre società che fatturano separatamente ma commercialmente sono un
            cliente solo. Sta SOTTO la card Finance di proposito — prima quanto
            fa questo negozio, poi di chi fa parte. */}
        <EntitaCard anagraficaId={place.anagrafiche_id} nomeNegozio={place.nome} />

        {/* Ultime mail ricevute dai contatti del negozio (da AI Mail). */}
        <MailContattoCard emails={contatti.map((c) => c.email ?? '').filter(Boolean)} />

        <View style={styles.interesseHead}>
          <Text style={styles.interesseLbl}>Tipologia di interesse — scegline una o più</Text>
          <Text style={styles.interesseNota}>Default dal registro Anagrafiche · modificabile</Text>
        </View>
        <LineaSelector value={linee} onChange={cambiaLinee} soloCanoniche />
        {lineeDaSalvare ? (
          <Pressable
            style={[styles.btnSalvaLinee, salvandoLinee && { opacity: 0.6 }]}
            onPress={salvaTipologia}
            disabled={salvandoLinee}
          >
            {salvandoLinee ? (
              <ActivityIndicator size="small" color={colors.bianco} />
            ) : (
              <Text style={styles.btnSalvaLineeTxt}>
                <Ionicons name="save-outline" size={15} color={colors.bianco} /> Salva e aggiorna Anagrafiche
              </Text>
            )}
          </Pressable>
        ) : null}

        {/* Task del negozio: quelli creati col bottone "Task" qui sopra. */}
        <Sezione titolo={`Task${taskPlace.length ? ` (${taskPlace.filter((t) => !t.completata).length} da fare)` : ''}`}>
          {taskPlace.length === 0 ? (
            <Text style={styles.vuoto}>Nessun task per questo negozio. Creane uno col bottone «Task».</Text>
          ) : (
            taskPlace.map((t) => (
              <View key={t.id} style={styles.taskRow}>
                <Pressable onPress={() => toggleTask(t)} hitSlop={8} accessibilityLabel={t.completata ? 'Riapri' : 'Completa'}>
                  <Ionicons
                    name={t.completata ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={t.completata ? colors.successo : colors.grigio}
                  />
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => { setTaskInModifica(t); setTaskAperto(true); }}>
                  <Text style={[styles.taskTitolo, t.completata && styles.taskFatto]} numberOfLines={2}>{t.titolo}</Text>
                  <Text style={styles.taskMeta} numberOfLines={1}>
                    {[t.priorita, t.scadenza ? `scad. ${t.scadenza}` : null, t.owner_nome ? `→ ${t.owner_nome}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </Sezione>

        {mailAperta ? (
          <ScegliScriptModal place={{ id: place.id, nome: place.nome }} onClose={() => setMailAperta(false)} />
        ) : null}

        {taskAperto ? (
          <TaskFormModal
            task={taskInModifica ?? undefined}
            placeId={place.id}
            placeNome={place.nome}
            onClose={() => { setTaskAperto(false); setTaskInModifica(null); }}
            onSalvato={() => { setTaskAperto(false); setTaskInModifica(null); ricaricaTask(); }}
          />
        ) : null}

        <Sezione titolo="Contatti">
          {contatti.length === 0 ? (
            <View>
              <Text style={styles.vuoto}>Nessun contatto registrato.</Text>
              <Text style={styles.vuotoAiuto}>Aggiungilo qui sotto, oppure cercalo su HubSpot.</Text>
            </View>
          ) : (
            contatti.map((c) => (
              <View key={c.id} style={styles.contatto}>
                <Text style={styles.contattoNome}>
                  {c.nome} {c.is_decisore ? <Ionicons name="star" size={13} color={colors.oro} /> : null}
                </Text>
                {c.ruolo ? <Text style={styles.meta}>{c.ruolo}</Text> : null}
                {c.telefono ? (
                  <Text style={styles.link} onPress={() => Linking.openURL(`tel:${c.telefono}`)}>
                    {c.telefono}
                  </Text>
                ) : null}
              </View>
            ))
          )}
          {/* Conciliazione intelligente con HubSpot */}
          <Pressable
            style={[styles.btnAI, matchLoading && { opacity: 0.6 }]}
            onPress={() => eseguiMatch(place, scartati, aziendeScartate)}
            disabled={matchLoading}
          >
            <Text style={styles.btnAITxt}>
              {matchLoading ? (
                'Cerco su HubSpot…'
              ) : (
                <>
                  <Ionicons name="search-outline" size={15} color={colors.goldStrong} /> Trova contatti su HubSpot
                </>
              )}
            </Text>
          </Pressable>
          {matchErrore ? <Text style={styles.err}>{matchErrore}</Text> : null}
          {matchAI ? (
            <View style={styles.aiBox}>
              {matchAI.match ? (
                <View style={styles.aiMatchRow}>
                  <Text style={[styles.aiMatch, { flex: 1 }]}>
                    <Ionicons name="business-outline" size={14} color={colors.navy} /> {matchAI.match.nome} · affinità{' '}
                    {matchAI.confidenza}
                  </Text>
                  <Pressable style={styles.btnRimuovi} onPress={rimuoviAzienda}>
                    <Text style={styles.btnRimuoviTxt}>Non è questa</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.vuoto}>Nessuna azienda HubSpot corrispondente.</Text>
              )}
              {matchAI.nota ? <Text style={styles.aiNota}>{matchAI.nota}</Text> : null}
              {matchAI.match && !contattiDaAggiungere.length ? (
                <Text style={styles.aiNota}>Tutti i contatti trovati sono già in rubrica.</Text>
              ) : null}
              {contattiDaAggiungere.map((c) => (
                <View key={c.hubspot_contact_id} style={styles.aiContatto}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contattoNome}>{c.nome || 'Contatto'}</Text>
                    <Text style={styles.meta}>
                      {[c.ruolo, c.telefono, c.email].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                  <Pressable style={styles.btnAdd} onPress={() => importaContattoAI(c)}>
                    <Text style={styles.btnAddTxt}>+ Aggiungi</Text>
                  </Pressable>
                  <Pressable
                    style={styles.btnScarta}
                    hitSlop={8}
                    onPress={() => scarta(c)}
                    accessibilityLabel="Non pertinente"
                  >
                    <Ionicons name="close" size={18} color={colors.grigio} />
                  </Pressable>
                </View>
              ))}
              {matchAI.duplicati?.length ? (
                <Text style={styles.aiDup}>
                  <Ionicons name="alert-circle-outline" size={13} color={colors.attenzione} /> Possibili duplicati da
                  unire: {matchAI.duplicati.map((d) => d.motivo).join('; ')}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Pressable style={styles.btnSecondario} onPress={() => router.push(`/(app)/contatto/${place.id}`)}>
            <Text style={styles.btnSecondarioTxt}>+ Aggiungi contatto</Text>
          </Pressable>
        </Sezione>

        <Sezione titolo="Trattative (HubSpot)">
          {deal.length === 0 ? (
            <View>
              <Text style={styles.vuoto}>Nessuna trattativa aperta.</Text>
              <Text style={styles.vuotoAiuto}>Le trattative HubSpot collegate al negozio compaiono qui.</Text>
            </View>
          ) : (
            deal.map((d) => (
              <View key={d.id} style={styles.deal}>
                <Text style={styles.dealLinea}>{d.linea ?? 'Deal'}</Text>
                <Text style={styles.meta}>Fase: {labelFase[d.fase] ?? d.fase}</Text>
                {d.valore_atteso ? <Text style={styles.meta}>Valore: € {d.valore_atteso}</Text> : null}
              </View>
            ))
          )}
        </Sezione>

        <Sezione titolo={`Storico visite (${visite.length})`}>
          {visite.length === 0 ? (
            <View>
              <Text style={styles.vuoto}>Ancora nessuna visita.</Text>
              <Text style={styles.vuotoAiuto}>Registra la prima con «+ Nuova visita» qui sopra.</Text>
            </View>
          ) : (
            visite.map((v) => (
              <Pressable
                key={v.id}
                style={styles.visita}
                onPress={() => router.push(`/(app)/visita-dettaglio/${v.id}`)}
              >
                <Text style={styles.visitaData}>
                  {new Date(v.data).toLocaleDateString('it-IT')} · {v.esito ? LABEL_ESITO[v.esito] ?? v.esito : '—'}
                  {v.hubspot_synced ? null : (
                    <>
                      {'  '}
                      <Ionicons name="time-outline" size={13} color={colors.attenzione} />
                    </>
                  )}
                  {'  ›'}
                </Text>
                {v.next_step ? <Text style={styles.meta}>Next: {v.next_step}</Text> : null}
              </Pressable>
            ))
          )}
        </Sezione>

        {/* Cancellazione: in fondo, staccata, e solo per chi l'ha creato.
            La regola vera sta nella RLS (migrazione 0054) — qui il bottone si
            nasconde soltanto per non proporre un'azione che fallirebbe. */}
        {mio ? (
          <View style={styles.zonaRossa}>
            <Text style={styles.zonaRossaNota}>
              Cancellando «{place.nome}» spariscono anche i suoi contatti, le visite, le trattative, le chiamate e le
              iscrizioni alle sequenze. Task, pagamenti e ordini restano, ma perdono il collegamento. Il registro
              Anagrafiche non viene toccato.
            </Text>
            <Pressable style={[styles.btnElimina, eliminando && { opacity: 0.5 }]} onPress={elimina} disabled={eliminando}>
              {eliminando ? (
                <ActivityIndicator size="small" color={colors.errore} />
              ) : (
                <Text style={styles.btnEliminaTxt}>
                  <Ionicons name="trash-outline" size={15} color={colors.errore} /> Elimina questo negozio
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <View style={styles.sezione}>
      <Text style={styles.sezioneTitolo}>{titolo}</Text>
      {children}
    </View>
  );
}

function AzioneRapida({
  icona,
  label,
  onPress,
  primaria,
  disabled,
}: {
  icona: any;
  label: string;
  onPress: () => void;
  primaria?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.azione, primaria && styles.azionePrimaria, disabled && styles.azioneOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
    >
      <Ionicons name={icona} size={15} color={primaria ? colors.bianco : disabled ? colors.grigio : colors.navy} />
      <Text style={[styles.azioneTxt, primaria && styles.azioneTxtPrimaria, disabled && styles.azioneTxtOff]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  azioniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm, marginBottom: spacing.sm },
  azione: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 11,
    // Bersaglio touch ≥44px (Libro UX cap.10 §1 / WCAG): prima ~32px, senza hitSlop.
    minHeight: touchMin,
  },
  azionePrimaria: { backgroundColor: colors.ink, borderColor: colors.ink },
  azioneOff: { opacity: 0.45 },
  azioneTxt: { color: colors.navy, fontWeight: '700', fontSize: 12.5 },
  azioneTxtPrimaria: { color: colors.bianco },
  azioneTxtOff: { color: colors.grigio },
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  percorso: {
    marginTop: spacing.lg,
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
  },
  percorsoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.errore },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prioRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prioOff: { opacity: 0.35 },
  stato: { color: colors.testoSoft, fontWeight: '700', fontSize: 12.5, marginTop: 2 },
  perche: {
    marginTop: spacing.sm,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    padding: spacing.sm,
    gap: 8,
  },
  percheTxt: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  btnRiapri: {
    alignSelf: 'flex-start',
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnRiapriTxt: { color: colors.testo, fontWeight: '700', fontSize: 13 },
  // In fondo e staccata: un'azione che non si annulla non sta fra le altre.
  zonaRossa: {
    marginTop: spacing.xxxl,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  zonaRossaNota: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  btnElimina: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.errore,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btnEliminaTxt: { color: colors.errore, fontWeight: '700', fontSize: 13.5 },
  nome: { fontSize: 24, fontWeight: '900', color: colors.navy, marginTop: spacing.sm },
  meta: { color: colors.testoSoft, fontSize: 14, marginTop: 2 },
  // Azione primaria DS: pillola nera (ink), mai oro.
  btnVisita: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  btnVisitaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 17 },
  azioniRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  btnTask: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
  },
  btnTaskTxt: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  btnNaviga: {
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radius.m,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnNavigaTxt: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  sezione: { marginTop: spacing.xxl },
  sezioneTitolo: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.oro,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  vuoto: { color: colors.grigio, fontStyle: 'italic' },
  vuotoAiuto: { color: colors.grigio, fontSize: 12.5, marginTop: 2 },
  interesseHead: { marginTop: spacing.xxl, marginBottom: spacing.sm, gap: 2 },
  interesseLbl: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.oro,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  interesseNota: { fontSize: 12, color: colors.grigio, fontStyle: 'italic' },
  btnSalvaLinee: {
    marginTop: spacing.lg,
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSalvaLineeTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  btnSecondario: {
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radius.m,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  btnSecondarioTxt: { color: colors.navy, fontWeight: '800' },
  btnAI: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: radius.m,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnAITxt: { color: colors.goldStrong, fontWeight: '800' },
  aiBox: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  aiMatchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiMatch: { color: colors.navy, fontWeight: '800', fontSize: 14 },
  btnRimuovi: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  btnRimuoviTxt: { color: colors.errore, fontWeight: '700', fontSize: 12 },
  aiNota: { color: colors.testoSoft, fontSize: 12, fontStyle: 'italic' },
  aiContatto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
    paddingTop: spacing.sm,
  },
  btnAdd: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  btnAddTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13 },
  btnScarta: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fill,
  },
  aiDup: { color: colors.attenzione, fontSize: 12, fontWeight: '600', marginTop: spacing.xs },
  contatto: { backgroundColor: colors.bianco, borderRadius: radius.s, padding: spacing.sm, marginBottom: spacing.sm },
  contattoNome: { fontWeight: '800', color: colors.navy },
  dupBox: { marginTop: spacing.lg, backgroundColor: colors.bianco, borderRadius: radius.m, borderWidth: 1, borderColor: colors.attenzione, padding: spacing.lg, gap: 6 },
  dupTitolo: { color: colors.attenzione, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  dupAiuto: { color: colors.testoSoft, fontSize: 12 },
  dupRow: { borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: 8, marginTop: 2, gap: 6 },
  dupRowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dupNome: { color: colors.navy, fontWeight: '800', fontSize: 14 },
  dupMeta: { color: colors.grigio, fontSize: 12, marginTop: 1 },
  dupAzioni: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dupAzione: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '700' },
  dupSep: { color: colors.grigio },
  btnUnisci: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  btnUnisciTxt: { color: colors.bianco, fontWeight: '800', fontSize: 13 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bianco, borderRadius: radius.s, padding: spacing.sm, marginBottom: spacing.sm },
  taskTitolo: { fontWeight: '700', color: colors.testo, fontSize: 14 },
  taskFatto: { textDecorationLine: 'line-through', color: colors.grigio },
  taskMeta: { color: colors.testoSoft, fontSize: 12, marginTop: 2 },
  link: { color: colors.oro, fontWeight: '700', marginTop: 2 },
  deal: { backgroundColor: colors.bianco, borderRadius: radius.s, padding: spacing.sm, marginBottom: spacing.sm },
  dealLinea: { fontWeight: '800', color: colors.navy },
  visita: { backgroundColor: colors.bianco, borderRadius: radius.s, padding: spacing.sm, marginBottom: spacing.sm },
  visitaData: { fontWeight: '700', color: colors.navy },
});
