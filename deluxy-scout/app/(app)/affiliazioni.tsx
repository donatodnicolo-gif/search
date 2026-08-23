// Affiliazioni: le attività della linea Re-seller (fioristi/pasticcerie) da reclutare
// come affiliati su deluxy.it. Per ciascuna: dati anagrafici, bottone "Chiama" (apre il
// telefono e registra la chiamata) e lo "step" di stato (i 7 valori del registro).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
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
import { aggiornaStarred, aggiornaStatoAffiliazione, fetchAffiliazioni, registraChiamata } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { STATI_AFFILIAZIONE, type AffiliazioneRow, type StatoAffiliazione } from '@/types';
import { AnagraficaRegistroCard } from '@/components/AnagraficaRegistroCard';
import { TaskFormModal } from '@/components/TaskFormModal';
import { EmptyState, PageIntro } from '@/components/ui';
import { RicercaAffiliazioni } from '@/components/RicercaAffiliazioni';
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

export default function Affiliazioni() {
  const [righe, setRighe] = useState<AffiliazioneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<FiltroAff>('tutti');
  // Due modi di lavorare le affiliazioni: l'ELENCO di quelle già censite e la
  // RICERCA sul territorio (scoperta Google) per trovarne di nuove.
  const [tab, setTab] = useState<'elenco' | 'ricerca'>('elenco');
  // Aperta da un preferito del menu (?lat&lng&indirizzo): vai alla Ricerca, centrata lì.
  const params = useLocalSearchParams<{ lat?: string; lng?: string; indirizzo?: string }>();
  const centroIniziale = useMemo(() => {
    const lat = parseFloat(String(params.lat ?? ''));
    const lng = parseFloat(String(params.lng ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, indirizzo: String(params.indirizzo ?? '') };
  }, [params.lat, params.lng, params.indirizzo]);
  useEffect(() => {
    if (centroIniziale) setTab('ricerca');
  }, [centroIniziale]);
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

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setRighe(await fetchAffiliazioni());
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
      return [r.nome, r.indirizzo, r.zona, r.referente, r.telefono]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [righe, query, filtro]);

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
        ]).map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={[styles.tab, tab === t.v && styles.tabOn]}>
            <Ionicons name={t.icona} size={15} color={tab === t.v ? colors.bianco : colors.testo} />
            <Text style={[styles.tabTxt, tab === t.v && styles.tabTxtOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'ricerca' ? (
        <RicercaAffiliazioni onPreso={carica} centroIniziale={centroIniziale} />
      ) : (
      <>
      <FlatList
        data={dati}
        keyExtractor={(r) => r.id}
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
            {tabella ? <Intestazione /> : null}
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
            />
          ) : (
            <Card
              item={item}
              onChiama={() => chiama(item)}
              onStato={(s) => cambiaStato(item, s)}
              onSeleziona={() => seleziona(item)}
              onApri={() => router.push(`/(app)/attivita/${item.id}`)}
              onPianifica={() => setDaPianificare(item)}
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
function Riga({
  item,
  onChiama,
  onStato,
  onSeleziona,
  onApri,
  onPianifica,
}: {
  item: AffiliazioneRow;
  onChiama: () => void;
  onStato: (s: StatoAffiliazione) => void;
  onSeleziona: () => void;
  onApri: () => void;
  onPianifica: () => void;
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
}

/**
 * Intestazione della tabella: chiude la card in alto e scorre con l'elenco — in
 * questa app c'è una sola area che scorre.
 */
function Intestazione() {
  return (
    <View style={styles.th}>
      <Text style={[styles.thTxt, styles.tdStella]}> </Text>
      <Text style={[styles.thTxt, styles.tdNome]}>Negozio</Text>
      <Text style={[styles.thTxt, styles.tdCitta]}>Città</Text>
      <Text style={[styles.thTxt, styles.tdRef]}>Referente</Text>
      <Text style={[styles.thTxt, styles.tdTel]}>Telefono</Text>
      <Text style={[styles.thTxt, styles.tdStato]}>Stato</Text>
      <Text style={[styles.thTxt, styles.tdQuando]}>Ultima chiamata</Text>
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
}: {
  item: AffiliazioneRow;
  onChiama: () => void;
  onStato: (s: StatoAffiliazione) => void;
  onSeleziona: () => void;
  onApri: () => void;
  onPianifica: () => void;
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
          {item.indirizzo ? <Text style={styles.meta} numberOfLines={1}>{item.indirizzo}</Text> : null}
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
  tdNome: { flex: 3, minWidth: 150 },
  nomeTab: { color: colors.testo, fontWeight: '600', fontSize: 14, letterSpacing: -0.1 },
  tdCitta: { flex: 1.1, minWidth: 75, color: colors.testoSoft, fontSize: 13 },
  tdRef: { flex: 1.4, minWidth: 95, color: colors.testoSoft, fontSize: 13 },
  tdTel: { flex: 1.3, minWidth: 100 },
  telTab: { color: colors.testo, fontSize: 13, fontVariant: ['tabular-nums'] },
  cellaVuota: { color: colors.grigio, fontSize: 13 },
  tdStato: { flex: 1.7, minWidth: 130, flexDirection: 'row', alignItems: 'center' },
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
