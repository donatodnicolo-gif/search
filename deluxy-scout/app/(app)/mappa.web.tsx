// Variante WEB della schermata Mappa — flusso "Scoperta sul territorio".
// Digiti un indirizzo → l'app trova i negozi della zona da Google (con cache),
// li classifica per linea, tu ⭐ quelli interessanti (= giro) e navighi.
// Layout curato in stile Apple: liste raggruppate, icone tipologia, filtri a pillole.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LINEE_ATTIVE, type Place } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { colors, labelStato, radius, spacing } from '@/lib/theme';
import { LineaIcon } from '@/components/LineaIcon';

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
import { distanzaKm, MILANO, posizioneCorrente, type Coord } from '@/lib/location';
import { urlNavigazione, urlNavigazioneGiro } from '@/lib/nav';
import type { GeocodeResult } from '@/lib/geocode';
import { scopriNegozi, type FiltroScoperta, type ScopertaResult } from '@/lib/discover';
import { aggiornaNascosto, aggiornaStarred, aggiornaStatoPlace } from '@/lib/db';
import { applicaFiltri, usePlaces } from '@/lib/usePlaces';
import { AddressSearch } from '@/components/AddressSearch';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { PriorityBadge } from '@/components/PriorityBadge';
import { VisitaModal } from '@/components/VisitaModal';
import { Loader } from '../_layout';

// Colore per lo stato attività (allineato ai token del design system).
function coloreStato(s: string): string {
  if (s === 'visitato') return colors.successo;
  if (s === 'cliente') return colors.oro;
  if (s === 'perso') return colors.errore;
  return colors.grigio; // da_visitare
}

// Etichetta breve dello stato registro (partner / trattativa) da mostrare sulla card.
function statoAffLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  const m: Record<string, string> = {
    attivo: '★ Partner',
    in_trattativa: 'In trattativa',
    in_contatto: 'In contatto',
    da_ricontattare: 'Da ricontattare',
  };
  return m[s] ?? null; // prospect/in_attesa/non_interessato: non li evidenziamo
}

// Sottomenu "cosa cerco": affiliati di default, poi si allarga.
const TIPI_SCOPERTA: { v: FiltroScoperta; l: string }[] = [
  { v: 'affiliazioni', l: 'Fiori/Pasticcerie' },
  { v: 'fiori', l: 'Fiori' },
  { v: 'pasticcerie', l: 'Pasticcerie' },
  { v: 'tutti', l: 'Tutti' },
];

export default function MappaWeb() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 560; // sotto questa soglia: card a colonna, icone a capo
  const { loading } = usePlaces();
  const [pos, setPos] = useState<Coord | null>(null);
  const [giroAttivo, setGiroAttivo] = useState(false);
  const [destinazione, setDestinazione] = useState<Coord | null>(null);
  const [scoperti, setScoperti] = useState<Place[]>([]);
  const [scopLoading, setScopLoading] = useState(false);
  const [scopInfo, setScopInfo] = useState<ScopertaResult | null>(null);
  const [scopErrore, setScopErrore] = useState<string | null>(null);
  const [filtroScoperta, setFiltroScoperta] = useState<FiltroScoperta>('affiliazioni');
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const [lineaFocus, setLineaFocus] = useState<string | null>(null); // linea da mettere in cima (null = tutte)
  const [visitaPlace, setVisitaPlace] = useState<Place | null>(null);
  const [giroOrdine, setGiroOrdine] = useState<string[]>([]); // id stellati, nell'ordine (riordinabile)

  useEffect(() => {
    posizioneCorrente().then(setPos);
  }, []);

  // Riconcilia l'ordine del giro coi negozi caricati: mantiene l'ordine scelto,
  // aggiunge in fondo eventuali stellati non presenti, toglie i non-stellati.
  useEffect(() => {
    const stellatiIds = scoperti.filter((p) => p.starred).map((p) => p.id);
    setGiroOrdine((prev) => {
      const set = new Set(stellatiIds);
      const mantenuti = prev.filter((id) => set.has(id));
      const nuovi = stellatiIds.filter((id) => !prev.includes(id));
      return [...mantenuti, ...nuovi];
    });
  }, [scoperti]);

  const origine: Coord = destinazione ?? pos ?? MILANO;

  async function cerca(c: Coord, f?: FiltroScoperta) {
    setScopErrore(null);
    setScopLoading(true);
    try {
      // Il sotto-filtro (fiori/pasticcerie/…) vale solo con la linea Affiliazioni attiva;
      // altrimenti la scoperta cerca tutti i tipi.
      const filtro = f ?? (lineaFocus === 'Affiliazioni' ? filtroScoperta : 'tutti');
      const res = await scopriNegozi(c.lat, c.lng, 400, filtro);
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

  // Scegliere l'indirizzo NON avvia la ricerca: la prepara e basta. Si parte col
  // pulsante "Cerca negozi qui" (la scoperta costa chiamate a Google: meglio esplicita).
  function onSelectDestinazione(r: GeocodeResult) {
    setDestinazione({ lat: r.lat, lng: r.lng });
    setGiroAttivo(false);
    setFiltri(FILTRI_VUOTI);
    setScoperti([]);
    setScopInfo(null);
    setScopErrore(null);
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

  // Stella = "da visitare": entra nel giro E porta lo stato a da_visitare.
  async function toggleStar(p: Place) {
    const nuovo = !p.starred;
    const statoNuovo = nuovo ? 'da_visitare' : p.stato;
    setScoperti((l) =>
      l.map((x) => (x.id === p.id ? { ...x, starred: nuovo, stato: statoNuovo, novita: false } : x)),
    );
    // Ordine del giro: se aggiungo la stella va in fondo (ordine di aggiunta); se la tolgo, esce.
    setGiroOrdine((ord) => (nuovo ? [...ord.filter((id) => id !== p.id), p.id] : ord.filter((id) => id !== p.id)));
    try {
      await aggiornaStarred(p.id, nuovo);
      if (nuovo && p.stato !== 'da_visitare') await aggiornaStatoPlace(p.id, 'da_visitare');
    } catch {
      // Ripristina lo stato originale (stella, stato E badge novità).
      setScoperti((l) => l.map((x) => (x.id === p.id ? { ...x, starred: p.starred, stato: p.stato, novita: p.novita } : x)));
      setGiroOrdine((ord) => (p.starred ? ord : ord.filter((id) => id !== p.id)));
    }
  }

  // Cerchio = "visitato": porta lo stato a visitato, esce dal giro e apre il pop-up
  // per registrare i dettagli della visita.
  async function segnaVisitato(p: Place) {
    setScoperti((l) => l.map((x) => (x.id === p.id ? { ...x, stato: 'visitato', starred: false } : x)));
    setGiroOrdine((ord) => ord.filter((id) => id !== p.id));
    aggiornaStatoPlace(p.id, 'visitato').catch(() => {});
    if (p.starred) aggiornaStarred(p.id, false).catch(() => {});
    setVisitaPlace({ ...p, stato: 'visitato' });
  }

  // Sposta una tappa su/giù nell'ordine del giro.
  function spostaTappa(id: string, dir: -1 | 1) {
    setGiroOrdine((ord) => {
      const i = ord.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ord.length) return ord;
      const c = [...ord];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
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

  // Il giro sono i negozi ⭐ nell'ordine scelto dall'utente (aggiunta stelle + frecce).
  const giro = useMemo(
    () =>
      giroOrdine
        .map((id) => scoperti.find((p) => p.id === id))
        .filter((p): p is Place => !!p && !!p.starred),
    [giroOrdine, scoperti],
  );

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
  // NB: calcolo semplice (NON un hook) perché è dopo il return condizionale sopra.
  const baseDist: Coord = destinazione ?? origine;
  const elenco = giroAttivo
    ? giro
    : [...scopertiFiltrati].sort((a, b) => {
        if (lineaFocus) {
          const fa = a.linea_ipotizzata === lineaFocus ? 0 : 1;
          const fb = b.linea_ipotizzata === lineaFocus ? 0 : 1;
          if (fa !== fb) return fa - fb;
        }
        const pr = RANK[a.priorita] - RANK[b.priorita];
        if (pr !== 0) return pr;
        return distanzaKm(baseDist, { lat: a.lat, lng: a.lng }) - distanzaKm(baseDist, { lat: b.lat, lng: b.lng });
      });

  const stellatiCount = scopertiFiltrati.filter((p) => p.starred).length;

  return (
    <View style={styles.container}>
      <AddressSearch onSelect={onSelectDestinazione} onClear={azzera} />

      {/* La scoperta parte solo su richiesta esplicita (costa chiamate a Google). */}
      {destinazione ? (
        <Pressable
          style={[styles.btnCerca, scopLoading && styles.btnCercaOff]}
          onPress={() => cerca(destinazione)}
          disabled={scopLoading}
        >
          <Text style={styles.btnCercaTxt}>
            {scopLoading ? 'Cerco negozi…' : scopInfo ? 'Cerca di nuovo qui' : 'Cerca negozi qui'}
          </Text>
        </Pressable>
      ) : null}

      {/* Ordina la scoperta dando precedenza a una linea di vendita (o Tutte). */}
      <View style={styles.focusBar}>
        <Text style={styles.focusLabel}>Ordina per linea di vendita</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.focusRow}>
          <FocusPill label="Tutte le linee" on={!lineaFocus} onPress={() => setLineaFocus(null)} />
          {LINEE_ATTIVE.map((l) => (
            <FocusPill
              key={l}
              label={l}
              linea={l}
              on={lineaFocus === l}
              onPress={() => setLineaFocus((v) => (v === l ? null : l))}
            />
          ))}
        </ScrollView>

        {/* Sotto-filtro "cosa cerco": solo quando è attiva la linea Affiliazioni. */}
        {lineaFocus === 'Affiliazioni' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subRow}>
            {TIPI_SCOPERTA.map((t) => (
              <Pressable
                key={t.v}
                onPress={() => {
                  setFiltroScoperta(t.v);
                  if (destinazione && scopInfo) cerca(destinazione, t.v);
                }}
                style={[styles.subChip, filtroScoperta === t.v && styles.subChipOn]}
              >
                <Text style={[styles.subTxt, filtroScoperta === t.v && styles.subTxtOn]}>{t.l}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
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
            {giroAttivo
              ? 'Metti ⭐ sui negozi per costruire il giro, poi riordinali con ▲▼.'
              : destinazione
                ? 'Nessun negozio in questa selezione.'
                : 'Nessun risultato ancora.'}
          </Text>
        ) : (
          elenco.map((p, i) => (
            <Pressable
              key={p.id}
              style={[styles.card, isMobile && styles.cardMobile]}
              onPress={() => router.push(`/(app)/attivita/${p.id}`)}
            >
              {/* Riga alta: icona + testo. Su mobile occupa tutta la larghezza,
                  così il nome del negozio si legge per esteso. */}
              <View style={styles.cardTop}>
                {/* Icona tipologia (o numero tappa nel giro) */}
                {giroAttivo ? (
                  <View style={[styles.icona, { backgroundColor: colors.navy }]}>
                    <Text style={styles.iconaNum}>{i + 1}</Text>
                  </View>
                ) : (
                  <View style={styles.icona}>
                    <LineaIcon linea={p.linea_ipotizzata} size={22} color={colors.navy} />
                  </View>
                )}

                {/* Testo */}
                <View style={styles.info}>
                  <View style={styles.titoloRow}>
                    <PriorityBadge priorita={p.priorita} small />
                    {p.novita ? (
                      <View style={styles.novita}>
                        <Text style={styles.novitaTxt}>NOVITÀ</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.nome}>{p.nome}</Text>
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
                  {typeof p.google_rating === 'number' ? (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={11} color={colors.oro} />
                      <Text style={styles.ratingTxt}>
                        {p.google_rating.toFixed(1)}
                        {p.google_reviews ? ` (${p.google_reviews})` : ''}
                      </Text>
                    </View>
                  ) : null}
                  {statoAffLabel(p.anagrafiche_stato) ? (
                    <View style={[styles.crmBadge, p.anagrafiche_stato === 'attivo' ? styles.crmPartner : styles.crmRegistro]}>
                      <Text style={p.anagrafiche_stato === 'attivo' ? styles.crmPartnerTxt : styles.crmRegistroTxt}>
                        {statoAffLabel(p.anagrafiche_stato)}
                      </Text>
                    </View>
                  ) : null}
                  {p.hubspot_ha_contatto ? (
                    <View style={[styles.crmBadge, styles.crmContatto]}>
                      <Text style={styles.crmContattoTxt}>◑ contatto</Text>
                    </View>
                  ) : null}
                  {p.hubspot_deal_aperta ? (
                    <View style={[styles.crmBadge, styles.crmTrattativa]}>
                      <Text style={styles.crmTrattativaTxt}>◆ trattativa</Text>
                    </View>
                  ) : null}
                  {p.stato ? (
                    <View style={[styles.statoBadge, { borderColor: coloreStato(p.stato) }]}>
                      <View style={[styles.statoDot, { backgroundColor: coloreStato(p.stato) }]} />
                      <Text style={styles.statoBadgeTxt}>{labelStato[p.stato]}</Text>
                    </View>
                  ) : null}
                  {p.da_completare ? <Text style={styles.daCompl}>da completare</Text> : null}
                  </View>
                </View>
              </View>

              {/* Azioni: in riga a destra su desktop, a capo sotto su mobile. */}
              <View style={[styles.azioni, isMobile && styles.azioniMobile]}>
                <Pressable
                  style={styles.azione}
                  hitSlop={8}
                  onPress={() => Linking.openURL(urlNavigazione({ lat: p.lat, lng: p.lng }, origine))}
                  accessibilityLabel="Naviga"
                >
                  <Ionicons name="navigate-outline" size={19} color={colors.testoSoft} />
                </Pressable>
                {!giroAttivo ? (
                  <>
                    <Pressable style={styles.azione} hitSlop={8} onPress={() => segnaVisitato(p)} accessibilityLabel="Segna visitato">
                      <Ionicons
                        name={p.stato === 'visitato' ? 'checkmark-circle' : 'ellipse-outline'}
                        size={21}
                        color={p.stato === 'visitato' ? colors.successo : colors.grigio}
                      />
                    </Pressable>
                    <Pressable style={styles.azione} hitSlop={8} onPress={() => toggleStar(p)} accessibilityLabel="Da visitare (giro)">
                      <Ionicons
                        name={p.starred ? 'star' : 'star-outline'}
                        size={21}
                        color={p.starred ? colors.oro : colors.grigio}
                      />
                    </Pressable>
                    <Pressable style={styles.azione} hitSlop={8} onPress={() => nascondi(p)} accessibilityLabel="Non interessante — nascondi">
                      <Ionicons name="eye-off-outline" size={19} color={colors.grigio} />
                    </Pressable>
                  </>
                ) : (
                  <>
                    {/* Anche durante il giro: pallino per confermare la visita. */}
                    <Pressable style={styles.azione} hitSlop={8} onPress={() => segnaVisitato(p)} accessibilityLabel="Segna visitato">
                      <Ionicons
                        name={p.stato === 'visitato' ? 'checkmark-circle' : 'ellipse-outline'}
                        size={21}
                        color={p.stato === 'visitato' ? colors.successo : colors.grigio}
                      />
                    </Pressable>
                    <Pressable style={styles.azione} hitSlop={6} onPress={() => spostaTappa(p.id, -1)} accessibilityLabel="Sposta su">
                      <Ionicons name="chevron-up" size={18} color={colors.testoSoft} />
                    </Pressable>
                    <Pressable style={styles.azione} hitSlop={6} onPress={() => spostaTappa(p.id, 1)} accessibilityLabel="Sposta giù">
                      <Ionicons name="chevron-down" size={18} color={colors.testoSoft} />
                    </Pressable>
                  </>
                )}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Barra flottante giro */}
      <View style={styles.dock}>
        <Text style={styles.dockTxt}>
          {giroAttivo ? `${giro.length} selezionati` : `${scopertiFiltrati.length} attività`}
          {giroAttivo && giroNav?.troncato ? ` · prime ${giroNav.tappeIncluse}` : ''}
        </Text>
        <View style={styles.dockAzioni}>
          {giroAttivo && giroNav ? (
            <Pressable style={styles.btnNaviga} onPress={() => Linking.openURL(giroNav.url)}>
              <Text style={styles.btnNavigaTxt}>
                <Ionicons name="navigate-outline" size={15} color={colors.testo} /> Naviga
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.btnGiro, giroAttivo && styles.btnGiroOn]}
            onPress={() => setGiroAttivo((v) => !v)}
            disabled={!destinazione && !giroAttivo}
          >
            <Text style={[styles.btnGiroTxt, giroAttivo && styles.btnGiroTxtOn]}>
              {giroAttivo ? 'Chiudi' : stellatiCount ? `Selezionati · ${stellatiCount} ⭐` : 'Selezionati'}
            </Text>
          </Pressable>
        </View>
      </View>

      <VisitaModal place={visitaPlace} onClose={() => setVisitaPlace(null)} onDone={chiudiVisita} />
    </View>
  );
}

function FocusPill({
  label,
  linea,
  on,
  onPress,
}: {
  label: string;
  linea?: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.focusPill, on && styles.focusPillOn]} onPress={onPress}>
      {linea ? <LineaIcon linea={linea} size={15} color={on ? colors.bianco : colors.testo} /> : null}
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

  btnCerca: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCercaOff: { opacity: 0.55 },
  btnCercaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 15 },
  subRow: { paddingHorizontal: spacing.md, paddingTop: 6, gap: 6, alignItems: 'center' },
  subChip: {
    alignSelf: 'center',
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  subChipOn: { backgroundColor: colors.oro, borderColor: colors.oro },
  subTxt: { color: colors.testoSoft, fontWeight: '600', fontSize: 12 },
  subTxtOn: { color: colors.bianco },
  focusBar: { paddingBottom: spacing.xs },
  focusLabel: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', paddingHorizontal: spacing.md, marginBottom: 4 },
  focusRow: { paddingHorizontal: spacing.md, gap: 6 },
  focusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    gap: 10,
    backgroundColor: colors.bianco,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  // Su mobile la card diventa a colonna: testo sopra (nome per esteso), icone sotto.
  cardMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  // Riga alta (icona + testo): su desktop occupa lo spazio prima delle icone.
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
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
  info: { flex: 1, minWidth: 0, gap: 3 },
  titoloRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nome: { color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2, lineHeight: 21 },
  novita: { backgroundColor: colors.oro, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  novitaTxt: { color: colors.navy, fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, rowGap: 4 },
  prioDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flexShrink: 1, color: colors.testoSoft, fontSize: 13 },
  hs: { color: colors.successo, fontWeight: '700', fontSize: 11 },
  daCompl: { color: colors.attenzione, fontWeight: '700', fontSize: 11 },
  crmBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  crmContatto: { backgroundColor: 'rgba(36,138,61,0.12)' },
  crmContattoTxt: { color: colors.successo, fontWeight: '800', fontSize: 10 },
  crmTrattativa: { backgroundColor: 'rgba(0,113,227,0.12)' },
  crmTrattativaTxt: { color: colors.blue, fontWeight: '800', fontSize: 10 },
  crmPartner: { backgroundColor: 'rgba(36,138,61,0.14)' },
  crmPartnerTxt: { color: colors.successo, fontWeight: '800', fontSize: 10 },
  crmRegistro: { backgroundColor: 'rgba(184,150,62,0.16)' },
  crmRegistroTxt: { color: colors.oro, fontWeight: '800', fontSize: 10 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 11 },
  statoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  statoDot: { width: 6, height: 6, borderRadius: 3 },
  statoBadgeTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 10 },
  azioni: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  // Mobile: icone a capo, allineate a destra sotto il testo, con più respiro.
  azioniMobile: { justifyContent: 'flex-end', gap: 10, paddingLeft: 56, paddingTop: 2 },
  azione: { paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  azioneIco: { fontSize: 18 },
  check: { fontSize: 22, color: colors.grigio },
  checkOn: { fontSize: 22, color: colors.successo },
  stella: { fontSize: 24, color: colors.grigioChiaro },
  stellaOn: { color: colors.oro },
  nascondiIco: { fontSize: 16, opacity: 0.5 },
  reorder: { flexDirection: 'row', gap: 2 },
  reorderIco: { fontSize: 15, color: colors.testoSoft },

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
