// Sezione "Nascosti": attività segnate "non interessanti". Si possono ripristinare.
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { EmptyState } from '@/components/ui';
import { LineaIcon } from '@/components/LineaIcon';
import { aggiornaNascosto, fetchNascosti } from '@/lib/db';
import { PriorityBadge } from '@/components/PriorityBadge';

export default function Nascosti() {
  const [dati, setDati] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setDati(await fetchNascosti());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  async function ripristina(p: Place) {
    setDati((l) => l.filter((x) => x.id !== p.id));
    try {
      await aggiornaNascosto(p.id, false);
    } catch {
      carica();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          Attività segnate "non interessanti". Ripristinale per rivederle nella scoperta.
        </Text>
      </View>
      <FlatList
        data={dati}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            icona="eye-off-outline"
            titolo="Nessuna attività nascosta"
            aiuto="Le attività che segni come non interessanti finiscono qui: puoi ripristinarle quando vuoi."
            loading={loading}
          />
        }
        renderItem={({ item: p }) => (
          <View style={styles.card}>
            <View style={styles.icona}>
              <LineaIcon linea={p.linea_ipotizzata} size={22} color={colors.navy} />
            </View>
            <View style={styles.info}>
              <View style={styles.titoloRow}>
                <PriorityBadge priorita={p.priorita} small />
                <Text style={styles.nome} numberOfLines={1}>
                  {p.nome}
                </Text>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {[p.linea_ipotizzata, p.indirizzo].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
            <Pressable style={styles.btn} onPress={() => ripristina(p)}>
              <Text style={styles.btnTxt}>Ripristina</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sub: { color: colors.testoSoft, fontSize: 13 },
  list: { padding: spacing.md, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bianco,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  icona: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 3 },
  titoloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flexShrink: 1, color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  meta: { color: colors.testoSoft, fontSize: 13 },
  btn: {
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  btnTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
});
