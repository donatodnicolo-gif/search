// Affiliazioni: le attività della linea Re-seller (fioristi/pasticcerie) da reclutare
// come affiliati su deluxy.it. Per ciascuna: dati anagrafici, bottone "Chiama" (apre il
// telefono e registra la chiamata) e lo "step" di stato (i 7 valori del registro).
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  colors,
  coloreAffiliazione,
  labelAffiliazione,
  radius,
  spacing,
  contenutoCentrato,
  contenutoLargo,
} from '@/lib/theme';
import {
  aggiornaStarred,
  aggiornaStatoAffiliazione,
  fetchAffiliazioni,
  fetchProfiles,
  registraChiamata,
} from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { STATI_AFFILIAZIONE, type AffiliazioneRow, type StatoAffiliazione } from '@/types';
import { AnagraficaRegistroCard } from '@/components/AnagraficaRegistroCard';
import { TaskFormModal } from '@/components/TaskFormModal';
import { EmptyState, PageIntro } from '@/components/ui';
import { RicercaAffiliazioni } from '@/components/RicercaAffiliazioni';
import { CoperturaProvince } from '@/components/CoperturaProvince';
import { SegnalazioniCS } from '@/components/SegnalazioniCS';
import { frecciaOrdine, ordinaRighe, useOrdinamento } from '@/lib/ordinamento';
import { PannelloFiltri } from '@/components/PannelloFiltri';

type FiltroAff = StatoAffiliazione | 'tutti' | 'selezionati';

const FILTRI: FiltroAff[] = ['tutti', 'selezionati', ...STATI_AFFILIAZIONE];

function etichettaFiltro(f: FiltroAff, nSel: number): string {
  if (f === 'tutti') return 'Tutti';
  if (f === 'selezionati') return `Selezionati${nSel ? ` (${nSel})` : ''}`;
  return labelAffiliazione[f];
}

function quando(iso: string | null): string {
  if (!iso) return 'mai chiamato';
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (giorni <= 0) return 'chiamato oggi';
  if (giorni === 1) return 'chiamato ieri';
  if (giorni < 30) return `chiamato ${giorni} giorni fa`;
  return `chiamato ${Math.floor(giorni / 30)} mesi fa`;
}

/**
 * La categoria, scritta in un modo solo.
 *
 * ⚠️ Nei dati veri convivono «fioraio» (137) e «FIORISTA» (16), «pasticceria»
 * (115) e «PASTICCERIA» (6): sono lo stesso mestiere scritto da due import
 * diversi. Senza questa normalizzazione la colonna mostra quattro categorie
 * dove ce ne sono due, e ordinandola i fioristi finiscono in due blocchi
 * lontani. È la stessa trappola di «Gifting» / «Regali aziendali».
 */
function categoriaLeggibile(c: string | null | undefined): string {
  const s = (c ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('fior')) return 'Fioraio';
  if (s.startsWith('pastic')) return 'Pasticceria';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Le colonne ordinabili della tabella. */
type ColonnaAff =
  | 'nome'
  | 'categoria'
  | 'zona'
  | 'referente'
  | 'telefono'
  | 'stato_affiliazione'
  | 'segnalato'
  | 'ultima_chiamata';

/**
 * Da chi è stato segnalato il negozio.
 *
 * ⚠️ Misurato il 21/08/2026: su **223 affiliazioni, ZERO hanno `creato_da`** —
 * nessuna l'ha scelta una persona. 199 arrivano dall'import del registro
 * Anagrafiche e 23 dalla scoperta Google. Quindi la colonna dice quasi sempre
 * «Registro»: è la verità, ed è un'informazione (nessuno ci ha ancora messo
 * mano), non un buco. Il giorno che qualcuno aggiunge un negozio con la ⭐ o
 * col +, lì comparirà il suo nome.
 */
function segnalatoDa(r: AffiliazioneRow, nomi: Map<string, string>): string {
  if (r.creato_da) return nomi.get(r.creato_da) ?? 'un venditore';
  if (r.source === 'anagrafiche') return 'Registro';
  if (r.source === 'google') return 'Ricerca Google';
  if (r.source === 'manual') return 'Inserito a mano';
  return '—';
}

/** «17 lug» — qui serve capire quanto è vecchia la segnalazione, non l'ora. */
function dataBreve(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

export default function Affiliazioni() {
  const [righe, setRighe] = useState<AffiliazioneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<FiltroAff>('tutti');
  // Due modi di lavorare le affiliazioni: l'ELENCO di quelle già censite e la
  // RICERCA sul territorio (scoperta Google) per trovarne di nuove.
  const [tab, setTab] = useState<'elenco' | 'ricerca' | 'copertura' | 'segnalati'>('elenco');
  // Aperta da un preferito del menu (?lat&lng&indirizzo): vai alla Ricerca, centrata lì.
  const params = useLocalSearchParams<{ lat?: string; lng?: string; indirizzo?: string; cerca?: string }>();
  const centroIniziale = useMemo(() => {
    const lat = parseFloat(String(params.lat ?? ''));
    const lng = parseFloat(String(params.lng ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, indirizzo: String(params.indirizzo ?? '') };
  }, [params.lat, params.lng, params.indirizzo]);
  useEffect(() => {
    if (centroIniziale) setTab('ricerca');
  }, [centroIniziale]);

  // Arrivo da /province (o da un link salvato) con una provincia già in mano.
  useEffect(() => {
    if (params.cerca) setQuery(String(params.cerca));
  }, [params.cerca]);
  const nSel = useMemo(() => righe.filter((r) => r.starred).length, [righe]);
  // TABELLA sopra i 900px, SCHEDE sotto. Non è un vezzo: sette colonne su uno
  // schermo da telefono diventano illeggibili, e in questa app la regola è che
  // il nome non si tronca mai. La soglia è la stessa oltre la quale i filtri
  // stanno già aperti (components/PannelloFiltri.tsx).
  const { width } = useWindowDimensions();
  const tabella = width >= 900;
  const router = useRouter();
  // «Quando lo chiamo»: si fissa in AGENDA, non in un campo isolato. Il
  // Calendario di Scout legge i **task con scadenza** (più i follow-up delle
  // trattative), quindi la data di una chiamata è un task datato sul negozio:
  // compare in Calendario, in «Da fare» e nella Home senza aggiungere nulla al
  // database. Un campo nuovo, invece, sarebbe rimasto una data che non guarda
  // nessuno.
  const [daPianificare, setDaPianificare] = useState<AffiliazioneRow | null>(null);
  // Ordinamento della tabella. Di default per nome: è come si cerca un negozio
  // in un elenco, e non suggerisce una priorità che non c'è.
  const { ordine, ordinaPer } = useOrdinamento<ColonnaAff>({ campo: 'nome', verso: 'asc' }, ['ultima_chiamata']);
  // owner → nome, per scrivere CHI ha segnalato invece di un uuid. Tollerante:
  // se la tabella profiles non risponde restano i nomi di ripiego.
  const [nomi, setNomi] = useState<Map<string, string>>(new Map());

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setRighe(await fetchAffiliazioni());
      fetchProfiles()
        .then((ps) => setNomi(new Map(ps.map((p) => [p.id, p.nome ?? p.email ?? 'venditore']))))
        .catch(() => {});
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
   * Chi è GIÀ cliente non sta in questo elenco.
   *
   * Qui si telefona per **affiliare** un negozio: un cliente è già dall'altra
   * parte, e vederlo in mezzo alla lista delle chiamate da fare fa perdere
   * tempo due volte — una a leggerlo, una a capire se bisogna chiamarlo.
   * Richiesta dell'utente (21/08/2026): «quelli già clienti non servono qui».
   *
   * Si guardano tutte e tre le colonne perché lo «attivo» può arrivare dal
   * registro (`anagrafiche_stato`), da Scout (`stato_affiliazione`) o dallo
   * stato del negozio (`stato = 'cliente'`, che lo scrive l'esito di una visita).
   */
  const eCliente = (r: AffiliazioneRow) =>
    r.stato === 'cliente' || r.stato_affiliazione === 'attivo' || r.anagrafiche_stato === 'attivo';
  const clientiFuori = useMemo(() => righe.filter(eCliente).length, [righe]);

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    return righe.filter((r) => {
      if (eCliente(r)) return false;
      if (filtro === 'selezionati') { if (!r.starred) return false; }
      else if (filtro !== 'tutti' && r.stato_affiliazione !== filtro) return false;
      if (!q) return true;
      return [r.nome, categoriaLeggibile(r.categoria), r.indirizzo, r.zona, r.referente, r.telefono, segnalatoDa(r, nomi)]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [righe, query, filtro, nomi]);

  const datiOrdinati = useMemo(
    () =>
      ordinaRighe(dati, ordine, (r, c) => {
        if (c === 'segnalato') return segnalatoDa(r, nomi);
        if (c === 'categoria') return categoriaLeggibile(r.categoria);
        if (c === 'stato_affiliazione') return labelAffiliazione[r.stato_affiliazione ?? 'prospect'];
        return (r as any)[c];
      }),
    [dati, ordine, nomi],
  );

  async function chiama(r: AffiliazioneRow) {
    if (!r.telefono) {
      avvisa('Nessun numero', 'Questa affiliazione non ha un telefono in rubrica.');
      return;
    }
    // Registra la chiamata (best-effort) e apri il dialer.
    registraChiamata(r.id).then(carica).catch(() => {});
    const tel = r.telefono.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${tel}`).catch(() =>
      avvisa('Impossibile chiamare', 'Compone il numero manualmente: ' + r.telefono),
    );
  }

  async function cambiaStato(r: AffiliazioneRow, stato: StatoAffiliazione) {
    setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, stato_affiliazione: stato } : x)));
    try {
      await aggiornaStatoAffiliazione(r.id, stato);
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Stato non salvato.');
      carica();
    }
  }

  // Seleziona/deseleziona l'affiliazione da contattare (stesso flag della stella in mappa).
  async function seleziona(r: AffiliazioneRow) {
    const nuovo = !r.starred;
    setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, starred: nuovo } : x)));
    try {
      await aggiornaStarred(r.id, nuovo);
    } catch {
      setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, starred: r.starred } : x)));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {([
          { v: 'elenco' as const, label: 'Elenco', icona: 'list-outline' as const },
          { v: 'ricerca' as const, label: 'Ricerca', icona: 'map-outline' as const },
          // Terza scheda: «dove non abbiamo nessuno». Sta qui in cima e non più
          // in un pannello dentro la testata dell'elenco — lì rubava una riga a
          // tutti, anche a chi era venuto solo per telefonare, e i suoi dati
          // (registro + venduto) si caricano solo quando la scheda si apre.
          { v: 'copertura' as const, label: 'Copertura', icona: 'grid-outline' as const },
          // Quarta scheda: chi ci ha già segnalato l'app fornitori. Stanno qui
          // perché sono la stessa cosa dell'elenco — fioristi e pasticcerie da
          // agganciare — solo che li ha trovati un'altra app invece di noi.
          { v: 'segnalati' as const, label: 'Segnalazioni CS', icona: 'megaphone-outline' as const },
        ]).map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={[styles.tab, tab === t.v && styles.tabOn]}>
            <Ionicons name={t.icona} size={15} color={tab === t.v ? colors.bianco : colors.testo} />
            <Text style={[styles.tabTxt, tab === t.v && styles.tabTxtOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'segnalati' ? (
        <SegnalazioniCS />
      ) : tab === 'copertura' ? (
        <ScrollView style={styles.container} contentContainerStyle={[styles.list, contenutoLargo]}>
          <Text style={styles.coperturaAiuto}>
            Tutte e 107 le province, comprese quelle dove non abbiamo nessuno: sono il motivo per cui la
            schermata esiste. Tocca una provincia — il suo nome finisce nella ricerca e torni all’elenco
            già filtrato.
          </Text>
          <CoperturaProvince
            onProvincia={(nome) => {
              setQuery(nome);
              setTab('elenco');
            }}
          />
        </ScrollView>
      ) : tab === 'ricerca' ? (
        <RicercaAffiliazioni onPreso={carica} centroIniziale={centroIniziale} />
      ) : (
      <>
      <FlatList
        data={datiOrdinati}
        keyExtractor={(r) => r.id}
        // ⚠️ Senza questi la lista disegnava **tutte** le 222 righe in un colpo,
        // e ogni riga ha una decina di elementi premibili: sul web sono
        // migliaia di nodi costruiti prima che compaia qualcosa. Segnalato
        // dall'utente («è molto lento», 23/08/2026). Ora ne prepara 15 e va
        // avanti mentre si scorre.
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={[styles.list, tabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        // Intro, ricerca e filtri scorrono con la lista: da fissi lasciavano
        // alle affiliazioni una striscia di schermo. Elemento e non funzione,
        // se no la ricerca perde il fuoco a ogni lettera.
        ListHeaderComponent={
          <View style={[styles.head, styles.headerScroll, tabella ? contenutoLargo : contenutoCentrato]}>
            <PageIntro testo="Fioristi e pasticcerie da reclutare come affiliati. La stella li mette tra i Selezionati da contattare; Chiama registra la chiamata e apre il telefono." />
            <Text style={styles.sub}>
              {righe.length - clientiFuori} da reclutare · fioristi e pasticcerie
              {clientiFuori
                ? ` · ${clientiFuori} già clienti, tenuti fuori`
                : ''}
            </Text>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Cerca per nome, città, referente…"
              placeholderTextColor={colors.grigio}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {/* Dietro un bottone: aperti, i 10 filtri occupavano mezza schermata. */}
            <PannelloFiltri
              attivi={filtro === 'tutti' ? 0 : 1}
              onAzzera={() => setFiltro('tutti')}
            >
              <View style={styles.filtri}>
                {FILTRI.map((f) => (
                  <Pressable key={f} onPress={() => setFiltro(f)} style={[styles.chip, filtro === f && styles.chipOn]}>
                    <Text style={[styles.chipTxt, filtro === f && styles.chipTxtOn]}>
                      {etichettaFiltro(f, nSel)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </PannelloFiltri>
            {tabella ? <Intestazione ordine={ordine} ordinaPer={ordinaPer} /> : null}
          </View>
        }
        ListFooterComponent={tabella && dati.length ? <Chiusura /> : null}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="git-network-outline"
            titolo="Nessuna affiliazione qui"
            aiuto="Prova ad azzerare i filtri o la ricerca. Le affiliazioni sono i negozi della linea Re-seller importati dal registro."
          />
        }
        renderItem={({ item }) =>
          tabella ? (
            <Riga
              item={item}
              onChiama={() => chiama(item)}
              onStato={(s) => cambiaStato(item, s)}
              onSeleziona={() => seleziona(item)}
              onApri={() => router.push(`/(app)/attivita/${item.id}`)}
              onPianifica={() => setDaPianificare(item)}
              segnalato={segnalatoDa(item, nomi)}
            />
          ) : (
            <Card
              item={item}
              onChiama={() => chiama(item)}
              onStato={(s) => cambiaStato(item, s)}
              onSeleziona={() => seleziona(item)}
              onApri={() => router.push(`/(app)/attivita/${item.id}`)}
              onPianifica={() => setDaPianificare(item)}
              segnalato={segnalatoDa(item, nomi)}
            />
          )
        }
      />
      </>
      )}

      {daPianificare ? (
        <TaskFormModal
          placeId={daPianificare.id}
          placeNome={daPianificare.nome}
          titoloIniziale={`Chiamare ${daPianificare.nome}`}
          onClose={() => setDaPianificare(null)}
          onSalvato={() => {
            setDaPianificare(null);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * La stessa affiliazione, in riga di tabella (schermi larghi).
 *
 * Stile secondo il design system, §Tabelle: la tabella sta DENTRO una card (le
 * righe portano i bordi laterali, l'intestazione chiude in alto e una riga di
 * chiusura in basso), intestazioni non urlate (12px, peso 500, terziario:
 * niente maiuscolo spaziato), divisori hairline, hover appena percettibile,
 * celle vuote «—», stato come pillola con dot e tinta al 10%.
 *
 * La riga si apre al clic: porta alla scheda del negozio.
 *
 * ⚠️ Le colonne non tolgono NIENTE alla scheda: stella, telefono, referente,
 * stato modificabile, registro Anagrafiche, e in più il calendario per fissare
 * la chiamata. Su una tabella la tentazione è togliere le azioni per far
 * entrare le colonne: qui si stringe la cornice, non ciò che si può fare.
 */
const Riga = memo(function Riga({
  item,
  onChiama,
  onStato,
  onSeleziona,
  onApri,
  onPianifica,
  segnalato,
}: {
  item: AffiliazioneRow;
  onChiama: () => void;
  onStato: (s: StatoAffiliazione) => void;
  onSeleziona: () => void;
  onApri: () => void;
  onPianifica: () => void;
  segnalato: string;
}) {
  const [apriStep, setApriStep] = useState(false);
  const [apriRegistro, setApriRegistro] = useState(false);
  const stato = item.stato_affiliazione ?? 'prospect';
  const colore = coloreAffiliazione[stato];
  // Le azioni dentro la riga non devono far scattare anche l'apertura della
  // scheda: sul web l'evento risale, quindi lo si ferma qui.
  const solo = (fn: () => void) => (e?: any) => {
    e?.stopPropagation?.();
    fn();
  };
  return (
    <View style={[styles.trWrap, item.starred && styles.trSel]}>
      <Pressable
        style={({ hovered }: any) => [styles.tr, hovered && styles.trHover]}
        onPress={onApri}
        accessibilityRole="button"
        accessibilityLabel={`Apri la scheda di ${item.nome}`}
      >
        <Pressable
          style={[styles.tdStella, item.starred && styles.stellaOn]}
          onPress={solo(onSeleziona)}
          hitSlop={6}
          accessibilityLabel={item.starred ? 'Togli dai selezionati' : 'Seleziona da contattare'}
        >
          <Ionicons
            name={item.starred ? 'star' : 'star-outline'}
            size={15}
            color={item.starred ? colors.bianco : colors.grigio}
          />
        </Pressable>

        <View style={styles.tdNome}>
          <Text style={styles.nomeTab}>{item.nome}</Text>
          {item.indirizzo ? (
            <Text style={styles.metaLeggero} numberOfLines={1}>
              {item.indirizzo}
            </Text>
          ) : null}
        </View>

        {/* Fiorista o pasticceria: è la prima cosa da sapere prima di chiamare,
            e finora si poteva solo indovinarla dal nome. */}
        <Text style={styles.tdCategoria} numberOfLines={1}>
          {categoriaLeggibile(item.categoria) || '—'}
        </Text>

        <Text style={styles.tdCitta} numberOfLines={1}>
          {item.zona || '—'}
        </Text>

        <Text style={styles.tdRef} numberOfLines={1}>
          {item.referente || '—'}
        </Text>

        <View style={styles.tdTel}>
          {item.telefono ? (
            <Pressable onPress={solo(onChiama)} hitSlop={4}>
              <Text style={styles.telTab} numberOfLines={1}>
                {item.telefono}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.cellaVuota}>—</Text>
          )}
        </View>

        <View style={styles.tdStato}>
          <Pressable
            style={[styles.pill, { backgroundColor: colore + '1A' }]}
            onPress={solo(() => setApriStep((v) => !v))}
            accessibilityLabel={`Stato: ${labelAffiliazione[stato]}. Tocca per cambiarlo`}
          >
            <View style={[styles.dot, { backgroundColor: colore }]} />
            <Text style={[styles.pillTxt, { color: colore }]} numberOfLines={1}>
              {labelAffiliazione[stato]}
            </Text>
            <Ionicons name={apriStep ? 'chevron-up' : 'chevron-down'} size={11} color={colore} />
          </Pressable>
        </View>

        {/* Da chi è arrivato e quando: due dati che stanno insieme — «Registro
            · 17 lug» si legge in un colpo, su due colonne no. */}
        <View style={styles.tdSegnalato}>
          <Text style={styles.segnalatoTxt} numberOfLines={1}>
            {segnalato}
          </Text>
          {item.created_at ? (
            <Text style={styles.metaLeggero} numberOfLines={1}>
              {dataBreve(item.created_at)}
            </Text>
          ) : null}
        </View>

        <Text style={styles.tdQuando} numberOfLines={1}>
          {quando(item.ultima_chiamata)}
        </Text>

        <View style={styles.tdAzioni}>
          <Pressable
            style={[styles.btnChiamaTab, !item.telefono && styles.btnChiamaOff]}
            onPress={solo(onChiama)}
            accessibilityLabel={`Chiama ${item.nome}`}
          >
            <Ionicons name="call-outline" size={13} color={colors.bianco} />
          </Pressable>
          <Pressable
            onPress={solo(onPianifica)}
            hitSlop={6}
            accessibilityLabel={`Fissa in agenda quando chiamare ${item.nome}`}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.grigio} />
          </Pressable>
          <Pressable
            onPress={solo(() => setApriRegistro((v) => !v))}
            hitSlop={6}
            accessibilityLabel="Dati dal registro Anagrafiche"
          >
            <Ionicons name="library-outline" size={16} color={apriRegistro ? colors.oro : colors.grigio} />
          </Pressable>
        </View>
      </Pressable>

      {apriStep ? (
        <View style={styles.stepWrapTab}>
          {STATI_AFFILIAZIONE.map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                onStato(s);
                setApriStep(false);
              }}
              style={[
                styles.stepChip,
                s === stato && { borderColor: coloreAffiliazione[s], backgroundColor: coloreAffiliazione[s] + '18' },
              ]}
            >
              <Text style={[styles.stepTxt, s === stato && styles.stepTxtOn]}>{labelAffiliazione[s]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {apriRegistro ? (
        <View style={styles.registroTab}>
          <AnagraficaRegistroCard nome={item.nome} citta={item.zona} compatta />
        </View>
      ) : null}
    </View>
  );
});

/**
 * Intestazione della tabella: chiude la card in alto e scorre con l'elenco — in
 * questa app c'è una sola area che scorre.
 */
function Intestazione({
  ordine,
  ordinaPer,
}: {
  ordine: { campo: ColonnaAff; verso: 'asc' | 'desc' };
  ordinaPer: (c: ColonnaAff) => void;
}) {
  const col: { c: ColonnaAff; label: string; stile: any }[] = [
    { c: 'nome', label: 'Negozio', stile: styles.tdNome },
    { c: 'categoria', label: 'Categoria', stile: styles.tdCategoria },
    { c: 'zona', label: 'Città', stile: styles.tdCitta },
    { c: 'referente', label: 'Referente', stile: styles.tdRef },
    { c: 'telefono', label: 'Telefono', stile: styles.tdTel },
    { c: 'stato_affiliazione', label: 'Stato', stile: styles.tdStato },
    { c: 'segnalato', label: 'Segnalato da', stile: styles.tdSegnalato },
    { c: 'ultima_chiamata', label: 'Ultima chiamata', stile: styles.tdQuando },
  ];
  return (
    <View style={styles.th}>
      <Text style={[styles.thTxt, styles.tdStella]}> </Text>
      {col.map((h) => (
        <Pressable key={h.c} style={h.stile} onPress={() => ordinaPer(h.c)}>
          <Text style={[styles.thTxt, ordine.campo === h.c && styles.thAttiva]} numberOfLines={1}>
            {h.label}
            {frecciaOrdine(ordine, h.c)}
          </Text>
        </Pressable>
      ))}
      <Text style={[styles.thTxt, styles.tdAzioni]}> </Text>
    </View>
  );
}

/** Chiude la card della tabella in basso: bordi e angoli arrotondati. */
function Chiusura() {
  return <View style={styles.tfoot} />;
}

function Card({
  item,
  onChiama,
  onStato,
  onSeleziona,
  onApri,
  onPianifica,
  segnalato,
}: {
  item: AffiliazioneRow;
  onChiama: () => void;
  onStato: (s: StatoAffiliazione) => void;
  onSeleziona: () => void;
  onApri: () => void;
  onPianifica: () => void;
  segnalato: string;
}) {
  const [apriStep, setApriStep] = useState(false);
  const [apriRegistro, setApriRegistro] = useState(false);
  const stato = item.stato_affiliazione ?? 'prospect';
  return (
    <View style={[styles.card, item.starred && styles.cardSel]}>
      <View style={styles.cardTop}>
        {/* Selettore "da contattare": stella → Selezionati (stesso flag della Mappa). */}
        <Pressable
          style={[styles.selBtn, item.starred && styles.selBtnOn]}
          onPress={onSeleziona}
          hitSlop={8}
          accessibilityLabel={item.starred ? 'Togli dai selezionati' : 'Seleziona da contattare'}
        >
          <Ionicons name={item.starred ? 'star' : 'star-outline'} size={18} color={item.starred ? colors.bianco : colors.grigio} />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={onApri} accessibilityLabel={`Apri la scheda di ${item.nome}`}>
          <Text numberOfLines={3} style={styles.nome}>{item.nome}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[categoriaLeggibile(item.categoria), item.indirizzo].filter(Boolean).join(' · ') || '—'}
          </Text>
          {item.telefono ? (
            <Pressable onPress={onChiama} hitSlop={6}>
              <Text style={styles.tel}>
                <Ionicons name="call" size={12} color={colors.successo} /> {item.telefono}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.metaLeggero}>Nessun numero in rubrica</Text>
          )}
          <View style={styles.refRow}>
            {item.referente ? <Text style={styles.meta}>{item.referente}</Text> : null}
            <Text style={styles.metaLeggero}>· {quando(item.ultima_chiamata)}</Text>
          </View>
          <Text style={styles.metaLeggero} numberOfLines={1}>
            Segnalato da {segnalato}
            {item.created_at ? ` · ${dataBreve(item.created_at)}` : ''}
          </Text>
        </Pressable>
        <Pressable
          onPress={onPianifica}
          hitSlop={8}
          style={styles.calBtn}
          accessibilityLabel={`Fissa in agenda quando chiamare ${item.nome}`}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.grigio} />
        </Pressable>
        <Pressable style={[styles.btnChiama, !item.telefono && styles.btnChiamaOff]} onPress={onChiama}>
          <Ionicons name="call-outline" size={16} color={colors.bianco} />
          <Text style={styles.btnChiamaTxt}>Chiama</Text>
        </Pressable>
      </View>

      {/* Step: stato corrente → tap per espandere e cambiarlo. */}
      <Pressable style={styles.statoRow} onPress={() => setApriStep((v) => !v)}>
        <View style={[styles.dot, { backgroundColor: coloreAffiliazione[stato] }]} />
        <Text style={styles.statoTxt}>
          Stato: {labelAffiliazione[stato]}
          {!apriStep ? <Text style={styles.statoHint}>  ·  tocca per cambiare</Text> : null}
        </Text>
        <Ionicons name={apriStep ? 'chevron-up' : 'chevron-down'} size={15} color={colors.grigio} />
      </Pressable>
      {apriStep ? (
        <View style={styles.stepWrap}>
          {STATI_AFFILIAZIONE.map((s) => (
            <Pressable
              key={s}
              onPress={() => { onStato(s); setApriStep(false); }}
              style={[styles.stepChip, s === stato && { borderColor: coloreAffiliazione[s], backgroundColor: coloreAffiliazione[s] }]}
            >
              <Text style={[styles.stepTxt, s === stato && styles.stepTxtOn]}>{labelAffiliazione[s]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Dati LIVE dal registro Anagrafiche (stato, interessi, referenti) — on demand. */}
      <Pressable style={styles.statoRow} onPress={() => setApriRegistro((v) => !v)}>
        <Ionicons name="library-outline" size={15} color={colors.oro} />
        <Text style={styles.statoTxt}>Registro Anagrafiche</Text>
        <Ionicons name={apriRegistro ? 'chevron-up' : 'chevron-down'} size={15} color={colors.grigio} />
      </Pressable>
      {apriRegistro ? <AnagraficaRegistroCard nome={item.nome} citta={item.zona} compatta /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Tabella (schermi larghi) — design system §Tabelle ─────────────────────
  // La tabella sta dentro una card: l'intestazione la chiude in alto, le righe
  // portano i bordi laterali, `tfoot` la chiude in basso. Le colonne hanno
  // `flex` + `minWidth`: senza il minimo, a 900px il telefono si riduce a tre
  // caratteri e la colonna diventa decorativa.
  th: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: spacing.sm,
  },
  // 12px, peso 500, terziario: l'intestazione si legge, non si urla.
  thTxt: { color: colors.grigio, fontSize: 12, fontWeight: '500' },
  thAttiva: { color: colors.testo, fontWeight: '700' },
  trWrap: {
    backgroundColor: colors.bianco,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.hairline,
  },
  // Selezionato: tinta appena accennata + filo oro a sinistra, non un blocco
  // di colore che copre la riga.
  trSel: { backgroundColor: colors.goldSoft, borderLeftWidth: 3, borderLeftColor: colors.gold },
  tr: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 11 },
  trHover: { backgroundColor: colors.fill },
  tfoot: {
    height: spacing.sm,
    backgroundColor: colors.bianco,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.hairline,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    marginBottom: spacing.md,
  },
  tdStella: { width: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 4 },
  stellaOn: { backgroundColor: colors.gold },
  tdNome: { flex: 2.4, minWidth: 130 },
  tdCategoria: { flex: 1.1, minWidth: 80, color: colors.testoSoft, fontSize: 13 },
  nomeTab: { color: colors.testo, fontWeight: '600', fontSize: 14, letterSpacing: -0.1 },
  tdCitta: { flex: 1, minWidth: 70, color: colors.testoSoft, fontSize: 13 },
  tdRef: { flex: 1.2, minWidth: 88, color: colors.testoSoft, fontSize: 13 },
  tdTel: { flex: 1.3, minWidth: 100 },
  telTab: { color: colors.testo, fontSize: 13, fontVariant: ['tabular-nums'] },
  cellaVuota: { color: colors.grigio, fontSize: 13 },
  tdStato: { flex: 1.5, minWidth: 122, flexDirection: 'row', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillTxt: { fontSize: 12, fontWeight: '600', maxWidth: 108 },
  // Le date a destra e con cifre a larghezza fissa: incolonnate si confrontano
  // con l'occhio, non leggendole una per una.
  tdQuando: {
    flex: 1.1,
    minWidth: 80,
    color: colors.testoSoft,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  tdSegnalato: { flex: 1.2, minWidth: 92 },
  segnalatoTxt: { color: colors.testoSoft, fontSize: 13 },
  tdAzioni: { width: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  btnChiamaTab: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepWrapTab: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.md, paddingBottom: 10 },
  registroTab: { paddingHorizontal: spacing.md, paddingBottom: 10 },
  calBtn: { padding: 4, alignSelf: 'flex-start' },
  coperturaAiuto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabTxt: { color: colors.testo, fontWeight: '700', fontSize: 13 },
  tabTxtOn: { color: colors.bianco },
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { paddingTop: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, backgroundColor: colors.sfondo },
  sub: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  search: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  // A capo invece che in scorrimento orizzontale: cosi' si vedono tutti i
  // filtri, prima l'ultimo restava tagliato fuori schermo ("In att…").
  filtri: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 6 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm },
  // Annulla il padding del contenitore della lista attorno alla testata.
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  cardSel: { borderColor: colors.oro, backgroundColor: colors.goldSoft },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  selBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: colors.grigioChiaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  selBtnOn: { backgroundColor: colors.oro, borderColor: colors.oro },
  nome: { fontSize: 16, fontWeight: '800', color: colors.navy },
  meta: { color: colors.testoSoft, fontSize: 13 },
  metaLeggero: { color: colors.grigio, fontSize: 12 },
  tel: { color: colors.successo, fontSize: 14, fontWeight: '700', marginTop: 3 },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  btnChiama: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnChiamaOff: { opacity: 0.55 },
  btnChiamaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13 },
  statoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statoTxt: { flex: 1, color: colors.navy, fontWeight: '600', fontSize: 13 },
  statoHint: { color: colors.grigio, fontWeight: '400', fontSize: 11 },
  stepWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  stepChip: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.sfondo,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  stepTxt: { color: colors.navy, fontWeight: '600', fontSize: 12 },
  stepTxtOn: { color: colors.bianco },
});
