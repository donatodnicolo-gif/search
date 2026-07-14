// Variante WEB della schermata Mappa — flusso "Scoperta sul territorio".
// Digiti un indirizzo → l'app trova i negozi della zona da Google (con cache),
// li classifica per linea, tu ⭐ quelli interessanti (= giro) e navighi.
// Layout curato in stile Apple: liste raggruppate, icone tipologia, filtri a pillole.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, iconaLinea, radius, spacing } from '@/lib/theme';
import { distanzaKm, MILANO, posizioneCorrente, type Coord } from '@/lib/location';
import { ordinaGiro } from '@/lib/giro';
import { urlNavigazione, urlNavigazioneGiro } from '@/lib/nav';
import type { GeocodeResult } from '@/lib/geocode';
import { scopriNegozi, type ScopertaResult } from '@/lib/discover';
import { aggiornaStarred } from '@/lib/db';
import { usePlaces } from '@/lib/usePlaces';
import { AddressSearch } from '@/components/AddressSearch';
import { Loader } from '../_layout';

const PRIO_COLORE: Record<string, string> = { P1: colors.oro, P2: colors.navy, P3: colors.grigio };

export default function MappaWeb() {
  const router = useRouter();
  const { loading } = usePlaces();
  const [pos, setPos] = useState<Coord | null>(null);
  const [giroAttivo, setGiroAttivo] = useState(false);
  const [destinazione, setDestinazione] = useState<Coord | null>(null);
  const [scoperti, setScoperti] = useState<Place[]>([]);
  const [scopLoading, setScopLoading] = useState(false);
  const [scopInfo, setScopInfo] = useState<ScopertaResult | null>(null);
  const [scopErrore, setScopErrore] = useState<string | null>(null);
  const [filtroLinea, setFiltroLinea] = useState<string | null>(null);

  useEffect(() => {
    posizioneCorrente().then(setPos);
  }, []);

  const origine: Coord = destinazione ?? pos ?? MILANO;

  async function onSelectDestinazione(r: GeocodeResult) {
    const c = { lat: r.lat, lng: r.lng };
    setDestinazione(c);
    setGiroAttivo(false);
    setFiltroLinea(null);
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
    setFiltroLinea(null);
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

  // Tipologie presenti tra i risultati (per il filtro a pillole).
  const lineePresenti = useMemo(() => {
    const set = new Set<string>();
    for (const p of scoperti) if (p.linea_ipotizzata) set.add(p.linea_ipotizzata);
    return [...set].sort();
  }, [scoperti]);

  const scopertiFiltrati = useMemo(
    () => (filtroLinea ? scoperti.filter((p) => p.linea_ipotizzata === filtroLinea) : scoperti),
    [scoperti, filtroLinea],
  );

  const giro = useMemo(() => {
    if (!giroAttivo) return [];
    const stellati = scopertiFiltrati.filter((p) => p.starred);
    return ordinaGiro(stellati.length ? stellati : scopertiFiltrati, origine);
  }, [giroAttivo, scopertiFiltrati, origine]);

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

  const elenco = giroAttivo ? giro : scopertiFiltrati;
  const stellatiCount = scopertiFiltrati.filter((p) => p.starred).length;

  return (
    <View style={styles.container}>
      <AddressSearch onSelect={onSelectDestinazione} onClear={azzera} />

      {/* Caption di stato, leggera */}
      <View style={styles.caption}>
        {scopLoading ? (
          <View style={styles.capRow}>
            <ActivityIndicator color={colors.navy} size="small" />
            <Text style={styles.capTxt}>Cerco i negozi della zona…</Text>
          </View>
        ) : scopErrore ? (
          <Text style={[styles.capTxt, { color: colors.errore }]}>{scopErrore}</Text>
        ) : destinazione && scopInfo ? (
          <Text style={styles.capTxt}>
            {scopInfo.places.length} attività · {scopInfo.nuovi ? `${scopInfo.nuovi} novità · ` : ''}
            {scopInfo.cached ? 'da cache' : 'da Google'}
            {stellatiCount ? ` · ${stellatiCount} ⭐ nel giro` : ''}
          </Text>
        ) : (
          <Text style={styles.capTxt}>Digita un indirizzo per scoprire i negozi della zona.</Text>
        )}
      </View>

      {/* Filtro tipologia a pillole (solo in scoperta) */}
      {destinazione && lineePresenti.length > 0 && !giroAttivo ? (
        <View style={styles.segmentWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segment}>
            <Segmento label="Tutte" on={filtroLinea === null} onPress={() => setFiltroLinea(null)} />
            {lineePresenti.map((l) => (
              <Segmento
                key={l}
                label={`${iconaLinea(l)} ${l}`}
                on={filtroLinea === l}
                onPress={() => setFiltroLinea((v) => (v === l ? null : l))}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.lista}>
        {elenco.length === 0 ? (
          <Text style={styles.vuoto}>
            {destinazione ? 'Nessun negozio in questa selezione.' : 'Nessun risultato ancora.'}
          </Text>
        ) : (
          elenco.map((p, i) => (
            <Pressable
              key={p.id}
              style={styles.card}
              onPress={() => router.push(`/(app)/attivita/${p.id}`)}
            >
              {/* Icona tipologia (o numero tappa nel giro) */}
              {giroAttivo ? (
                <View style={[styles.icona, { backgroundColor: colors.navy }]}>
                  <Text style={styles.iconaNum}>{i + 1}</Text>
                </View>
              ) : (
                <View style={styles.icona}>
                  <Text style={styles.iconaEmoji}>{iconaLinea(p.linea_ipotizzata)}</Text>
                </View>
              )}

              {/* Testo */}
              <View style={styles.info}>
                <View style={styles.titoloRow}>
                  <Text style={styles.nome} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  {p.novita ? (
                    <View style={styles.novita}>
                      <Text style={styles.novitaTxt}>NOVITÀ</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.metaRow}>
                  <View style={[styles.prioDot, { backgroundColor: PRIO_COLORE[p.priorita] }]} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {[
                      p.linea_ipotizzata,
                      giroAttivo
                        ? `${distanzeTappe[i].toFixed(1)} km`
                        : destinazione
                          ? `${distanzaKm(destinazione, { lat: p.lat, lng: p.lng }).toFixed(1)} km`
                          : null,
                    ]
                      .filter(Boolean)
                      .join('  ·  ') || '—'}
                  </Text>
                  {p.hubspot_deal_aperta ? <Text style={styles.hs}>● trattativa</Text> : null}
                </View>
              </View>

              {/* Azioni */}
              <Pressable
                style={styles.azione}
                hitSlop={8}
                onPress={() => Linking.openURL(urlNavigazione({ lat: p.lat, lng: p.lng }, origine))}
              >
                <Text style={styles.azioneIco}>🧭</Text>
              </Pressable>
              {!giroAttivo ? (
                <Pressable style={styles.azione} hitSlop={8} onPress={() => toggleStar(p)}>
                  <Text style={[styles.stella, p.starred && styles.stellaOn]}>{p.starred ? '★' : '☆'}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Barra flottante giro */}
      <View style={styles.dock}>
        <Text style={styles.dockTxt}>
          {giroAttivo ? `${giro.length} tappe` : `${scopertiFiltrati.length} attività`}
          {giroAttivo && giroNav?.troncato ? ` · prime ${giroNav.tappeIncluse}` : ''}
        </Text>
        <View style={styles.dockAzioni}>
          {giroAttivo && giroNav ? (
            <Pressable style={styles.btnNaviga} onPress={() => Linking.openURL(giroNav.url)}>
              <Text style={styles.btnNavigaTxt}>🧭 Naviga</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.btnGiro, giroAttivo && styles.btnGiroOn]}
            onPress={() => setGiroAttivo((v) => !v)}
            disabled={!destinazione && !giroAttivo}
          >
            <Text style={[styles.btnGiroTxt, giroAttivo && styles.btnGiroTxtOn]}>
              {giroAttivo ? 'Chiudi' : stellatiCount ? `Giro · ${stellatiCount} ⭐` : 'Pianifica giro'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Segmento({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.seg, on && styles.segOn]} onPress={onPress}>
      <Text style={[styles.segTxt, on && styles.segTxtOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  caption: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  capTxt: { color: colors.testoSoft, fontSize: 13 },

  segmentWrap: { paddingBottom: spacing.xs },
  segment: { paddingHorizontal: spacing.md, gap: spacing.sm },
  seg: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  segOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  segTxt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  segTxtOn: { color: colors.bianco },

  lista: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: 96, gap: 10 },
  vuoto: { color: colors.grigio, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xl },

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
  icona: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#F0ECE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconaEmoji: { fontSize: 22 },
  iconaNum: { color: colors.bianco, fontWeight: '900', fontSize: 18 },
  info: { flex: 1, gap: 3 },
  titoloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flexShrink: 1, color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  novita: { backgroundColor: colors.oro, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  novitaTxt: { color: colors.navy, fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prioDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flexShrink: 1, color: colors.testoSoft, fontSize: 13 },
  hs: { color: colors.successo, fontWeight: '700', fontSize: 11 },
  azione: { paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  azioneIco: { fontSize: 18 },
  stella: { fontSize: 24, color: colors.grigioChiaro },
  stellaOn: { color: colors.oro },

  dock: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    paddingLeft: spacing.lg,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dockTxt: { color: colors.navy, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  dockAzioni: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnNaviga: { backgroundColor: colors.oro, borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: 11 },
  btnNavigaTxt: { color: colors.navy, fontWeight: '800' },
  btnGiro: { backgroundColor: colors.navy, borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: 11 },
  btnGiroOn: { backgroundColor: colors.oro },
  btnGiroTxt: { color: colors.bianco, fontWeight: '800' },
  btnGiroTxtOn: { color: colors.navy },
});
