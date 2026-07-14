// Trattative: tutte le deal aperte, raggruppate per negozio.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, labelFase, radius, spacing } from '@/lib/theme';
import { fetchTutteTrattative, type TrattativaConLuogo } from '@/lib/db';

interface Sezione {
  title: string;
  placeId: string;
  data: TrattativaConLuogo[];
}

export default function Trattative() {
  const router = useRouter();
  const [deals, setDeals] = useState<TrattativaConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setDeals(await fetchTutteTrattative());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const sezioni = useMemo<Sezione[]>(() => {
    const q = query.trim().toLowerCase();
    const filtrate = q
      ? deals.filter((d) =>
          [d.place_nome, d.linea, labelFase[d.fase]]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(q)),
        )
      : deals;

    const map = new Map<string, Sezione>();
    for (const d of filtrate) {
      const key = d.place_id;
      if (!map.has(key)) {
        map.set(key, { title: d.place_nome ?? 'Senza negozio', placeId: key, data: [] });
      }
      map.get(key)!.data.push(d);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [deals, query]);

  const totale = useMemo(
    () => deals.reduce((s, d) => s + (d.valore_atteso ?? 0), 0),
    [deals],
  );

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          {deals.length} trattative · valore atteso € {totale.toLocaleString('it-IT')}
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
      </View>
      <SectionList
        sections={sezioni}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <Text style={styles.vuoto}>{loading ? 'Caricamento…' : 'Nessuna trattativa aperta.'}</Text>
        }
        renderSectionHeader={({ section }) => (
          <Pressable
            style={styles.sezioneHead}
            onPress={() => router.push(`/(app)/attivita/${(section as Sezione).placeId}`)}
          >
            <Text style={styles.sezioneTitolo} numberOfLines={1}>
              🏬 {section.title}
            </Text>
            <Text style={styles.sezioneConteggio}>{section.data.length}</Text>
          </Pressable>
        )}
        renderItem={({ item }) => <RigaDeal deal={item} />}
      />
    </View>
  );
}

function RigaDeal({ deal }: { deal: TrattativaConLuogo }) {
  return (
    <View style={styles.deal}>
      <View style={styles.dealHead}>
        <Text style={styles.dealLinea} numberOfLines={1}>
          {deal.linea ?? 'Trattativa'}
        </Text>
        {deal.valore_atteso ? (
          <Text style={styles.dealValore}>€ {deal.valore_atteso.toLocaleString('it-IT')}</Text>
        ) : null}
      </View>
      <View style={styles.dealMetaRow}>
        <View style={styles.faseBadge}>
          <Text style={styles.faseTxt}>{labelFase[deal.fase]}</Text>
        </View>
        {deal.hubspot_deal_id ? <Text style={styles.hs}>HubSpot ✓</Text> : null}
      </View>
      {deal.next_action ? <Text style={styles.nextAction}>→ {deal.next_action}</Text> : null}
    </View>
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
  list: { padding: spacing.md, paddingBottom: spacing.xl },
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
  hs: { color: colors.successo, fontWeight: '700', fontSize: 12 },
  nextAction: { color: colors.testoSoft, fontSize: 13 },
});
