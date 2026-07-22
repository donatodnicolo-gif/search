import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, coloreStato, labelStato, radius, shadow, spacing } from '@/lib/theme';
import { aggiornaNascosto } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { applicaFiltri, usePlaces } from '@/lib/usePlaces';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { PriorityBadge } from '@/components/PriorityBadge';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

export default function Lista() {
  const router = useRouter();
  const { places, loading, opzioni, ricarica } = usePlaces();
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const [query, setQuery] = useState('');

  async function nascondi(place: Place) {
    try {
      await aggiornaNascosto(place.id, true);
      ricarica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile rimuovere il target.');
    }
  }

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = applicaFiltri(places, filtri)
      .filter((p) => !p.nascosto) // i target "non interessanti" non compaiono qui
      .filter((p) => {
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        (p.indirizzo ?? '').toLowerCase().includes(q) ||
        (p.categoria ?? '').toLowerCase().includes(q) ||
        (p.zona ?? '').toLowerCase().includes(q) ||
        (p.linea_ipotizzata ?? '').toLowerCase().includes(q)
      );
    });
    return [...f].sort((a, b) => RANK[a.priorita] - RANK[b.priorita] || a.nome.localeCompare(b.nome));
  }, [places, filtri, query]);

  return (
    <View style={styles.container}>
      <PageIntro testo="I negozi obiettivo da visitare, in ordine di priorità. Tocca un negozio per aprire la sua scheda; l'occhio barrato lo nasconde se non è interessante." />
      <View style={styles.filterBar}>
        <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per nome, indirizzo, zona, linea…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={dati}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={ricarica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="flag-outline"
            titolo="Nessun negozio qui"
            aiuto="Prova ad azzerare filtri o ricerca, scopri nuovi negozi dalla Mappa, oppure aggiungi un target a mano col bottone +."
            azione="Vai alla Mappa"
            onAzione={() => router.push('/(app)/mappa')}
          />
        }
        renderItem={({ item }) => (
          <Riga place={item} onPress={() => router.push(`/(app)/attivita/${item.id}`)} onNascondi={() => nascondi(item)} />
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/(app)/nuovo-target')} accessibilityLabel="Nuovo target">
        <Ionicons name="add" size={30} color={colors.bianco} />
      </Pressable>
    </View>
  );
}

function Riga({ place, onPress, onNascondi }: { place: Place; onPress: () => void; onNascondi: () => void }) {
  return (
    <Pressable style={styles.riga} onPress={onPress}>
      <View style={styles.rigaHead}>
        <PriorityBadge priorita={place.priorita} small />
        <Text style={styles.nome} numberOfLines={1}>
          {place.nome}
        </Text>
        <StatusBadge small label={labelStato[place.stato]} colore={coloreStato[place.stato]} />
        <Pressable
          style={styles.nascondi}
          hitSlop={8}
          onPress={(e) => {
            (e as any)?.stopPropagation?.();
            onNascondi();
          }}
          accessibilityLabel="Rimuovi target (nascondi)"
        >
          <Ionicons name="eye-off-outline" size={18} color={colors.grigio} />
        </Pressable>
      </View>
      {place.linea_ipotizzata ? (
        <View style={styles.lineaTag}>
          <Text style={styles.lineaTagTxt}>{place.linea_ipotizzata}</Text>
        </View>
      ) : null}
      {place.indirizzo ? <Text style={styles.indirizzo} numberOfLines={1}>{place.indirizzo}</Text> : null}
      {place.creato_da_nome ? (
        <Text style={styles.inserito} numberOfLines={1}>
          <Ionicons name="person-outline" size={11} color={colors.grigio} /> Inserito da {place.creato_da_nome}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  filterBar: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
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
  riga: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 6,
  },
  rigaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.navy },
  stato: { fontSize: 12, color: colors.testoSoft, fontWeight: '600' },
  nascondi: { padding: 2 },
  // "Tipologia di interesse" = linea Deluxy, come tag oro.
  lineaTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  indirizzo: { fontSize: 13, color: colors.grigio },
  inserito: { fontSize: 12, color: colors.grigio, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontSize: 30, fontWeight: '400', marginTop: -2 },
});
