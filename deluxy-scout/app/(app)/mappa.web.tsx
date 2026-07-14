// Variante WEB della schermata Mappa — flusso "Scoperta sul territorio".
// Digiti un indirizzo → l'app trova i negozi della zona da Google (con cache),
// li classifica per linea, tu ⭐ quelli interessanti (= giro) e navighi.
// Layout curato in stile Apple: liste raggruppate, icone tipologia, filtri a pillole.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LINEE_ATTIVE, type Place } from '@/types';
import { colors, iconaLinea, radius, spacing } from '@/lib/theme';

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
import { distanzaKm, MILANO, posizioneCorrente, type Coord } from '@/lib/location';
import { ordinaGiro } from '@/lib/giro';
import { urlNavigazione, urlNavigazioneGiro } from '@/lib/nav';
import type { GeocodeResult } from '@/lib/geocode';
import { scopriNegozi, type ScopertaResult } from '@/lib/discover';
import { aggiornaNascosto, aggiornaStarred } from '@/lib/db';
import { applicaFiltri, usePlaces } from '@/lib/usePlaces';
import { AddressSearch } from '@/components/AddressSearch';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { PriorityBadge } from '@/components/PriorityBadge';
import { VisitaModal } from '@/components/VisitaModal';
import { Loader } from '../_layout';

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
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const [lineaFocus, setLineaFocus] = useState<string | null>(null); // linea da mettere in cima (null = tutte)
  const [visitaPlace, setVisitaPlace] = useState<Place | null>(null);

  useEffect(() => {
    posizioneCorrente().then(setPos);
  }, []);

  const origine: Coord = destinazione ?? pos ?? MILANO;

  async function cerca(c: Coord) {
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

  async function onSelectDestinazione(r: GeocodeResult) {
    const c = { lat: r.lat, lng: r.lng };
    setDestinazione(c);
    setGiroAttivo(false);
    setFiltri(FILTRI_VUOTI);
    await cerca(c);
  }

  // Dopo una visita: ricarica dalla cache (riflette stato/da_completare aggiornati).
  function chiudiVisita() {
    setVisitaPlace(null);
    if (destinazione) cerca(destinazione);
  }

  function azzera() {
    setDestinazione(null);
    setScoperti([]);
    setScopInfo(null);
    setScopErrore(null);
    setGiroAttivo(false);
    setFiltri(FILTRI_VUOTI);
    setLineaFocus(null);
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

  // "Non interessante": nasconde per sempre (visibile solo in Profilo → Nascosti).
  async function nascondi(p: Place) {
    setScoperti((l) => l.filter((x) => x.id !== p.id));
    try {
      await aggiornaNascosto(p.id, true);
    } catch {
      if (destinazione) cerca(destinazione); // ripristina lo stato reale in caso d'errore
    }
  }

  // Opzioni filtro: per la scoperta solo le linee presenti tra i risultati
  // (zona/settore restano vuoti → i rispettivi gruppi non compaiono).
  const opzioniFiltri = useMemo(() => {
    const linee = new Set<string>();
    for (const p of scoperti) if (p.linea_ipotizzata) linee.add(p.linea_ipotizzata);
    return { zone: [] as string[], settori: [] as string[], linee: [...linee].sort() };
  }, [scoperti]);

  const scopertiFiltrati = useMemo(() => applicaFiltri(scoperti, filtri), [scoperti, filtri]);

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

  // Ordinamento della scoperta: linea scelta in cima → priorità (P1→P3) → vicinanza.
  const elenco = useMemo(() => {
    if (giroAttivo) return giro;
    const base: Coord = destinazione ?? origine;
    return [...scopertiFiltrati].sort((a, b) => {
      if (lineaFocus) {
        const fa = a.linea_ipotizzata === lineaFocus ? 0 : 1;
        const fb = b.linea_ipotizzata === lineaFocus ? 0 : 1;
        if (fa !== fb) return fa - fb;
      }
      const pr = RANK[a.priorita] - RANK[b.priorita];
      if (pr !== 0) return pr;
      return distanzaKm(base, { lat: a.lat, lng: a.lng }) - distanzaKm(base, { lat: b.lat, lng: b.lng });
    });
  }, [giroAttivo, giro, scopertiFiltrati, lineaFocus, destinazione, origine]);

  const stellatiCount = scopertiFiltrati.filter((p) => p.starred).length;

  return (
    <View style={styles.container}>
      <AddressSearch onSelect={onSelectDestinazione} onClear={azzera} />

      {/* Ordina la scoperta dando precedenza a una linea di vendita (o Tutte). */}
      <View style={styles.focusBar}>
        <Text style={styles.focusLabel}>Ordina per linea di vendita</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.focusRow}>
          <FocusPill label="Tutte le linee" on={!lineaFocus} onPress={() => setLineaFocus(null)} />
          {LINEE_ATTIVE.map((l) => (
            <FocusPill
              key={l}
              label={`${iconaLinea(l)} ${l}`}
              on={lineaFocus === l}
              onPress={() => setLineaFocus((v) => (v === l ? null : l))}
            />
          ))}
        </ScrollView>
      </View>

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

      {/* Filtri a gruppi etichettati (come la scheda Target): Priorità / Stato / Linea */}
      {destinazione && !giroAttivo ? (
        <View style={styles.filterBar}>
          <Filters filtri={filtri} opzioni={opzioniFiltri} onChange={setFiltri} />
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
                  <PriorityBadge priorita={p.priorita} small />
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
                  {p.da_completare ? <Text style={styles.daCompl}>da completare</Text> : null}
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
                <>
                  <Pressable style={styles.azione} hitSlop={8} onPress={() => setVisitaPlace(p)}>
                    <Text style={[styles.check, p.stato === 'visitato' && styles.checkOn]}>
                      {p.stato === 'visitato' ? '☑' : '☐'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.azione} hitSlop={8} onPress={() => toggleStar(p)}>
                    <Text style={[styles.stella, p.starred && styles.stellaOn]}>{p.starred ? '★' : '☆'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.azione}
                    hitSlop={8}
                    onPress={() => nascondi(p)}
                    accessibilityLabel="Non interessante — nascondi"
                  >
                    <Text style={styles.nascondiIco}>🚫</Text>
                  </Pressable>
                </>
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

      <VisitaModal place={visitaPlace} onClose={() => setVisitaPlace(null)} onDone={chiudiVisita} />
    </View>
  );
}

function FocusPill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.focusPill, on && styles.focusPillOn]} onPress={onPress}>
      <Text style={[styles.focusPillTxt, on && styles.focusPillTxtOn]} numberOfLines={1}>
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

  filterBar: {
    backgroundColor: colors.bianco,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.grigioChiaro,
  },

  focusBar: { paddingBottom: spacing.xs },
  focusLabel: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', paddingHorizontal: spacing.md, marginBottom: 4 },
  focusRow: { paddingHorizontal: spacing.md, gap: 6 },
  focusPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  focusPillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  focusPillTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  focusPillTxtOn: { color: colors.bianco },

  lista: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 96, gap: 10 },
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
  daCompl: { color: colors.attenzione, fontWeight: '700', fontSize: 11 },
  azione: { paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  azioneIco: { fontSize: 18 },
  check: { fontSize: 22, color: colors.grigio },
  checkOn: { fontSize: 22, color: colors.successo },
  stella: { fontSize: 24, color: colors.grigioChiaro },
  stellaOn: { color: colors.oro },
  nascondiIco: { fontSize: 16, opacity: 0.5 },

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
  btnNaviga: { backgroundColor: colors.fill, borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: 11 },
  btnNavigaTxt: { color: colors.testo, fontWeight: '600' },
  btnGiro: { backgroundColor: colors.navy, borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: 11 },
  btnGiroOn: { backgroundColor: colors.oro },
  btnGiroTxt: { color: colors.bianco, fontWeight: '800' },
  btnGiroTxtOn: { color: colors.navy },
});
