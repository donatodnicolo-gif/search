import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import type { Place } from '@/types';
import { canonizzaLinee } from '@/types';
import { colors, radius, shadow, spacing, contenutoCentrato } from '@/lib/theme';
import { aggiornaNascosto } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { applicaFiltri, usePlaces } from '@/lib/usePlaces';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { Filters, filtriVuoti, type FiltriMappa } from '@/components/Filters';
import { PriorityBadge } from '@/components/PriorityBadge';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { aRischio, coloreLivello, COLORE_A_RISCHIO, COLORE_PERSO, ePerso, inLavorazione, LABEL_A_RISCHIO, LABEL_LIVELLO, LABEL_PERSO, LIVELLI, livelloDi, type Livello } from '@/lib/livelli';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';
import { VisitaModal } from '@/components/VisitaModal';
import { IconaAzione } from '@/components/AzioniRiga';
import { AzioniContatto } from '@/components/AzioniContatto';
import { CardElenco } from '@/components/CardElenco';
import { PianificaVisitaModal } from '@/components/PianificaVisitaModal';
import { IscriviSequenzaModal } from '@/components/IscriviSequenzaModal';
import { COLORE_VISITA, LABEL_VISITA, giorniDaOggi, giornoBreve, statoVisita, type StatoVisita } from '@/lib/statoVisita';
import type { RecapitoPlace } from '@/lib/db';

// Le "viste" del menu: ogni voce di Contatti apre /lista già filtrata.
// "inattivi" = dormienti + persi, la scheda dei rapporti da riattivare.
//
// ⚠️ Dal 27/07/2026 i nomi delle viste coincidono con i livelli (lib/livelli.ts):
// `vista=prospect` mostra i Prospect veri, non più i Selezionati. Chi avesse un
// vecchio link salvato finisce su una lista diversa da prima — il titolo in
// cima dice sempre quale.
type Vista = 'selezionato' | 'lead' | 'prospect' | 'cliente' | 'inattivi';
const LIVELLI_VISTA: Record<Vista, Livello[]> = {
  selezionato: ['selezionato'],
  lead: ['lead'],
  prospect: ['prospect'],
  cliente: ['cliente'],
  // ⚠️ Solo i dormienti (decisione utente 29/07/2026): «in Dormienti e persi ci
  // vanno solo quelli che Anagrafiche indica come dismessi». I persi restano
  // nella lista del loro livello, con il badge — vedi `ePerso` in lib/livelli.
  inattivi: ['dormiente'],
};
// Il titolo in cima alla schermata: la rotta è una sola (/lista) ma le viste
// sono cinque, e un titolo fisso contraddiceva la voce di menu da cui si era
// arrivati.
const NOME_VISTA: Record<Vista, string> = {
  selezionato: 'Selezionati',
  lead: 'Lead',
  prospect: 'Prospect',
  cliente: 'Clienti',
  inattivi: 'Dormienti',
};

const TITOLO_VISTA: Record<Vista, string> = {
  selezionato: 'Selezionati — scelti con la ⭐ da Mappa o Affiliazioni: non gli è ancora stato detto niente. L’azione è il primo contatto.',
  lead: 'Lead — c’è un contatto: una persona in rubrica, un messaggio partito, o è arrivato lui. Non ha ancora mostrato interesse: sono quelli da incalzare.',
  prospect: 'Prospect — ha risposto e c’è una trattativa aperta: qui si sta giocando qualcosa, e l’azione è portarla a casa.',
  cliente: 'Clienti — hanno chiuso una trattativa.',
  inattivi:
    'Dormienti — clienti che il registro Anagrafiche dà per dismessi: ci conoscono e hanno già comprato, ed è la lista più redditizia da riattivare. I rapporti chiusi senza esito NON stanno qui: restano nella loro lista col badge «Perso».',
};

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

export default function Lista() {
  const router = useRouter();
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const { places, conContatto, contattati, inTrattativa, nonFatturano, conBozza, visitati, recapiti, loading, opzioni, ricarica } =
    usePlaces();
  // Il livello dipende da tre insiemi caricati una volta sola: scriverlo qui
  // evita di ripeterli a ogni chiamata e di dimenticarne uno in una delle
  // quattro (è già successo con `contattati`).
  const livelloPlace = (p: Place) =>
    livelloDi(p, conContatto.has(p.id), contattati.has(p.id), inTrattativa.has(p.id), nonFatturano.has(p.id));
  const [filtri, setFiltri] = useState<FiltriMappa>(filtriVuoti);
  const { vista } = useLocalSearchParams<{ vista?: string }>();
  const vistaCorr = (['selezionato', 'lead', 'prospect', 'cliente', 'inattivi'] as Vista[]).includes(vista as Vista)
    ? (vista as Vista)
    : null;
  const livelliVista = vistaCorr ? LIVELLI_VISTA[vistaCorr] : null;

  // Il titolo in cima segue la voce di menu da cui si arriva: la rotta è una
  // sola, ma "Prospect e Lead" fisso smentiva la voce appena premuta.
  const navigazione = useNavigation();
  useEffect(() => {
    navigazione.setOptions({ title: vistaCorr ? NOME_VISTA[vistaCorr] : 'Contatti' });
  }, [navigazione, vistaCorr]);

  const [query, setQuery] = useState('');
  // Dentro la vista si può ancora affinare per singolo livello (es. dormiente vs perso).
  const [livello, setLivello] = useState<Livello | null>(null);
  // Cambiando voce di menu (vista) si azzera il sotto-filtro.
  useEffect(() => setLivello(null), [vista]);
  // "Invia mail" su un Prospect: scegli lo script (o creane uno) → schermata invio.
  const [mailPlace, setMailPlace] = useState<Place | null>(null);
  // La visita: stessa finestra della Mappa (VisitaModal), non una pagina a parte.
  const [visitaPlace, setVisitaPlace] = useState<Place | null>(null);
  // «Quando ci vado?»: la data che ci si dà per andare a trovare il negozio.
  const [pianificaPlace, setPianificaPlace] = useState<Place | null>(null);
  // «Metti in sequenza»: i solleciti a scadenza (lib/sequenze.ts).
  const [sequenzaPlace, setSequenzaPlace] = useState<Place | null>(null);

  async function nascondi(place: Place) {
    try {
      await aggiornaNascosto(place.id, true);
      ricarica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile rimuovere il target.');
    }
  }

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = applicaFiltri(places, filtri)
      // Chi si lavora: scelto da una persona (creato_da / ⭐) oppure con un
      // rapporto già in piedi. La regola sta in `inLavorazione` (lib/livelli.ts)
      // insieme al motivo per cui è così — e sta lì e non qui perché la usano
      // anche Per interesse e i conteggi dei chip: tre copie divergenti erano
      // già bastate a far sparire dei negozi da una vista sola.
      .filter((p) => inLavorazione(p, conContatto.has(p.id), contattati.has(p.id)))
      .filter((p) => (livelliVista ? livelliVista.includes(livelloPlace(p)) : true))
      .filter((p) => (livello ? livelloPlace(p) === livello : true))
      .filter((p) => {
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        (p.indirizzo ?? '').toLowerCase().includes(q) ||
        (p.categoria ?? '').toLowerCase().includes(q) ||
        (p.zona ?? '').toLowerCase().includes(q) ||
        (p.linea_ipotizzata ?? '').toLowerCase().includes(q)
      );
    });
    return [...f].sort((a, b) => RANK[a.priorita] - RANK[b.priorita] || a.nome.localeCompare(b.nome));
  }, [places, conContatto, contattati, filtri, query, livello, livelliVista]);

  // Quanti ce ne sono per livello (i numeri sui chip: dicono dove sta il lavoro).
  const perLivello = useMemo(() => {
    // Partire dai livelli veri: con le chiavi scritte a mano, aggiungerne uno
    // (è successo con "lead") lasciava un conteggio `undefined` e il chip senza
    // numero.
    const c: Record<string, number> = Object.fromEntries(LIVELLI.map((l) => [l, 0]));
    for (const p of places) {
      // Stesso criterio della lista: se cambia solo lì, i numeri sui chip non
      // corrispondono più alle righe che si vedono.
      if (!inLavorazione(p, conContatto.has(p.id), contattati.has(p.id))) continue;
      c[livelloPlace(p)] += 1;
    }
    return c;
  }, [places, conContatto, contattati]);

  // I chip: dentro una vista mostro solo i suoi livelli, e solo se più d'uno.
  const chipLivelli = livelliVista ?? LIVELLI;
  const mostraChip = chipLivelli.length > 1;

  return (
    <View style={styles.container}>
      <FlatList
        data={dati}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={ricarica} />}
        // Intro, chip e filtri scorrono INSIEME alla lista: da fissi occupavano
        // mezzo schermo e ai negozi restava una finestrella alta pochi pixel.
        // Va passato come elemento (non come funzione), altrimenti a ogni
        // lettera digitata l'header si rimonta e la ricerca perde il fuoco.
        ListHeaderComponent={
          <View style={styles.headerScroll}>
            <PageIntro
              testo={
                vistaCorr
                  ? TITOLO_VISTA[vistaCorr]
                  : 'I negozi che qualcuno ha scelto di lavorare. SELEZIONATO: scelto con la ⭐, ancora senza un contatto. PROSPECT: ha una persona in rubrica. CLIENTE: ha chiuso una trattativa.'
              }
            />
            {mostraChip ? (
              <View style={styles.livelli}>
                <ChipLivello label="Tutti" on={!livello} onPress={() => setLivello(null)} />
                {chipLivelli.map((l) => (
                  <ChipLivello
                    key={l}
                    label={`${LABEL_LIVELLO[l]}${perLivello[l] ? ` (${perLivello[l]})` : ''}`}
                    on={livello === l}
                    colore={coloreLivello(l)}
                    onPress={() => setLivello((c) => (c === l ? null : l))}
                  />
                ))}
              </View>
            ) : null}
            {/* Prima la ricerca, poi il bottone dei filtri: stesso ordine di
                Clienti, Affiliazioni, Trattative e Rubrica. */}
            <View style={styles.filterBar}>
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Cerca per nome, indirizzo, zona, linea…"
                placeholderTextColor={colors.grigio}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
              <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} admin={admin} />
            </View>
          </View>
        }
        ListEmptyComponent={
          // Nei Lead il consiglio "mettili in lista con la ⭐" sarebbe sbagliato:
          // la stella crea un Selezionato, non un Lead. Qui l'azione è un'altra.
          vistaCorr === 'lead' ? (
            <EmptyState
              loading={loading}
              icona="send-outline"
              titolo="Nessun lead"
              aiuto="Un negozio diventa Lead quando gli scrivi, lo chiami o ci passi: fallo dalle azioni di un Selezionato. Se il contatto è già avvenuto fuori dall'app, inseriscilo qui col bottone +."
              azione="Vai ai Selezionati"
              onAzione={() => router.push('/(app)/lista?vista=selezionato')}
            />
          ) : (
            <EmptyState
              loading={loading}
              icona="flag-outline"
              titolo="Nessun negozio in lista"
              aiuto="Qui entrano solo i negozi che scegli tu: mettili in lista dalla Mappa con la ⭐ (diventano SELEZIONATI), oppure creane uno col bottone +. Se pensavi di trovarne, prova ad azzerare filtri e ricerca."
              azione="Vai alla Mappa"
              onAzione={() => router.push('/(app)/mappa')}
            />
          )
        }
        renderItem={({ item }) => (
          <Riga
            place={item}
            livello={livelloPlace(item)}
            visita={statoVisita(item, conBozza.has(item.id), visitati.has(item.id))}
            recapito={recapiti.get(item.id)}
            onPress={() => router.push(`/(app)/attivita/${item.id}`)}
            onNascondi={() => nascondi(item)}
            onVisita={() => setVisitaPlace(item)}
            onPianifica={() => setPianificaPlace(item)}
            onMail={() => setMailPlace(item)}
            onSequenza={() => setSequenzaPlace(item)}
            onTrattativa={(p) =>
              router.push(`/(app)/trattative?nuovoPer=${p.id}&nuovoNome=${encodeURIComponent(p.nome)}`)
            }
          />
        )}
      />
      {/* Dalla vista Lead il + crea un lead, non un selezionato: altrimenti il
          negozio appena inserito nascerebbe "mai contattato" e sparirebbe
          dall'elenco da cui lo si è appena creato. */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push(vistaCorr === 'lead' ? '/(app)/nuovo-target?come=lead' : '/(app)/nuovo-target')}
        accessibilityLabel={vistaCorr === 'lead' ? 'Nuovo lead' : 'Nuovo target'}
      >
        <Ionicons name="add" size={30} color={colors.bianco} />
      </Pressable>
      {mailPlace ? <ScegliScriptModal place={mailPlace} onClose={() => setMailPlace(null)} /> : null}
      <VisitaModal place={visitaPlace} onClose={() => setVisitaPlace(null)} onDone={() => { setVisitaPlace(null); ricarica(); }} />
      {sequenzaPlace ? (
        <IscriviSequenzaModal place={sequenzaPlace} onClose={() => setSequenzaPlace(null)} />
      ) : null}
      <PianificaVisitaModal
        place={pianificaPlace}
        onClose={() => setPianificaPlace(null)}
        onDone={() => { setPianificaPlace(null); ricarica(); }}
      />
    </View>
  );
}

function ChipLivello({ label, on, colore, onPress }: { label: string; on: boolean; colore?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chipLiv, on && styles.chipLivOn, on && colore ? { backgroundColor: colore, borderColor: colore } : null]}
    >
      <Text style={[styles.chipLivTxt, on && styles.chipLivTxtOn]}>{label}</Text>
    </Pressable>
  );
}

/** "il 12 lug 26": quando il target è entrato nella lista. */
function dataInserimento(iso: string | null | undefined): string {
  if (!iso) return 'in data non registrata';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'in data non registrata';
  return `il ${d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })}`;
}

/** Da quale account (utente) arriva il target. I record senza `creato_da` non
 *  sono stati inseriti da una persona loggata: o li ha scoperti Google (Edge
 *  Function, service role) o vengono dagli import iniziali da terminale. */
function origineInserimento(place: Place): string {
  if (place.creato_da_nome) return `da ${place.creato_da_nome}`;
  if (place.source === 'google') return 'dalla scoperta Google';
  return 'da import iniziale';
}

function Riga({
  place,
  livello,
  visita,
  recapito,
  onPress,
  onNascondi,
  onVisita,
  onPianifica,
  onMail,
  onSequenza,
  onTrattativa,
}: {
  place: Place;
  /** Già calcolato dalla lista: la riga non deve rifare il conto (e sbagliarlo). */
  livello: Livello;
  /** Il semaforo: rosso da fare, giallo da finire, verde fatta. */
  visita: StatoVisita;
  recapito: RecapitoPlace | undefined;
  onPress: () => void;
  onNascondi: () => void;
  onVisita: () => void;
  onPianifica: () => void;
  onMail: () => void;
  onSequenza: () => void;
  onTrattativa: (place: Place) => void;
}) {
  const quando = giornoBreve(place.visita_pianificata);
  const fra = giorniDaOggi(place.visita_pianificata);
  return (
    // Stessa scheda dei Clienti (components/CardElenco.tsx): icona a sinistra,
    // testo al centro, badge a destra, azioni in fondo.
    <CardElenco
      // Il riquadro dell'icona è il semaforo della visita: si legge prima del
      // testo, ed è la cosa che dice se quel negozio è lavoro da fare.
      coloreIcona={COLORE_VISITA[visita]}
      titoloIcona={LABEL_VISITA[visita]}
      nome={place.nome}
      meta={place.indirizzo}
      account={place.anagrafiche_account ?? null}
      // TUTTI gli interessi, non solo il primo: la riga mostrava la sola
      // `linea_ipotizzata` mentre la scheda ne elencava tre, e sembrava che il
      // negozio ne avesse uno solo (segnalato dall'utente il 29/07/2026).
      tag={canonizzaLinee(place.linee_ipotizzate ?? (place.linea_ipotizzata ? [place.linea_ipotizzata] : []))}
      onPress={onPress}
      badge={
        <>
          <StatusBadge small label={LABEL_LIVELLO[livello]} colore={coloreLivello(livello)} />
          {/* Perso non toglie il negozio dalla sua lista: lo marca. Un lead
              chiuso resta fra i Lead, e si vede che è chiuso. */}
          {ePerso(place) ? <StatusBadge small label={LABEL_PERSO} colore={COLORE_PERSO} /> : null}
          {/* Ancora cliente, ma i segnali peggiorano: è il momento in cui si
              può fare qualcosa, e prima non lo diceva niente. */}
          {aRischio(place) ? <StatusBadge small label={LABEL_A_RISCHIO} colore={COLORE_A_RISCHIO} /> : null}
          <PriorityBadge priorita={place.priorita} small />
        </>
      }
      extra={
        <>
          {/* La data che ci si è dati, se c'è: in ritardo va detto, altrimenti
              un giro saltato resta in agenda senza che nessuno se ne accorga. */}
          {quando ? (
            <Text style={[styles.pianificata, fra !== null && fra < 0 && styles.pianificataTardi]} numberOfLines={1}>
              <Ionicons name="calendar-outline" size={11} /> Visita prevista {quando}
              {fra === 0 ? ' · oggi' : fra !== null && fra < 0 ? ` · in ritardo di ${-fra} g` : ''}
            </Text>
          ) : null}
          <Text style={styles.inserito} numberOfLines={1}>
            <Ionicons name="person-outline" size={11} color={colors.grigio} /> Inserito{' '}
            {dataInserimento(place.created_at)} · {origineInserimento(place)}
          </Text>
        </>
      }
      azioni={
        // Le stesse azioni dei Potenziali (components/AzioniContatto.tsx): un
        // Selezionato serve a poco se dalla riga non si può nemmeno chiamarlo o
        // scrivergli. La mail parte dall'app con gli script, non con `mailto:`.
        <AzioniContatto
          place={place}
          recapito={recapito}
          onVisita={onVisita}
          onMail={onMail}
          onSequenza={onSequenza}
          onTrattativa={onTrattativa}
        >
          <IconaAzione
            nome="calendar-outline"
            attiva
            // Acceso quando una data c'è già: si vede dalla fila dei bottoni
            // quali negozi sono in agenda, senza leggere riga per riga.
            evidenza={Boolean(place.visita_pianificata)}
            label={quando ? `Visita prevista ${quando} — cambia` : 'Pianifica la visita'}
            onPress={onPianifica}
          />
          <IconaAzione nome="eye-off-outline" attiva label="Rimuovi target (nascondi)" onPress={onNascondi} />
        </AzioniContatto>
      }
    />
  );
}

const styles = StyleSheet.create({
  livelli: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  rigaBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  rigaAzione: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  rigaAzioneTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12 },
  chipLiv: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipLivOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipLivTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipLivTxtOn: { color: colors.bianco },
  container: { flex: 1, backgroundColor: colors.sfondo },
  filterBar: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  search: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  list: { padding: spacing.md, gap: spacing.sm },
  // L'header sta dentro il contenitore della lista, che ha gia' il suo padding:
  // qui lo si annulla perche' intro, chip e filtri hanno gia' i propri margini
  // (e la barra dei filtri deve restare larga da bordo a bordo).
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md },
  riga: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 6,
  },
  rigaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.navy },
  stato: { fontSize: 12, color: colors.testoSoft, fontWeight: '600' },
  nascondi: { padding: 2 },
  // "Tipologia di interesse" = linea Deluxy, come tag oro.
  lineaTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  indirizzo: { fontSize: 13, color: colors.grigio },
  metaPersone: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  accountTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  accountTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  inserito: { fontSize: 12, color: colors.grigio, fontWeight: '600' },
  pianificata: { fontSize: 12.5, color: colors.testo, fontWeight: '700' },
  pianificataTardi: { color: colors.errore },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontSize: 30, fontWeight: '400', marginTop: -2 },
});
