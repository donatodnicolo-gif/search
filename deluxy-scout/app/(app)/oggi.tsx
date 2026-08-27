// "Oggi" — il cockpit del venditore (docs/VISIONE-COMMERCIALE.md).
// Non un recap: risponde nell'ordine alle 3 domande del mattino.
//   1. Dove vado e chi chiamo oggi?   → giro (territorio) + chiamate (telefono)
//   2. Quali trattative devo muovere? → follow-up di oggi e in ritardo, col valore
//   3. Cosa posso riprendere?         → le perse arrivate a maturazione
// Sopra, i numeri personali della settimana: servono a capire se si sta
// seminando abbastanza in ciascun canale, non a fare la pagella.
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Place, RichiestaCliente, RichiestaPagamento, Task, Visit } from '@/types';
import type { ChiamataFatta, OrdineConLuogo } from '@/lib/db';
import { colors, coloreProprita, labelFase, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { isoOggi } from '@/lib/giorni';
import { useAuth } from '@/lib/auth';
import {
  fetchOrdini,
  fetchRichiesteCliente,
  fetchRichiestePagamento,
  fetchChiamateDal,
  fetchAllVisits,
  fetchLeads,
  fetchPlaces,
  fetchProfilo,
  fetchTask,
  fetchTutteTrattative,
  chiudiRichiamo,
  fetchUltimoContattoPerPlace,
  inviaPromemoriaEmail,
  type TrattativaConLuogo,
} from '@/lib/db';
import { daRicontattare, placeIdConTrattativaAperta, type Richiamo } from '@/lib/metrics';
import { giorniDaOggi } from '@/lib/statoVisita';
import { GIORNI_RISPOSTA_LEAD } from '@/lib/cadenze';
import type { Lead } from '@/types';
import { avvisa, conferma } from '@/lib/dialoghi';
import { RicercaGlobale } from '@/components/RicercaGlobale';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

// isoOggi/isoTraGiorni stanno in lib/giorni.ts: in ora LOCALE. Con
// toISOString, fra mezzanotte e le due, «oggi» era ieri.
function isoGiorniFa(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}
type RigaDettaglio = { id: string; nome: string; meta: string; valore?: string; rotta?: string };

/**
 * Quanti negozi ha senso proporre come giro di UNA giornata.
 *
 * ⚠️ Misurato il 21/08/2026: i negozi «stellati e da visitare» erano **803**, e
 * la Home li sommava tutti nel titolo — «803 azioni per vendere oggi». Ma 801
 * di quegli 803 arrivano dall'**import del registro Anagrafiche**, che li stella
 * per costruzione (senza ⭐ non comparirebbero in nessuna lista): non li ha
 * scelti nessuno, sono il magazzino. Quelli scelti da una persona erano **28**.
 * Un giro di un giorno non è 803 negozi, e un numero che nessuno può fare non è
 * un obiettivo: è rumore che fa smettere di guardare la Home.
 *
 * (Il tetto di 10 è morto il 25/08/2026 insieme al riempimento automatico:
 * ora il giro è SOLO ciò che è stato pianificato per il giorno.)
 */

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_target: 'Non è un target',
  chiuso: 'Chiuso',
};

/** «14 ago» — la data lunga qui non serve, serve capire quanto è vecchia. */
function dataBreve(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

// Cosa c'è dietro ogni tessera, a parole. L'elenco vuoto deve dire PERCHÉ è
// vuoto: «0» senza spiegazione fa pensare a un guasto dell'app.
const DETTAGLIO_TESTI: Record<string, { titolo: string; vuoto: string; cta: string; rotta: string }> = {
  visite: {
    titolo: 'Le tue visite degli ultimi 7 giorni',
    vuoto: 'Nessuna visita registrata negli ultimi 7 giorni. Si registrano dalla scheda del negozio, o dalla spunta sulla Mappa.',
    cta: 'Apri lo Storico',
    rotta: '/(app)/storico',
  },
  chiamate: {
    titolo: 'Le tue chiamate degli ultimi 7 giorni',
    vuoto:
      'Nessuna chiamata registrata. Attenzione: il bottone che le registra oggi sta solo in Affiliazioni — altrove il numero apre il telefono e non lascia traccia, quindi questo numero può essere 0 anche se hai telefonato.',
    cta: 'Apri Chiamate · Affiliazioni',
    rotta: '/(app)/affiliazioni',
  },
  trattative: {
    titolo: 'Le tue trattative aperte',
    vuoto: 'Nessuna trattativa aperta assegnata a te. Se ne apre una dalla scheda del negozio o da Trattative.',
    cta: 'Apri le Trattative',
    rotta: '/(app)/trattative',
  },
  pipeline: {
    titolo: 'Pipeline — trattative aperte per valore',
    vuoto: 'Nessuna trattativa aperta, quindi nessun valore in pipeline.',
    cta: 'Apri le Trattative',
    rotta: '/(app)/trattative',
  },
};

/**
 * ⚠️ ABBREVIATO, perché queste cifre stanno in tessere da ~78px sul telefono
 * (27/08/2026). Prima era `toLocaleString` per esteso: «€ 12.345,67» chiede
 * ~82px e la tessera ne dà 78, quindi con `numberOfLines={1}` le ultime cifre
 * sparivano dietro i puntini — un importo troncato è peggio di un importo
 * arrotondato, perché sembra ancora un importo esatto.
 */
function euro(n: number): string {
  if (Math.abs(n) >= 1000) {
    return `€ ${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k`;
  }
  return `€ ${n.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`;
}

export default function Oggi() {
  const router = useRouter();
  const { session } = useAuth();
  const [nome, setNome] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trattative, setTrattative] = useState<TrattativaConLuogo[]>([]);
  const [giro, setGiro] = useState<Place[]>([]);
  const [richiami, setRichiami] = useState<Richiamo[]>([]);
  const [leadNuovi, setLeadNuovi] = useState<Lead[]>([]);
  // Le RIGHE dietro ai numeri, non i numeri: le tessere si aprono, e un
  // conteggio calcolato per conto suo prima o poi non torna con l'elenco che
  // dovrebbe spiegarlo.
  const [visite7g, setVisite7g] = useState<Visit[]>([]);
  const [chiamate7g, setChiamate7g] = useState<ChiamataFatta[]>([]);
  const [nomiPlace, setNomiPlace] = useState<Map<string, string>>(new Map());
  const [dettaglio, setDettaglio] = useState<null | 'visite' | 'chiamate' | 'trattative' | 'pipeline'>(null);
  /**
   * ⭐ LA SECONDA RIGA DEI NUMERI (26/08/2026, richiesta dell'utente): dopo la
   * pipeline, il denaro che si muove davvero — preventivi fuori, ordini da
   * incassare, pagamenti chiesti e fatturato.
   *
   * ⚠️ Sono QUATTRO cose diverse, e nessuna è l'altra: un preventivo è
   * un'offerta che il cliente può rifiutare, un ordine è lavoro venduto ma non
   * ancora pagato, un pagamento è una richiesta di soldi, il fatturato è ciò
   * per cui il documento è stato emesso. Sommarle darebbe un numero che non
   * vuol dire niente.
   */
  const [ordini, setOrdini] = useState<OrdineConLuogo[]>([]);
  const [richiesteCliente, setRichiesteCliente] = useState<RichiestaCliente[]>([]);
  const [richiestePagamento, setRichiestePagamento] = useState<RichiestaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviando, setInviando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const uid = session?.user?.id;
      const settimanaFa = isoGiorniFa(7);
      const [t, tr, places, visits, chiamate, prof, tuttiLead, ultimoContatto, ord, richC, richP] = await Promise.all([
        fetchTask(true),
        fetchTutteTrattative(),
        fetchPlaces(),
        fetchAllVisits(),
        fetchChiamateDal(settimanaFa).catch(() => []),
        uid ? fetchProfilo(uid) : Promise.resolve(null),
        fetchLeads().catch(() => []),
        fetchUltimoContattoPerPlace().catch(() => new Map<string, string>()),
        // I tre elenchi del denaro. Ognuno col suo `catch`: una tabella non
        // ancora migrata non deve far sparire la giornata — il numero resta a
        // zero e il resto della schermata vive.
        fetchOrdini().catch(() => []),
        fetchRichiesteCliente().catch(() => []),
        fetchRichiestePagamento().catch(() => []),
      ]);
      setOrdini(ord);
      setRichiesteCliente(richC);
      setRichiestePagamento(richP);
      setLeadNuovi(tuttiLead.filter((l) => l.stato === 'nuovo'));
      setTasks(t.filter((x) => !x.completata));
      setTrattative(tr);
      // Fuori dalla coda i negozi già in trattativa: li muove la pipeline.
      setRichiami(
        daRicontattare(places, visits, new Date(), {
          conTrattativaAperta: placeIdConTrattativaAperta(tr),
          ultimoContatto,
        }),
      );
      setNome(prof?.nome?.split(' ')[0] ?? '');
      setNomiPlace(new Map(places.map((p) => [p.id, p.nome])));
      setChiamate7g(chiamate);
      setVisite7g(visits.filter((v) => v.owner === uid && v.created_at >= settimanaFa));
      // Il giro di oggi = i target selezionati con la stella (⭐), ancora da visitare.
      setGiro(places.filter((p) => p.starred && p.stato === 'da_visitare' && !p.nascosto));
      // I KPI si ricavano dalle righe qui sopra (vedi `aperteMie` più giù).
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const oggi = isoOggi();
  const uid = session?.user?.id;

  // 2. Trattative da muovere: scadute prima, poi quelle di oggi. Solo mie o non attribuite.
  const daMuovere = useMemo(
    () =>
      trattative
        .filter(
          (d) =>
            d.fase !== 'closedwon' &&
            d.fase !== 'closedlost' &&
            d.scadenza &&
            d.scadenza <= oggi &&
            (!d.owner || d.owner === uid),
        )
        .sort((a, b) => (a.scadenza! < b.scadenza! ? -1 : 1)),
    [trattative, oggi, uid],
  );

  // 3. Da riprendere: le perse arrivate a maturazione (riprendere_il ≤ oggi).
  const daRiprendere = useMemo(
    () =>
      trattative
        .filter((d) => d.fase === 'closedlost' && d.riprendere_il && d.riprendere_il <= oggi)
        .sort((a, b) => (a.riprendere_il! < b.riprendere_il! ? -1 : 1)),
    [trattative, oggi],
  );

  // «×» sulla riga: il richiamo esce dalla coda. Ottimistico, ma se il server
  // rifiuta la riga TORNA e si dice perché — una UI ottimistica muta nasconde
  // il guasto e l'utente scopre domani che non era chiuso niente.
  const chiudi = useCallback((r: Richiamo) => {
    conferma(
      'Chiudere il richiamo?',
      `«${r.place.nome}» esce da questa coda. Ci torna da solo se registri una visita nuova con esito «interessato» o «da richiamare».`,
      () => {
        const prima = richiami;
        setRichiami((cur) => cur.filter((x) => x.place.id !== r.place.id));
        chiudiRichiamo(r.place.id).catch((e) => {
          setRichiami(prima);
          avvisa('Richiamo non chiuso', String((e as Error)?.message ?? e));
        });
      },
      { testoConferma: 'Chiudi' },
    );
  }, [richiami]);

  // Trattative aperte mie (o senza proprietario): è il numero della tessera E
  // l'elenco che ci sta dietro — lo stesso, non due calcoli separati.
  const aperteMie = useMemo(
    () =>
      trattative.filter(
        (d) => d.fase !== 'closedwon' && d.fase !== 'closedlost' && (!d.owner || d.owner === uid),
      ),
    [trattative, uid],
  );
  const pipeline = useMemo(() => aperteMie.reduce((s, d) => s + (d.valore_atteso ?? 0), 0), [aperteMie]);

  /**
   * I quattro numeri del denaro dopo la pipeline. Ognuno da una fonte sola, e
   * dichiarata — non si sommano fra loro e non si sommano alla pipeline.
   *
   * ⚠️ «Fatturato» qui vuol dire: ordini per cui il documento è stato EMESSO
   * (c'è il numero della fattura di FINANCE). Non è l'incassato — quello è
   * «Ordini», che conta ciò che aspetta ancora i soldi — e non è il fatturato
   * ufficiale dell'azienda, che vive in FINANCE ed è più largo di quello che
   * passa da Scout.
   */
  const soldi = useMemo(() => {
    const annoOra = new Date().getFullYear();
    const dellAnno = (iso: string | null | undefined) =>
      !!iso && new Date(iso).getFullYear() === annoOra;
    return {
      // Offerte fuori, in attesa di una risposta del cliente.
      preventivi: richiesteCliente
        .filter((r) => r.stato === 'preventivo_inviato')
        .reduce((s, r) => s + (r.importo ?? 0), 0),
      // Lavoro venduto che aspetta ancora i soldi.
      ordini: ordini.filter((o) => o.stato === 'da_incassare').reduce((s, o) => s + (o.valore ?? 0), 0),
      // Soldi chiesti e non ancora arrivati: il RESIDUO, non l'importo pieno —
      // una richiesta incassata a metà è ancora aperta per la sua metà.
      pagamenti: richiestePagamento
        // ⚠️ Gli stati chiusi sono due — «pagata» e «annullata». Tutto il
        // resto (inviata, in attesa, parziale, insoluta) è denaro che aspetta
        // ancora, e va contato.
        .filter((r) => r.stato !== 'pagata' && r.stato !== 'annullata')
        .reduce((s, r) => s + Math.max(0, (r.importo ?? 0) - (r.importo_incassato ?? 0)), 0),
      // Documento emesso, quest'anno.
      fatturato: ordini
        .filter((o) => o.fattura_numero && o.stato !== 'annullato' && dellAnno(o.created_at))
        .reduce((s, o) => s + (o.valore ?? 0), 0),
    };
  }, [ordini, richiesteCliente, richiestePagamento]);

  // Le aperte in ordine di URGENZA, per la sezione in cima (richiesta utente
  // 25/08: «metti per prima cosa le trattative aperte»): prima chi ha la
  // scadenza passata o di oggi, poi le scadenze future, in fondo quelle senza
  // scadenza — ordinate per valore, che è l'unico segnale rimasto.
  const aperteOrdinate = useMemo(() => {
    const rank = (d: TrattativaConLuogo) => (d.scadenza ? (d.scadenza <= oggi ? 0 : 1) : 2);
    return aperteMie.slice().sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (a.scadenza && b.scadenza && a.scadenza !== b.scadenza) return a.scadenza < b.scadenza ? -1 : 1;
      return (b.valore_atteso ?? 0) - (a.valore_atteso ?? 0);
    });
  }, [aperteMie, oggi]);

  const righeDettaglio = useMemo<RigaDettaglio[]>(() => {
    const nome = (id: string | null | undefined) => (id && nomiPlace.get(id)) || 'Negozio senza nome';
    if (dettaglio === 'visite') {
      return visite7g
        .slice()
        .sort((a, b) => (a.data < b.data ? 1 : -1))
        .map((v) => ({
          id: v.id,
          nome: nome(v.place_id),
          meta: `${LABEL_ESITO[v.esito ?? ''] ?? 'visita'} · ${dataBreve(v.data)}`,
          rotta: `/(app)/attivita/${v.place_id}`,
        }));
    }
    if (dettaglio === 'chiamate') {
      return chiamate7g.map((c) => ({
        id: c.id,
        nome: nome(c.place_id),
        meta: [c.esito, dataBreve(c.created_at)].filter(Boolean).join(' · '),
        rotta: `/(app)/attivita/${c.place_id}`,
      }));
    }
    const deals = dettaglio === 'pipeline'
      ? aperteMie.slice().sort((a, b) => (b.valore_atteso ?? 0) - (a.valore_atteso ?? 0))
      : aperteMie;
    return deals.map((d) => ({
      id: d.id,
      nome: d.place_nome ?? d.oggetto ?? d.titolo ?? 'Trattativa',
      meta: [labelFase[d.fase] ?? d.fase, d.linea].filter(Boolean).join(' · '),
      valore: d.valore_atteso ? euro(d.valore_atteso) : 'valore non indicato',
      // La riga di una trattativa porta alla TRATTATIVA, non al negozio: la
      // scheda si apre già aperta su quella (parametro `apri`).
      rotta: `/(app)/trattative?apri=${d.id}`,
    }));
  }, [dettaglio, visite7g, chiamate7g, aperteMie, nomiPlace]);

  /**
   * Il giro di oggi: SOLO chi ha una visita **pianificata** per oggi o nei
   * giorni scorsi mai chiusa (impegno preso e saltato: sparirlo in silenzio
   * nasconderebbe il buco).
   *
   * ⚠️ Prima la sezione si RIEMPIVA DA SOLA col magazzino degli stellati
   * (scelti a mano, poi per priorità, fino a un tetto di 10): ogni mattina
   * compariva «un giro» che nessuno aveva deciso — un giro vecchio, sempre
   * uguale (segnalato dall'utente il 25/08/2026). I giri sono del GIORNO: se
   * oggi non è stato impostato come giorno di giro, qui non c'è niente, e la
   * sezione non si monta. Gli stellati non spariscono: stanno sulla Mappa e
   * nei Selezionati, e il giro si imposta da lì con «Pianifica la visita».
   */
  const giroOggi = useMemo(
    () =>
      giro
        .filter((p) => p.visita_pianificata && p.visita_pianificata <= oggi)
        .sort((a, b) => (a.visita_pianificata! < b.visita_pianificata! ? -1 : 1)),
    [giro, oggi],
  );

  const richiamiOrdinati = useMemo(
    () => [...richiami].sort((a, b) => Number(b.inRitardo) - Number(a.inRitardo) || b.giorni - a.giorni),
    [richiami],
  );

  const taskOggi = useMemo(() => tasks.filter((t) => t.scadenza && t.scadenza <= oggi), [tasks, oggi]);

  const d = new Date();
  const dataLunga = `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
  const cose = giroOggi.length + richiamiOrdinati.length + leadNuovi.length + daMuovere.length + daRiprendere.length + taskOggi.length;

  async function promemoria() {
    setInviando(true);
    try {
      const r = await inviaPromemoriaEmail();
      if (r.sent) avvisa('Inviato', 'Riepilogo inviato alla tua email.');
      else if (r.reason === 'niente_in_scadenza') avvisa('Tutto in ordine', 'Niente in scadenza: nessuna email necessaria.');
      else if (r.reason === 'smtp_non_configurato') avvisa('Email non attiva', 'L’invio email non è ancora configurato (SMTP).');
      else avvisa('Non inviato', r.reason ?? 'Riprova più tardi.');
    } catch {
      avvisa('Errore', 'Invio non riuscito, riprova.');
    } finally {
      setInviando(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      {/* Prima di tutto la ricerca: la prima domanda della giornata è «quel
          negozio come si chiamava?», e prima bisognava indovinare in quale
          sezione andarlo a cercare. Cerca in tutta l'app (lib/ricerca.ts). */}
      <RicercaGlobale />

      {/* Testata sobria: niente blocchi scenografici, si va dritti alle azioni */}
      <View style={styles.testata}>
        <Text style={styles.data}>{dataLunga}{nome ? ` · ${nome}` : ''}</Text>
        <Text style={styles.titolo}>
          {loading
            ? 'Preparo la giornata…'
            : cose
              ? `${cose} azioni per vendere oggi`
              : 'Coda vuota: vai a cercarti le occasioni sulla Mappa'}
        </Text>
      </View>

      {/* I numeri della settimana: sto seminando abbastanza in ogni canale? */}
      <View style={styles.kpiRow}>
        <Kpi label="Visite" valore={String(visite7g.length)} icona="walk-outline" onPress={() => setDettaglio('visite')} />
        <Kpi label="Chiamate" valore={String(chiamate7g.length)} icona="call-outline" onPress={() => setDettaglio('chiamate')} />
        <Kpi label="Trattative" valore={String(aperteMie.length)} icona="briefcase-outline" onPress={() => setDettaglio('trattative')} />
        <Kpi label="Pipeline" valore={euro(pipeline)} icona="trending-up-outline" stretta onPress={() => setDettaglio('pipeline')} />
      </View>

      {/* La seconda riga: il denaro DOPO la pipeline, diviso nei quattro
          momenti che non vanno confusi. Ogni tessera porta dov'è il lavoro. */}
      <View style={styles.kpiRow}>
        <Kpi
          label="Preventivi"
          valore={euro(soldi.preventivi)}
          icona="document-text-outline"
          stretta
          onPress={() => router.push({ pathname: '/(app)/richieste-clienti' } as never)}
        />
        <Kpi
          label="Ordini"
          valore={euro(soldi.ordini)}
          icona="receipt-outline"
          stretta
          onPress={() => router.push('/(app)/ordini')}
        />
        <Kpi
          label="Pagamenti"
          valore={euro(soldi.pagamenti)}
          icona="wallet-outline"
          stretta
          onPress={() => router.push('/(app)/pagamenti')}
        />
        <Kpi
          label="Fatturato"
          valore={euro(soldi.fatturato)}
          icona="checkmark-done-outline"
          stretta
          onPress={() => router.push('/(app)/ordini')}
        />
      </View>

      <DettaglioKpi
        tipo={dettaglio}
        righe={righeDettaglio}
        onChiudi={() => setDettaglio(null)}
        onApri={(rotta) => {
          setDettaglio(null);
          router.push(rotta as any);
        }}
      />

      {/* 0. LE TRATTATIVE APERTE, per prime (richiesta utente 25/08): sono i
          soldi in gioco, e la giornata parte da lì. In cima le scadute/di
          oggi (in rosso), poi le scadenze future, in fondo le senza scadenza
          per valore. La riga apre LA trattativa (parametro `apri`). */}
      <Canale
        icona="briefcase-outline"
        titolo="Le tue trattative aperte"
        conteggio={aperteMie.length}
        nota={daMuovere.length ? `${daMuovere.length} da muovere oggi` : undefined}
        cta="Apri le Trattative"
        onCta={() => router.push('/(app)/trattative')}
        vuoto={loading ? 'Caricamento…' : 'Nessuna trattativa aperta assegnata a te: se ne apre una dalla scheda di un negozio o da Trattative.'}
      >
        {aperteOrdinate.slice(0, 5).map((t) => {
          const inRitardo = !!t.scadenza && t.scadenza <= oggi;
          return (
            <Pressable key={t.id} style={styles.riga} onPress={() => router.push(`/(app)/trattative?apri=${t.id}`)}>
              <Ionicons name="briefcase-outline" size={16} color={inRitardo ? colors.errore : colors.navy} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={3} style={styles.rigaTitolo}>{t.place_nome ?? t.oggetto ?? t.titolo ?? 'Trattativa'}</Text>
                {t.oggetto || t.next_action ? (
                  <Text style={styles.rigaSotto} numberOfLines={1}>{t.oggetto ?? t.next_action}</Text>
                ) : null}
              </View>
              <Text style={[styles.rigaMeta, inRitardo && styles.ritardo]}>
                {t.valore_atteso ? euro(t.valore_atteso) : ''}
                {inRitardo ? ' · da muovere' : t.scadenza ? ` · ${dataBreve(t.scadenza)}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </Canale>

      {/* 1a. TERRITORIO — il giro di oggi. SOLO se oggi è un giorno di giro
          (una visita pianificata per oggi, o una dei giorni scorsi mai
          chiusa): senza, la sezione non si monta — prima si riempiva da sola
          col magazzino degli stellati e ogni mattina mostrava un giro vecchio
          che nessuno aveva deciso. */}
      {giroOggi.length ? (
        <Canale
          icona="walk-outline"
          titolo="Territorio — il giro di oggi"
          conteggio={giroOggi.length}
          nota={giro.length ? `${giro.length} selezionati sulla Mappa: il giro si pianifica da lì` : undefined}
          cta="Apri la Mappa e parti"
          onCta={() => router.push('/(app)/mappa')}
          vuoto=""
        >
          {giroOggi.slice(0, 8).map((p) => {
            const fra = giorniDaOggi(p.visita_pianificata);
            const inRitardo = fra !== null && fra < 0;
            return (
              <Pressable key={p.id} style={styles.riga} onPress={() => router.push(`/(app)/attivita/${p.id}`)}>
                <Ionicons name="storefront-outline" size={16} color={inRitardo ? colors.errore : colors.navy} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={3} style={styles.rigaTitolo}>{p.nome}</Text>
                  <Text style={styles.rigaSotto} numberOfLines={1}>{p.zona ?? p.indirizzo ?? ''}</Text>
                </View>
                <Text style={[styles.rigaMeta, inRitardo && styles.ritardo]}>
                  {inRitardo ? `saltata · ${-fra!} g fa` : 'oggi'}
                </Text>
              </Pressable>
            );
          })}
        </Canale>
      ) : null}

      {/* 1b. TELEFONO — chi chiamo oggi */}
      <Canale
        icona="call-outline"
        titolo="Telefono — chi chiamo oggi"
        conteggio={richiamiOrdinati.length}
        cta="Tutti i richiami in «Da fare»"
        onCta={() => router.push('/(app)/da-completare')}
        vuoto={loading ? 'Caricamento…' : 'Nessun richiamo maturato: i «da richiamare» delle visite compariranno qui.'}
      >
        {richiamiOrdinati.slice(0, 5).map((r) => (
          <Pressable key={r.place.id} style={styles.riga} onPress={() => router.push(`/(app)/attivita/${r.place.id}`)}>
            <Ionicons name="call-outline" size={16} color={r.inRitardo ? colors.errore : colors.navy} />
            <Text numberOfLines={3} style={styles.rigaTitolo}>{r.place.nome}</Text>
            <Text style={[styles.rigaMeta, r.inRitardo && styles.ritardo]}>
              {r.giorni}g fa{r.inRitardo ? ' · ritardo' : ''}
            </Text>
            <Pressable
              onPress={() => chiudi(r)}
              hitSlop={10}
              style={styles.chiudiRichiamo}
              accessibilityLabel={`Chiudi il richiamo di ${r.place.nome}`}
            >
              <Ionicons name="close" size={15} color={colors.grigio} />
            </Pressable>
          </Pressable>
        ))}
      </Canale>

      {/* 1c. WEB — lead da qualificare (rispondere entro 2 giorni) */}
      {leadNuovi.length ? (
        <Canale
          icona="globe-outline"
          titolo="Web — richieste da qualificare"
          conteggio={leadNuovi.length}
          cta="Apri le Richieste Web"
          onCta={() => router.push('/(app)/lead')}
          vuoto=""
        >
          {leadNuovi.slice(0, 4).map((l) => {
            const eta = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400_000);
            const ritardo = eta >= GIORNI_RISPOSTA_LEAD;
            return (
              <Pressable key={l.id} style={styles.riga} onPress={() => router.push('/(app)/lead')}>
                <Ionicons name="globe-outline" size={16} color={ritardo ? colors.errore : colors.navy} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={3} style={styles.rigaTitolo}>{l.nome}</Text>
                  {l.messaggio ? <Text style={styles.rigaSotto} numberOfLines={1}>{l.messaggio}</Text> : null}
                </View>
                <Text style={[styles.rigaMeta, ritardo && styles.ritardo]}>
                  {eta === 0 ? 'oggi' : `${eta}g fa`}{ritardo ? ' · ritardo' : ''}
                </Text>
              </Pressable>
            );
          })}
        </Canale>
      ) : null}

      {/* La vecchia sezione «Trattative da muovere» è stata ASSORBITA da «Le
          tue trattative aperte» in cima: le da-muovere sono le sue prime
          righe (in rosso) e il conteggio sta nella nota — due sezioni con le
          stesse righe avrebbero detto la stessa cosa due volte. */}

      {/* 3. Da riprendere: le perse arrivate a maturazione (pipeline differita) */}
      {daRiprendere.length ? (
        <Canale
          icona="refresh-outline"
          titolo="Da riprendere — perse che maturano"
          conteggio={daRiprendere.length}
          cta="Apri le Trattative"
          onCta={() => router.push('/(app)/trattative')}
          vuoto=""
        >
          {daRiprendere.slice(0, 5).map((t) => (
            <Pressable key={t.id} style={styles.riga} onPress={() => router.push('/(app)/trattative')}>
              <Ionicons name="refresh-outline" size={16} color={colors.goldStrong} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={3} style={styles.rigaTitolo}>{t.place_nome ?? 'Trattativa'}</Text>
                <Text style={styles.rigaSotto} numberOfLines={1}>
                  {t.oggetto ? `Era per: ${t.oggetto}` : 'Persa'}
                  {t.motivo_perso ? ` · motivo: ${t.motivo_perso.replace('_', ' ')}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </Canale>
      ) : null}

      {/* Task del giorno, compatti */}
      {taskOggi.length ? (
        <Canale
          icona="checkbox-outline"
          titolo="Task di oggi"
          conteggio={taskOggi.length}
          cta="Apri la tasklist"
          onCta={() => router.push('/(app)/task')}
          vuoto=""
        >
          {taskOggi.slice(0, 4).map((t) => (
            <Pressable key={t.id} style={styles.riga} onPress={() => router.push('/(app)/task')}>
              <View style={[styles.dot, { backgroundColor: coloreProprita[t.priorita] }]} />
              <Text style={styles.rigaTitolo} numberOfLines={1}>{t.titolo}</Text>
              {t.scadenza && t.scadenza < oggi ? <Text style={[styles.rigaMeta, styles.ritardo]}>ritardo</Text> : null}
            </Pressable>
          ))}
        </Canale>
      ) : null}

      {/* Assistente email */}
      <Pressable style={[styles.promemoria, inviando && { opacity: 0.5 }]} disabled={inviando} onPress={promemoria}>
        <Ionicons name="mail-unread-outline" size={16} color={colors.goldStrong} />
        <Text style={styles.promemoriaTxt}>Inviami il riepilogo via email</Text>
      </Pressable>
    </ScrollView>
  );
}

function Kpi({
  label,
  valore,
  icona,
  stretta,
  onPress,
}: {
  label: string;
  valore: string;
  icona: any;
  stretta?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.kpi, stretta && { flex: 1.4 }, pressed && styles.kpiPremuta]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${valore}. Apri il dettaglio`}
    >
      <Ionicons name={icona} size={15} color={colors.testoSoft} />
      <Text style={styles.kpiValore} numberOfLines={1}>{valore}</Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Cosa c'è dietro al numero della tessera: le righe, una per una. */
function DettaglioKpi({
  tipo,
  righe,
  onChiudi,
  onApri,
}: {
  tipo: null | 'visite' | 'chiamate' | 'trattative' | 'pipeline';
  righe: RigaDettaglio[];
  onChiudi: () => void;
  onApri: (rotta: string) => void;
}) {
  if (!tipo) return null;
  const testi = DETTAGLIO_TESTI[tipo];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={styles.velo} onPress={onChiudi}>
        {/* Il foglio non si chiude toccandolo: solo il velo o la ×. */}
        <Pressable style={styles.foglio} onPress={() => {}}>
          <View style={styles.foglioTesta}>
            <Text style={styles.foglioTitolo}>{testi.titolo}</Text>
            <Pressable onPress={onChiudi} hitSlop={10} accessibilityLabel="Chiudi il dettaglio">
              <Ionicons name="close" size={20} color={colors.grigio} />
            </Pressable>
          </View>
          <Text style={styles.foglioConto}>{righe.length === 1 ? '1 riga' : `${righe.length} righe`}</Text>
          <ScrollView style={styles.foglioLista}>
            {righe.length === 0 ? (
              <Text style={styles.foglioVuoto}>{testi.vuoto}</Text>
            ) : (
              righe.map((r) => (
                <Pressable
                  key={r.id}
                  style={styles.foglioRiga}
                  onPress={() => r.rotta && onApri(r.rotta)}
                  disabled={!r.rotta}
                >
                  <View style={styles.foglioTesto}>
                    <Text style={styles.foglioNome}>{r.nome}</Text>
                    <Text style={styles.foglioMeta} numberOfLines={2}>{r.meta}</Text>
                  </View>
                  {r.valore ? <Text style={styles.foglioValore}>{r.valore}</Text> : null}
                  {r.rotta ? <Ionicons name="chevron-forward" size={16} color={colors.grigio} /> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable style={styles.foglioCta} onPress={() => onApri(testi.rotta)}>
            <Text style={styles.link}>{testi.cta} ›</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Canale({
  icona,
  titolo,
  conteggio,
  nota,
  cta,
  onCta,
  vuoto,
  children,
}: {
  icona: any;
  titolo: string;
  nota?: string;
  conteggio: number;
  cta: string;
  onCta: () => void;
  vuoto: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.canale}>
      <View style={styles.canaleHead}>
        <Ionicons name={icona} size={16} color={colors.navy} />
        <Text style={styles.canaleTitolo}>{titolo}</Text>
        {conteggio ? <Text style={styles.canaleConteggio}>{conteggio}</Text> : null}
      </View>
      {/* Il taglio si dichiara: un elenco troncato in silenzio si legge come
          «non c'è altro», ed è il modo più veloce per far perdere fiducia a chi
          sa che i negozi erano di più. */}
      {nota ? <Text style={styles.canaleNota}>{nota}</Text> : null}
      {conteggio === 0 && vuoto ? <Text style={styles.vuoto}>{vuoto}</Text> : children}
      <Pressable onPress={onCta}>
        <Text style={styles.link}>{cta} ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  testata: { gap: 2, paddingTop: 2 },
  data: { color: colors.testoSoft, fontSize: 13, textTransform: 'capitalize' },
  titolo: { color: colors.navy, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  kpi: {
    flex: 1,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: 2,
  },
  kpiValore: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  kpiLabel: { color: colors.testoSoft, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  canaleNota: { color: colors.testoSoft, fontSize: 11.5, marginTop: -2, marginBottom: 2 },
  canale: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: 8,
  },
  canaleHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  canaleTitolo: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 14, letterSpacing: -0.2 },
  canaleConteggio: {
    color: colors.navy,
    fontWeight: '800',
    fontSize: 12,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  riga: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  rigaTitolo: { flex: 1, color: colors.testo, fontWeight: '700', fontSize: 14 },
  rigaSotto: { color: colors.testoSoft, fontSize: 12 },
  rigaMeta: { color: colors.testoSoft, fontSize: 12, maxWidth: 150, textAlign: 'right' },
  // Il bersaglio vero: hitSlop non vale sul web, e questa x sta in una riga
  // che apre la scheda del negozio — mancarla porta da un'altra parte.
  chiudiRichiamo: { padding: 10 },
  kpiPremuta: { backgroundColor: colors.fill },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing.md },
  foglio: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    padding: spacing.md,
    maxHeight: '80%',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
  foglioTesta: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  foglioTitolo: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 16, letterSpacing: -0.3 },
  foglioConto: { color: colors.testoSoft, fontSize: 12, marginTop: 2, marginBottom: spacing.sm },
  foglioLista: { flexGrow: 0 },
  foglioVuoto: { color: colors.testoSoft, fontSize: 13, lineHeight: 19, paddingVertical: spacing.sm },
  foglioRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  foglioTesto: { flex: 1, minWidth: 0 },
  foglioNome: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  foglioMeta: { color: colors.testoSoft, fontSize: 12, marginTop: 1 },
  foglioValore: { color: colors.navy, fontWeight: '800', fontSize: 13 },
  foglioCta: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: 2 },
  ritardo: { color: colors.errore, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vuoto: { color: colors.grigio, fontStyle: 'italic', fontSize: 13 },
  link: { color: colors.goldStrong, fontWeight: '700', fontSize: 13, paddingTop: 2 },
  promemoria: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  promemoriaTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
});
