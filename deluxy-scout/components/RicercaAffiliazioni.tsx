// Tab "Ricerca" delle Affiliazioni: cerca fioristi e pasticcerie SUL TERRITORIO
// (scoperta Google, stessa Edge Function della Mappa, preset "affiliazioni")
// partendo da un indirizzo. Chi interessa si prende con la ⭐: entra fra i
// Selezionati da chiamare — e, se era solo un risultato Google, diventa in quel
// momento un target vero intestato a chi l'ha preso (assicuraPlace).
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, coloreAffiliazione, labelAffiliazione, radius, spacing } from '@/lib/theme';
import { AddressSearch } from '@/components/AddressSearch';
import { EmptyState, StatusBadge } from '@/components/ui';
import type { StatoAffiliazione } from '@/types';
import { scopriNegozi, type FiltroScoperta } from '@/lib/discover';
import { aggiornaStarred, assicuraPlace } from '@/lib/db';
import { distanzaKm, type Coord } from '@/lib/location';
import type { GeocodeResult } from '@/lib/geocode';
import type { Place } from '@/types';
import { aggiungiPreferito, rimuoviPreferito, usePreferiti } from '@/lib/preferiti';
import { useMemo } from 'react';
import { avvisa } from '@/lib/dialoghi';

// Il raggio è FACOLTATIVO: senza indicazione si cerca su TUTTA LA CITTÀ
// (12 km dal punto scelto). Chi vuole restringere sceglie una distanza.
const RAGGI = [300, 600, 1000, 2000];
const RAGGIO_CITTA = 12000;
const COSA: { valore: FiltroScoperta; label: string }[] = [
  { valore: 'affiliazioni', label: 'Fiori + Pasticcerie' },
  { valore: 'fiori', label: 'Solo fiori' },
  { valore: 'pasticcerie', label: 'Solo pasticcerie' },
];

export function RicercaAffiliazioni({
  onPreso,
  centroIniziale,
}: {
  onPreso: () => void;
  centroIniziale?: { lat: number; lng: number; indirizzo: string } | null;
}) {
  const preferiti = usePreferiti();
  const [centro, setCentro] = useState<Coord | null>(null);
  const [indirizzo, setIndirizzo] = useState<string | null>(null);
  const [cercato, setCercato] = useState(false); // true dopo aver premuto "Cerca"

  // Aperta da un preferito del menu: parte già centrata lì, pronta a cercare.
  useEffect(() => {
    if (centroIniziale) {
      setCentro({ lat: centroIniziale.lat, lng: centroIniziale.lng });
      setIndirizzo(centroIniziale.indirizzo || null);
      setCercato(false);
      setRisultati([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centroIniziale?.lat, centroIniziale?.lng]);
  const [raggio, setRaggio] = useState<number | null>(null); // null = Auto
  const [raggioUsato, setRaggioUsato] = useState<number | null>(null);
  const [cosa, setCosa] = useState<FiltroScoperta>('affiliazioni');
  const [risultati, setRisultati] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [presi, setPresi] = useState<Set<string>>(new Set());

  async function cerca(punto: Coord, r: number | null = raggio, c = cosa) {
    setLoading(true);
    setErrore(null);
    try {
      // Raggio non indicato = tutta la città in un colpo solo.
      const effettivo = r ?? RAGGIO_CITTA;
      const esito = await scopriNegozi(punto.lat, punto.lng, effettivo, c, true);
      setRisultati(esito.places);
      setRaggioUsato(effettivo);
      setCercato(true);
    } catch (e: any) {
      setErrore(e?.message ?? 'Ricerca non riuscita.');
      setRisultati([]);
    } finally {
      setLoading(false);
    }
  }

  // Scegliere l'indirizzo NON avvia la ricerca (la scoperta costa chiamate a
  // Google): la prepara, poi si parte col pulsante "Cerca affiliazioni qui".
  function scegliIndirizzo(g: GeocodeResult) {
    setCentro({ lat: g.lat, lng: g.lng });
    setIndirizzo(g.formatted_address ?? null);
    setCercato(false);
    setRisultati([]);
    setRaggioUsato(null);
    setErrore(null);
  }

  // Questo indirizzo è già salvato fra i preferiti? (match per coordinate ~11 m)
  const preferitoCorrente = useMemo(() => {
    if (!centro) return null;
    return (
      preferiti.find(
        (f) => f.contesto === 'affiliazioni' && Math.abs(f.lat - centro.lat) < 1e-4 && Math.abs(f.lng - centro.lng) < 1e-4,
      ) ?? null
    );
  }, [preferiti, centro]);

  async function salvaLuogo() {
    if (!centro || !indirizzo) return;
    try {
      if (preferitoCorrente) await rimuoviPreferito(preferitoCorrente.id);
      else await aggiungiPreferito({ etichetta: indirizzo, indirizzo, lat: centro.lat, lng: centro.lng, contesto: 'affiliazioni' });
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Operazione non riuscita.');
    }
  }

  /** ⭐ = "questa la contatto": entra fra i Selezionati delle Affiliazioni. */
  async function prendi(p: Place) {
    try {
      const id = await assicuraPlace(p);
      await aggiornaStarred(id, true);
      setPresi((s) => new Set(s).add(p.id));
      onPreso();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Non è stato possibile selezionare il negozio.');
    }
  }

  // Sincronizzazione con Anagrafiche: i negozi che nel registro sono GIÀ clienti
  // attivi non vanno riproposti da reclutare. Nascondiamo gli attivi e — per non
  // mostrare un doppione "nuovo" da Google dello stesso negozio — anche i
  // risultati Google (id "g:") il cui nome combacia con un attivo.
  const normaNome = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nomiAttivi = useMemo(
    () => new Set(risultati.filter((r) => r.anagrafiche_stato === 'attivo').map((r) => normaNome(r.nome))),
    [risultati],
  );
  const visibili = useMemo(
    () =>
      risultati.filter((r) => {
        if (r.anagrafiche_stato === 'attivo') return false;
        if (r.id.startsWith('g:') && nomiAttivi.has(normaNome(r.nome))) return false;
        return true;
      }),
    [risultati, nomiAttivi],
  );
  const nascostiAttivi = risultati.length - visibili.length;

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <AddressSearch onSelect={scegliIndirizzo} placeholder="Cerca in che zona: indirizzo, via, quartiere…" />
        {centro ? (
          <View style={styles.cercaRow}>
            <Pressable
              style={[styles.btnCerca, loading && styles.btnOff]}
              disabled={loading}
              onPress={() => cerca(centro)}
            >
              <Text style={styles.btnCercaTxt}>
                {loading ? 'Cerco negozi…' : cercato ? 'Cerca di nuovo qui' : 'Cerca affiliazioni qui'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btnSalva, preferitoCorrente && styles.btnSalvaOn]}
              onPress={salvaLuogo}
              accessibilityLabel={preferitoCorrente ? 'Togli dai preferiti' : 'Salva la località'}
            >
              <Ionicons name={preferitoCorrente ? 'bookmark' : 'bookmark-outline'} size={17} color={preferitoCorrente ? colors.bianco : colors.navy} />
              <Text style={[styles.btnSalvaTxt, preferitoCorrente && styles.btnSalvaTxtOn]}>{preferitoCorrente ? 'Salvata' : 'Salva'}</Text>
            </Pressable>
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Text style={styles.etichetta}>Cosa</Text>
          {COSA.map((c) => (
            <Chip
              key={c.valore}
              label={c.label}
              on={cosa === c.valore}
              onPress={() => {
                setCosa(c.valore);
                if (centro && cercato) cerca(centro, raggio, c.valore);
              }}
            />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Text style={styles.etichetta}>Raggio</Text>
          <Chip
            label="Tutta la città"
            on={raggio === null}
            onPress={() => {
              setRaggio(null);
              if (centro) cerca(centro, null, cosa);
            }}
          />
          {RAGGI.map((r) => (
            <Chip
              key={r}
              label={r >= 1000 ? `${r / 1000} km` : `${r} m`}
              on={raggio === r}
              onPress={() => {
                setRaggio(r);
                if (centro && cercato) cerca(centro, r, cosa);
              }}
            />
          ))}
        </ScrollView>
        {indirizzo ? (
          <Text style={styles.zona} numberOfLines={1}>
            <Ionicons name="location-outline" size={12} color={colors.testoSoft} /> {indirizzo}
            {visibili.length ? ` · ${visibili.length} da contattare` : ''}
            {nascostiAttivi ? ` · ${nascostiAttivi} già clienti nascosti` : ''}
            {raggioUsato ? (raggioUsato >= RAGGIO_CITTA ? ' in tutta la città' : ` entro ${raggioUsato >= 1000 ? `${(raggioUsato / 1000).toFixed(1)} km` : `${raggioUsato} m`}`) : ''}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.oro} />
          <Text style={styles.attesa}>Cerco negozi in zona…</Text>
        </View>
      ) : errore ? (
        <View style={styles.centro}>
          <Text style={styles.errore}>{errore}</Text>
        </View>
      ) : !centro || !cercato ? (
        <EmptyState
          icona="search-outline"
          titolo="Cerca affiliazioni sul territorio"
          aiuto="Scrivi un indirizzo o una zona e premi «Cerca affiliazioni qui»: trovo fioristi e pasticcerie lì attorno. Con la ⭐ li metti fra i Selezionati da chiamare."
        />
      ) : visibili.length === 0 ? (
        <EmptyState
          icona="map-outline"
          titolo={nascostiAttivi ? 'Solo clienti già attivi qui' : 'Nessun negozio in questa zona'}
          aiuto={
            nascostiAttivi
              ? 'I negozi trovati sono già nostri clienti nel registro: niente di nuovo da reclutare qui.'
              : 'Ho cercato in tutta la città: prova un altro punto di partenza o cambia cosa cercare.'
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {visibili.map((p) => {
            const preso = presi.has(p.id) || p.starred;
            const km = centro ? distanzaKm(centro, { lat: p.lat, lng: p.lng }) : null;
            return (
              <View key={p.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nome} numberOfLines={1}>{p.nome}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[p.indirizzo, km != null ? `${km.toFixed(1)} km` : null, p.categoria].filter(Boolean).join(' · ')}
                  </Text>
                  {p.google_rating ? (
                    <Text style={styles.meta}>
                      ★ {p.google_rating}{p.google_reviews ? ` · ${p.google_reviews} recensioni` : ''}
                    </Text>
                  ) : null}
                  {p.anagrafiche_stato && p.anagrafiche_stato in labelAffiliazione ? (
                    <View style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                      <StatusBadge
                        small
                        label={labelAffiliazione[p.anagrafiche_stato as StatoAffiliazione]}
                        colore={coloreAffiliazione[p.anagrafiche_stato as StatoAffiliazione]}
                      />
                    </View>
                  ) : null}
                </View>
                <Pressable
                  style={[styles.btn, preso && styles.btnOn]}
                  disabled={preso}
                  onPress={() => prendi(p)}
                  accessibilityLabel={preso ? 'Già selezionato' : 'Seleziona da contattare'}
                >
                  <Ionicons name={preso ? 'star' : 'star-outline'} size={16} color={preso ? colors.bianco : colors.navy} />
                  <Text style={[styles.btnTxt, preso && styles.btnTxtOn]}>{preso ? 'Selezionato' : 'Seleziona'}</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  head: { gap: 6, paddingBottom: spacing.sm },
  cercaRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, alignItems: 'stretch' },
  btnCerca: { flex: 1, backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnCercaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  btnOff: { opacity: 0.6 },
  btnSalva: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.bianco, borderWidth: 1.5, borderColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: 14 },
  btnSalvaOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  btnSalvaTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  btnSalvaTxtOn: { color: colors.bianco },
  chips: { paddingHorizontal: spacing.md, gap: 6, alignItems: 'center' },
  etichetta: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', marginRight: 2 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  zona: { color: colors.testoSoft, fontSize: 12.5, paddingHorizontal: spacing.md },
  centro: { alignItems: 'center', gap: 8, padding: spacing.lg },
  attesa: { color: colors.testoSoft, fontSize: 13 },
  errore: { color: colors.errore, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  lista: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.testoSoft, fontSize: 12.5, marginTop: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  btnOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  btnTxt: { color: colors.navy, fontWeight: '700', fontSize: 12.5 },
  btnTxtOn: { color: colors.bianco },
});
