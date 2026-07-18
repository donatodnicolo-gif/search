import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { DealStage, Place, Profilo, Visit } from '@/types';
import { LINEE_ATTIVE } from '@/types';
import { colors, labelFase, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  aggiornaFaseDeal,
  fetchAllVisits,
  fetchPlaces,
  fetchProfiles,
  fetchTutteTrattative,
  type TrattativaConLuogo,
} from '@/lib/db';
import { contaInCoda, flushCoda } from '@/lib/syncQueue';
import {
  chiusePerse,
  coperturaZone,
  daRicontattare,
  dealPerFase,
  followupAffiliazioni,
  nomeVenditore,
  valorePerLinea,
  valoreTrattative,
  visitePerSettimana,
  visiteUltimi7Giorni,
  winRate,
} from '@/lib/metrics';
import { BarChart } from '@/components/BarChart';
import { StatCard } from '@/components/StatCard';
import { SyncBadge } from '@/components/SyncBadge';

const FASI: DealStage[] = [
  'appointmentscheduled',
  'decisionmakerboughtin',
  'contractsent',
  'closedwon',
  'closedlost',
];

const eur = (n: number) => '€ ' + Math.round(n).toLocaleString('it-IT');

export default function Dashboard() {
  const { signOut } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [deals, setDeals] = useState<TrattativaConLuogo[]>([]);
  const [profili, setProfili] = useState<Profilo[]>([]);
  const [inCoda, setInCoda] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filtri
  const [zona, setZona] = useState<string>('tutte');
  const [venditore, setVenditore] = useState<string>('tutti'); // ownerId
  const [linea, setLinea] = useState<string>('tutte');
  const [fase, setFase] = useState<string>('tutte'); // stato trattativa

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [p, v, d, pr, q] = await Promise.all([
        fetchPlaces(),
        fetchAllVisits(),
        fetchTutteTrattative(),
        fetchProfiles(),
        contaInCoda(),
      ]);
      setPlaces(p);
      setVisits(v);
      setDeals(d);
      setProfili(pr);
      setInCoda(q);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  async function nurturing(d: TrattativaConLuogo) {
    if (d.origine !== 'scout') return; // solo i deal Scout hanno un id modificabile
    await aggiornaFaseDeal(d.id, 'appointmentscheduled');
    carica();
  }

  // Opzioni filtri
  const zoneOpt = useMemo(
    () => Array.from(new Set(places.map((p) => p.zona).filter(Boolean))).sort() as string[],
    [places],
  );
  const venditoriOpt = useMemo(() => {
    const map = new Map(profili.map((p) => [p.id, p]));
    return profili.map((p) => ({ id: p.id, nome: nomeVenditore(p.id, map) }));
  }, [profili]);

  // Zona per place (per filtrare le visite, che non hanno la zona)
  const zonaPerPlace = useMemo(() => new Map(places.map((p) => [p.id, p.zona])), [places]);

  // Applicazione filtri
  const dealsF = useMemo(
    () =>
      deals.filter((d) => {
        if (zona !== 'tutte' && (d.place_zona ?? null) !== zona) return false;
        if (venditore !== 'tutti' && (d.owner ?? null) !== venditore) return false;
        if (linea !== 'tutte' && (d.linea ?? null) !== linea) return false;
        if (fase !== 'tutte' && d.fase !== fase) return false;
        return true;
      }),
    [deals, zona, venditore, linea, fase],
  );
  const visitsF = useMemo(
    () =>
      visits.filter((v) => {
        if (venditore !== 'tutti' && (v.owner ?? null) !== venditore) return false;
        if (zona !== 'tutte' && (zonaPerPlace.get(v.place_id) ?? null) !== zona) return false;
        return true;
      }),
    [visits, venditore, zona, zonaPerPlace],
  );
  const placesF = useMemo(
    () =>
      places.filter((p) => {
        if (zona !== 'tutte' && (p.zona ?? null) !== zona) return false;
        if (linea !== 'tutte' && (p.linea_ipotizzata ?? null) !== linea) return false;
        return true;
      }),
    [places, zona, linea],
  );

  const val = useMemo(() => valoreTrattative(dealsF), [dealsF]);
  const win = useMemo(() => winRate(dealsF), [dealsF]);
  const richiami = useMemo(() => daRicontattare(placesF, visitsF), [placesF, visitsF]);
  const inRitardo = richiami.filter((r) => r.inRitardo).length;
  const cop = useMemo(() => coperturaZone(placesF), [placesF]);
  const perse = useMemo(() => chiusePerse(dealsF), [dealsF]);
  const affil = useMemo(() => followupAffiliazioni(dealsF), [dealsF]);
  const faseBar = useMemo(
    () => dealPerFase(dealsF).map((x) => ({ label: labelFase[x.fase], value: x.value })),
    [dealsF],
  );
  const valLineaBar = useMemo(() => valorePerLinea(dealsF), [dealsF]);

  const filtriAttivi = zona !== 'tutte' || venditore !== 'tutti' || linea !== 'tutte' || fase !== 'tutte';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      {inCoda > 0 ? (
        <Pressable onPress={() => flushCoda().then(carica)} style={{ alignSelf: 'center' }}>
          <SyncBadge count={inCoda} />
        </Pressable>
      ) : null}

      {/* ── Filtri ── */}
      <View style={styles.filtri}>
        <View style={styles.filtriHead}>
          <Text style={styles.filtriTitolo}>Filtri</Text>
          {filtriAttivi ? (
            <Pressable
              onPress={() => {
                setZona('tutte');
                setVenditore('tutti');
                setLinea('tutte');
                setFase('tutte');
              }}
            >
              <Text style={styles.azzera}>Azzera</Text>
            </Pressable>
          ) : null}
        </View>
        <FiltroRiga label="Zona">
          <Chip label="Tutte" on={zona === 'tutte'} onPress={() => setZona('tutte')} />
          {zoneOpt.map((z) => (
            <Chip key={z} label={z} on={zona === z} onPress={() => setZona(z)} />
          ))}
        </FiltroRiga>
        {venditoriOpt.length > 0 ? (
          <FiltroRiga label="Venditore">
            <Chip label="Tutti" on={venditore === 'tutti'} onPress={() => setVenditore('tutti')} />
            {venditoriOpt.map((v) => (
              <Chip key={v.id} label={v.nome} on={venditore === v.id} onPress={() => setVenditore(v.id)} />
            ))}
          </FiltroRiga>
        ) : null}
        <FiltroRiga label="Linea">
          <Chip label="Tutte" on={linea === 'tutte'} onPress={() => setLinea('tutte')} />
          {LINEE_ATTIVE.map((l) => (
            <Chip key={l} label={l} on={linea === l} onPress={() => setLinea(l)} />
          ))}
        </FiltroRiga>
        <FiltroRiga label="Stato trattativa">
          <Chip label="Tutti" on={fase === 'tutte'} onPress={() => setFase('tutte')} />
          {FASI.map((f) => (
            <Chip key={f} label={labelFase[f]} on={fase === f} onPress={() => setFase(f)} />
          ))}
        </FiltroRiga>
      </View>

      {/* ── Trattative ── */}
      <Text style={styles.sezioneTitolo}>Trattative</Text>
      <View style={styles.cards}>
        <StatCard label="Pipeline aperto" valore={eur(val.aperto)} sub={`${val.nAperti} trattative`} accent />
        <StatCard label="Vinto" valore={eur(val.vinto)} sub={`${val.nVinti} chiuse`} />
        <StatCard label="Win rate" valore={`${win.pct}%`} sub={`${win.num}/${win.den}`} />
        <StatCard label="Perso" valore={eur(val.perso)} sub={`${val.nPersi} chiuse`} />
      </View>
      <BarChart titolo="Trattative per stato" data={faseBar} />
      <View style={{ height: spacing.md }} />
      <BarChart titolo="Valore atteso per linea (€)" data={valLineaBar} />

      {/* ── Attività sul campo ── */}
      <Text style={[styles.sezioneTitolo, { marginTop: spacing.lg }]}>Attività sul campo</Text>
      <View style={styles.cards}>
        <StatCard label="Visite ultimi 7 giorni" valore={visiteUltimi7Giorni(visitsF)} sub={`${visitsF.length} totali`} accent />
        <StatCard label="Da ricontattare" valore={richiami.length} sub={inRitardo ? `${inRitardo} in ritardo` : undefined} />
      </View>
      <BarChart titolo="Visite per settimana" data={visitePerSettimana(visitsF)} />

      <Sezione titolo="Copertura zone">
        {cop.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna zona.</Text>
        ) : (
          cop.map((z) => (
            <View key={z.zona} style={styles.zonaRow}>
              <Text style={styles.zonaNome} numberOfLines={1}>{z.zona}</Text>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${z.pct}%` }]} />
              </View>
              <Text style={styles.zonaPct}>
                {z.visitati}/{z.totali} · {z.pct}%
              </Text>
            </View>
          ))
        )}
      </Sezione>

      <Sezione titolo={`Chiuse perse da recuperare (${perse.length})`}>
        {perse.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna trattativa persa.</Text>
        ) : (
          perse.map((d) => (
            <View key={d.id} style={styles.dealRow}>
              <Text style={styles.dealLinea} numberOfLines={1}>
                {d.place_nome ?? d.linea ?? 'Deal'}
              </Text>
              {d.origine === 'scout' ? (
                <Pressable style={styles.btnNurt} onPress={() => nurturing(d)}>
                  <Text style={styles.btnNurtTxt}>↺ Nurturing</Text>
                </Pressable>
              ) : (
                <Text style={styles.meta}>{d.origine === 'hubspot' ? 'HubSpot' : 'Registro'}</Text>
              )}
            </View>
          ))
        )}
      </Sezione>

      <Sezione titolo={`Follow-up affiliazioni / re-seller (${affil.length})`}>
        {affil.length === 0 ? (
          <Text style={styles.vuoto}>Nessun follow-up aperto.</Text>
        ) : (
          affil.map((d) => (
            <View key={d.id} style={styles.dealRow}>
              <Text style={styles.dealLinea} numberOfLines={1}>{d.place_nome ?? d.linea}</Text>
              <Text style={styles.meta}>{labelFase[d.fase]}</Text>
            </View>
          ))
        )}
      </Sezione>

      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutTxt}>Esci</Text>
      </Pressable>
    </ScrollView>
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

function FiltroRiga({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.filtroRiga}>
      <Text style={styles.filtroLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtroChips}>
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  sezione: { marginTop: spacing.lg },
  sezioneTitolo: { fontSize: 13, fontWeight: '800', color: colors.oro, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  vuoto: { color: colors.grigio, fontStyle: 'italic' },

  // Filtri
  filtri: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  filtriHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  filtriTitolo: { fontSize: 12, fontWeight: '800', color: colors.testoSoft, letterSpacing: 0.5, textTransform: 'uppercase' },
  azzera: { color: colors.oro, fontWeight: '800', fontSize: 12 },
  filtroRiga: { gap: 4 },
  filtroLabel: { fontSize: 11, fontWeight: '700', color: colors.grigio, paddingHorizontal: 2 },
  filtroChips: { gap: 6, paddingVertical: 2, paddingRight: spacing.sm },
  chip: {
    backgroundColor: colors.sfondo,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    maxWidth: 170,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 12 },
  chipTxtOn: { color: colors.bianco },

  zonaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  zonaNome: { width: 90, color: colors.navy, fontWeight: '700', fontSize: 13 },
  barBg: { flex: 1, height: 10, backgroundColor: colors.grigioChiaro, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: colors.oro },
  zonaPct: { width: 84, textAlign: 'right', color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dealLinea: { flex: 1, fontWeight: '800', color: colors.navy },
  meta: { color: colors.testoSoft },
  btnNurt: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  btnNurtTxt: { color: colors.bianco, fontWeight: '800', fontSize: 13 },
  logout: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.md },
  logoutTxt: { color: colors.errore, fontWeight: '800' },
});
