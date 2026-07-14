import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, labelStato, radius, spacing } from '@/lib/theme';
import { distanzaKm } from '@/lib/location';
import { geocodeIndirizzo, type GeocodeResult } from '@/lib/geocode';
import { applicaFiltri, usePlaces } from '@/lib/usePlaces';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { PriorityBadge } from '@/components/PriorityBadge';

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

export default function Lista() {
  const router = useRouter();
  const { places, loading, opzioni, ricarica } = usePlaces();
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const [query, setQuery] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [destinazione, setDestinazione] = useState<GeocodeResult | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoErrore, setGeoErrore] = useState<string | null>(null);

  async function vai() {
    const q = indirizzo.trim();
    if (!q) return;
    setGeoErrore(null);
    setGeoLoading(true);
    try {
      setDestinazione(await geocodeIndirizzo(q));
    } catch (e) {
      setDestinazione(null);
      setGeoErrore((e as Error).message);
    } finally {
      setGeoLoading(false);
    }
  }

  function azzeraDestinazione() {
    setDestinazione(null);
    setIndirizzo('');
    setGeoErrore(null);
  }

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = applicaFiltri(places, filtri).filter((p) => {
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        (p.indirizzo ?? '').toLowerCase().includes(q) ||
        (p.categoria ?? '').toLowerCase().includes(q) ||
        (p.zona ?? '').toLowerCase().includes(q)
      );
    });
    // Con una destinazione: ordina per vicinanza. Altrimenti: per priorità.
    if (destinazione) {
      const dest = { lat: destinazione.lat, lng: destinazione.lng };
      return [...f].sort(
        (a, b) => distanzaKm(dest, { lat: a.lat, lng: a.lng }) - distanzaKm(dest, { lat: b.lat, lng: b.lng }),
      );
    }
    return [...f].sort((a, b) => RANK[a.priorita] - RANK[b.priorita] || a.nome.localeCompare(b.nome));
  }, [places, filtri, query, destinazione]);

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        <View style={styles.addressRow}>
          <TextInput
            style={styles.address}
            value={indirizzo}
            onChangeText={setIndirizzo}
            placeholder="Dove vai? Indirizzo o zona…"
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={vai}
          />
          <Pressable style={[styles.btnVai, geoLoading && styles.btnVaiOff]} onPress={vai} disabled={geoLoading}>
            {geoLoading ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.btnVaiTxt}>Vai</Text>}
          </Pressable>
        </View>
        {destinazione ? (
          <Pressable style={styles.chip} onPress={azzeraDestinazione}>
            <Text style={styles.chipTxt} numberOfLines={1}>
              📍 Da: {destinazione.formatted_address}
            </Text>
            <Text style={styles.chipX}>✕</Text>
          </Pressable>
        ) : null}
        {geoErrore ? <Text style={styles.geoErrore}>{geoErrore}</Text> : null}
        <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per nome, indirizzo, zona…"
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
          <Text style={styles.vuoto}>
            {loading ? 'Caricamento…' : 'Nessuna attività con questi filtri.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Riga
            place={item}
            distanza={
              destinazione
                ? distanzaKm({ lat: destinazione.lat, lng: destinazione.lng }, { lat: item.lat, lng: item.lng })
                : null
            }
            onPress={() => router.push(`/(app)/attivita/${item.id}`)}
          />
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/(app)/nuovo-target')} accessibilityLabel="Nuovo target">
        <Text style={styles.fabTxt}>＋</Text>
      </Pressable>
    </View>
  );
}

function Riga({ place, distanza, onPress }: { place: Place; distanza: number | null; onPress: () => void }) {
  return (
    <Pressable style={styles.riga} onPress={onPress}>
      <View style={styles.rigaHead}>
        <PriorityBadge priorita={place.priorita} small />
        <Text style={styles.nome} numberOfLines={1}>
          {place.nome}
        </Text>
        {distanza != null ? (
          <Text style={styles.distanza}>{distanza.toFixed(1)} km</Text>
        ) : (
          <Text style={styles.stato}>{labelStato[place.stato]}</Text>
        )}
      </View>
      {place.linea_ipotizzata ? (
        <Text style={styles.linea}>
          <Text style={styles.lineaLabel}>Ipotesi: </Text>
          {place.linea_ipotizzata}
        </Text>
      ) : null}
      {place.indirizzo ? <Text style={styles.indirizzo} numberOfLines={1}>{place.indirizzo}</Text> : null}
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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  address: {
    flex: 1,
    backgroundColor: colors.bianco,
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  btnVai: {
    backgroundColor: colors.oro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minWidth: 64,
    alignItems: 'center',
  },
  btnVaiOff: { opacity: 0.6 },
  btnVaiTxt: { color: colors.navy, fontWeight: '900', fontSize: 15 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#EEF1F6',
    borderRadius: radius.pill,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  chipTxt: { flex: 1, color: colors.navy, fontWeight: '700', fontSize: 13 },
  chipX: { color: colors.grigio, fontWeight: '900', fontSize: 15 },
  geoErrore: { color: colors.errore, fontSize: 13, marginHorizontal: spacing.md, marginTop: spacing.sm, fontWeight: '600' },
  distanza: { fontSize: 13, color: colors.oro, fontWeight: '800' },
  list: { padding: spacing.md, gap: spacing.sm },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  riga: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 4,
  },
  rigaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.navy },
  stato: { fontSize: 12, color: colors.testoSoft, fontWeight: '600' },
  linea: { fontSize: 14, color: colors.navy },
  lineaLabel: { color: colors.oro, fontWeight: '800' },
  indirizzo: { fontSize: 13, color: colors.grigio },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.oro,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  fabTxt: { color: colors.navy, fontSize: 30, fontWeight: '900', marginTop: -2 },
});
