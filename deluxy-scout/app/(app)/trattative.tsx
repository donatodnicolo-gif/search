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
import { coloreAffiliazione, coloreFase, colors, labelAffiliazione, labelFase, radius, shadow, spacing } from '@/lib/theme';
import {
  aggiornaDeal,
  cercaPlaces,
  fetchContatti,
  fetchTutteTrattative,
  inserisciDeal,
  type PlaceLite,
  type TrattativaConLuogo,
} from '@/lib/db';
import { aggiornaValoriTrattative, modificaTrattativaHubspot, syncTrattativa } from '@/lib/hubspot';
import { env } from '@/lib/env';
import { type Contact, type DealStage, type StatoAffiliazione } from '@/types';
import { LineaSelector } from '@/components/LineaSelector';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { riepilogoTrattative, type RiepilogoTrattative } from '@/lib/assistente';

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
  const [deals, setDeals] = useState<TrattativaConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [faseFiltro, setFaseFiltro] = useState<DealStage | 'tutte'>('tutte');
  const [formAperto, setFormAperto] = useState(false);
  const [editDeal, setEditDeal] = useState<TrattativaConLuogo | null>(null);

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
      <PageIntro testo="Le trattative in corso raggruppate per negozio, da Scout, HubSpot e registro Anagrafiche. Tocca una trattativa per modificarla." />
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
        ListHeaderComponent={
          filtrate.length ? (
            <AssistenteCard
              trattative={filtrate}
              contesto={[
                faseFiltro !== 'tutte' ? `fase ${labelFase[faseFiltro]}` : '',
                query.trim() ? `ricerca "${query.trim()}"` : '',
              ].filter(Boolean).join(', ')}
            />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="briefcase-outline"
            titolo="Nessuna trattativa"
            aiuto="Le trattative nascono da una visita con esito positivo o da qui: crea la prima col bottone in basso."
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
        renderItem={({ item }) => <RigaDeal deal={item} onEdit={() => setEditDeal(item)} />}
      />

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova trattativa</Text>
      </Pressable>

      {formAperto ? (
        <TrattativaModal
          onClose={() => setFormAperto(false)}
          onSalvata={() => {
            setFormAperto(false);
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

// Assistente AI: sintesi della pipeline (rispetta i filtri attivi), su richiesta.
function AssistenteCard({ trattative, contesto }: { trattative: TrattativaConLuogo[]; contesto: string }) {
  const [stato, setStato] = useState<'idle' | 'loading' | 'fatto' | 'errore'>('idle');
  const [r, setR] = useState<RiepilogoTrattative | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function genera() {
    setStato('loading');
    setErrore(null);
    try {
      const res = await riepilogoTrattative(trattative, contesto);
      setR(res);
      setStato('fatto');
    } catch (e: any) {
      setErrore(e?.message ?? 'Riprova più tardi.');
      setStato('errore');
    }
  }

  return (
    <View style={styles.aiCard}>
      <View style={styles.aiHead}>
        <View style={styles.aiTitoloRow}>
          <Ionicons name="sparkles-outline" size={16} color={colors.goldStrong} />
          <Text style={styles.aiTitolo}>Eleonor</Text>
        </View>
        <Pressable style={styles.aiBtn} onPress={genera} disabled={stato === 'loading'}>
          {stato === 'loading' ? (
            <ActivityIndicator color={colors.bianco} size="small" />
          ) : (
            <Text style={styles.aiBtnTxt}>{stato === 'fatto' ? 'Aggiorna' : 'Riassumi'}</Text>
          )}
        </Pressable>
      </View>

      {stato === 'idle' ? (
        <Text style={styles.aiHint}>
          Eleonor riassume come vanno le {trattative.length} trattative {contesto ? 'filtrate' : 'in elenco'}: cosa
          sta andando bene e cosa richiede attenzione.
        </Text>
      ) : null}

      {stato === 'errore' ? <Text style={styles.aiErrore}>{errore}</Text> : null}

      {stato === 'fatto' && r ? (
        r.disponibile === false || r.reason === 'ai_non_configurata' ? (
          <Text style={styles.aiHint}>Eleonor non è ancora attiva (manca la chiave del modello AI).</Text>
        ) : r.vuoto ? (
          <Text style={styles.aiHint}>Nessuna trattativa da riassumere con questi filtri.</Text>
        ) : (
          <View style={styles.aiBody}>
            {r.aggregati ? (
              <View style={styles.aiKpiRow}>
                <Text style={styles.aiKpi}>{r.aggregati.aperte} aperte · {r.aggregati.valore_aperto_txt}</Text>
                {r.aggregati.in_ritardo ? <Text style={[styles.aiKpi, { color: colors.errore }]}>{r.aggregati.in_ritardo} in ritardo</Text> : null}
              </View>
            ) : null}
            {r.sintesi ? <Text style={styles.aiSintesi}>{r.sintesi}</Text> : null}
            {r.azioni?.length ? (
              <>
                <Text style={styles.aiSezione}>Azioni prioritarie</Text>
                {r.azioni.map((a, i) => (
                  <View key={i} style={styles.aiVoce}>
                    <Ionicons name="arrow-forward" size={13} color={colors.goldStrong} style={{ marginTop: 2 }} />
                    <Text style={styles.aiVoceTxt}>{a}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {r.attenzione?.length ? (
              <>
                <Text style={styles.aiSezione}>Attenzione</Text>
                {r.attenzione.map((a, i) => (
                  <View key={i} style={styles.aiVoce}>
                    <Ionicons name="alert-circle-outline" size={13} color={colors.attenzione} style={{ marginTop: 2 }} />
                    <Text style={styles.aiVoceTxt}>{a}</Text>
                  </View>
                ))}
              </>
            ) : null}
            <Text style={styles.aiNota}>Sintesi generata da Eleonor — verifica sempre prima di agire.</Text>
          </View>
        )
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

function RigaDeal({ deal, onEdit }: { deal: TrattativaConLuogo; onEdit: () => void }) {
  const lineaTxt = deal.linee?.length ? deal.linee.join(', ') : deal.linea;
  const titolo = deal.titolo ?? lineaTxt ?? 'Trattativa';
  // Tipologia di interesse (linee Deluxy) come tag, quando distinta dal titolo.
  const tipologia = lineaTxt && deal.titolo ? lineaTxt : null;
  const daRegistro = deal.origine === 'anagrafiche';
  return (
    <Pressable style={styles.deal} onPress={onEdit}>
      <View style={styles.dealHead}>
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
    </Pressable>
  );
}

// ── Form crea/modifica trattativa (sincronizzato con negozio + contatti) ───────
function TrattativaModal({
  deal,
  onClose,
  onSalvata,
}: {
  deal?: TrattativaConLuogo;
  onClose: () => void;
  onSalvata: () => void;
}) {
  const inModifica = !!deal;
  const daRegistro = deal?.origine === 'anagrafiche';
  const [ricerca, setRicerca] = useState('');
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [place, setPlace] = useState<PlaceLite | null>(
    deal ? { id: deal.place_id, nome: deal.place_nome ?? 'Negozio', indirizzo: null, zona: null } : null,
  );
  const [contatti, setContatti] = useState<Contact[]>([]);
  const [linee, setLinee] = useState<string[]>(
    deal?.linee?.length ? deal.linee : deal?.linea ? [deal.linea] : ['Consegne'],
  );
  const [fase, setFase] = useState<DealStage>((deal?.fase as DealStage) ?? 'appointmentscheduled');
  const [valore, setValore] = useState(deal?.valore_atteso != null ? String(deal.valore_atteso) : '');
  const [nextAction, setNextAction] = useState(deal?.next_action ?? '');
  const [scadenza, setScadenza] = useState<string | null>(deal?.scadenza ?? null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In modifica: carica i contatti del negozio già associato (se ce n'è uno Scout).
  useEffect(() => {
    if (deal?.place_id) {
      fetchContatti(deal.place_id).then(setContatti).catch(() => setContatti([]));
    }
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

  async function salva() {
    if (!place || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      const valNum = valore.trim() ? Number(valore.replace(/[^\d]/g, '')) : null;
      const patch = {
        linea: linee[0] ?? null,
        linee,
        fase,
        valore_atteso: valNum != null && isFinite(valNum) ? valNum : null,
        next_action: nextAction.trim() || null,
        scadenza,
      };

      if (inModifica && deal) {
        if (deal.origine === 'hubspot' && deal.hubspot_deal_id) {
          // Deal HubSpot: modifica su HubSpot (+ mirror locale) via edge function.
          await modificaTrattativaHubspot(deal.hubspot_deal_id, patch);
        } else if (daRegistro) {
          // Riga dal registro: non esiste un deal → creane uno Scout gestibile.
          const nuovo = await inserisciDeal({ place_id: deal.place_id, ...patch });
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
          if (deal.hubspot_deal_id && env.hubspotSyncUrl()) {
            try {
              await modificaTrattativaHubspot(deal.hubspot_deal_id, patch);
            } catch {
              /* la modifica è salva su Supabase; il sync si recupera dopo */
            }
          }
        }
      } else {
        // Creazione.
        const nuovo = await inserisciDeal({ place_id: place.id, ...patch });
        if (env.hubspotSyncUrl()) {
          try {
            await syncTrattativa(nuovo.id);
          } catch {
            /* la trattativa è salva su Supabase; il sync si recupera dopo */
          }
        }
      }
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
              <Text style={styles.salvaTxt}>{labelSalva}</Text>
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
  // Assistente AI
  aiCard: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 8,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiTitoloRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTitolo: { color: colors.testo, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  aiBtn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8, minWidth: 84, alignItems: 'center' },
  aiBtnTxt: { color: colors.bianco, fontWeight: '600', fontSize: 13.5 },
  aiHint: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  aiErrore: { color: colors.errore, fontSize: 13 },
  aiBody: { gap: 6 },
  aiKpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  aiKpi: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '700' },
  aiSintesi: { color: colors.testo, fontSize: 14, lineHeight: 20 },
  aiSezione: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 },
  aiVoce: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  aiVoceTxt: { flex: 1, color: colors.testo, fontSize: 13.5, lineHeight: 19 },
  aiNota: { color: colors.grigio, fontSize: 11, fontStyle: 'italic', marginTop: 6 },
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
    ...shadow.float,
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
