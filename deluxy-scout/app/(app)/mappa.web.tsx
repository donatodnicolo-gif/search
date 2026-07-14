// Variante WEB della schermata Mappa.
// react-native-maps è solo-nativo e non è bundlabile per il web: qui niente mappa,
// ma la stessa logica di giro (lib/giro) più lista target e navigazione Google Maps
// (che sul web apre maps.google.com in una nuova scheda).
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { distanzaKm, MILANO, posizioneCorrente, type Coord } from '@/lib/location';
import { ordinaGiro } from '@/lib/giro';
import { urlNavigazione, urlNavigazioneGiro } from '@/lib/nav';
import type { GeocodeResult } from '@/lib/geocode';
import { applicaFiltri, haFiltriAttivi, usePlaces } from '@/lib/usePlaces';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { AddressSearch } from '@/components/AddressSearch';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Loader } from '../_layout';

export default function MappaWeb() {
  const router = useRouter();
  const { places, loading, opzioni } = usePlaces();
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const [pos, setPos] = useState<Coord | null>(null);
  const [giroAttivo, setGiroAttivo] = useState(false);
  const [destinazione, setDestinazione] = useState<Coord | null>(null);

  useEffect(() => {
    posizioneCorrente().then(setPos);
  }, []);

  // Punto di partenza: l'indirizzo digitato, altrimenti la posizione GPS.
  const origine: Coord = destinazione ?? pos ?? MILANO;

  const filtrati = useMemo(() => applicaFiltri(places, filtri), [places, filtri]);
  const visibili = haFiltriAttivi(filtri) ? filtrati : places;

  const giro = useMemo(() => {
    if (!giroAttivo) return [];
    const base = haFiltriAttivi(filtri) ? filtrati : places;
    return ordinaGiro(base, origine);
  }, [giroAttivo, origine, filtrati, places, filtri]);

  const giroNav = useMemo(
    () => urlNavigazioneGiro(origine, giro.map((p) => ({ lat: p.lat, lng: p.lng }))),
    [origine, giro],
  );

  // Distanza di ciascuna tappa dalla precedente (solo in modalità giro).
  const distanzeTappe = useMemo(() => {
    let prec: Coord = origine;
    return giro.map((p) => {
      const d = distanzaKm(prec, { lat: p.lat, lng: p.lng });
      prec = { lat: p.lat, lng: p.lng };
      return d;
    });
  }, [giro, origine]);

  if (loading) return <Loader />;

  // Senza giro: se c'è una destinazione, ordina per vicinanza; altrimenti ordine base.
  const elenco = giroAttivo
    ? giro
    : destinazione
      ? [...visibili].sort(
          (a, b) =>
            distanzaKm(destinazione, { lat: a.lat, lng: a.lng }) -
            distanzaKm(destinazione, { lat: b.lat, lng: b.lng }),
        )
      : visibili;

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} />
      </View>

      <AddressSearch
        onSelect={(r: GeocodeResult) => setDestinazione({ lat: r.lat, lng: r.lng })}
        onClear={() => setDestinazione(null)}
      />

      <View style={styles.banner}>
        <Text style={styles.bannerTxt}>
          🗺️ La mappa interattiva è nell'app mobile. Qui trovi la lista dei target e il
          pianificatore di giro, con navigazione su Google Maps.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.lista}>
        {elenco.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna attività da mostrare.</Text>
        ) : (
          elenco.map((p, i) => (
            <View key={p.id} style={styles.card}>
              {giroAttivo ? <Text style={styles.num}>{i + 1}</Text> : null}
              <Pressable style={styles.cardInfo} onPress={() => router.push(`/(app)/attivita/${p.id}`)}>
                <View style={styles.cardHead}>
                  <PriorityBadge priorita={p.priorita} small />
                  <Text style={styles.cardNome} numberOfLines={1}>
                    {p.nome}
                  </Text>
                </View>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {[
                    p.zona,
                    p.linea_ipotizzata,
                    giroAttivo
                      ? `${distanzeTappe[i].toFixed(1)} km`
                      : destinazione
                        ? `${distanzaKm(destinazione, { lat: p.lat, lng: p.lng }).toFixed(1)} km`
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.cardNav}
                onPress={() => Linking.openURL(urlNavigazione({ lat: p.lat, lng: p.lng }, origine))}
              >
                <Text style={styles.cardNavTxt}>🧭</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.conteggio}>
          {giroAttivo ? `${giro.length} tappe` : `${visibili.length} attività`}
          {giroAttivo && giroNav?.troncato ? ` · naviga prime ${giroNav.tappeIncluse}` : ''}
        </Text>
        <View style={styles.footerAzioni}>
          {giroAttivo && giroNav ? (
            <Pressable style={styles.btnNaviga} onPress={() => Linking.openURL(giroNav.url)}>
              <Text style={styles.btnNavigaTxt}>🧭 Naviga giro</Text>
            </Pressable>
          ) : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  filterBar: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
  },
  banner: {
    backgroundColor: '#EFE9DA',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerTxt: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  lista: { padding: spacing.md, paddingBottom: 90, gap: spacing.sm },
  vuoto: { color: colors.grigio, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  num: { width: 22, textAlign: 'center', color: colors.navy, fontWeight: '900', fontSize: 15 },
  cardInfo: { flex: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardNome: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  cardMeta: { color: colors.testoSoft, fontSize: 12, marginTop: 2 },
  cardNav: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  cardNavTxt: { fontSize: 18 },
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
  conteggio: { color: colors.navy, fontWeight: '700', fontSize: 13, flexShrink: 1 },
  footerAzioni: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  btnNaviga: {
    backgroundColor: colors.oro,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  btnNavigaTxt: { color: colors.navy, fontWeight: '900' },
  btnGiro: {
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  btnGiroOn: { backgroundColor: colors.oro },
  btnGiroTxt: { color: colors.bianco, fontWeight: '800' },
  btnGiroTxtOn: { color: colors.navy },
});
