// Dashboard di Team (solo admin): cosa hanno fatto i venditori.
// Riepilogo di rete + scheda per venditore (volume, esiti, deal) + feed delle
// ultime visite. I dati sono già condivisi via RLS; qui li attribuiamo a un nome.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Deal, Place, Profilo, Visit } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { fetchAllDeals, fetchAllVisits, fetchPlaces, fetchProfiles } from '@/lib/db';
import { attivitaPerVenditore, nomeVenditore, visiteUltimi7Giorni, type StatVenditore } from '@/lib/metrics';
import { EmptyState, PageIntro } from '@/components/ui';
import { StatCard } from '@/components/StatCard';

const ESITO_LABEL: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_target: 'Non target',
  chiuso: 'Chiuso',
};
const ESITO_COLORE: Record<string, string> = {
  interessato: colors.successo,
  da_richiamare: colors.attenzione,
  non_target: colors.grigio,
  chiuso: colors.oro,
};

export default function Team() {
  const { session } = useAuth();
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [profili, setProfili] = useState<Profilo[]>([]);
  const [loading, setLoading] = useState(true);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [v, d, p, pr] = await Promise.all([
        fetchAllVisits(),
        fetchAllDeals(),
        fetchPlaces(),
        fetchProfiles(),
      ]);
      setVisits(v);
      setDeals(d);
      setPlaces(p);
      setProfili(pr);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const venditori = useMemo(() => attivitaPerVenditore(visits, deals, profili), [visits, deals, profili]);
  const mappaProfili = useMemo(() => new Map(profili.map((p) => [p.id, p])), [profili]);
  const nomiPlace = useMemo(() => new Map(places.map((p) => [p.id, p.nome])), [places]);
  const recenti = useMemo(
    () => [...visits].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 25),
    [visits],
  );
  const attivi7 = venditori.filter((s) => s.visite7 > 0).length;

  // Guardia: la sezione è per l'amministratore della rete.
  if (!isAdmin(session?.user?.email)) return <Redirect href="/(app)/dashboard" />;

  return (
    <View style={styles.container}>
      <PageIntro testo="L'attività di tutta la rete: visite, esiti e trattative di ogni venditore. Tocca un venditore per il dettaglio giorno per giorno." />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
      <View style={styles.cards}>
        <StatCard label="Visite ultimi 7 giorni" valore={visiteUltimi7Giorni(visits)} sub={`${visits.length} totali`} accent />
        <StatCard label="Venditori attivi (7 gg)" valore={attivi7} sub={`${venditori.length} in totale`} />
        <StatCard label="Trattative aperte" valore={deals.filter((d) => d.fase !== 'closedwon' && d.fase !== 'closedlost').length} />
        <StatCard label="Trattative vinte" valore={deals.filter((d) => d.fase === 'closedwon').length} />
      </View>

      <Text style={styles.sezione}>Per venditore</Text>
      {venditori.length === 0 ? (
        <EmptyState
          icona="people-outline"
          titolo="Nessuna attività registrata"
          aiuto="Quando i venditori registrano visite e trattative, qui compare una scheda per ciascuno."
          loading={loading}
        />
      ) : (
        venditori.map((s) => (
          <VenditoreCard
            key={s.ownerId ?? 'none'}
            s={s}
            oggi={new Date()}
            onPress={() => router.push(`/(app)/venditore/${s.ownerId ?? 'none'}`)}
          />
        ))
      )}

      <Text style={styles.sezione}>Ultime visite</Text>
      {recenti.length === 0 ? (
        <Text style={styles.vuoto}>Ancora nessuna visita registrata dalla rete.</Text>
      ) : (
        recenti.map((v) => (
          <View key={v.id} style={styles.feedRow}>
            <View style={[styles.dot, { backgroundColor: ESITO_COLORE[v.esito ?? ''] ?? colors.grigio }]} />
            <View style={styles.feedInfo}>
              <Text style={styles.feedNegozio} numberOfLines={1}>
                {nomiPlace.get(v.place_id) ?? 'Attività'}
              </Text>
              <Text style={styles.feedMeta} numberOfLines={1}>
                {nomeVenditore(v.owner, mappaProfili)} · {quando(v.data)}
                {v.esito ? ` · ${ESITO_LABEL[v.esito] ?? v.esito}` : ''}
              </Text>
            </View>
          </View>
        ))
      )}
      </ScrollView>
    </View>
  );
}

function VenditoreCard({ s, oggi, onPress }: { s: StatVenditore; oggi: Date; onPress: () => void }) {
  return (
    <Pressable style={styles.vCard} onPress={onPress}>
      <View style={styles.vHead}>
        <Text style={styles.vNome} numberOfLines={1}>
          {s.nome}
        </Text>
        <View style={styles.vHeadRight}>
          <Text style={styles.vUltima}>
            {s.ultimaData
              ? `attivo ${quando(s.ultimaData, oggi)}`
              : s.ultimoAccesso
                ? `accesso ${quando(s.ultimoAccesso, oggi)}`
                : 'mai attivo'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.grigio} />
        </View>
      </View>
      <View style={styles.vStats}>
        <Metric label="Visite 7 gg" valore={s.visite7} forte />
        <Metric label="Totali" valore={s.visite} />
        <Metric label="Interessati" valore={s.interessati} />
        <Metric label="Da richiamare" valore={s.daRichiamare} />
        <Metric label="Trattative aperte" valore={s.dealAperti} />
        <Metric label="Vinte" valore={s.dealVinti} />
      </View>
    </Pressable>
  );
}

function Metric({ label, valore, forte }: { label: string; valore: number; forte?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricVal, forte && styles.metricValForte]}>{valore}</Text>
      <Text style={styles.metricLbl}>{label}</Text>
    </View>
  );
}

// Data relativa breve, senza API di data proibite in build (usa solo getTime).
function quando(iso: string, oggi: Date = new Date()): string {
  const giorni = Math.floor((oggi.getTime() - new Date(iso).getTime()) / 86400000);
  if (giorni <= 0) return 'oggi';
  if (giorni === 1) return 'ieri';
  if (giorni < 7) return `${giorni} giorni fa`;
  if (giorni < 14) return `1 settimana fa`;
  if (giorni < 30) return `${Math.floor(giorni / 7)} settimane fa`;
  return `${Math.floor(giorni / 30)} mesi fa`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.xs },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  sezione: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.testoSoft,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  vuoto: { color: colors.grigio, fontStyle: 'italic' },

  vCard: {
    backgroundColor: colors.bianco,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  vHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, gap: spacing.sm },
  vHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vNome: { flexShrink: 1, color: colors.navy, fontWeight: '800', fontSize: 17, letterSpacing: -0.3 },
  vUltima: { color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  vStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { minWidth: 64 },
  metricVal: { color: colors.navy, fontWeight: '800', fontSize: 20 },
  metricValForte: { color: colors.oro },
  metricLbl: { color: colors.testoSoft, fontSize: 11, fontWeight: '600' },

  feedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  feedInfo: { flex: 1 },
  feedNegozio: { color: colors.navy, fontWeight: '700', fontSize: 15 },
  feedMeta: { color: colors.testoSoft, fontSize: 12 },
});
