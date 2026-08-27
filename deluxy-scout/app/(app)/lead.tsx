// Lead web — la coda di qualificazione del canale internet
// (docs/VISIONE-COMMERCIALE.md). Un lead entra qui (form del sito via API,
// mail, social, o inserito a mano), e SI LAVORA: o diventa una trattativa
// (canale web) agganciata a un negozio, o si scarta. Un lead "nuovo" più
// vecchio di 2 giorni è in ritardo: sul web chi non risponde subito perde.
//
// La scheda è components/LeadCard (dati del cliente estratti dalle notifiche
// del modulo Shopify), le finestre stanno su components/Foglio (centrate su
// desktop, foglio dal basso su telefono).
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
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
import { colors, radius, spacing, touchMin, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { Tabella, dataBreve, type ColonnaTabella } from '@/components/Tabella';
import { EmptyState, PageIntro } from '@/components/ui';
import { Foglio } from '@/components/Foglio';
import { LeadCard } from '@/components/LeadCard';
import { QualificaLeadModal } from '@/components/QualificaLeadModal';
import { creaLead, eliminaLead, fetchLeads, scartaLead } from '@/lib/db';
import type { EsitoRegistro } from '@/lib/anagrafiche';
import { urlMessaggioAiMail } from '@/lib/aimail';
import { fetchCorpoMail, importaRichiesteDaMail } from '@/lib/mail';
import { chiudiLetturaPosta, prenotaLetturaPosta, rilasciaLetturaPosta, statoImportPosta } from '@/lib/db';
import { avvisa, conferma } from '@/lib/dialoghi';
import { analizzaMessaggioLead } from '@/lib/lead-parse';
import { GIORNI_RISPOSTA_LEAD } from '@/lib/cadenze';
import type { FonteLead, Lead } from '@/types';

/**
 * Cosa è successo nel registro Anagrafiche, detto in italiano.
 *
 * ⚠️ Si dice SEMPRE, anche quando è andata male: la trattativa si apre lo
 * stesso (è il pezzo che conta), ma se il negozio non è entrato nel registro
 * chi lo cercherà di là non lo troverà — e senza questa riga non lo saprebbe
 * nessuno, perché l'esito viveva solo dentro la risposta della Edge Function.
 */
function frasePerIlRegistro(r: EsitoRegistro): string {
  if (!r.ok) {
    const perche =
      r.reason === 'non_configurato'
        ? 'manca la chiave di scrittura (Profilo → Impostazioni → App collegate → Anagrafiche)'
        : r.reason === 'non_raggiungibile'
          ? 'il registro non ha risposto'
          : /^registro_40[13]$/.test(r.reason ?? '')
            ? 'il registro ha rifiutato la chiave di Scout'
            : (r.reason ?? 'motivo sconosciuto');
    return `⚠️ Anagrafiche NON aggiornato (${perche}): il negozio resta solo in Scout.`;
  }
  if (r.reason === 'gia_agganciato_ad_altro_negozio') {
    return 'Anagrafiche: scritto nel registro, ma quella scheda è già agganciata a un ALTRO negozio di Scout — è un doppione da unire (Da completare → Duplicati).';
  }
  const chi = r.nome ? ` («${r.nome}»)` : '';
  if (r.esito === 'creato') return `Anagrafiche: il negozio non c'era, l'abbiamo creato adesso nel registro${chi}.`;
  if (r.esito === 'merged') return `Anagrafiche: il negozio c'era già nel registro${chi}; ci abbiamo aggiunto quello che sapevamo.`;
  if (r.esito === 'gia_presente') return `Anagrafiche: il negozio era già nel registro${chi} — niente da creare.`;
  // Edge Function `anagrafiche` più vecchia dell'esito (26/08/2026): la
  // scrittura è passata, ma non sappiamo dire quale delle due è stata.
  return 'Anagrafiche: scrittura accettata dal registro (non dice se il negozio è nato adesso o c’era già).';
}

const FONTI: { valore: FonteLead; label: string }[] = [
  { valore: 'sito', label: 'Sito' },
  { valore: 'mail', label: 'Mail' },
  { valore: 'social', label: 'Social' },
  { valore: 'passaparola', label: 'Passaparola' },
  { valore: 'altro', label: 'Altro' },
];

export default function LeadWeb() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statoFiltro, setStatoFiltro] = useState<string>('nuovo');
  const [formAperto, setFormAperto] = useState(false);
  const [daQualificare, setDaQualificare] = useState<Lead | null>(null);
  const [importando, setImportando] = useState(false);
  /**
   * ⭐ L'IMPORT CHE PARTE DA SOLO (27/08/2026, richiesta dell'utente: «import
   * automatico ogni giorno o ogni volta che si apre la pagina»).
   *
   * Prima bisognava ricordarsi di premere un bottone: una richiesta arrivata
   * di sabato restava nella casella finché qualcuno non apriva questa pagina E
   * si ricordava di cliccare. Ora l'apertura basta.
   *
   * ⚠️ L'esito NON apre un pop-up. Il bottone a mano lo fa perché lo hai
   * chiesto tu; una finestra che si piazza davanti ogni volta che passi di qui
   * si impara a chiudere senza leggere, e il giorno che dice qualcosa di
   * importante nessuno la legge. Qui si scrive in una riga sotto al bottone.
   */
  const [esitoAuto, setEsitoAuto] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setLeads(await fetchLeads());
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
   * Quanto si aspetta prima di rileggere la casella aprendo di nuovo la
   * pagina.
   *
   * ⚠️ Non è zero, e non è un capriccio: fra dashboard e lead si passa di qui
   * dieci volte in un'ora, e ogni lettura è una connessione IMAP e una manciata
   * di secondi. Un quarto d'ora tiene la promessa («si apre la pagina, arriva
   * la posta») senza trasformare ogni navigazione in un'attesa. Il bottone a
   * mano non aspetta niente: se sai che è appena arrivata, la prendi subito.
   */
  /**
   * Quanto si aspetta prima di rileggere la casella riaprendo la pagina.
   *
   * ⚠️ Non è zero, e non è un capriccio: fra dashboard e lead si passa di qui
   * dieci volte in un'ora, e ogni lettura è una connessione alla casella e una
   * manciata di secondi. Un quarto d'ora tiene la promessa — si apre la pagina,
   * arriva la posta — senza trasformare ogni navigazione in un'attesa. Il
   * bottone a mano non aspetta niente: se sai che è appena arrivata, la prendi
   * subito.
   */
  const ATTESA_MIN = 15;

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      (async () => {
        const prima = await statoImportPosta();
        // Chi apre e non deve leggere vede comunque com'è finita l'ultima
        // volta: senza, la riga sparisce e la pagina sembra non fare niente.
        if (vivo && prima?.ultimo_esito) setEsitoAuto(prima.ultimo_esito);
        const mio = await prenotaLetturaPosta(ATTESA_MIN);
        if (!mio || !vivo) return;
        try {
          const esito = await importaRichiesteDaMail();
          if (!vivo) return;
          await carica();
          const parti = [
            esito.importate ? `${esito.importate} nuove richieste` : 'nessuna richiesta nuova',
            esito.richiesteCliente ? `${esito.richiesteCliente} in Richieste Clienti` : '',
            esito.scartate ? `${esito.scartate} scartate` : '',
          ].filter(Boolean);
          const riga = `Posta letta alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}: ${parti.join(' · ')}.`;
          setEsitoAuto(riga);
          await chiudiLetturaPosta(riga, true);
        } catch (e: any) {
          // ⚠️ Si DICE che non ha funzionato, e l'orologio torna indietro. Un
          // import automatico che fallisce in silenzio è peggio di nessun
          // import automatico: la casella sembra vuota e nessuno va a guardare.
          const riga = `Lettura automatica della posta non riuscita: ${e?.message ?? 'riprova col bottone'}.`;
          await rilasciaLetturaPosta(prima?.ultimo_tentativo ?? null).catch(() => undefined);
          await chiudiLetturaPosta(riga, false).catch(() => undefined);
          if (vivo) setEsitoAuto(riga);
        }
      })();
      return () => {
        vivo = false;
      };
    }, [carica]),
  );

  const dati = useMemo(() => leads.filter((l) => l.stato === statoFiltro), [leads, statoFiltro]);
  const nNuovi = leads.filter((l) => l.stato === 'nuovo').length;

  /** Tira dentro la posta della casella commerciale: ogni mail è una richiesta. */
  async function importaDallaMail() {
    if (importando) return;
    setImportando(true);
    try {
      const {
        lette,
        importate,
        scartate,
        automatiche,
        interne,
        mittentiScartati,
        trattativeAgganciate,
        trattativeConNegozioNuovo,
        rimasteInCoda,
        richiesteCliente,
        anagraficheCreate,
        anagraficheGiaPresenti,
        anagraficheNonScritte,
      } = await importaRichiesteDaMail();
      await carica();
      // ⚠️ Il taglio si DICHIARA. Un import che dice «0 nuove» dopo aver letto
      // 30 mail sembra un guasto; e un filtro silenzioso che un giorno taglia
      // un cliente vero non lo scopre nessuno. Si dice quante, perché, e da
      // quali indirizzi — le mail restano comunque nella casella.
      const perche = [
        automatiche ? `${automatiche} ${automatiche === 1 ? 'automatica' : 'automatiche'}` : '',
        interne ? `${interne} da noi` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const notaScarto = scartate
        ? `\n\nNon sono richieste e restano fuori: ${scartate} (${perche}).${
            mittentiScartati.length ? ` Da: ${mittentiScartati.join(', ')}.` : ''
          }`
        : '';
      // L'auto-qualifica si racconta: quante trattative sono nate da sole, su
      // chi, e quante richieste aspettano ancora una persona.
      const notaTrattative = importate
        ? [
            trattativeAgganciate ? `${trattativeAgganciate} su contatti già in rubrica` : '',
            trattativeConNegozioNuovo ? `${trattativeConNegozioNuovo} con negozio e contatto nuovi` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : '';
      const nate = trattativeAgganciate + trattativeConNegozioNuovo;
      // Il registro Anagrafiche: quante anagrafiche sono nate, quante c'erano
      // già, e — soprattutto — quante NON sono state scritte. L'ultimo numero
      // è quello che conta: quei negozi restano solo in Scout, e chi domani li
      // cerca nel registro non li trova.
      const notaRegistro = [
        anagraficheCreate ? `${anagraficheCreate} ${anagraficheCreate === 1 ? 'creata' : 'create'}` : '',
        anagraficheGiaPresenti ? `${anagraficheGiaPresenti} già presenti` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      avvisa(
        importate ? 'Richieste importate' : 'Nessuna nuova richiesta',
        (importate
          ? `${importate} nuove richieste dalla casella commerciale (su ${lette} mail lette).` +
            (nate ? `\n\nTrattative create in automatico: ${nate}${notaTrattative ? ` (${notaTrattative})` : ''}.` : '') +
            // La regola del binario, detta a chi importa: quelle di un cliente
            // non sono trattative e non stanno qui — sono lavoro da prezzare,
            // e vanno cercate in un'altra schermata. Se non lo si dice, chi
            // guarda pensa che si siano perse.
            (richiesteCliente
              ? `\n${richiesteCliente} ${richiesteCliente === 1 ? 'era di un cliente' : 'erano di clienti'}: ${richiesteCliente === 1 ? 'è finita' : 'sono finite'} in «Richieste Clienti» da prezzare, senza aprire una trattativa.`
              : '') +
            (notaRegistro ? `\nRegistro Anagrafiche: ${notaRegistro}.` : '') +
            (anagraficheNonScritte
              ? `\n⚠️ ${anagraficheNonScritte} ${anagraficheNonScritte === 1 ? 'negozio non è entrato' : 'negozi non sono entrati'} nel registro Anagrafiche: ${anagraficheNonScritte === 1 ? 'resta' : 'restano'} solo in Scout.`
              : '') +
            (rimasteInCoda ? `\n${rimasteInCoda} rimaste in coda da qualificare a mano.` : '')
          : `Nessuna mail nuova da importare: le ${lette} lette erano già in elenco o non sono richieste.`) + notaScarto,
      );
    } catch (e: any) {
      avvisa('Importazione non riuscita', e?.message ?? 'Riprova più tardi.');
    } finally {
      setImportando(false);
    }
  }

  // La mail aperta per intero (il testo salvato al momento dell'import).
  const [daLeggere, setDaLeggere] = useState<Lead | null>(null);

  // Il testo intero della mail aperta: si chiede ad AI Mail solo quando serve.
  const [corpo, setCorpo] = useState('');
  const [corpoStato, setCorpoStato] = useState<'fermo' | 'carico' | 'ok' | 'ripiego'>('fermo');
  const [corpoErrore, setCorpoErrore] = useState('');

  function apriMessaggio(l: Lead) {
    setDaLeggere(l);
    setCorpo('');
    setCorpoErrore('');
    const rif = l.mail_ref || l.mail_id;
    if (!rif) {
      // Richiesta inserita a mano: non c'è nessuna mail da andare a prendere.
      setCorpoStato('fermo');
      return;
    }
    setCorpoStato('carico');
    fetchCorpoMail(rif)
      .then((r) => {
        setCorpo(r.testo || '');
        setCorpoStato(r.testo ? 'ok' : 'ripiego');
      })
      .catch((e) => {
        setCorpoErrore((e as Error)?.message ?? '');
        setCorpoStato('ripiego');
      });
  }

  /** Elimina una richiesta: sparisce dalla coda, in tutti e tre i filtri. */
  function elimina(l: Lead) {
    conferma(
      'Eliminare la richiesta?',
      '«' + l.nome + '» sparisce dalla coda e non torna. La mail resta nella casella: qui si cancella solo la richiesta.',
      async () => {
        const prima = leads;
        setLeads((cur) => cur.filter((x) => x.id !== l.id));
        try {
          await eliminaLead(l.id);
        } catch (e) {
          // Se il server rifiuta, la riga TORNA: una lista che si accorcia da
          // sola fa credere fatta una cosa che non è successa.
          setLeads(prima);
          avvisa('Non eliminata', (e as Error)?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  async function scarta(l: Lead) {
    try {
      await scartaLead(l.id);
      carica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Operazione non riuscita.');
    }
  }

  const infoDaLeggere = daLeggere ? analizzaMessaggioLead(daLeggere.nome, daLeggere.messaggio) : null;

  // Da 900px in su la coda è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const colonne: ColonnaTabella<Lead>[] = [
    {
      chiave: 'persona',
      label: 'Chi',
      flex: 0.9,
      valore: (l) => analizzaMessaggioLead(l.nome, l.messaggio).persona || l.nome,
      cella: (l) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {analizzaMessaggioLead(l.nome, l.messaggio).persona || l.nome}
        </Text>
      ),
    },
    {
      chiave: 'contatto',
      label: 'Contatti',
      flex: 0.9,
      valore: (l) => {
        const i = analizzaMessaggioLead(l.nome, l.messaggio);
        return i.email || i.telefono || l.contatto || null;
      },
      cella: (l) => {
        const i = analizzaMessaggioLead(l.nome, l.messaggio);
        const email = i.email || (l.contatto?.includes('@') ? l.contatto : null);
        return (
          <View style={{ gap: 1 }}>
            {email ? (
              <Pressable onPress={(e: any) => { e?.stopPropagation?.(); Linking.openURL(`mailto:${email}`); }}>
                <Text style={styles.tabContatto} numberOfLines={1}>{email}</Text>
              </Pressable>
            ) : null}
            {i.telefono ? (
              <Pressable onPress={(e: any) => { e?.stopPropagation?.(); Linking.openURL(`tel:${i.telefono!.replace(/\s+/g, '')}`); }}>
                <Text style={styles.tabContatto} numberOfLines={1}>{i.telefono}</Text>
              </Pressable>
            ) : null}
            {!email && !i.telefono ? <Text style={styles.tabMuto}>—</Text> : null}
          </View>
        );
      },
    },
    {
      chiave: 'messaggio',
      label: 'Richiesta',
      flex: 1.6,
      righe: 2,
      valore: (l) => analizzaMessaggioLead(l.nome, l.messaggio).testo || l.messaggio || null,
    },
    { chiave: 'fonte', label: 'Fonte', width: 84, valore: (l) => l.fonte ?? null },
    {
      chiave: 'quando',
      label: 'Arrivata',
      width: 82,
      destra: true,
      numerica: true,
      valore: (l) => l.created_at,
      cella: (l) => {
        const eta = (Date.now() - new Date(l.created_at).getTime()) / 86_400_000;
        const ritardo = l.stato === 'nuovo' && eta >= GIORNI_RISPOSTA_LEAD;
        return (
          <Text style={[styles.tabData, ritardo && styles.tabRitardo]}>
            {dataBreve(l.created_at)}
          </Text>
        );
      },
    },
    {
      chiave: 'azioni',
      label: '',
      width: 210,
      fissa: true,
      valore: () => null,
      cella: (l) => (
        <View style={styles.tabAzioni}>
          {l.stato === 'nuovo' ? (
            <>
              <Pressable
                style={styles.tabBtn}
                onPress={(e: any) => { e?.stopPropagation?.(); setDaQualificare(l); }}
              >
                <Text style={styles.tabBtnTxt}>Qualifica</Text>
              </Pressable>
              <Pressable
                style={styles.tabBtnGhost}
                onPress={(e: any) => { e?.stopPropagation?.(); scarta(l); }}
              >
                <Text style={styles.tabBtnGhostTxt}>Scarta</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={styles.tabBtnGhost}
              onPress={(e: any) => { e?.stopPropagation?.(); router.push('/(app)/trattative'); }}
            >
              <Text style={styles.tabBtnGhostTxt}>Trattative</Text>
            </Pressable>
          )}
          {l.mail_ref ? (
            <Pressable
              hitSlop={6}
              onPress={(e: any) => { e?.stopPropagation?.(); Linking.openURL(urlMessaggioAiMail(l.mail_ref!)); }}
              accessibilityLabel="Apri in AI Mail"
              {...({ title: 'Apri in AI Mail' } as any)}
            >
              <Ionicons name="mail-open-outline" size={16} color={colors.grigio} />
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={6}
            onPress={(e: any) => { e?.stopPropagation?.(); elimina(l); }}
            accessibilityLabel="Elimina la richiesta"
            {...({ title: 'Elimina' } as any)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.errore} />
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.head, contenutoCentrato]}>
        <PageIntro testo="Le richieste arrivate dal web e dalla casella commerciale: qualificale agganciandole a un negozio — nasce la trattativa, canale web — oppure scartale. Rispondere entro 2 giorni: sul web chi tarda perde." />
        <Pressable style={[styles.btnImporta, importando && { opacity: 0.5 }]} disabled={importando} onPress={importaDallaMail}>
          <Ionicons name="mail-outline" size={15} color={colors.navy} />
          <Text style={styles.btnImportaTxt}>
            {importando ? 'Leggo la posta…' : 'Importa da commerciale@deluxy.it'}
          </Text>
        </Pressable>
        {esitoAuto ? <Text style={styles.esitoAuto}>{esitoAuto}</Text> : null}
        <View style={styles.chips}>
          {[
            { v: 'nuovo', label: `Nuovi${nNuovi ? ` (${nNuovi})` : ''}` },
            { v: 'qualificato', label: 'Qualificati' },
            { v: 'scartato', label: 'Scartati' },
          ].map((c) => (
            <Pressable key={c.v} onPress={() => setStatoFiltro(c.v)} style={[styles.chip, statoFiltro === c.v && styles.chipOn]}>
              <Text style={[styles.chipTxt, statoFiltro === c.v && styles.chipTxtOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        // In tabella la FlatList riceve UNA riga con l'intera coda.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(l: any) => (aTabella ? 'tabella' : (l as Lead).id)}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="globe-outline"
            titolo={statoFiltro === 'nuovo' ? 'Nessuna richiesta da qualificare' : 'Niente qui'}
            aiuto="Le richieste arrivano dal sito (via API) o si inseriscono col bottone +. Ogni richiesta qualificata diventa una trattativa sul canale web."
          />
        }
        renderItem={({ item }) => {
          if (aTabella) {
            return (
              <Tabella
                righe={item as Lead[]}
                colonne={colonne}
                chiaveRiga={(l) => l.id}
                ordineIniziale={{ campo: 'quando', verso: 'desc' }}
                // La riga apre la mail, ma solo se c'è davvero qualcosa da
                // leggere (stessa regola delle schede).
                onRiga={(l) => {
                  if (l.messaggio || l.mail_ref || l.mail_id) apriMessaggio(l);
                }}
                labelRiga={(l) => `Leggi la richiesta di ${analizzaMessaggioLead(l.nome, l.messaggio).persona || l.nome}`}
              />
            );
          }
          const lead = item as Lead;
          // La scheda intera apre la mail, ma solo se c'è davvero qualcosa da
          // leggere: le richieste inserite a mano non hanno mail, e un pop-up
          // vuoto è peggio di un clic che non fa niente.
          const leggibile = !!(lead.messaggio || lead.mail_ref || lead.mail_id);
          return (
            <LeadCard
              lead={lead}
              onApri={leggibile ? () => apriMessaggio(lead) : undefined}
              onQualifica={() => setDaQualificare(lead)}
              onScarta={() => scarta(lead)}
              onVediTrattativa={() => router.push('/(app)/trattative')}
              onApriAiMail={lead.mail_ref ? () => Linking.openURL(urlMessaggioAiMail(lead.mail_ref!)) : undefined}
              onElimina={() => elimina(lead)}
            />
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova richiesta</Text>
      </Pressable>

      {formAperto ? <NuovoLeadModal onClose={() => setFormAperto(false)} onSalvato={() => { setFormAperto(false); carica(); }} /> : null}

      {daLeggere ? (
        <Foglio
          titolo={infoDaLeggere?.persona || daLeggere.nome}
          sottotitolo={[infoDaLeggere?.email || daLeggere.contatto, infoDaLeggere?.telefono].filter(Boolean).join(' · ') || undefined}
          onClose={() => setDaLeggere(null)}
        >
          <ScrollView style={styles.corpoBox} contentContainerStyle={{ paddingBottom: 8 }}>
            {corpoStato === 'carico' ? (
              <Text style={styles.corpoAttesa}>Prendo il testo da AI Mail…</Text>
            ) : null}
            {/* Il testo intero se AI Mail lo dà; se no resta l'anteprima
                salvata all'import, che è meglio di niente ma è solo l'inizio. */}
            <Text style={styles.corpoMail} selectable>
              {corpo || daLeggere.messaggio || 'Nessun testo disponibile.'}
            </Text>
            {corpoStato === 'ripiego' ? (
              <Text style={styles.corpoNota}>
                Questo è l’estratto salvato all’import: il testo intero non è arrivato
                {corpoErrore ? ` (${corpoErrore})` : ''}.
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.azioniMail}>
            {daLeggere.mail_ref ? (
              <Pressable hitSlop={6} onPress={() => Linking.openURL(urlMessaggioAiMail(daLeggere.mail_ref!))}>
                <Text style={styles.azioneTxt}>Aprila in AI Mail</Text>
              </Pressable>
            ) : null}
            {daLeggere.stato === 'nuovo' ? (
              <>
                <Text style={styles.sep}>·</Text>
                <Pressable
                  hitSlop={6}
                  onPress={() => {
                    const l = daLeggere;
                    setDaLeggere(null);
                    setDaQualificare(l);
                  }}
                >
                  <Text style={styles.azioneTxt}>Qualifica</Text>
                </Pressable>
              </>
            ) : null}
            <Text style={styles.sep}>·</Text>
            <Pressable
              hitSlop={6}
              onPress={() => {
                const l = daLeggere;
                setDaLeggere(null);
                elimina(l);
              }}
            >
              <Text style={[styles.azioneTxt, styles.azionePericolo]}>Elimina</Text>
            </Pressable>
          </View>
        </Foglio>
      ) : null}

      {daQualificare ? (
        <QualificaLeadModal
          lead={daQualificare}
          onClose={() => setDaQualificare(null)}
          onFatto={(registro) => {
            setDaQualificare(null);
            carica();
            avvisa(
              'Trattativa aperta',
              `Richiesta qualificata: trova la trattativa (canale web) in Trattative.\n\n${frasePerIlRegistro(registro)}`,
            );
          }}
        />
      ) : null}
    </View>
  );
}

// ── Nuovo lead a mano ─────────────────────────────────────────────────────────
function NuovoLeadModal({ onClose, onSalvato }: { onClose: () => void; onSalvato: () => void }) {
  const [nome, setNome] = useState('');
  const [contatto, setContatto] = useState('');
  const [fonte, setFonte] = useState<FonteLead>('sito');
  const [messaggio, setMessaggio] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      await creaLead({ nome, contatto, fonte, messaggio });
      onSalvato();
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  return (
    // bloccaSfondo: un form scritto a metà non si chiude con un clic fuori.
    <Foglio titolo="Nuova richiesta" onClose={onClose} bloccaSfondo>
      <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.campoLabel}>Chi ci ha contattato</Text>
        <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="nome persona o azienda" placeholderTextColor={colors.grigio} autoFocus />
        <Text style={styles.campoLabel}>Contatto (email o telefono)</Text>
        <TextInput style={styles.input} value={contatto} onChangeText={setContatto} placeholder="es. maria@negozio.it" placeholderTextColor={colors.grigio} autoCapitalize="none" />
        <Text style={styles.campoLabel}>Fonte</Text>
        <View style={styles.chips}>
          {FONTI.map((f) => (
            <Pressable key={f.valore} onPress={() => setFonte(f.valore)} style={[styles.chip, fonte === f.valore && styles.chipOn]}>
              <Text style={[styles.chipTxt, fonte === f.valore && styles.chipTxtOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.campoLabel}>Cosa chiede</Text>
        <TextInput style={[styles.input, { minHeight: 60 }]} value={messaggio} onChangeText={setMessaggio} placeholder="es. preventivo consegne weekend" placeholderTextColor={colors.grigio} multiline />
        {errore ? <Text style={styles.errore}>{errore}</Text> : null}
      </ScrollView>
      <Pressable style={[styles.btn, styles.btnLargo, (!nome.trim() || salvando) && { opacity: 0.5 }]} disabled={!nome.trim() || salvando} onPress={salva}>
        <Text style={styles.btnTxt}>{salvando ? 'Salvo…' : 'Salva richiesta'}</Text>
      </Pressable>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabContatto: { color: colors.testo, fontSize: 12.5 },
  tabMuto: { color: colors.grigio, fontSize: 12.5 },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabRitardo: { color: colors.errore, fontWeight: '700' },
  tabAzioni: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  tabBtn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  tabBtnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12 },
  tabBtnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  tabBtnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12 },
  head: { padding: spacing.md, gap: spacing.sm },
  btnImporta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingVertical: 9 },
  btnImportaTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  esitoAuto: { color: colors.grigio, fontSize: 12, lineHeight: 16, marginTop: 6, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minHeight: touchMin, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 90 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, minHeight: touchMin },
  btnLargo: { marginTop: spacing.sm },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12.5 },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  campoLabel: { color: colors.testoSoft, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  input: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.testo, fontSize: 14 },
  errore: { color: colors.errore, fontSize: 13, fontWeight: '700' },
  corpoMail: { color: colors.testo, fontSize: 14.5, lineHeight: 23 },
  corpoBox: { maxHeight: 380, marginVertical: spacing.sm },
  corpoAttesa: { color: colors.testoSoft, fontSize: 13, marginBottom: 6 },
  corpoNota: { color: colors.testoSoft, fontSize: 12, marginTop: 10, fontStyle: 'italic' },
  azioniMail: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  azioneTxt: { color: colors.navy, fontSize: 12.5, fontWeight: '600' },
  azionePericolo: { color: colors.errore },
  sep: { color: colors.grigio, fontSize: 12 },
});
