// Sezione "Da completare": negozi con visita segnata ma info non ancora inserite.
// Tap → riapre il pop-up visita per aggiungere contatto e note.
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Place } from '@/types';
import { colors, iconaLinea, radius, spacing } from '@/lib/theme';
import { fetchDaCompletare } from '@/lib/db';
import { PriorityBadge } from '@/components/PriorityBadge';
import { VisitaModal } from '@/components/VisitaModal';

export default function DaCompletare() {
  const [dati, setDati] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Place | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setDati(await fetchDaCompletare());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          Visite segnate da completare — tocca per aggiungere contatto e note.
        </Text>
      </View>
      <FlatList
        data={dati}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <Text style={styles.vuoto}>{loading ? 'Caricamento…' : 'Niente da completare 🎉'}</Text>
        }
        renderItem={({ item: p }) => (
          <Pressable style={styles.card} onPress={() => setSel(p)}>
            <View style={styles.icona}>
              <Text style={styles.iconaEmoji}>{iconaLinea(p.linea_ipotizzata)}</Text>
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
            <Text style={styles.freccia}>Completa ›</Text>
          </Pressable>
        )}
      />
      <VisitaModal
        place={sel}
        onClose={() => setSel(null)}
        onDone={() => {
          setSel(null);
          carica();
        }}
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
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
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
  icona: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#F0ECE2', alignItems: 'center', justifyContent: 'center' },
  iconaEmoji: { fontSize: 22 },
  info: { flex: 1, gap: 3 },
  titoloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flexShrink: 1, color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  meta: { color: colors.testoSoft, fontSize: 13 },
  freccia: { color: colors.oro, fontWeight: '800', fontSize: 14 },
});
