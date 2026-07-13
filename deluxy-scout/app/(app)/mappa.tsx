import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, coloreProprita, iconaStato, radius, spacing } from '@/lib/theme';
import { MILANO, posizioneCorrente, type Coord } from '@/lib/location';
import { env } from '@/lib/env';
import { applicaFiltri, haFiltriAttivi, usePlaces } from '@/lib/usePlaces';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { Loader } from '../_layout';

export default function Mappa() {
  const router = useRouter();
  const { places, loading, opzioni } = usePlaces();
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const [pos, setPos] = useState<Coord | null>(null);
  const [giroAttivo, setGiroAttivo] = useState(false);

  useEffect(() => {
    posizioneCorrente().then(setPos);
  }, []);

  // Regola #1: di default la mappa mostra TUTTI i pin. I filtri sono opzionali
  // e servono soprattutto a costruire il giro; non nascondono i pin finché
  // l'utente non attiva "Pianifica giro".
  const filtrati = useMemo(() => applicaFiltri(places, filtri), [places, filtri]);
  const visibili = giroAttivo && haFiltriAttivi(filtri) ? filtrati : places;

  // Pianificatore di giro: ordina per priorità poi prossimità (nearest-neighbor).
  const giro = useMemo(() => {
    if (!giroAttivo) return [];
    const partenza = pos ?? MILANO;
    const base = haFiltriAttivi(filtri) ? filtrati : places;
    return ordinaGiro(base, partenza);
  }, [giroAttivo, pos, filtrati, places, filtri]);

  if (loading) return <Loader />;

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} />
      </View>

      {env.hasGoogleMaps() ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          showsUserLocation
          initialRegion={{
            latitude: (pos ?? MILANO).lat,
            longitude: (pos ?? MILANO).lng,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
        >
          {visibili.map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              onPress={() => router.push(`/(app)/attivita/${p.id}`)}
              tracksViewChanges={false}
            >
              <PinAttivita place={p} />
            </Marker>
          ))}

          {giro.length > 1 ? (
            <Polyline
              coordinates={[
                ...(pos ? [{ latitude: pos.lat, longitude: pos.lng }] : []),
                ...giro.map((p) => ({ latitude: p.lat, longitude: p.lng })),
              ]}
              strokeColor={colors.oro}
              strokeWidth={4}
            />
          ) : null}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderIco}>🗺️</Text>
          <Text style={styles.mapPlaceholderTitolo}>Mappa non ancora configurata</Text>
          <Text style={styles.mapPlaceholderTxt}>
            Aggiungi le chiavi Google Maps per vedere i pin sul territorio. Intanto usa la scheda
            “Target” per la lista completa delle {visibili.length} attività.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.conteggio}>
          {visibili.length} attività{giroAttivo && giro.length ? ` · giro di ${giro.length} tappe` : ''}
        </Text>
        <Pressable
          style={[styles.btnGiro, giroAttivo && styles.btnGiroOn]}
          onPress={() => setGiroAttivo((v) => !v)}
        >
          <Text style={[styles.btnGiroTxt, giroAttivo && styles.btnGiroTxtOn]}>
            {giroAttivo ? 'Chiudi giro' : 'Pianifica giro'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function PinAttivita({ place }: { place: Place }) {
  return (
    <View style={[styles.pin, { backgroundColor: coloreProprita[place.priorita] }]}>
      <Text style={styles.pinStato}>{iconaStato[place.stato]}</Text>
    </View>
  );
}

/** Ordina per priorità (P1>P2>P3) e poi costruisce un percorso greedy
 *  a partire dalla posizione corrente (nearest-neighbor). */
function ordinaGiro(places: Place[], partenza: Coord): Place[] {
  const rank: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
  const restanti = [...places].sort((a, b) => rank[a.priorita] - rank[b.priorita]);
  const percorso: Place[] = [];
  let corrente = partenza;
  // Greedy dentro ciascun livello di priorità per non "saltare" P1.
  for (const livello of ['P1', 'P2', 'P3']) {
    let pool = restanti.filter((p) => p.priorita === livello);
    while (pool.length) {
      pool.sort((a, b) => dist(corrente, a) - dist(corrente, b));
      const prossimo = pool.shift()!;
      percorso.push(prossimo);
      corrente = { lat: prossimo.lat, lng: prossimo.lng };
    }
  }
  return percorso;
}

function dist(a: Coord, b: { lat: number; lng: number }): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng; // sufficiente per ordinare
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  filterBar: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.sfondo,
  },
  mapPlaceholderIco: { fontSize: 44, marginBottom: spacing.sm },
  mapPlaceholderTitolo: { fontSize: 18, fontWeight: '800', color: colors.navy, marginBottom: spacing.sm },
  mapPlaceholderTxt: { fontSize: 14, color: colors.testoSoft, textAlign: 'center', lineHeight: 20 },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.bianco,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinStato: { color: colors.bianco, fontSize: 13, fontWeight: '900' },
  footer: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bianco,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  conteggio: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  btnGiro: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  btnGiroOn: { backgroundColor: colors.oro },
  btnGiroTxt: { color: colors.bianco, fontWeight: '800' },
  btnGiroTxtOn: { color: colors.navy },
});
