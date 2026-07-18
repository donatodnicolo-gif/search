// Trattative: tutte le deal aperte, raggruppate per negozio.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useFocusEffect, useRouter } from 'expo-router';
import { coloreAffiliazione, colors, labelAffiliazione, labelFase, radius, spacing } from '@/lib/theme';
import {
  cercaPlaces,
  fetchContatti,
  fetchTutteTrattative,
  inserisciDeal,
  type PlaceLite,
  type TrattativaConLuogo,
} from '@/lib/db';
import { aggiornaValoriTrattative, syncTrattativa } from '@/lib/hubspot';
import { env } from '@/lib/env';
import { LINEE_ATTIVE, type Contact, type DealStage, type StatoAffiliazione } from '@/types';

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

export default function Trattative() {
  const router = useRouter();
  const [deals, setDeals] = useState<TrattativaConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [faseFiltro, setFaseFiltro] = useState<DealStage | 'tutte'>('tutte');
  const [formAperto, setFormAperto] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setDeals(await fetchTutteTrattative());
    } finally {
      setLoading(false);
    }
  }, []);

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

  const filtrate = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((d) => {
      if (faseFiltro !== 'tutte' && d.fase !== faseFiltro) return false;
      if (!q) return true;
      return [d.place_nome, d.linea, d.titolo, labelFase[d.fase]]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
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
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [filtrate]);

  const totale = useMemo(
    () => filtrate.reduce((s, d) => s + (d.valore_atteso ?? 0), 0),
    [filtrate],
  );

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          {filtrate.length} trattative · valore € {totale.toLocaleString('it-IT')}
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
          <Text style={styles.vuoto}>{loading ? 'Caricamento…' : 'Nessuna trattativa.'}</Text>
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
              <Text style={styles.sezioneTitolo} numberOfLines={1}>
                <Ionicons name="storefront-outline" size={14} color={colors.bianco} /> {section.title}
              </Text>
              <Text style={styles.sezioneConteggio}>{section.data.length}</Text>
            </Pressable>
          );
        }}
        renderItem={({ item }) => <RigaDeal deal={item} />}
      />

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova trattativa</Text>
      </Pressable>

      {formAperto ? (
        <NuovaTrattativaModal
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

function RigaDeal({ deal }: { deal: TrattativaConLuogo }) {
  const titolo = deal.titolo ?? deal.linea ?? 'Trattativa';
  // Tipologia di interesse (linea Deluxy) come tag, quando distinta dal titolo.
  const tipologia = deal.linea && deal.titolo ? deal.linea : null;
  const daRegistro = deal.origine === 'anagrafiche';
  return (
    <View style={styles.deal}>
      <View style={styles.dealHead}>
        <Text style={styles.dealLinea} numberOfLines={1}>
          {titolo}
        </Text>
        {deal.valore_atteso ? (
          <Text style={styles.dealValore}>€ {deal.valore_atteso.toLocaleString('it-IT')}</Text>
        ) : null}
      </View>
      <View style={styles.dealMetaRow}>
        {/* Fase: dealstage per Scout/HubSpot; stato registro per le righe da Anagrafiche. */}
        {daRegistro ? (
          <RegistroBadge stato={deal.anagrafiche_stato ?? 'in_trattativa'} />
        ) : (
          <View style={styles.faseBadge}>
            <Text style={styles.faseTxt}>{labelFase[deal.fase]}</Text>
          </View>
        )}
        {tipologia ? (
          <View style={styles.lineaTag}>
            <Text style={styles.lineaTagTxt}>{tipologia}</Text>
          </View>
        ) : null}
        {/* Stato registro come info aggiuntiva sui deal Scout/HubSpot schedati. */}
        {!daRegistro && deal.anagrafiche_stato ? (
          <RegistroBadge stato={deal.anagrafiche_stato} partner={deal.is_partner} />
        ) : null}
        {deal.origine === 'hubspot' ? (
          <Text style={styles.hs}>HubSpot</Text>
        ) : daRegistro ? (
          <Text style={styles.hs}>Registro</Text>
        ) : deal.hubspot_deal_id ? (
          <Text style={styles.hs}>HubSpot ✓</Text>
        ) : null}
      </View>
      {deal.next_action ? <Text style={styles.nextAction}>→ {deal.next_action}</Text> : null}
    </View>
  );
}

// ── Form "Nuova trattativa" (sincronizzato con negozio + contatti) ─────────────
function NuovaTrattativaModal({ onClose, onCreata }: { onClose: () => void; onCreata: () => void }) {
  const [ricerca, setRicerca] = useState('');
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [place, setPlace] = useState<PlaceLite | null>(null);
  const [contatti, setContatti] = useState<Contact[]>([]);
  const [linea, setLinea] = useState<string>('Consegne');
  const [fase, setFase] = useState<DealStage>('appointmentscheduled');
  const [valore, setValore] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typeahead negozi (debounce). Non cerca finché non è selezionato un negozio.
  useEffect(() => {
    if (place) return;
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
  }, [ricerca, place]);

  async function selezionaPlace(p: PlaceLite) {
    setPlace(p);
    setRisultati([]);
    try {
      setContatti(await fetchContatti(p.id));
    } catch {
      setContatti([]);
    }
  }

  async function salva() {
    if (!place || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      const valNum = valore.trim() ? Number(valore.replace(/[^\d]/g, '')) : null;
      const deal = await inserisciDeal({
        place_id: place.id,
        linea,
        fase,
        valore_atteso: valNum != null && isFinite(valNum) ? valNum : null,
        next_action: nextAction.trim() || null,
      });
      // Best effort: porta la trattativa + i contatti su HubSpot (con il valore).
      if (env.hubspotSyncUrl()) {
        try {
          await syncTrattativa(deal.id);
        } catch {
          /* la trattativa è salva su Supabase; il sync si recupera dopo */
        }
      }
      onCreata();
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitolo}>Nuova trattativa</Text>
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
                <Pressable
                  onPress={() => {
                    setPlace(null);
                    setContatti([]);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="swap-horizontal" size={20} color={colors.oro} />
                </Pressable>
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
                    {c.is_decisore ? '  ★' : ''}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Linea */}
            <Text style={styles.campoLabel}>Linea</Text>
            <View style={styles.chipRow}>
              {LINEE_ATTIVE.map((l) => (
                <Pressable
                  key={l}
                  style={[styles.chip, linea === l && styles.chipOn]}
                  onPress={() => setLinea(l)}
                >
                  <Text style={[styles.chipTxt, linea === l && styles.chipTxtOn]}>{l}</Text>
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

            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          </ScrollView>

          <Pressable
            style={[styles.salva, (!place || salvando) && styles.salvaDisabled]}
            disabled={!place || salvando}
            onPress={salva}
          >
            {salvando ? (
              <ActivityIndicator color={colors.bianco} />
            ) : (
              <Text style={styles.salvaTxt}>Crea trattativa</Text>
            )}
          </Pressable>
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
  sezioneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.navy,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sezioneTitolo: { flex: 1, color: colors.bianco, fontWeight: '800', fontSize: 15 },
  sezioneConteggio: {
    color: colors.navy,
    backgroundColor: colors.oro,
    fontWeight: '900',
    fontSize: 13,
    minWidth: 24,
    textAlign: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
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
  dealValore: { color: colors.oro, fontWeight: '900', fontSize: 15 },
  dealMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faseBadge: { backgroundColor: colors.sfondo, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  faseTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 12 },
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
  nextAction: { color: colors.testoSoft, fontSize: 13 },

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
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
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
