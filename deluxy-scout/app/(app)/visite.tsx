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
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Place, Visit } from '@/types';
import { canonizzaLinee } from '@/types';
import { colors, radius, spacing, touchMin, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import {
  fetchAllVisits,
  fetchDaCompletare,
  fetchPlaceIdConBozza,
  fetchPlaces,
  fetchRecapitiPlace,
  fetchTutteTrattative,
  type RecapitoPlace,
  type TrattativaConLuogo,
} from '@/lib/db';
import { COLORE_VISITA, LABEL_VISITA } from '@/lib/statoVisita';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { AzioniContatto } from '@/components/AzioniContatto';
import { VisitaModal } from '@/components/VisitaModal';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_interessato: 'Non interessato',
  chiuso: 'Chiuso',
};

// Token semantici del DS (Libro UX cap.5), non hex Material: un solo verde/
// arancione/rosso in tutta l'app.
const COLORE_ESITO: Record<string, string> = {
  interessato: colors.successo,
  da_richiamare: colors.attenzione,
  non_interessato: colors.errore,
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
  // Da 900px in su le due sezioni sono TABELLE (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [visite, setVisite] = useState<Visit[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [bozze, setBozze] = useState<Place[]>([]);
  const [trattative, setTrattative] = useState<TrattativaConLuogo[]>([]);
  // I recapiti stanno sui contatti, non sul negozio: servono per le azioni.
  const [recapiti, setRecapiti] = useState<Map<string, RecapitoPlace>>(new Map());
  const [loading, setLoading] = useState(true);
  // ⚠️ Un fallimento non è una lista vuota (Libro UX cap.6, legge 9): senza,
  // se le visite non si caricavano compariva «Nessun potenziale da lavorare»,
  // cioè si dava per vuoto ciò che era solo irraggiungibile.
  const [errore, setErrore] = useState<string | null>(null);
  const [daCompletare, setDaCompletare] = useState<Place | null>(null);
  // «Invia mail»: si sceglie lo script e si parte dall'app, come in Clienti.
  const [mailPlace, setMailPlace] = useState<Place | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [v, p, b, t, idBozze] = await Promise.all([
        fetchAllVisits(),
        fetchPlaces(),
        fetchDaCompletare(),
        fetchTutteTrattative(),
        // Chi ha scritto qualcosa nel pop-up e l'ha chiuso senza premere niente:
        // la bozza è salva, ma senza questa riga non comparirebbe da nessuna
        // parte e si ritroverebbe solo riaprendo quel negozio per caso.
        fetchPlaceIdConBozza().catch(() => new Set<string>()),
      ]);
      setVisite(v);
      setPlaces(p);
      const gia = new Set(b.map((x) => x.id));
      setBozze([...b, ...p.filter((x) => idBozze.has(x.id) && !gia.has(x.id))]);
      setTrattative(t);
      // Best-effort: senza recapiti le azioni restano spente, la lista funziona.
      try {
        setRecapiti(await fetchRecapitiPlace());
      } catch {
        setRecapiti(new Map());
      }
    } catch (e: any) {
      // ⚠️ Errore ≠ vuoto: se le visite/negozi non si caricano si dice, con
      // «Riprova», invece di mostrare la schermata «nessun potenziale».
      setErrore(String(e?.message ?? '') || 'Non è stato possibile caricare le visite.');
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

  // In tabella ogni sezione diventa UNA riga che contiene tutte le sue: la
  // SectionList tiene testate, refresh e stato vuoto, la griglia la fa Tabella.
  const sezioniVista = useMemo(
    () => (aTabella ? sezioni.map((s) => ({ ...s, data: [s.data] as unknown as Riga[] })) : sezioni),
    [aTabella, sezioni],
  );

  const colonneBozze: ColonnaTabella<Place>[] = [
    {
      chiave: 'nome',
      label: 'Negozio',
      flex: 1.2,
      valore: (p) => p.nome,
      cella: (p) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {p.nome}
        </Text>
      ),
    },
    { chiave: 'indirizzo', label: 'Indirizzo', flex: 1, valore: (p) => p.indirizzo ?? null },
    {
      chiave: 'linee',
      label: 'Linee ipotizzate',
      flex: 0.9,
      righe: 2,
      valore: (p) =>
        canonizzaLinee(p.linee_ipotizzate ?? (p.linea_ipotizzata ? [p.linea_ipotizzata] : [])).join(', ') || null,
    },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 120,
      fissa: true,
      valore: () => null,
      cella: () => <StatusBadge small label="Da completare" colore={COLORE_VISITA.da_finire} />,
    },
  ];

  const colonneVisite: ColonnaTabella<Riga & { tipo: 'visita' }>[] = [
    {
      chiave: 'negozio',
      label: 'Negozio',
      flex: 1.1,
      valore: (r) => r.place?.nome ?? 'Negozio',
      cella: (r) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {r.place?.nome ?? 'Negozio'}
        </Text>
      ),
    },
    {
      chiave: 'quando',
      label: 'Quando',
      width: 78,
      destra: true,
      numerica: true,
      valore: (r) => r.visita.data,
      cella: (r) => <Text style={styles.tabData}>{quando(r.visita.data)}</Text>,
    },
    { chiave: 'passo', label: 'Prossimo passo', flex: 1, righe: 2, valore: (r) => r.visita.next_step ?? null },
    {
      chiave: 'motivi',
      label: 'Motivi',
      flex: 0.9,
      righe: 2,
      valore: (r) =>
        (r.visita.motivi?.length ? r.visita.motivi : r.visita.linea_proposta ? [r.visita.linea_proposta] : []).join(', ') || null,
    },
    {
      chiave: 'esito',
      label: 'Esito',
      width: 122,
      valore: (r) => r.visita.esito ?? null,
      cella: (r) =>
        r.visita.esito ? (
          <StatusBadge
            small
            label={LABEL_ESITO[r.visita.esito] ?? r.visita.esito}
            colore={COLORE_ESITO[r.visita.esito] ?? colors.grigio}
          />
        ) : (
          <Text style={styles.tabData}>—</Text>
        ),
    },
    { chiave: 'nota', label: 'Note', flex: 1, righe: 2, valore: (r) => r.visita.note_post_meeting ?? null },
  ];

  return (
    <View style={styles.container}>
      <SectionList
        sections={sezioniVista}
        keyExtractor={(r: any, i) =>
          Array.isArray(r) ? `tab-${i}` : r.tipo === 'bozza' ? 'b' + r.place.id : 'v' + r.visita.id
        }
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListHeaderComponent={
          <View style={styles.headerScroll}>
            <PageIntro testo="I negozi su cui stai lavorando: qui ci sono tutte le azioni per instaurare un contatto. Le bozze vanno chiuse; quando nasce la trattativa il negozio esce da qui." />
          </View>
        }
        ListEmptyComponent={
          errore ? (
            <View style={styles.erroreCard}>
              <View style={styles.erroreTesta}>
                <Ionicons name="warning-outline" size={16} color={colors.errore} />
                <Text style={styles.erroreTitolo}>Le visite non si sono caricate</Text>
              </View>
              <Text style={styles.erroreTxt}>{errore}</Text>
              <Pressable
                style={({ pressed }) => [styles.btnRiprova, pressed && { opacity: 0.6 }]}
                onPress={carica}
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare le visite"
              >
                <Ionicons name="refresh" size={15} color={colors.bianco} />
                <Text style={styles.btnRiprovaTxt}>Riprova</Text>
              </Pressable>
            </View>
          ) : (
            <EmptyState
              loading={loading}
              icona="walk-outline"
              titolo="Nessun potenziale da lavorare"
              aiuto="I potenziali arrivano dalle visite fatte sulla Mappa o dalla scheda di un negozio. Quelli già diventati trattativa non compaiono qui: li trovi in Trattative."
            />
          )
        }
        renderSectionHeader={({ section }) => <Text style={styles.sezione}>{section.title.toUpperCase()}</Text>}
        renderItem={({ item }) => {
          // Vista tabella: l'item è l'INTERA sezione. Le due sezioni sono
          // omogenee, quindi il tipo del primo dice il tipo di tutti.
          if (Array.isArray(item)) {
            const righe = item as Riga[];
            if (!righe.length) return null;
            if (righe[0].tipo === 'bozza') {
              const bozzeRighe = righe.map((r) => (r as Riga & { tipo: 'bozza' }).place);
              return (
                <Tabella
                  righe={bozzeRighe}
                  colonne={colonneBozze}
                  chiaveRiga={(p) => p.id}
                  ordineIniziale={{ campo: 'nome', verso: 'asc' }}
                  onRiga={(p) => setDaCompletare(p)}
                  labelRiga={(p) => `Completa la visita da ${p.nome}`}
                  azioni={(p) => azioniPotenziale(p, { bozza: true })}
                  larghezzaAzioni={278}
                />
              );
            }
            const visiteRighe = righe as (Riga & { tipo: 'visita' })[];
            return (
              <Tabella
                righe={visiteRighe}
                colonne={colonneVisite}
                chiaveRiga={(r) => r.visita.id}
                ordineIniziale={{ campo: 'quando', verso: 'desc' }}
                onRiga={(r) => router.push(`/(app)/attivita/${r.visita.place_id}`)}
                labelRiga={(r) => `Apri la scheda di ${r.place?.nome ?? 'negozio'}`}
                azioni={(r) => (r.place ? azioniPotenziale(r.place) : null)}
                larghezzaAzioni={278}
              />
            );
          }
          if (item.tipo === 'bozza') {
            const p = item.place;
            return (
              <CardElenco
                icona="create-outline"
                // Giallo: il giro è già stato fatto ma il resoconto è a metà.
                coloreIcona={COLORE_VISITA.da_finire}
                titoloIcona={LABEL_VISITA.da_finire}
                nome={p.nome}
                meta={p.indirizzo}
                tag={canonizzaLinee(p.linee_ipotizzate ?? (p.linea_ipotizzata ? [p.linea_ipotizzata] : []))}
                onPress={() => setDaCompletare(p)}
                badge={<StatusBadge small label="Da completare" colore={COLORE_VISITA.da_finire} />}
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
              // Verde: la visita è stata fatta e registrata.
              coloreIcona={COLORE_VISITA.fatta}
              titoloIcona={LABEL_VISITA.fatta}
              nome={nome}
              meta={`${quando(v.data)}${v.next_step ? ' · ' + v.next_step : ''}`}
              // I motivi della visita (migr. 0053); le visite di prima hanno
              // solo `linea_proposta`, che resta il primo motivo.
              tag={v.motivi?.length ? v.motivi : v.linea_proposta ? [v.linea_proposta] : []}
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
  // Errore di caricamento (Libro UX cap.6): card rossa con «Riprova».
  erroreCard: { backgroundColor: colors.erroreSoft, borderWidth: 1, borderColor: colors.errore, borderRadius: radius.lg, padding: spacing.md, gap: 8 },
  erroreTesta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  erroreTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  erroreTxt: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  btnRiprova: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: touchMin },
  btnRiprovaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  sezione: { color: colors.testoSoft, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4, marginTop: spacing.sm, marginBottom: 4 },
  nota: { color: colors.grigio, fontSize: 12.5, fontStyle: 'italic' },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabData: { color: colors.testoSoft, fontSize: 12.5, fontVariant: ['tabular-nums'] },
});
