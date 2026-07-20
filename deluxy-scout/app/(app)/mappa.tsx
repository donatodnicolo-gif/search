import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, coloreProprita, iconaStato, radius, spacing } from '@/lib/theme';
import { distanzaKm, MILANO, posizioneCorrente, type Coord } from '@/lib/location';
import { urlNavigazioneGiro } from '@/lib/nav';
import { ordinaGiro } from '@/lib/giro';
import type { GeocodeResult } from '@/lib/geocode';
import { env } from '@/lib/env';
import { applicaFiltri, haFiltriAttivi, usePlaces } from '@/lib/usePlaces';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { AddressSearch } from '@/components/AddressSearch';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Loader } from '../_layout';

export default function Mappa() {
  const router = useRouter();
  const { places, loading, opzioni } = usePlaces();
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const [pos, setPos] = useState<Coord | null>(null);
  const [giroAttivo, setGiroAttivo] = useState(false);
  const [pannelloAperto, setPannelloAperto] = useState(false);
  const [destinazione, setDestinazione] = useState<Coord | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    posizioneCorrente().then(setPos);
  }, []);

  // Punto di partenza del giro: l'indirizzo digitato, altrimenti la posizione GPS.
  const origine: Coord = destinazione ?? pos ?? MILANO;

  // Regola #1: di default la mappa mostra TUTTI i pin. I filtri sono opzionali
  // e servono soprattutto a costruire il giro; non nascondono i pin finché
  // l'utente non attiva "Pianifica giro".
  const filtrati = useMemo(() => applicaFiltri(places, filtri), [places, filtri]);
  const visibili = giroAttivo && haFiltriAttivi(filtri) ? filtrati : places;

  // Pianificatore di giro: ordina per priorità poi prossimità (nearest-neighbor).
  const giro = useMemo(() => {
    if (!giroAttivo) return [];
    const base = haFiltriAttivi(filtri) ? filtrati : places;
    return ordinaGiro(base, origine);
  }, [giroAttivo, origine, filtrati, places, filtri]);

  // URL Google Maps per navigare l'intero giro (origine → tappe → destinazione).
  const giroNav = useMemo(
    () => urlNavigazioneGiro(origine, giro.map((p) => ({ lat: p.lat, lng: p.lng }))),
    [origine, giro],
  );

  // Distanza di ciascuna tappa dalla precedente (dall'origine per la prima).
  const distanzeTappe = useMemo(() => {
    let prec: Coord = origine;
    return giro.map((p) => {
      const d = distanzaKm(prec, { lat: p.lat, lng: p.lng });
      prec = { lat: p.lat, lng: p.lng };
      return d;
    });
  }, [giro, origine]);

  // L'operatore digita "dove va": ricentra la mappa e apre il giro da lì.
  function onSelectDestinazione(r: GeocodeResult) {
    const c = { lat: r.lat, lng: r.lng };
    setDestinazione(c);
    setGiroAttivo(true);
    setPannelloAperto(true);
    mapRef.current?.animateToRegion(
      { latitude: c.lat, longitude: c.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      600,
    );
  }

  function chiudiGiro() {
    setGiroAttivo(false);
    setPannelloAperto(false);
  }

  if (loading) return <Loader />;

  return (
    <View style={styles.container}>
      {env.hasGoogleMaps() ? (
        <MapView
          ref={mapRef}
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
                { latitude: origine.lat, longitude: origine.lng },
                ...giro.map((p) => ({ latitude: p.lat, longitude: p.lng })),
              ]}
              strokeColor={colors.oro}
              strokeWidth={4}
            />
          ) : null}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={44} color={colors.grigio} style={{ marginBottom: spacing.sm }} />
          <Text style={styles.mapPlaceholderTitolo}>Mappa non ancora configurata</Text>
          <Text style={styles.mapPlaceholderTxt}>
            Aggiungi le chiavi Google Maps per vedere i pin sul territorio. Intanto usa la scheda
            “Target” per la lista completa delle {visibili.length} attività.
          </Text>
        </View>
      )}

      {giroAttivo && giro.length > 0 && pannelloAperto ? (
        <View style={styles.pannello}>
          <View style={styles.pannelloHead}>
            <Text style={styles.pannelloTitolo}>Giro · {giro.length} tappe</Text>
            {giroNav?.troncato ? (
              <Text style={styles.pannelloNota}>Naviga: prime {giroNav.tappeIncluse}</Text>
            ) : null}
          </View>
          <ScrollView style={styles.pannelloLista}>
            {giro.map((p, i) => (
              <Pressable
                key={p.id}
                style={styles.tappa}
                onPress={() => router.push(`/(app)/attivita/${p.id}`)}
              >
                <Text style={styles.tappaNum}>{i + 1}</Text>
                <PriorityBadge priorita={p.priorita} small />
                <View style={styles.tappaInfo}>
                  <Text style={styles.tappaNome} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  <Text style={styles.tappaMeta} numberOfLines={1}>
                    {[p.zona, `${distanzeTappe[i].toFixed(1)} km`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.tappaChevron}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.footer}>
        {giroAttivo ? (
          <>
            <Pressable style={styles.conteggioBtn} onPress={() => setPannelloAperto((v) => !v)}>
              <Text style={styles.conteggio}>
                {giro.length} tappe{' '}
                {giro.length > 0 ? (
                  <Ionicons
                    name={pannelloAperto ? 'chevron-down' : 'chevron-forward'}
                    size={12}
                    color={colors.navy}
                  />
                ) : null}
              </Text>
            </Pressable>
            <View style={styles.footerAzioni}>
              {giroNav ? (
                <Pressable style={styles.btnNaviga} onPress={() => Linking.openURL(giroNav.url)}>
                  <Text style={styles.btnNavigaTxt}>
                    <Ionicons name="navigate-outline" size={15} color={colors.bianco} /> Naviga
                  </Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.btnChiudi} onPress={chiudiGiro}>
                <Text style={styles.btnChiudiTxt}>Chiudi</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.conteggio}>{visibili.length} attività</Text>
            <Pressable
              style={styles.btnGiro}
              onPress={() => {
                setGiroAttivo(true);
                setPannelloAperto(true);
              }}
            >
              <Text style={styles.btnGiroTxt}>Pianifica giro</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Controlli in cima, sopra la mappa: filtri + "Dove vai?" con suggerimenti. */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.filterBar}>
          <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} />
          {/* Legenda dei glifi disegnati sui pin (stato del negozio). */}
          <Text style={styles.legenda}>Pin: ○ da visitare · ◐ visitato · ★ cliente · ✕ perso</Text>
        </View>
        <AddressSearch onSelect={onSelectDestinazione} onClear={() => setDestinazione(null)} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
  filterBar: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  legenda: { color: colors.grigio, fontSize: 11, paddingHorizontal: spacing.md, paddingBottom: 6 },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.sfondo,
  },
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
  conteggioBtn: { paddingVertical: 6, paddingRight: spacing.sm },
  btnGiro: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  btnGiroTxt: { color: colors.bianco, fontWeight: '800' },
  footerAzioni: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // Azione primaria DS: pillola nera (ink), mai oro.
  btnNaviga: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  btnNavigaTxt: { color: colors.bianco, fontWeight: '600' },
  btnChiudi: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  btnChiudiTxt: { color: colors.testo, fontWeight: '600' },
  // Pannello elenco tappe (sopra il footer).
  pannello: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 76,
    maxHeight: '46%',
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pannelloHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
  },
  pannelloTitolo: { color: colors.navy, fontWeight: '900', fontSize: 15 },
  pannelloNota: { color: colors.oro, fontWeight: '700', fontSize: 12 },
  pannelloLista: { paddingHorizontal: spacing.sm },
  tappa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
  },
  tappaNum: {
    width: 22,
    textAlign: 'center',
    color: colors.navy,
    fontWeight: '900',
    fontSize: 15,
  },
  tappaInfo: { flex: 1 },
  tappaNome: { color: colors.navy, fontWeight: '700', fontSize: 15 },
  tappaMeta: { color: colors.testoSoft, fontSize: 12, marginTop: 1 },
  tappaChevron: { color: colors.grigio, fontSize: 20, fontWeight: '700' },
});
