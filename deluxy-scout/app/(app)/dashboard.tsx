import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Deal, Place, Visit } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { aggiornaFaseDeal, fetchAllDeals, fetchAllVisits, fetchPlaces } from '@/lib/db';
import { contaInCoda, flushCoda } from '@/lib/syncQueue';
import {
  chiusePerse,
  coperturaZone,
  dealApertiPerLinea,
  followupAffiliazioni,
  tassoAvanzamento,
  visitePerSettimana,
  visitePerVenditore,
} from '@/lib/metrics';
import { BarChart } from '@/components/BarChart';
import { StatCard } from '@/components/StatCard';
import { SyncBadge } from '@/components/SyncBadge';

export default function Dashboard() {
  const { signOut } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [inCoda, setInCoda] = useState(0);
  const [loading, setLoading] = useState(true);

  const carica = useCallback(async () => {
    setLoading(true);
    const [p, v, d, q] = await Promise.all([
      fetchPlaces(),
      fetchAllVisits(),
      fetchAllDeals(),
      contaInCoda(),
    ]);
    setPlaces(p);
    setVisits(v);
    setDeals(d);
    setInCoda(q);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  async function nurturing(d: Deal) {
    await aggiornaFaseDeal(d.id, 'appointmentscheduled');
    carica();
  }

  const tasso = tassoAvanzamento(deals);
  const cop = coperturaZone(places);
  const perse = chiusePerse(deals);
  const affil = followupAffiliazioni(deals);

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

      <View style={styles.cards}>
        <StatCard label="Visite totali" valore={visits.length} accent />
        <StatCard label="Deal aperti" valore={deals.filter((d) => d.fase !== 'closedwon' && d.fase !== 'closedlost').length} />
        <StatCard label="Appuntamento → decisore" valore={`${tasso.pct}%`} sub={`${tasso.num}/${tasso.den} trattative`} />
        <StatCard label="Attività totali" valore={places.length} />
      </View>

      <BarChart titolo="Visite per settimana" data={visitePerSettimana(visits)} />
      <View style={{ height: spacing.md }} />
      <BarChart titolo="Visite per venditore" data={visitePerVenditore(visits)} />
      <View style={{ height: spacing.md }} />
      <BarChart titolo="Deal aperti per linea" data={dealApertiPerLinea(deals)} />

      <Sezione titolo="Copertura zone di Milano">
        {cop.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna zona.</Text>
        ) : (
          cop.map((z) => (
            <View key={z.zona} style={styles.zonaRow}>
              <Text style={styles.zonaNome}>{z.zona}</Text>
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
              <Text style={styles.dealLinea}>{d.linea ?? 'Deal'}</Text>
              <Pressable style={styles.btnNurt} onPress={() => nurturing(d)}>
                <Text style={styles.btnNurtTxt}>↺ Nurturing</Text>
              </Pressable>
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
              <Text style={styles.dealLinea}>{d.linea}</Text>
              <Text style={styles.meta}>{d.fase}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  sezione: { marginTop: spacing.lg },
  sezioneTitolo: { fontSize: 13, fontWeight: '800', color: colors.oro, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  vuoto: { color: colors.grigio, fontStyle: 'italic' },
  zonaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  zonaNome: { width: 90, color: colors.navy, fontWeight: '700', fontSize: 13 },
  barBg: { flex: 1, height: 10, backgroundColor: colors.grigioChiaro, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: colors.oro },
  zonaPct: { width: 84, textAlign: 'right', color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bianco,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dealLinea: { fontWeight: '800', color: colors.navy },
  meta: { color: colors.testoSoft },
  btnNurt: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  btnNurtTxt: { color: colors.bianco, fontWeight: '800', fontSize: 13 },
  logout: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.md },
  logoutTxt: { color: colors.errore, fontWeight: '800' },
});
