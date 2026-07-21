import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Contact, Deal, Place, Visit } from '@/types';
import { colors, labelFase, labelStato, radius, spacing } from '@/lib/theme';
import { aggiornaPlace, fetchAziendeScartate, fetchContatti, fetchContattiScartati, fetchDealPlace, fetchPlace, fetchVisitePlace, inserisciContatto, scartaAzienda, scartaContatto, sincronizzaPlaceRegistro } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { cercaContattiHubspot, dealsPerPlace, type ContattoAI, type MatchAI } from '@/lib/hubspot';
import { env } from '@/lib/env';
import { BoxIpotesi } from '@/components/BoxIpotesi';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { PercorsoCliente } from '@/components/PercorsoCliente';
import { TaskFormModal } from '@/components/TaskFormModal';
import { AnagraficaRegistroCard } from '@/components/AnagraficaRegistroCard';
import { FinanceCard } from '@/components/FinanceCard';
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
    const [p, c, v, d, sc, az] = await Promise.all([
      fetchPlace(id),
      fetchContatti(id),
      fetchVisitePlace(id),
      fetchDealPlace(id),
      fetchContattiScartati(id),
      fetchAziendeScartate(id),
    ]);
    setPlace(p);
    // Tipologia di interesse: parte dal valore salvato; il registro (Anagrafiche)
    // può poi sovrascriverlo come default finché l'utente non modifica a mano.
    const inizLinee = p?.linee_ipotizzate ?? (p?.linea_ipotizzata ? [p.linea_ipotizzata] : []);
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
    // #2: se il negozio è già abbinato a un'azienda HubSpot, mostra subito i contatti.
    if (p?.hubspot_company_id) eseguiMatch(p, sc, az);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

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
          <PriorityBadge priorita={place.priorita} />
          <Text style={styles.stato}>{labelStato[place.stato]}</Text>
        </View>
        <Text style={styles.nome}>{place.nome}</Text>
        {place.indirizzo ? <Text style={styles.meta}>{place.indirizzo}</Text> : null}
        {place.categoria ? <Text style={styles.meta}>Categoria: {place.categoria}</Text> : null}
        {place.zona ? <Text style={styles.meta}>Zona: {place.zona}</Text> : null}

        {/* Storyline: percorso commerciale verso il cliente. */}
        <View style={styles.percorso}>
          <Text style={styles.percorsoTitolo}>Percorso verso cliente</Text>
          <PercorsoCliente
            stato={place.stato}
            inTrattativa={
              Boolean(place.hubspot_deal_aperta) || deal.some((d) => d.fase !== 'closedwon' && d.fase !== 'closedlost')
            }
          />
        </View>

        <View style={styles.azioniRow}>
          <Pressable
            style={[styles.btnNaviga, { flex: 1 }]}
            onPress={() =>
              Linking.openURL(
                `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`,
              )
            }
          >
            <Text style={styles.btnNavigaTxt}>
              <Ionicons name="navigate-outline" size={15} color={colors.navy} /> Naviga
            </Text>
          </Pressable>
          <Pressable style={[styles.btnNaviga, { flex: 1 }]} onPress={() => router.push(`/(app)/modifica/${place.id}`)}>
            <Text style={styles.btnNavigaTxt}>
              <Ionicons name="create-outline" size={15} color={colors.navy} /> Modifica
            </Text>
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <BoxIpotesi linea={place.linea_ipotizzata} aggancio={place.aggancio_apertura} />
        </View>

        <AnagraficaRegistroCard nome={place.nome} citta={place.zona} onInteressi={defaultDaRegistro} />

        {/* FINANCE: fatturato + andamento del cliente (solo per clienti/partner). */}
        <View style={{ marginTop: spacing.md }}>
          <FinanceCard nomeCliente={place.nome} mostra={place.stato === 'cliente' || place.anagrafiche_stato === 'attivo'} />
        </View>

        <View style={styles.interesseHead}>
          <Text style={styles.interesseLbl}>Tipologia di interesse — scegline una o più</Text>
          <Text style={styles.interesseNota}>Default dal registro Anagrafiche · modificabile</Text>
        </View>
        <LineaSelector value={linee} onChange={cambiaLinee} />
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

        <View style={styles.azioniRow}>
          <Pressable style={[styles.btnVisita, { flex: 1, marginTop: 0 }]} onPress={() => router.push(`/(app)/visita/${place.id}`)}>
            <Text style={styles.btnVisitaTxt}>+ Nuova visita</Text>
          </Pressable>
          <Pressable style={styles.btnTask} onPress={() => setTaskAperto(true)}>
            <Ionicons name="checkbox-outline" size={16} color={colors.navy} />
            <Text style={styles.btnTaskTxt}>Task</Text>
          </Pressable>
        </View>

        {taskAperto ? (
          <TaskFormModal
            placeId={place.id}
            placeNome={place.nome}
            onClose={() => setTaskAperto(false)}
            onSalvato={() => setTaskAperto(false)}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  percorso: {
    marginTop: spacing.md,
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  percorsoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.errore },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stato: { color: colors.testoSoft, fontWeight: '700' },
  nome: { fontSize: 24, fontWeight: '900', color: colors.navy, marginTop: spacing.sm },
  meta: { color: colors.testoSoft, fontSize: 14, marginTop: 2 },
  // Azione primaria DS: pillola nera (ink), mai oro.
  btnVisita: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnVisitaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 17 },
  azioniRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btnTask: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  btnTaskTxt: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  btnNaviga: {
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnNavigaTxt: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  sezione: { marginTop: spacing.lg },
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
  interesseHead: { marginTop: spacing.lg, marginBottom: spacing.sm, gap: 2 },
  interesseLbl: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.oro,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  interesseNota: { fontSize: 12, color: colors.grigio, fontStyle: 'italic' },
  btnSalvaLinee: {
    marginTop: spacing.md,
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
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  btnSecondarioTxt: { color: colors.navy, fontWeight: '800' },
  btnAI: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.oro,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnAITxt: { color: colors.goldStrong, fontWeight: '800' },
  aiBox: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
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
    paddingHorizontal: spacing.md,
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
  contatto: { backgroundColor: colors.bianco, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  contattoNome: { fontWeight: '800', color: colors.navy },
  link: { color: colors.oro, fontWeight: '700', marginTop: 2 },
  deal: { backgroundColor: colors.bianco, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  dealLinea: { fontWeight: '800', color: colors.navy },
  visita: { backgroundColor: colors.bianco, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  visitaData: { fontWeight: '700', color: colors.navy },
});
