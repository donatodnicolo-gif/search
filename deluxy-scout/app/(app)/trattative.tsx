// Trattative: tutte le deal aperte, raggruppate per negozio.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  coloreAffiliazione,
  coloreFase,
  coloreProprita,
  colors,
  labelAffiliazione,
  labelFase,
  labelPriorita,
  radius,
  spacing,
} from '@/lib/theme';
import {
  aggiornaDeal,
  aggiornaTrattativaHubspotLocale,
  caricaAllegatoFile,
  cercaPlaces,
  eliminaAllegato,
  fetchAllegati,
  fetchConteggioAllegati,
  fetchContatti,
  fetchPlace,
  fetchTutteTrattative,
  inserisciAllegatoLink,
  inserisciDeal,
  notificaChiusuraTrattativa,
  type DealPatch,
  type PlaceLite,
  type TrattativaConLuogo,
} from '@/lib/db';
import { aggiornaValoriTrattative, modificaTrattativaHubspot, syncTrattativa } from '@/lib/hubspot';
import { env } from '@/lib/env';
import { chiaveTrattativa, ordinaTrattative, rangoPriorita, richiedeMotivoChiusura } from '@/lib/trattative';
import {
  FASI_CHIUSE,
  PRIORITA_DEAL,
  type Contact,
  type DealAllegato,
  type DealStage,
  type PrioritaDeal,
  type StatoAffiliazione,
} from '@/types';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Btn, EmptyState, PageIntro, StatusBadge } from '@/components/ui';

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

// Data ISO (YYYY-MM-DD) a N giorni da oggi, e formattazione GG/MM/AAAA.
function isoTraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function formattaData(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

export default function Trattative() {
  const router = useRouter();
  // `?nuova=<placeId>`: arrivo dalla scheda negozio → apro subito il form con quel negozio.
  const params = useLocalSearchParams<{ nuova?: string }>();
  const [deals, setDeals] = useState<TrattativaConLuogo[]>([]);
  const [nAllegati, setNAllegati] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [faseFiltro, setFaseFiltro] = useState<DealStage | 'tutte'>('tutte');
  const [formAperto, setFormAperto] = useState(false);
  const [placeIniziale, setPlaceIniziale] = useState<PlaceLite | null>(null);
  const [editDeal, setEditDeal] = useState<TrattativaConLuogo | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [d, n] = await Promise.all([fetchTutteTrattative(), fetchConteggioAllegati()]);
      setDeals(d);
      setNAllegati(n);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!params.nuova) return;
    let attivo = true;
    fetchPlace(params.nuova)
      .then((p) => {
        if (!attivo || !p) return;
        setPlaceIniziale({ id: p.id, nome: p.nome, indirizzo: p.indirizzo, zona: p.zona });
        setFormAperto(true);
      })
      .catch(() => {});
    return () => {
      attivo = false;
    };
  }, [params.nuova]);

  // Best-effort: allinea gli importi da HubSpot (i deal nati da una visita non
  // hanno `amount`; se impostato su HubSpot lo riportiamo qui). Se aggiorna
  // qualcosa, ricarica la lista. Non blocca né segnala errori all'utente.
  const allineaDaHubspot = useCallback(async () => {
    if (!env.hubspotSyncUrl()) return;
    try {
      const { aggiornati } = await aggiornaValoriTrattative();
      if (aggiornati > 0) setDeals(await fetchTutteTrattative());
    } catch {
      /* la lista locale resta valida; si riprova al prossimo accesso */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica().then(allineaDaHubspot);
    }, [carica, allineaDaHubspot]),
  );

  // Stati presenti (per i chip filtro), nell'ordine della pipeline.
  const fasiPresenti = useMemo<DealStage[]>(() => {
    const set = new Set(deals.map((d) => d.fase));
    return FASI.filter((f) => set.has(f));
  }, [deals]);

  // Filtro testo/fase, poi ordinamento per PRIORITÀ (P0 → P3), scadenza, valore.
  const filtrate = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ordinaTrattative(
      deals.filter((d) => {
        if (faseFiltro !== 'tutte' && d.fase !== faseFiltro) return false;
        if (!q) return true;
        return [d.place_nome, d.linea, d.titolo, labelFase[d.fase], d.priorita]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q));
      }),
    );
  }, [deals, query, faseFiltro]);

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
    // I gruppi seguono la priorità più alta che contengono, poi il nome.
    return [...map.values()].sort((a, b) => {
      const ra = Math.min(...a.data.map(rangoPriorita));
      const rb = Math.min(...b.data.map(rangoPriorita));
      if (ra !== rb) return ra - rb;
      return a.title.localeCompare(b.title);
    });
  }, [filtrate]);

  const totale = useMemo(
    () => filtrate.reduce((s, d) => s + (d.valore_atteso ?? 0), 0),
    [filtrate],
  );

  return (
    <View style={styles.container}>
      <PageIntro testo="Le trattative raggruppate per negozio e ordinate per priorità (P0 = la più importante), da Scout, HubSpot e registro Anagrafiche. Tocca una trattativa per modificarla, allegare documenti o chiuderla." />
      <View style={styles.head}>
        <Text style={styles.sub}>
          {filtrate.length} trattative · valore € {totale.toLocaleString('it-IT')} · ordinate per priorità
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtri}
        >
          <FiltroChip label="Tutte" on={faseFiltro === 'tutte'} onPress={() => setFaseFiltro('tutte')} />
          {fasiPresenti.map((f) => (
            <FiltroChip
              key={f}
              label={labelFase[f]}
              on={faseFiltro === f}
              onPress={() => setFaseFiltro(f)}
            />
          ))}
        </ScrollView>
      </View>
      <SectionList
        sections={sezioni}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="briefcase-outline"
            titolo="Nessuna trattativa"
            aiuto="Una visita non apre una trattativa: la crei tu da qui o dalla scheda del negozio, quando c'è davvero un'opportunità."
            azione="Nuova trattativa"
            onAzione={() => setFormAperto(true)}
          />
        }
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
              <Text style={styles.sezioneTitolo} numberOfLines={1}>{section.title}</Text>
              <Text style={styles.sezioneConteggio}>{section.data.length}</Text>
              {navigabile ? <Ionicons name="chevron-forward" size={15} color={colors.grigio} /> : null}
            </Pressable>
          );
        }}
        renderItem={({ item }) => (
          <RigaDeal deal={item} nAllegati={nAllegati.get(chiaveTrattativa(item)) ?? 0} onEdit={() => setEditDeal(item)} />
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova trattativa</Text>
      </Pressable>

      {formAperto ? (
        <TrattativaModal
          placeIniziale={placeIniziale}
          onClose={() => {
            setFormAperto(false);
            setPlaceIniziale(null);
          }}
          onSalvata={() => {
            setFormAperto(false);
            setPlaceIniziale(null);
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

function RigaDeal({ deal, nAllegati, onEdit }: { deal: TrattativaConLuogo; nAllegati: number; onEdit: () => void }) {
  const lineaTxt = deal.linee?.length ? deal.linee.join(', ') : deal.linea;
  const titolo = deal.titolo ?? lineaTxt ?? 'Trattativa';
  // Tipologia di interesse (linee Deluxy) come tag, quando distinta dal titolo.
  const tipologia = lineaTxt && deal.titolo ? lineaTxt : null;
  const daRegistro = deal.origine === 'anagrafiche';
  const chiusa = FASI_CHIUSE.includes(deal.fase);
  return (
    <Pressable style={styles.deal} onPress={onEdit}>
      <View style={styles.dealHead}>
        {!daRegistro ? <PriorityBadge priorita={deal.priorita ?? 'P2'} small /> : null}
        <Text style={styles.dealLinea} numberOfLines={1}>
          {titolo}
        </Text>
        {deal.valore_atteso ? (
          <Text style={styles.dealValore}>€ {deal.valore_atteso.toLocaleString('it-IT')}</Text>
        ) : (
          <Text style={styles.dealValoreVuoto}>+ valore €</Text>
        )}
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
      {deal.owner_nome ? (
        <View style={styles.ownerRow}>
          <Ionicons name="person-circle-outline" size={15} color={colors.testoSoft} />
          <Text style={styles.ownerTxt}>{deal.owner_nome}</Text>
        </View>
      ) : null}
      {deal.next_action ? <Text style={styles.nextAction}>Prossima azione: {deal.next_action}</Text> : null}
      {chiusa && deal.motivo_chiusura ? (
        <Text style={styles.motivoRiga} numberOfLines={2}>
          Motivo: {deal.motivo_chiusura}
        </Text>
      ) : null}
      {deal.link || nAllegati ? (
        <View style={styles.allegatiRow}>
          {deal.link ? (
            <Pressable style={styles.allegatoChip} onPress={() => Linking.openURL(deal.link!)} hitSlop={6}>
              <Ionicons name="link-outline" size={13} color={colors.testoSoft} />
              <Text style={styles.allegatoChipTxt}>Link</Text>
            </Pressable>
          ) : null}
          {nAllegati ? (
            <View style={styles.allegatoChip}>
              <Ionicons name="attach-outline" size={13} color={colors.testoSoft} />
              <Text style={styles.allegatoChipTxt}>
                {nAllegati} {nAllegati === 1 ? 'allegato' : 'allegati'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Form crea/modifica trattativa (sincronizzato con negozio + contatti) ───────
function TrattativaModal({
  deal,
  placeIniziale,
  onClose,
  onSalvata,
}: {
  deal?: TrattativaConLuogo;
  placeIniziale?: PlaceLite | null;
  onClose: () => void;
  onSalvata: () => void;
}) {
  const inModifica = !!deal;
  const daRegistro = deal?.origine === 'anagrafiche';
  const daHubspot = deal?.origine === 'hubspot';
  // Chiave per gli allegati: uuid Scout o hs_<id>; le righe registro non hanno ancora un deal.
  const dealKey = deal && !daRegistro ? chiaveTrattativa(deal) : null;
  const [ricerca, setRicerca] = useState('');
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [place, setPlace] = useState<PlaceLite | null>(
    deal ? { id: deal.place_id, nome: deal.place_nome ?? 'Negozio', indirizzo: null, zona: null } : placeIniziale ?? null,
  );
  const [contatti, setContatti] = useState<Contact[]>([]);
  // Nessuna linea preselezionata: la sceglie chi apre la trattativa.
  const [linee, setLinee] = useState<string[]>(deal?.linee?.length ? deal.linee : deal?.linea ? [deal.linea] : []);
  const [fase, setFase] = useState<DealStage>((deal?.fase as DealStage) ?? 'appointmentscheduled');
  const [priorita, setPriorita] = useState<PrioritaDeal>(deal?.priorita ?? 'P2');
  const [valore, setValore] = useState(deal?.valore_atteso != null ? String(deal.valore_atteso) : '');
  const [nextAction, setNextAction] = useState(deal?.next_action ?? '');
  const [scadenza, setScadenza] = useState<string | null>(deal?.scadenza ?? null);
  const [link, setLink] = useState(deal?.link ?? '');
  const [motivo, setMotivo] = useState(deal?.motivo_chiusura ?? '');
  const [chiediMotivo, setChiediMotivo] = useState(false);
  const [allegati, setAllegati] = useState<DealAllegato[]>([]);
  const [nuovoLink, setNuovoLink] = useState<{ titolo: string; url: string } | null>(null);
  const [allegando, setAllegando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In modifica: carica i contatti del negozio già associato e gli allegati.
  useEffect(() => {
    const pid = deal?.place_id ?? placeIniziale?.id;
    if (pid) fetchContatti(pid).then(setContatti).catch(() => setContatti([]));
    if (dealKey) fetchAllegati(dealKey).then(setAllegati).catch(() => setAllegati([]));
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

  // ── Allegati (link + documenti) ─────────────────────────────────────────────
  async function aggiungiLink() {
    if (!dealKey || !nuovoLink?.url.trim()) return;
    setAllegando(true);
    try {
      const url = /^https?:\/\//i.test(nuovoLink.url.trim()) ? nuovoLink.url.trim() : `https://${nuovoLink.url.trim()}`;
      const a = await inserisciAllegatoLink(dealKey, nuovoLink.titolo, url);
      setAllegati((l) => [a, ...l]);
      setNuovoLink(null);
    } catch (e: any) {
      setErrore(e?.message ?? 'Link non salvato');
    } finally {
      setAllegando(false);
    }
  }

  async function aggiungiDocumento() {
    if (!dealKey) return;
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const f = res.assets[0];
    setAllegando(true);
    setErrore(null);
    try {
      const a = await caricaAllegatoFile(dealKey, { uri: f.uri, name: f.name, mimeType: f.mimeType });
      setAllegati((l) => [a, ...l]);
    } catch (e: any) {
      setErrore(e?.message ?? 'Documento non caricato');
    } finally {
      setAllegando(false);
    }
  }

  async function rimuoviAllegato(a: DealAllegato) {
    setAllegati((l) => l.filter((x) => x.id !== a.id));
    try {
      await eliminaAllegato(a);
    } catch {
      if (dealKey) fetchAllegati(dealKey).then(setAllegati).catch(() => {});
    }
  }

  // ── Salvataggio ─────────────────────────────────────────────────────────────
  const chiusuraNuova = richiedeMotivoChiusura(deal?.fase, fase);
  const faseChiusa = FASI_CHIUSE.includes(fase);

  async function salva(motivoConfermato?: string) {
    if (!place || salvando) return;
    const motivoTxt = (motivoConfermato ?? motivo).trim();
    // Chiusura (vinta/persa): il motivo è OBBLIGATORIO → pop-up dedicato.
    if (faseChiusa && !motivoTxt) {
      setChiediMotivo(true);
      return;
    }
    setChiediMotivo(false);
    setSalvando(true);
    setErrore(null);
    try {
      const valNum = valore.trim() ? Number(valore.replace(/[^\d]/g, '')) : null;
      const patch: DealPatch = {
        linea: linee[0] ?? null,
        linee,
        fase,
        priorita,
        valore_atteso: valNum != null && isFinite(valNum) ? valNum : null,
        next_action: nextAction.trim() || null,
        scadenza,
        link: link.trim() || null,
        motivo_chiusura: faseChiusa ? motivoTxt : null,
        chiusa_at: faseChiusa ? (deal?.chiusa_at ?? new Date().toISOString()) : null,
      };
      let keyNotifica: string | null = null;

      if (inModifica && deal) {
        if (daHubspot && deal.hubspot_deal_id) {
          // Deal HubSpot: priorità/link/motivo restano nella copia locale; il resto va su HubSpot.
          await aggiornaTrattativaHubspotLocale(deal.hubspot_deal_id, {
            priorita,
            link: patch.link,
            motivo_chiusura: patch.motivo_chiusura,
          });
          await modificaTrattativaHubspot(deal.hubspot_deal_id, {
            linea: patch.linea,
            fase: patch.fase,
            valore_atteso: patch.valore_atteso,
            next_action: patch.next_action,
            motivo_chiusura: patch.motivo_chiusura,
          });
          keyNotifica = `hs_${deal.hubspot_deal_id}`;
        } else if (daRegistro) {
          // Riga dal registro: non esiste un deal → creane uno Scout gestibile.
          const nuovo = await inserisciDeal({ place_id: deal.place_id, ...patch, fase, linea: patch.linea ?? null, valore_atteso: patch.valore_atteso ?? null, next_action: patch.next_action ?? null });
          keyNotifica = nuovo.id;
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
          keyNotifica = deal.id;
          if (deal.hubspot_deal_id && env.hubspotSyncUrl()) {
            try {
              await modificaTrattativaHubspot(deal.hubspot_deal_id, {
                linea: patch.linea,
                fase: patch.fase,
                valore_atteso: patch.valore_atteso,
                next_action: patch.next_action,
                motivo_chiusura: patch.motivo_chiusura,
              });
            } catch {
              /* la modifica è salva su Supabase; il sync si recupera dopo */
            }
          }
        }
      } else {
        // Creazione.
        const nuovo = await inserisciDeal({ place_id: place.id, ...patch, fase, linea: patch.linea ?? null, valore_atteso: patch.valore_atteso ?? null, next_action: patch.next_action ?? null });
        keyNotifica = nuovo.id;
        if (env.hubspotSyncUrl()) {
          try {
            await syncTrattativa(nuovo.id);
          } catch {
            /* la trattativa è salva su Supabase; il sync si recupera dopo */
          }
        }
      }
      // Chiusa adesso (vinta/persa): manda i motivi via email a responsabile e venditore.
      if (chiusuraNuova && keyNotifica) notificaChiusuraTrattativa(keyNotifica).catch(() => {});
      onSalvata();
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  const titoloSheet = !inModifica ? 'Nuova trattativa' : daRegistro ? 'Crea trattativa' : 'Modifica trattativa';
  const labelSalva = !inModifica ? 'Crea trattativa' : daRegistro ? 'Crea trattativa Scout' : 'Salva modifiche';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitolo}>{titoloSheet}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {/* Negozio / contatto */}
            <Text style={styles.campoLabel}>Negozio</Text>
            {place ? (
              <View style={styles.placeSel}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeSelNome} numberOfLines={1}>
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
                      <Text style={styles.risNome} numberOfLines={1}>
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

            {/* Priorità P0 (massima) → P3 */}
            <Text style={styles.campoLabel}>Priorità</Text>
            <View style={styles.chipRow}>
              {PRIORITA_DEAL.map((p) => (
                <Pressable
                  key={p}
                  style={[styles.chip, priorita === p && { backgroundColor: coloreProprita[p], borderColor: coloreProprita[p] }]}
                  onPress={() => setPriorita(p)}
                >
                  <Text style={[styles.chipTxt, priorita === p && styles.chipTxtOn]}>
                    {p} · {labelPriorita[p]}
                  </Text>
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

            {/* Motivo di chiusura: visibile (e obbligatorio) quando la fase è vinta/persa */}
            {faseChiusa ? (
              <>
                <Text style={styles.campoLabel}>
                  {fase === 'closedwon' ? 'Perché l’abbiamo vinta *' : 'Perché l’abbiamo persa *'}
                </Text>
                <TextInput
                  style={[styles.input, styles.area]}
                  value={motivo}
                  onChangeText={setMotivo}
                  placeholder={fase === 'closedwon' ? 'Cosa ha fatto la differenza…' : 'Prezzo, concorrente, tempi, nessun bisogno…'}
                  placeholderTextColor={colors.grigio}
                  multiline
                />
                <Text style={styles.notaRegistro}>I motivi vengono inviati via email al responsabile e al venditore.</Text>
              </>
            ) : null}

            {/* Link di riferimento (sempre) */}
            <Text style={styles.campoLabel}>Link di riferimento</Text>
            <TextInput
              style={styles.input}
              value={link}
              onChangeText={setLink}
              placeholder="es. cartella Drive, preventivo, presentazione…"
              placeholderTextColor={colors.grigio}
              autoCapitalize="none"
              keyboardType="url"
            />

            {/* Documenti e link allegati (solo su una trattativa già salvata) */}
            <Text style={styles.campoLabel}>Documenti e link allegati</Text>
            {dealKey ? (
              <View style={styles.allegatiBox}>
                {allegati.length === 0 ? (
                  <Text style={styles.allegatiVuoto}>Nessun allegato. Aggiungi la presentazione fatta per questo cliente, un preventivo, un link.</Text>
                ) : (
                  allegati.map((a) => (
                    <View key={a.id} style={styles.allegato}>
                      <Pressable style={styles.allegatoApri} onPress={() => Linking.openURL(a.url)}>
                        <Ionicons
                          name={a.tipo === 'link' ? 'link-outline' : 'document-attach-outline'}
                          size={16}
                          color={colors.testoSoft}
                        />
                        <Text style={styles.allegatoTitolo} numberOfLines={1}>
                          {a.titolo}
                        </Text>
                        <Ionicons name="open-outline" size={14} color={colors.grigio} />
                      </Pressable>
                      <Pressable onPress={() => rimuoviAllegato(a)} hitSlop={8} accessibilityLabel="Rimuovi allegato">
                        <Ionicons name="trash-outline" size={16} color={colors.grigio} />
                      </Pressable>
                    </View>
                  ))
                )}
                {nuovoLink ? (
                  <View style={styles.nuovoLink}>
                    <TextInput
                      style={styles.input}
                      value={nuovoLink.titolo}
                      onChangeText={(t) => setNuovoLink({ ...nuovoLink, titolo: t })}
                      placeholder="Titolo (es. Presentazione Deluxy)"
                      placeholderTextColor={colors.grigio}
                    />
                    <TextInput
                      style={styles.input}
                      value={nuovoLink.url}
                      onChangeText={(t) => setNuovoLink({ ...nuovoLink, url: t })}
                      placeholder="https://…"
                      placeholderTextColor={colors.grigio}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                    <View style={styles.allegatiAzioni}>
                      <Btn tipo="secondario" small label="Annulla" onPress={() => setNuovoLink(null)} />
                      <Btn small label="Aggiungi link" onPress={aggiungiLink} disabled={!nuovoLink.url.trim() || allegando} />
                    </View>
                  </View>
                ) : (
                  <View style={styles.allegatiAzioni}>
                    <Btn tipo="secondario" small icona="link-outline" label="Link" onPress={() => setNuovoLink({ titolo: '', url: '' })} disabled={allegando} />
                    <Btn tipo="secondario" small icona="document-attach-outline" label={allegando ? 'Carico…' : 'Documento'} onPress={aggiungiDocumento} disabled={allegando} />
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.notaRegistro}>Salva prima la trattativa: poi potrai allegare documenti e link da qui.</Text>
            )}

            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          </ScrollView>

          <Pressable
            style={[styles.salva, (!place || salvando) && styles.salvaDisabled]}
            disabled={!place || salvando}
            onPress={() => salva()}
          >
            {salvando ? (
              <ActivityIndicator color={colors.bianco} />
            ) : (
              <Text style={styles.salvaTxt}>{labelSalva}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Pop-up obbligatorio alla chiusura: perché vinta / perché persa */}
      {chiediMotivo ? (
        <MotivoChiusuraModal
          fase={fase}
          negozio={place?.nome ?? ''}
          iniziale={motivo}
          onAnnulla={() => setChiediMotivo(false)}
          onConferma={(m) => {
            setMotivo(m);
            salva(m);
          }}
        />
      ) : null}
    </Modal>
  );
}

// ── Pop-up motivo di chiusura (obbligatorio) ──────────────────────────────────
function MotivoChiusuraModal({
  fase,
  negozio,
  iniziale,
  onAnnulla,
  onConferma,
}: {
  fase: DealStage;
  negozio: string;
  iniziale: string;
  onAnnulla: () => void;
  onConferma: (motivo: string) => void;
}) {
  const [testo, setTesto] = useState(iniziale);
  const vinta = fase === 'closedwon';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onAnnulla}>
      <View style={styles.popOverlay}>
        <View style={styles.pop}>
          <View style={[styles.popIcona, { backgroundColor: vinta ? colors.goldSoft : colors.fill }]}>
            <Ionicons name={vinta ? 'trophy-outline' : 'flag-outline'} size={22} color={vinta ? colors.goldStrong : colors.testoSoft} />
          </View>
          <Text style={styles.popTitolo}>{vinta ? 'Trattativa vinta 🎉' : 'Trattativa persa'}</Text>
          <Text style={styles.popSotto}>
            {negozio ? `${negozio} · ` : ''}
            {vinta ? 'Cosa ha fatto la differenza? Serve a ripetere il successo.' : 'Perché l’abbiamo persa? Serve a non ripetere l’errore.'}
          </Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={testo}
            onChangeText={setTesto}
            placeholder={vinta ? 'es. rapporto col titolare, qualità del servizio, prezzo giusto…' : 'es. prezzo troppo alto, già servito da X, nessun bisogno reale…'}
            placeholderTextColor={colors.grigio}
            multiline
            autoFocus
          />
          <Text style={styles.popNota}>Campo obbligatorio · i motivi vengono inviati via email al responsabile e al venditore.</Text>
          <View style={styles.popAzioni}>
            <Btn tipo="secondario" label="Annulla" onPress={onAnnulla} />
            <Btn label={vinta ? 'Conferma vinta' : 'Conferma persa'} onPress={() => onConferma(testo.trim())} disabled={!testo.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    paddingTop: spacing.sm,
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
  filtri: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
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
  motivoRiga: { color: colors.testoSoft, fontSize: 12.5, fontStyle: 'italic' },
  allegatiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allegatoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  allegatoChipTxt: { color: colors.testoSoft, fontWeight: '600', fontSize: 11.5 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownerTxt: { color: colors.testoSoft, fontSize: 12, fontWeight: '700' },

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
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },

  // Modal / sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.sfondo,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
  },
  sheetTitolo: { fontSize: 18, fontWeight: '900', color: colors.testo },
  sheetBody: { padding: spacing.md, gap: spacing.xs },
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
  area: { minHeight: 84, textAlignVertical: 'top' },
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
  // Allegati
  allegatiBox: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  allegatiVuoto: { color: colors.grigio, fontSize: 12.5, lineHeight: 17 },
  allegato: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  allegatoApri: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  allegatoTitolo: { flex: 1, color: colors.testo, fontWeight: '600', fontSize: 13.5 },
  allegatiAzioni: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  nuovoLink: { gap: 6 },
  // Pop-up motivo chiusura (card float centrata)
  popOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  pop: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  popIcona: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  popTitolo: { fontSize: 19, fontWeight: '600', color: colors.testo, letterSpacing: -0.3 },
  popSotto: { color: colors.testoSoft, fontSize: 13.5, lineHeight: 19 },
  popNota: { color: colors.grigio, fontSize: 12 },
  popAzioni: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  scadenzaSel: { color: colors.goldStrong, fontWeight: '700', fontSize: 12, marginTop: 4 },
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
});
