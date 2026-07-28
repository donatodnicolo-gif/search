// Interessi — l'app vista per LINEA DI SERVIZIO invece che per livello.
//
// Le altre sezioni rispondono a «a che punto è questo negozio»: Selezionati,
// Lead, Prospect, Clienti. Questa risponde a un'altra domanda, che prima non
// aveva un posto: **«per il Gifting, a che punto siamo?»** — quanti clienti
// abbiamo già, quanti prospect stiamo lavorando, quanti selezionati aspettano
// il primo contatto. È la vista di chi porta una linea, non un territorio.
//
// Un negozio può avere più interessi: compare sotto ciascuno. Non è un errore
// di conteggio — un fioraio che fa consegne ed è anche affiliato è davvero due
// cose, e sommare le colonne di questa pagina non deve dare il totale dei
// negozi.
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { canonizzaLinee } from '@/types';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { usePlaces } from '@/lib/usePlaces';
import { coloreLivello, inLavorazione, LABEL_LIVELLO, livelloDi, type Livello } from '@/lib/livelli';
import { EmptyState, PageIntro } from '@/components/ui';
import { CardElenco } from '@/components/CardElenco';
import { AzioniContatto } from '@/components/AzioniContatto';
import { IconaAzione } from '@/components/AzioniRiga';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';
import { VisitaModal } from '@/components/VisitaModal';
import { PianificaVisitaModal } from '@/components/PianificaVisitaModal';
import { COLORE_VISITA, LABEL_VISITA, giornoBreve, statoVisita } from '@/lib/statoVisita';

// L'ordine del funnel: dove sta il lavoro si legge da sinistra a destra.
// Dormienti e persi restano fuori: qui si guarda il lavoro in corso, e
// tenerli allargherebbe ogni riga con due colonne che non si lavorano.
type Colonna = Extract<Livello, 'selezionato' | 'lead' | 'prospect' | 'cliente'>;
const COLONNE: Colonna[] = ['selezionato', 'lead', 'prospect', 'cliente'];
type PerLivello = Record<Colonna, Place[]>;

export default function Interessi() {
  const router = useRouter();
  const { places, conContatto, contattati, inTrattativa, conBozza, visitati, recapiti, loading, ricarica } = usePlaces();
  // Le stesse finestre delle altre liste: chi apre un negozio da qui deve
  // poterci fare le stesse cose, non tornare in un'altra sezione per agire.
  const [mailPlace, setMailPlace] = useState<Place | null>(null);
  const [visitaPlace, setVisitaPlace] = useState<Place | null>(null);
  const [pianificaPlace, setPianificaPlace] = useState<Place | null>(null);
  // Quale interesse è aperto. Uno per volta: aperti tutti, la pagina diventa
  // l'elenco completo dei negozi e non si vede più il quadro d'insieme.
  const [aperto, setAperto] = useState<string | null>(null);
  const [livelloAperto, setLivelloAperto] = useState<Colonna | null>(null);

  const gruppi = useMemo(() => {
    const per = new Map<string, PerLivello>();
    for (const p of places) {
      // Stesso criterio delle liste (lib/livelli.ts): scelto da una persona
      // OPPURE con un rapporto già in piedi — un contatto in rubrica o una
      // mail già partita. Prima bastava non avere `creato_da` per sparire da
      // qui pur comparendo in Rubrica.
      if (!inLavorazione(p, conContatto.has(p.id), contattati.has(p.id))) continue;
      const liv = livelloDi(p, conContatto.has(p.id), contattati.has(p.id), inTrattativa.has(p.id));
      if (!COLONNE.includes(liv as Colonna)) continue; // dormienti e persi: non sono lavoro in corso
      // Un negozio senza interesse non sparisce: finisce in «Da assegnare»,
      // che è esattamente il lavoro che qualcuno deve fare.
      const linee = canonizzaLinee(
        p.linee_ipotizzate?.length ? p.linee_ipotizzate : p.linea_ipotizzata ? [p.linea_ipotizzata] : [],
      );
      for (const linea of linee.length ? linee : ['Da assegnare']) {
        if (!per.has(linea)) {
          per.set(linea, { selezionato: [], lead: [], prospect: [], cliente: [] });
        }
        per.get(linea)![liv as Colonna].push(p);
      }
    }
    return [...per.entries()]
      .map(([linea, per]) => ({
        linea,
        per,
        totale: COLONNE.reduce((s, l) => s + per[l].length, 0),
      }))
      // Prima gli interessi più grandi; «Da assegnare» sempre in fondo, che è
      // una mancanza, non una linea di servizio.
      .sort((a, b) =>
        a.linea === 'Da assegnare' ? 1 : b.linea === 'Da assegnare' ? -1 : b.totale - a.totale,
      );
  }, [places, conContatto, contattati, inTrattativa]);

  const elencoAperto = useMemo(() => {
    if (!aperto || !livelloAperto) return [];
    const g = gruppi.find((x) => x.linea === aperto);
    return [...(g?.per[livelloAperto] ?? [])].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [gruppi, aperto, livelloAperto]);

  function apri(linea: string, livello: Colonna) {
    // Ritap sulla stessa casella = chiude. Serve per tornare al quadro
    // d'insieme senza cercare un bottone apposta.
    if (aperto === linea && livelloAperto === livello) {
      setAperto(null);
      setLivelloAperto(null);
      return;
    }
    setAperto(linea);
    setLivelloAperto(livello);
  }

  return (
    // Le finestre stanno FUORI dallo scorrimento: dentro, un pop-up si
    // muoverebbe con la pagina invece di restare al centro dello schermo.
    <View style={styles.container}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={ricarica} />}
    >
      <View style={styles.headerScroll}>
        <PageIntro testo="Ogni linea di servizio con quello che ci sta dentro: selezionati, lead, prospect e clienti. Tocca un numero per vedere i negozi. Qui si contano i NEGOZI, mentre in Rubrica si contano le persone — lo stesso negozio con tre referenti lì fa tre righe, qui una. Un negozio con due interessi compare sotto entrambi: le colonne non si sommano." />
      </View>

      {!loading && gruppi.length === 0 ? (
        <EmptyState
          loading={loading}
          icona="pricetags-outline"
          titolo="Nessun interesse da mostrare"
          aiuto="Gli interessi arrivano dalla tipologia dei negozi in lista. Metti qualche negozio in Selezionati e qui comincia a comparire il quadro."
        />
      ) : null}

      {gruppi.map((g) => {
        const daAssegnare = g.linea === 'Da assegnare';
        return (
          <View key={g.linea} style={[styles.gruppo, daAssegnare && styles.gruppoManca]}>
            <View style={styles.gruppoTesta}>
              <Ionicons
                name={daAssegnare ? 'help-circle-outline' : 'pricetag-outline'}
                size={16}
                color={daAssegnare ? colors.attenzione : colors.goldStrong}
              />
              <Text style={styles.gruppoNome} numberOfLines={2}>
                {g.linea}
              </Text>
              <Text style={styles.gruppoTot}>{g.totale}</Text>
            </View>

            <View style={styles.colonne}>
              {COLONNE.map((liv) => {
                const n = g.per[liv].length;
                const attiva = aperto === g.linea && livelloAperto === liv;
                return (
                  <Pressable
                    key={liv}
                    onPress={() => n > 0 && apri(g.linea, liv)}
                    style={[styles.cella, attiva && styles.cellaOn, !n && styles.cellaVuota]}
                    accessibilityLabel={`${LABEL_LIVELLO[liv]}: ${n}`}
                  >
                    <Text style={[styles.cellaNum, attiva && styles.cellaNumOn, !n && styles.cellaNumVuoto]}>
                      {n || '—'}
                    </Text>
                    <View style={styles.cellaEt}>
                      <View style={[styles.dot, { backgroundColor: coloreLivello(liv) }]} />
                      <Text style={[styles.cellaTxt, attiva && styles.cellaTxtOn]} numberOfLines={1}>
                        {LABEL_LIVELLO[liv]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* I negozi della casella aperta, sotto al suo gruppo: aprirli in
                un'altra schermata farebbe perdere il confronto fra le colonne. */}
            {aperto === g.linea && livelloAperto ? (
              <View style={styles.elenco}>
                <Text style={styles.elencoTitolo}>
                  {LABEL_LIVELLO[livelloAperto]} · {g.linea} ({elencoAperto.length})
                </Text>
                {elencoAperto.map((p) => {
                  const visita = statoVisita(p, conBozza.has(p.id), visitati.has(p.id));
                  const quando = giornoBreve(p.visita_pianificata);
                  return (
                    <CardElenco
                      key={p.id}
                      coloreIcona={COLORE_VISITA[visita]}
                      titoloIcona={LABEL_VISITA[visita]}
                      nome={p.nome}
                      meta={[p.zona, p.categoria].filter(Boolean).join(' · ') || p.indirizzo}
                      account={p.anagrafiche_account ?? null}
                      onPress={() => router.push(`/(app)/attivita/${p.id}`)}
                      azioni={
                        // Le stesse azioni delle altre liste
                        // (components/AzioniContatto.tsx): da qui si vede dove
                        // sta il lavoro di una linea, e chi lo vede deve poterlo
                        // fare subito invece di annotarsi il nome e cambiare
                        // sezione.
                        <AzioniContatto
                          place={p}
                          recapito={recapiti.get(p.id)}
                          onVisita={() => setVisitaPlace(p)}
                          onMail={(x) => setMailPlace(x as Place)}
                          onTrattativa={(x) =>
                            router.push(
                              `/(app)/trattative?nuovoPer=${x.id}&nuovoNome=${encodeURIComponent(x.nome)}`,
                            )
                          }
                        >
                          <IconaAzione
                            nome="calendar-outline"
                            attiva
                            evidenza={Boolean(p.visita_pianificata)}
                            label={quando ? `Visita prevista ${quando} — cambia` : 'Pianifica la visita'}
                            onPress={() => setPianificaPlace(p)}
                          />
                        </AzioniContatto>
                      }
                    />
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>

    {mailPlace ? <ScegliScriptModal place={mailPlace} onClose={() => setMailPlace(null)} /> : null}
    <VisitaModal
      place={visitaPlace}
      onClose={() => setVisitaPlace(null)}
      onDone={() => {
        setVisitaPlace(null);
        // Ricarica: registrata la visita il negozio può cambiare colonna, e
        // vederlo restare dov'era farebbe pensare che non sia stato salvato.
        ricarica();
      }}
    />
    <PianificaVisitaModal
      place={pianificaPlace}
      onClose={() => setPianificaPlace(null)}
      onDone={() => {
        setPianificaPlace(null);
        ricarica();
      }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md },
  gruppo: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: spacing.sm,
  },
  // «Da assegnare» non è una linea: è lavoro arretrato, e si vede.
  gruppoManca: { borderColor: colors.attenzione, backgroundColor: '#FFFDF5' },
  gruppoTesta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gruppoNome: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  gruppoTot: { color: colors.testoSoft, fontWeight: '800', fontSize: 13 },
  colonne: { flexDirection: 'row', gap: 6 },
  cella: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.sfondo,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellaOn: { backgroundColor: colors.bianco, borderColor: colors.ink },
  cellaVuota: { opacity: 0.55 },
  cellaNum: { color: colors.navy, fontWeight: '800', fontSize: 18 },
  cellaNumOn: { color: colors.ink },
  cellaNumVuoto: { color: colors.grigio, fontSize: 15 },
  cellaEt: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cellaTxt: { color: colors.testoSoft, fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  cellaTxtOn: { color: colors.testo },
  elenco: { gap: spacing.sm, marginTop: 2 },
  elencoTitolo: {
    color: colors.testoSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
