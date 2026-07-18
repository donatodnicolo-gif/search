import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Contact, Deal, Place, Visit } from '@/types';
import { colors, labelStato, radius, spacing } from '@/lib/theme';
import { aggiornaPlace, fetchAziendeScartate, fetchContatti, fetchContattiScartati, fetchDealPlace, fetchPlace, fetchVisitePlace, inserisciContatto, scartaAzienda, scartaContatto } from '@/lib/db';
import { cercaContattiHubspot, dealsPerPlace, type ContattoAI, type MatchAI } from '@/lib/hubspot';
import { env } from '@/lib/env';
import { BoxIpotesi } from '@/components/BoxIpotesi';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { CreaTaskModal } from '@/components/CreaTaskModal';
import { Loader } from '../../_layout';

export default function SchedaAttivita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<Place | null>(null);
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

  // Imposta/cambia la tipologia di interesse (linee, multipla) direttamente da qui.
  async function salvaLinee(linee: string[]) {
    if (!place) return;
    const primaria = linee[0] ?? null;
    setPlace({ ...place, linee_ipotizzate: linee, linea_ipotizzata: primaria });
    try {
      await aggiornaPlace(place.id, { linee_ipotizzate: linee, linea_ipotizzata: primaria });
    } catch {
      /* riprova al prossimo focus */
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

        <Text style={styles.interesseLbl}>Tipologia di interesse — scegline una o più</Text>
        <LineaSelector
          value={place.linee_ipotizzate ?? (place.linea_ipotizzata ? [place.linea_ipotizzata] : [])}
          onChange={salvaLinee}
        />

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
          <CreaTaskModal placeId={place.id} placeNome={place.nome} onClose={() => setTaskAperto(false)} />
        ) : null}

        <Sezione titolo="Contatti">
          {contatti.length === 0 ? (
            <Text style={styles.vuoto}>Nessun contatto registrato.</Text>
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
                    <Ionicons name="business-outline" size={14} color={colors.navy} /> {matchAI.match.nome} · corrispondenza{' '}
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
              {matchAI.contatti.map((c) => (
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
                  ⚠️ Possibili duplicati da unire: {matchAI.duplicati.map((d) => d.motivo).join('; ')}
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
            <Text style={styles.vuoto}>Nessuna trattativa aperta.</Text>
          ) : (
            deal.map((d) => (
              <View key={d.id} style={styles.deal}>
                <Text style={styles.dealLinea}>{d.linea ?? 'Deal'}</Text>
                <Text style={styles.meta}>Fase: {d.fase}</Text>
                {d.valore_atteso ? <Text style={styles.meta}>Valore: € {d.valore_atteso}</Text> : null}
              </View>
            ))
          )}
        </Sezione>

        <Sezione titolo={`Storico visite (${visite.length})`}>
          {visite.length === 0 ? (
            <Text style={styles.vuoto}>Ancora nessuna visita.</Text>
          ) : (
            visite.map((v) => (
              <Pressable
                key={v.id}
                style={styles.visita}
                onPress={() => router.push(`/(app)/visita-dettaglio/${v.id}`)}
              >
                <Text style={styles.visitaData}>
                  {new Date(v.data).toLocaleDateString('it-IT')} · {v.esito ?? '—'}
                  {v.hubspot_synced ? '' : '  ⏳'}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.errore },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stato: { color: colors.testoSoft, fontWeight: '700' },
  nome: { fontSize: 24, fontWeight: '900', color: colors.navy, marginTop: spacing.sm },
  meta: { color: colors.testoSoft, fontSize: 14, marginTop: 2 },
  btnVisita: {
    backgroundColor: colors.oro,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnVisitaTxt: { color: colors.navy, fontWeight: '900', fontSize: 17 },
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
  interesseLbl: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.oro,
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
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
