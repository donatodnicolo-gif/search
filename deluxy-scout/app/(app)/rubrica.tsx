// Rubrica: tutti i contatti registrati nell'app, condivisi con HubSpot.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchTuttiContatti, type ContattoConLuogo } from '@/lib/db';

export default function Rubrica() {
  const router = useRouter();
  const [contatti, setContatti] = useState<ContattoConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setContatti(await fetchTuttiContatti());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contatti;
    return contatti.filter((c) =>
      [c.nome, c.ruolo, c.place_nome, c.telefono, c.email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [contatti, query]);

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>Contatti registrati · sincronizzati con HubSpot</Text>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per nome, ruolo, negozio, telefono…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={dati}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <Text style={styles.vuoto}>{loading ? 'Caricamento…' : 'Nessun contatto registrato.'}</Text>
        }
        renderItem={({ item }) => (
          <Contatto contatto={item} onOpenPlace={() => router.push(`/(app)/attivita/${item.place_id}`)} />
        )}
      />
    </View>
  );
}

function Contatto({ contatto: c, onOpenPlace }: { contatto: ContattoConLuogo; onOpenPlace: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.nome} numberOfLines={1}>
          {c.nome} {c.is_decisore ? '⭐' : ''}
        </Text>
        <View style={[styles.badge, c.hubspot_contact_id ? styles.badgeOk : styles.badgeAttesa]}>
          <Text style={[styles.badgeTxt, c.hubspot_contact_id ? styles.badgeTxtOk : styles.badgeTxtAttesa]}>
            {c.hubspot_contact_id ? 'HubSpot ✓' : 'da sync'}
          </Text>
        </View>
      </View>
      {c.ruolo ? <Text style={styles.meta}>{c.ruolo}</Text> : null}
      {c.place_nome ? (
        <Pressable onPress={onOpenPlace}>
          <Text style={styles.negozio}>🏬 {c.place_nome}</Text>
        </Pressable>
      ) : null}
      {c.place_linea ? (
        <View style={styles.lineaTag}>
          <Text style={styles.lineaTagTxt}>{c.place_linea}</Text>
        </View>
      ) : null}
      <View style={styles.azioni}>
        {c.telefono ? (
          <Pressable style={styles.azione} onPress={() => Linking.openURL(`tel:${c.telefono}`)}>
            <Text style={styles.azioneTxt}>📞 {c.telefono}</Text>
          </Pressable>
        ) : null}
        {c.email ? (
          <Pressable style={styles.azione} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
            <Text style={styles.azioneTxt}>✉️ {c.email}</Text>
          </Pressable>
        ) : null}
      </View>
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
  list: { padding: spacing.md, gap: spacing.sm },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 4,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.navy },
  meta: { color: colors.testoSoft, fontSize: 13 },
  negozio: { color: colors.navy, fontSize: 14, fontWeight: '600', marginTop: 2 },
  lineaTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3E9D6',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  lineaTagTxt: { color: colors.oro, fontWeight: '800', fontSize: 12 },
  azioni: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  azione: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  azioneTxt: { color: colors.oro, fontWeight: '700', fontSize: 13 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOk: { backgroundColor: '#E3F0EA' },
  badgeAttesa: { backgroundColor: '#F3E9D6' },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  badgeTxtOk: { color: colors.successo },
  badgeTxtAttesa: { color: colors.attenzione },
});
