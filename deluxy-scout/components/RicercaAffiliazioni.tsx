// Tab "Ricerca" delle Affiliazioni: cerca fioristi e pasticcerie SUL TERRITORIO
// (scoperta Google, stessa Edge Function della Mappa, preset "affiliazioni")
// partendo da un indirizzo. Chi interessa si prende con la ⭐: entra fra i
// Selezionati da chiamare — e, se era solo un risultato Google, diventa in quel
// momento un target vero intestato a chi l'ha preso (assicuraPlace).
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { AddressSearch } from '@/components/AddressSearch';
import { EmptyState } from '@/components/ui';
import { scopriNegozi, type FiltroScoperta } from '@/lib/discover';
import { aggiornaStarred, assicuraPlace } from '@/lib/db';
import { distanzaKm, type Coord } from '@/lib/location';
import type { GeocodeResult } from '@/lib/geocode';
import type { Place } from '@/types';
import { avvisa } from '@/lib/dialoghi';

// Il raggio è FACOLTATIVO: di default è "Auto" e l'app allarga da sola finché
// trova abbastanza negozi (utile in periferia, dove 600 m non bastano). Chi
// vuole decidere sceglie una distanza precisa.
const RAGGI = [300, 600, 1000, 2000];
const AUTO_PASSI = [400, 800, 1500, 2000];
const AUTO_ABBASTANZA = 8;
const COSA: { valore: FiltroScoperta; label: string }[] = [
  { valore: 'affiliazioni', label: 'Fiori + Pasticcerie' },
  { valore: 'fiori', label: 'Solo fiori' },
  { valore: 'pasticcerie', label: 'Solo pasticcerie' },
];

export function RicercaAffiliazioni({ onPreso }: { onPreso: () => void }) {
  const [centro, setCentro] = useState<Coord | null>(null);
  const [indirizzo, setIndirizzo] = useState<string | null>(null);
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
      if (r != null) {
        const esito = await scopriNegozi(punto.lat, punto.lng, r, c);
        setRisultati(esito.places);
        setRaggioUsato(r);
      } else {
        // Auto: si allarga finché non ci sono abbastanza negozi da lavorare.
        let ultimi: Place[] = [];
        let usato = AUTO_PASSI[0];
        for (const passo of AUTO_PASSI) {
          const esito = await scopriNegozi(punto.lat, punto.lng, passo, c);
          ultimi = esito.places;
          usato = passo;
          if (ultimi.length >= AUTO_ABBASTANZA) break;
        }
        setRisultati(ultimi);
        setRaggioUsato(usato);
      }
    } catch (e: any) {
      setErrore(e?.message ?? 'Ricerca non riuscita.');
      setRisultati([]);
    } finally {
      setLoading(false);
    }
  }

  function scegliIndirizzo(g: GeocodeResult) {
    const punto = { lat: g.lat, lng: g.lng };
    setCentro(punto);
    setIndirizzo(g.formatted_address ?? null);
    cerca(punto);
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

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <AddressSearch onSelect={scegliIndirizzo} placeholder="Cerca in che zona: indirizzo, via, quartiere…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Text style={styles.etichetta}>Cosa</Text>
          {COSA.map((c) => (
            <Chip
              key={c.valore}
              label={c.label}
              on={cosa === c.valore}
              onPress={() => {
                setCosa(c.valore);
                if (centro) cerca(centro, raggio, c.valore);
              }}
            />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Text style={styles.etichetta}>Raggio</Text>
          <Chip
            label="Auto"
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
                if (centro) cerca(centro, r, cosa);
              }}
            />
          ))}
        </ScrollView>
        {indirizzo ? (
          <Text style={styles.zona} numberOfLines={1}>
            <Ionicons name="location-outline" size={12} color={colors.testoSoft} /> {indirizzo}
            {risultati.length ? ` · ${risultati.length} trovati` : ''}
            {raggioUsato ? ` entro ${raggioUsato >= 1000 ? `${(raggioUsato / 1000).toFixed(1)} km` : `${raggioUsato} m`}` : ''}
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
      ) : !centro ? (
        <EmptyState
          icona="search-outline"
          titolo="Cerca affiliazioni sul territorio"
          aiuto="Scrivi un indirizzo o una zona: trovo fioristi e pasticcerie lì attorno. Con la ⭐ li metti fra i Selezionati da chiamare."
        />
      ) : risultati.length === 0 ? (
        <EmptyState
          icona="map-outline"
          titolo="Nessun negozio in questa zona"
          aiuto="Con «Auto» ho già allargato fino a 2 km: prova un altro indirizzo o cambia cosa cercare."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {risultati.map((p) => {
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
