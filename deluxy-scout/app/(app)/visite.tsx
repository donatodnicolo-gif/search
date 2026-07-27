// Potenziali (rotta /visite): i negozi su cui si sta lavorando prima che
// diventino una trattativa — il risultato di quello che si è fatto sul campo.
//
// Contiene due cose, in quest'ordine:
//   1. le BOZZE — negozi segnati «sono stato qui» ma con la visita non ancora
//      compilata (`places.da_completare`): vanno chiuse, altrimenti il giro di
//      oggi si perde;
//   2. le VISITE FATTE, con esito e note.
//
// Non compaiono le visite dei negozi che hanno già una trattativa: hanno fatto
// il loro lavoro e la palla è passata a Vendita. ⚠️ Sono nascoste, NON
// cancellate: i record di `visits` alimentano Storico, Dashboard e Team.
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Place, Visit } from '@/types';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import {
  fetchAllVisits,
  fetchDaCompletare,
  fetchPlaces,
  fetchRecapitiPlace,
  fetchTutteTrattative,
  type RecapitoPlace,
  type TrattativaConLuogo,
} from '@/lib/db';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { CardElenco } from '@/components/CardElenco';
import { AzioniContatto } from '@/components/AzioniContatto';
import { VisitaModal } from '@/components/VisitaModal';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_interessato: 'Non interessato',
  chiuso: 'Chiuso',
};

const COLORE_ESITO: Record<string, string> = {
  interessato: '#2F7D46',
  da_richiamare: '#B7791F',
  non_interessato: '#B3261E',
};

/** "il 12 lug", per dire quando è stata fatta senza pesare sulla riga. */
function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'data non registrata';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

type Riga =
  | { tipo: 'bozza'; place: Place }
  | { tipo: 'visita'; visita: Visit; place: Place | undefined };

export default function Visite() {
  const router = useRouter();
  const [visite, setVisite] = useState<Visit[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [bozze, setBozze] = useState<Place[]>([]);
  const [trattative, setTrattative] = useState<TrattativaConLuogo[]>([]);
  // I recapiti stanno sui contatti, non sul negozio: servono per le azioni.
  const [recapiti, setRecapiti] = useState<Map<string, RecapitoPlace>>(new Map());
  const [loading, setLoading] = useState(true);
  const [daCompletare, setDaCompletare] = useState<Place | null>(null);
  // «Invia mail»: si sceglie lo script e si parte dall'app, come in Clienti.
  const [mailPlace, setMailPlace] = useState<Place | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [v, p, b, t] = await Promise.all([
        fetchAllVisits(),
        fetchPlaces(),
        fetchDaCompletare(),
        fetchTutteTrattative(),
      ]);
      setVisite(v);
      setPlaces(p);
      setBozze(b);
      setTrattative(t);
      // Best-effort: senza recapiti le azioni restano spente, la lista funziona.
      try {
        setRecapiti(await fetchRecapitiPlace());
      } catch {
        setRecapiti(new Map());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const perId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  // I negozi che hanno già una trattativa: le loro visite escono dall'elenco.
  const conTrattativa = useMemo(
    () => new Set(trattative.map((t) => t.place_id).filter(Boolean)),
    [trattative],
  );

  const sezioni = useMemo(() => {
    const bozzeAperte = bozze.filter((p) => !conTrattativa.has(p.id));
    const fatte = visite
      .filter((v) => !conTrattativa.has(v.place_id))
      // Una bozza è già in cima: non ripeterla qui sotto.
      .filter((v) => !bozzeAperte.some((b) => b.id === v.place_id))
      .sort((a, b) => (a.data < b.data ? 1 : -1));

    return [
      ...(bozzeAperte.length
        ? [{ title: `Da completare (${bozzeAperte.length})`, data: bozzeAperte.map((p): Riga => ({ tipo: 'bozza', place: p })) }]
        : []),
      ...(fatte.length
        ? [{ title: `Visite fatte (${fatte.length})`, data: fatte.map((v): Riga => ({ tipo: 'visita', visita: v, place: perId.get(v.place_id) })) }]
        : []),
    ];
  }, [bozze, visite, conTrattativa, perId]);

  function apriTrattativa(placeId: string, nome: string) {
    router.push(`/(app)/trattative?nuovoPer=${placeId}&nuovoNome=${encodeURIComponent(nome)}`);
  }

  /**
   * Le azioni di un potenziale: tutte quelle che servono a **instaurare un
   * contatto** — chiamare, WhatsApp, email, andarlo a trovare — più la
   * trattativa quando il contatto è avvenuto. Quelle senza recapito restano
   * visibili ma spente, così si vede a colpo d'occhio cosa manca.
   */
  function azioniPotenziale(place: Place, opts?: { bozza?: boolean }) {
    return (
      <AzioniContatto
        place={place}
        recapito={recapiti.get(place.id)}
        bozza={opts?.bozza}
        onVisita={() => setDaCompletare(place)}
        onMail={(p) => setMailPlace(p)}
        onTrattativa={(p) => apriTrattativa(p.id, p.nome)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sezioni}
        keyExtractor={(r) => (r.tipo === 'bozza' ? 'b' + r.place.id : 'v' + r.visita.id)}
        contentContainerStyle={[styles.list, contenutoCentrato]}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListHeaderComponent={
          <View style={styles.headerScroll}>
            <PageIntro testo="I negozi su cui stai lavorando: qui ci sono tutte le azioni per instaurare un contatto. Le bozze vanno chiuse; quando nasce la trattativa il negozio esce da qui." />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="walk-outline"
            titolo="Nessun potenziale da lavorare"
            aiuto="I potenziali arrivano dalle visite fatte sulla Mappa o dalla scheda di un negozio. Quelli già diventati trattativa non compaiono qui: li trovi in Trattative."
          />
        }
        renderSectionHeader={({ section }) => <Text style={styles.sezione}>{section.title.toUpperCase()}</Text>}
        renderItem={({ item }) => {
          if (item.tipo === 'bozza') {
            const p = item.place;
            return (
              <CardElenco
                icona="create-outline"
                nome={p.nome}
                meta={p.indirizzo}
                tag={p.linea_ipotizzata ? [p.linea_ipotizzata] : []}
                onPress={() => setDaCompletare(p)}
                badge={<StatusBadge small label="Da completare" colore={colors.oro} />}
                azioni={azioniPotenziale(p, { bozza: true })}
              />
            );
          }
          const v = item.visita;
          const nome = item.place?.nome ?? 'Negozio';
          const esito = v.esito ?? '';
          return (
            <CardElenco
              icona="walk-outline"
              nome={nome}
              meta={`${quando(v.data)}${v.next_step ? ' · ' + v.next_step : ''}`}
              tag={v.linea_proposta ? [v.linea_proposta] : []}
              onPress={() => router.push(`/(app)/attivita/${v.place_id}`)}
              badge={
                esito ? (
                  <StatusBadge small label={LABEL_ESITO[esito] ?? esito} colore={COLORE_ESITO[esito] ?? colors.grigio} />
                ) : null
              }
              extra={
                v.note_post_meeting ? (
                  <Text style={styles.nota} numberOfLines={2}>
                    <Ionicons name="chatbubble-outline" size={11} color={colors.grigio} /> “{v.note_post_meeting}”
                  </Text>
                ) : null
              }
              azioni={item.place ? azioniPotenziale(item.place) : null}
            />
          );
        }}
      />

      <VisitaModal
        place={daCompletare}
        onClose={() => setDaCompletare(null)}
        onDone={() => {
          setDaCompletare(null);
          carica();
        }}
      />
      {mailPlace ? <ScegliScriptModal place={mailPlace} onClose={() => setMailPlace(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  sezione: { color: colors.testoSoft, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4, marginTop: spacing.sm, marginBottom: 4 },
  nota: { color: colors.grigio, fontSize: 12.5, fontStyle: 'italic' },
});
