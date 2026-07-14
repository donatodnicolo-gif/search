// Variante WEB della schermata Mappa.
// react-native-maps è solo-nativo: qui niente mappa, ma il flusso "scoperta":
// digiti un indirizzo → l'app trova i negozi della zona da Google (con cache),
// li classifica per linea, tu ⭐ quelli interessanti (= giro) e navighi.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { distanzaKm, MILANO, posizioneCorrente, type Coord } from '@/lib/location';
import { ordinaGiro } from '@/lib/giro';
import { urlNavigazione, urlNavigazioneGiro } from '@/lib/nav';
import type { GeocodeResult } from '@/lib/geocode';
import { scopriNegozi, type ScopertaResult } from '@/lib/discover';
import { aggiornaStarred } from '@/lib/db';
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
  const [scoperti, setScoperti] = useState<Place[]>([]);
  const [scopLoading, setScopLoading] = useState(false);
  const [scopInfo, setScopInfo] = useState<ScopertaResult | null>(null);
  const [scopErrore, setScopErrore] = useState<string | null>(null);

  useEffect(() => {
    posizioneCorrente().then(setPos);
  }, []);

  const origine: Coord = destinazione ?? pos ?? MILANO;

  async function onSelectDestinazione(r: GeocodeResult) {
    const c = { lat: r.lat, lng: r.lng };
    setDestinazione(c);
    setGiroAttivo(false);
    setScopErrore(null);
    setScopLoading(true);
    try {
      const res = await scopriNegozi(c.lat, c.lng, 400);
      setScoperti(res.places);
      setScopInfo(res);
    } catch (e) {
      setScoperti([]);
      setScopInfo(null);
      setScopErrore((e as Error).message);
    } finally {
      setScopLoading(false);
    }
  }

  function azzera() {
    setDestinazione(null);
    setScoperti([]);
    setScopInfo(null);
    setScopErrore(null);
    setGiroAttivo(false);
  }

  async function toggleStar(p: Place) {
    const nuovo = !p.starred;
    setScoperti((l) => l.map((x) => (x.id === p.id ? { ...x, starred: nuovo, novita: false } : x)));
    try {
      await aggiornaStarred(p.id, nuovo);
    } catch {
      setScoperti((l) => l.map((x) => (x.id === p.id ? { ...x, starred: !nuovo } : x)));
    }
  }

  const filtrati = useMemo(() => applicaFiltri(places, filtri), [places, filtri]);
  const visibili = haFiltriAttivi(filtri) ? filtrati : places;
  const scopertiFiltrati = useMemo(() => applicaFiltri(scoperti, filtri), [scoperti, filtri]);

  // In modalità scoperta il giro parte dai negozi ⭐ (se ce ne sono), altrimenti da tutti.
  const giro = useMemo(() => {
    if (!giroAttivo) return [];
    if (destinazione) {
      const stellati = scopertiFiltrati.filter((p) => p.starred);
      return ordinaGiro(stellati.length ? stellati : scopertiFiltrati, origine);
    }
    return ordinaGiro(haFiltriAttivi(filtri) ? filtrati : places, origine);
  }, [giroAttivo, destinazione, scopertiFiltrati, origine, filtrati, places, filtri]);

  const giroNav = useMemo(
    () => urlNavigazioneGiro(origine, giro.map((p) => ({ lat: p.lat, lng: p.lng }))),
    [origine, giro],
  );

  const distanzeTappe = useMemo(() => {
    let prec: Coord = origine;
    return giro.map((p) => {
      const d = distanzaKm(prec, { lat: p.lat, lng: p.lng });
      prec = { lat: p.lat, lng: p.lng };
      return d;
    });
  }, [giro, origine]);

  if (loading) return <Loader />;

  const elenco = giroAttivo ? giro : destinazione ? scopertiFiltrati : visibili;
  const stellatiCount = scopertiFiltrati.filter((p) => p.starred).length;

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} />
      </View>

      <AddressSearch onSelect={onSelectDestinazione} onClear={azzera} />

      <View style={styles.banner}>
        {scopLoading ? (
          <View style={styles.bannerRow}>
            <ActivityIndicator color={colors.navy} />
            <Text style={styles.bannerTxt}>Cerco i negozi della zona su Google…</Text>
          </View>
        ) : scopErrore ? (
          <Text style={[styles.bannerTxt, { color: colors.errore }]}>{scopErrore}</Text>
        ) : destinazione && scopInfo ? (
          <Text style={styles.bannerTxt}>
            {scopInfo.places.length} attività nella zona
            {scopInfo.nuovi ? ` · ${scopInfo.nuovi} novità` : ''}
            {scopInfo.cached ? ' · da cache' : ' · aggiornato da Google'}
            {stellatiCount ? ` · ${stellatiCount} ⭐ nel giro` : ''}. Metti ⭐ sui negozi interessanti.
          </Text>
        ) : (
          <Text style={styles.bannerTxt}>
            🔎 Digita un indirizzo qui sopra: trovo i negozi della zona, li classifico per linea e tu
            scegli con ⭐ quali visitare.
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.lista}>
        {elenco.length === 0 ? (
          <Text style={styles.vuoto}>
            {destinazione ? 'Nessun negozio trovato in questa zona.' : 'Digita un indirizzo per iniziare.'}
          </Text>
        ) : (
          elenco.map((p, i) => (
            <View key={p.id} style={styles.card}>
              {giroAttivo ? (
                <Text style={styles.num}>{i + 1}</Text>
              ) : (
                <Pressable onPress={() => toggleStar(p)} hitSlop={6} style={styles.star}>
                  <Text style={[styles.starTxt, p.starred && styles.starOn]}>{p.starred ? '⭐' : '☆'}</Text>
                </Pressable>
              )}
              <Pressable style={styles.cardInfo} onPress={() => router.push(`/(app)/attivita/${p.id}`)}>
                <View style={styles.cardHead}>
                  <PriorityBadge priorita={p.priorita} small />
                  <Text style={styles.cardNome} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  {p.novita ? (
                    <View style={styles.novita}>
                      <Text style={styles.novitaTxt}>NOVITÀ</Text>
                    </View>
                  ) : null}
                  {p.hubspot_deal_aperta ? <Text style={styles.hs}>● trattativa</Text> : null}
                </View>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {[
                    p.linea_ipotizzata,
                    p.indirizzo,
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
          {giroAttivo
            ? `${giro.length} tappe`
            : destinazione
              ? `${scopertiFiltrati.length} attività`
              : `${visibili.length} attività`}
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
              {giroAttivo ? 'Chiudi giro' : stellatiCount ? `Giro (${stellatiCount} ⭐)` : 'Pianifica giro'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  filterBar: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  banner: { backgroundColor: '#EFE9DA', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  num: { width: 24, textAlign: 'center', color: colors.navy, fontWeight: '900', fontSize: 15 },
  star: { width: 24, alignItems: 'center' },
  starTxt: { fontSize: 20, color: colors.grigio },
  starOn: { color: colors.oro },
  cardInfo: { flex: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardNome: { flexShrink: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  novita: { backgroundColor: colors.oro, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  novitaTxt: { color: colors.navy, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },
  hs: { color: colors.successo, fontWeight: '800', fontSize: 11 },
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
  btnNaviga: { backgroundColor: colors.oro, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  btnNavigaTxt: { color: colors.navy, fontWeight: '900' },
  btnGiro: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  btnGiroOn: { backgroundColor: colors.oro },
  btnGiroTxt: { color: colors.bianco, fontWeight: '800' },
  btnGiroTxtOn: { color: colors.navy },
});
