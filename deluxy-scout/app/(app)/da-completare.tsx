// Sezione "Da fare": la coda operativa del venditore.
// 1) Da ricontattare — negozi la cui ultima visita chiede un seguito
//    (interessato → recap entro 3 giorni, da richiamare → entro 7).
// 2) Follow-up affiliazioni — le trattative Affiliazioni/Re-seller CON una
//    scadenza (chi non se ne è data una sta in Trattative, non qui).
// 3) TASK aperti (28/08/2026, richiesta dell'utente: «da fare fai vedere anche
//    le tasks sempre con filtro io / tutti»). Erano l'unica cosa da fare che
//    questa pagina non mostrava: chi la teneva aperta come coda del giorno
//    doveva ricordarsi di guardare anche «I miei task».
// 4) Da completare — visite segnate sul campo ma senza contatto/note.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Place, Task } from '@/types';
import { colors, radius, shadow, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { EmptyState, StatusBadge } from '@/components/ui';
import { LineaIcon } from '@/components/LineaIcon';
import {
  fetchAllVisits,
  fetchDaCompletare,
  fetchPlaces,
  fetchTask,
  fetchTutteTrattative,
  fetchUltimoContattoPerPlace,
  chiudiRichiamo,
  type TrattativaConLuogo,
} from '@/lib/db';
import { CampoCerca, Chip, RigaChips } from '@/components/ui';
import { TaskFormModal } from '@/components/TaskFormModal';
import {
  daRicontattare,
  followupAffiliazioni,
  placeIdConTrattativaAperta,
  type Richiamo,
} from '@/lib/metrics';
import { avvisa, conferma } from '@/lib/dialoghi';
import { PriorityBadge } from '@/components/PriorityBadge';
import { VisitaModal } from '@/components/VisitaModal';
import { PianoCommerciale } from '@/components/PianoCommerciale';

type Riga =
  | { tipo: 'richiamo'; richiamo: Richiamo }
  | { tipo: 'followup'; deal: TrattativaConLuogo }
  | { tipo: 'task'; task: Task }
  | { tipo: 'completa'; place: Place };

// Info scadenza follow-up: testo relativo + flag ritardo + data breve.
function scadenzaInfo(iso: string | null): { txt: string; ritardo: boolean; data: string | null } {
  if (!iso) return { txt: 'Senza scadenza', ritardo: false, data: null };
  const d = new Date(iso + 'T00:00:00');
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const gg = Math.round((d.getTime() - oggi.getTime()) / 86400000);
  const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const txt =
    gg === 0 ? 'scade oggi' : gg === 1 ? 'scade domani' : gg === -1 ? 'scaduta ieri' : gg < 0 ? `scaduta ${-gg} giorni fa` : `tra ${gg} giorni`;
  return { txt, ritardo: gg < 0, data };
}

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato — inviare recap',
  da_richiamare: 'Da richiamare',
};

export default function DaCompletare() {
  const router = useRouter();
  const [richiami, setRichiami] = useState<Richiamo[]>([]);
  const [daCompletare, setDaCompletare] = useState<Place[]>([]);
  const [followup, setFollowup] = useState<TrattativaConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Place | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  /** Il filtro dei task, come in «I miei task»: la stessa domanda, la stessa
   *  risposta. ⚠️ Vale SOLO per i task — richiami e visite non hanno un
   *  assegnatario, e il titolo della sezione lo dice per non far credere che
   *  filtri tutta la pagina. */
  // Ricerca su ogni elenco (Libro v1.9 §8-bis — mancava, 28/08/2026).
  const [cerca, setCerca] = useState('');
  const [scopeTask, setScopeTask] = useState<'miei' | 'tutti'>('miei');
  const [taskAperto, setTaskAperto] = useState<Task | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [dc, places, visits, trattative, ultimoContatto, task] = await Promise.all([
        fetchDaCompletare(),
        fetchPlaces(),
        fetchAllVisits(),
        fetchTutteTrattative(),
        fetchUltimoContattoPerPlace().catch(() => new Map<string, string>()),
        // ⚠️ Best effort: se i task non arrivano, la coda si vede lo stesso
        // senza quella sezione invece di non vedersi affatto.
        fetchTask(scopeTask === 'miei').catch(() => [] as Task[]),
      ]);
      setDaCompletare(dc);
      // ⚠️ Solo gli APERTI: questa è una coda di cose da fare, e un task già
      // spuntato non è una cosa da fare — sta in «I miei task», completati.
      setTasks(task.filter((t) => !t.completata));
      // Stesso criterio della Home: chi è in trattativa non è un richiamo.
      setRichiami(
        daRicontattare(places, visits, new Date(), {
          conTrattativaAperta: placeIdConTrattativaAperta(trattative),
          ultimoContatto,
        }),
      );
      // Follow-up affiliazioni/re-seller aperti, prima i più urgenti (scaduti in cima).
      const fu = followupAffiliazioni(trattative).sort((a, b) => {
        if (!a.scadenza) return 1;
        if (!b.scadenza) return -1;
        return a.scadenza < b.scadenza ? -1 : a.scadenza > b.scadenza ? 1 : 0;
      });
      setFollowup(fu);
    } finally {
      setLoading(false);
    }
  }, [scopeTask]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // «×»: il richiamo esce dalla coda. Stesso comportamento della Home, testo
  // compreso: due schermate che chiudono la stessa cosa devono dire la stessa cosa.
  const chiudi = useCallback((r: Richiamo) => {
    conferma(
      'Chiudere il richiamo?',
      `«${r.place.nome}» esce da questa coda. Ci torna da solo se registri una visita nuova con esito «interessato» o «da richiamare».`,
      () => {
        const prima = richiami;
        setRichiami((cur) => cur.filter((x) => x.place.id !== r.place.id));
        chiudiRichiamo(r.place.id).catch((e) => {
          setRichiami(prima);
          avvisa('Richiamo non chiuso', String((e as Error)?.message ?? e));
        });
      },
      { testoConferma: 'Chiudi' },
    );
  }, [richiami]);

  // Il filtro della ricerca, applicato a OGNI sezione con i suoi campi.
  const q = cerca.trim().toLowerCase();
  const nrm = (v: unknown) => String(v ?? '').toLowerCase();
  const richiamiVisti = q ? richiami.filter((r) => [r.place.nome, r.place.zona, r.visita.note_post_meeting].some((x) => nrm(x).includes(q))) : richiami;
  const followupVisti = q ? followup.filter((d) => [d.place_nome, d.titolo, d.linea, d.owner_nome].some((x) => nrm(x).includes(q))) : followup;
  const tasksVisti = q ? tasks.filter((t) => [t.titolo, t.place_nome, t.owner_nome, t.contatto?.nome].some((x) => nrm(x).includes(q))) : tasks;
  const daCompletareVisti = q ? daCompletare.filter((p) => [p.nome, p.zona].some((x) => nrm(x).includes(q))) : daCompletare;

  const sezioni = [
    ...(richiamiVisti.length
      ? [{ title: `Da ricontattare (${richiamiVisti.length})`, data: richiamiVisti.map((r): Riga => ({ tipo: 'richiamo', richiamo: r })) }]
      : []),
    ...(followupVisti.length
      ? [{ title: `Follow-up affiliazioni (${followupVisti.length})`, data: followupVisti.map((d): Riga => ({ tipo: 'followup', deal: d })) }]
      : []),
    ...(tasksVisti.length
      ? [
          {
            // Il titolo DICE su cosa agisce il filtro: «Task (3)» con le
            // pillole sopra farebbe credere che filtrino tutta la pagina.
            title: `${scopeTask === 'miei' ? 'I miei task' : 'Task di tutta la squadra'} (${tasksVisti.length})`,
            data: tasksVisti.map((t): Riga => ({ tipo: 'task', task: t })),
          },
        ]
      : []),
    ...(daCompletareVisti.length
      ? [{ title: `Da completare (${daCompletareVisti.length})`, data: daCompletareVisti.map((p): Riga => ({ tipo: 'completa', place: p })) }]
      : []),
  ];

  // Da 900px in su ogni sezione è una TABELLA (le righe-scheda sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const sezioniVista = aTabella
    ? sezioni.map((s) => ({ ...s, data: [s.data] as unknown as Riga[] }))
    : sezioni;

  const colonneRichiami: ColonnaTabella<Richiamo>[] = [
    {
      chiave: 'nome',
      label: 'Negozio',
      flex: 1.1,
      valore: (r) => r.place.nome,
      cella: (r) => (
        <View style={styles.tabNomeRiga}>
          <PriorityBadge priorita={r.place.priorita} small />
          <Text style={styles.tabNome} numberOfLines={2}>
            {r.place.nome}
          </Text>
        </View>
      ),
    },
    {
      chiave: 'cosa',
      label: 'Cosa fare',
      flex: 1,
      righe: 2,
      valore: (r) => LABEL_ESITO[r.visita.esito ?? ''] ?? 'Da ricontattare',
    },
    {
      chiave: 'quando',
      label: 'Visita',
      width: 96,
      destra: true,
      numerica: true,
      valore: (r) => r.giorni,
      cella: (r) => (
        <Text style={[styles.tabData, r.inRitardo && styles.tabRitardo]}>
          {r.giorni === 0 ? 'oggi' : r.giorni === 1 ? 'ieri' : `${r.giorni} g fa`}
          {r.inRitardo ? ' · ritardo' : ''}
        </Text>
      ),
    },
    { chiave: 'nota', label: 'Note', flex: 1, righe: 2, valore: (r) => r.visita.note_post_meeting ?? null },
    {
      chiave: 'chiudi',
      label: '',
      width: 36,
      fissa: true,
      valore: () => null,
      cella: (r) => (
        <Pressable
          hitSlop={10}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            chiudi(r);
          }}
          accessibilityLabel={`Chiudi il richiamo di ${r.place.nome}`}
          {...({ title: 'Chiudi il richiamo' } as any)}
        >
          <Ionicons name="close" size={18} color={colors.grigio} />
        </Pressable>
      ),
    },
  ];

  const colonneTask: ColonnaTabella<Task>[] = [
    {
      chiave: 'titolo',
      label: 'Task',
      flex: 1.2,
      valore: (t) => t.titolo,
      cella: (t) => (
        <View style={{ gap: 2 }}>
          <View style={styles.tabNomeRiga}>
            <PriorityBadge priorita={t.priorita} small />
            <Text style={styles.tabNome} numberOfLines={2}>{t.titolo}</Text>
          </View>
          {/* ⚠️ Il CONTATTO collegato si legge qui (migr. 0100): «Sentire
              Marco» senza dire quale Marco è un promemoria che fra un mese non
              si sa più eseguire. */}
          {t.contatto?.nome ? (
            <Text style={styles.tabSotto} numberOfLines={1}>
              {t.contatto.nome}
              {t.contatto.telefono ? ` · ${t.contatto.telefono}` : ''}
            </Text>
          ) : t.place_nome ? (
            <Text style={styles.tabSotto} numberOfLines={1}>{t.place_nome}</Text>
          ) : null}
        </View>
      ),
    },
    { chiave: 'owner', label: 'Assegnato a', flex: 0.8, valore: (t) => t.owner_nome ?? 'Non attribuito' },
    {
      chiave: 'scadenza',
      label: 'Scadenza',
      width: 132,
      valore: (t) => t.scadenza,
      cella: (t) => {
        const s = scadenzaInfo(t.scadenza);
        if (!s) return <Text style={styles.tabSotto}>Senza scadenza</Text>;
        return <Text style={[styles.tabData, s.ritardo && styles.tabRitardo]}>{s.txt}</Text>;
      },
    },
  ];

  const colonneFollowup: ColonnaTabella<TrattativaConLuogo>[] = [
    {
      chiave: 'nome',
      label: 'Negozio',
      flex: 1.2,
      /**
       * ⚠️ IL RIPIEGO ERA LA LINEA, e faceva sparire il cliente (27/08/2026,
       * domanda dell'utente: «questo da fare da dove arriva?»).
       *
       * Trentanove righe su quaranta scrivevano «Affiliazioni», perche' quelle
       * trattative arrivano da HubSpot e NON hanno un negozio agganciato in
       * Scout: il ripiego stampava il nome della linea come se fosse il nome
       * del cliente. Ma il nome dell'affare ce l'ha — «Affiliazione I Fiori di
       * Sonia» — e quello va letto per primo.
       *
       * L'ordine dei ripieghi e' quello della SPECIFICITA': il negozio
       * agganciato, poi il nome dell'affare, e la linea solo come ultima
       * spiaggia — perche' una linea non identifica niente.
       */
      valore: (d) => d.place_nome ?? d.titolo ?? d.linea ?? 'Trattativa',
      cella: (d) => (
        <View style={{ gap: 2 }}>
          <Text style={styles.tabNome} numberOfLines={2}>
            {d.place_nome ?? d.titolo ?? d.linea ?? 'Trattativa'}
          </Text>
          {/* La linea resta visibile, ma come quello che e': un'etichetta. */}
          {d.linea ? <Text style={styles.tabSotto}>{d.linea}</Text> : null}
        </View>
      ),
    },
    { chiave: 'owner', label: 'Assegnato a', flex: 0.8, valore: (d) => d.owner_nome ?? 'Non attribuito' },
    {
      chiave: 'scadenza',
      label: 'Scadenza',
      flex: 0.9,
      destra: true,
      numerica: true,
      valore: (d) => d.scadenza ?? null,
      cella: (d) => {
        const sc = scadenzaInfo(d.scadenza);
        return (
          <Text style={[styles.tabData, sc.ritardo && styles.tabRitardo]} numberOfLines={2}>
            {sc.data ? `${sc.data} · ${sc.txt}` : sc.txt}
          </Text>
        );
      },
    },
  ];

  const colonneCompleta: ColonnaTabella<Place>[] = [
    {
      chiave: 'nome',
      label: 'Negozio',
      flex: 1.1,
      valore: (p) => p.nome,
      cella: (p) => (
        <View style={styles.tabNomeRiga}>
          <PriorityBadge priorita={p.priorita} small />
          <Text style={styles.tabNome} numberOfLines={2}>
            {p.nome}
          </Text>
        </View>
      ),
    },
    { chiave: 'linea', label: 'Linea', flex: 0.6, valore: (p) => p.linea_ipotizzata ?? null },
    { chiave: 'indirizzo', label: 'Indirizzo', flex: 1, valore: (p) => p.indirizzo ?? null },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          Prima il piano — target e conversione per linea, mese per mese — poi la coda: richiami, task e visite.
        </Text>
        {/* ⚠️ Le pillole governano SOLO i task, e il titolo della sezione lo
            ripete («I miei task» / «Task di tutta la squadra»): richiami e visite
            non hanno un assegnatario, e un filtro che sembra globale ma agisce
            su una sezione sola fa contare righe che non sono cambiate. */}
        <View style={{ marginTop: 10 }}>
          <CampoCerca valore={cerca} onCambia={setCerca} placeholder="Cerca in tutta la coda: negozio, task, contatto…" />
        </View>
        <RigaChips style={styles.filtri}>
          <Chip label="I miei task" on={scopeTask === 'miei'} onPress={() => setScopeTask('miei')} />
          <Chip label="Task di tutta la squadra" on={scopeTask === 'tutti'} onPress={() => setScopeTask('tutti')} />
        </RigaChips>
      </View>
      <SectionList
        // ⭐ IL CALENDARIO DEL PIANO STA IN TESTA (29/08/2026, richiesta
        // dell'utente: «mostra in primis un calendario…»). Riferimento di
        // COMPONENTE, non elemento: un elemento inline si rimonterebbe a ogni
        // lettera scritta nella ricerca qui sopra, rifacendo le fetch.
        ListHeaderComponent={PianoCommerciale}
        sections={sezioniVista}
        keyExtractor={(r: any, i) =>
          Array.isArray(r)
            ? `tab-${i}`
            : r.tipo === 'richiamo'
              ? `r-${r.richiamo.place.id}`
              : r.tipo === 'followup'
                ? `f-${r.deal.id}`
                : r.tipo === 'task'
                  ? `t-${r.task.id}`
                  : `c-${r.place.id}`
        }
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            icona="checkmark-done-outline"
            titolo="Niente da fare"
            aiuto="Qui finiscono i richiami dopo una visita, i task aperti e le visite da completare."
            loading={loading}
          />
        }
        renderSectionHeader={({ section }) => <Text style={styles.sezione}>{section.title}</Text>}
        renderItem={({ item }) => {
          // Vista tabella: l'item è l'INTERA sezione, omogenea per tipo.
          if (Array.isArray(item)) {
            const righe = item as Riga[];
            if (!righe.length) return null;
            if (righe[0].tipo === 'richiamo') {
              return (
                <Tabella
                  righe={righe.map((r) => (r as Riga & { tipo: 'richiamo' }).richiamo)}
                  colonne={colonneRichiami}
                  chiaveRiga={(r) => r.place.id}
                  ordineIniziale={{ campo: 'quando', verso: 'desc' }}
                  onRiga={(r) => router.push(`/(app)/attivita/${r.place.id}`)}
                  labelRiga={(r) => `Apri la scheda di ${r.place.nome}`}
                
            totali={(righe) => ({
              nome: `Totale · ${righe.length} ${righe.length === 1 ? 'riga' : 'righe'}`,
            })}
          />
              );
            }
            if (righe[0].tipo === 'followup') {
              return (
                <Tabella
                  righe={righe.map((r) => (r as Riga & { tipo: 'followup' }).deal)}
                  colonne={colonneFollowup}
                  chiaveRiga={(d) => d.id}
                  ordineIniziale={{ campo: 'scadenza', verso: 'asc' }}
                  onRiga={(d) => d.place_id && router.push(`/(app)/attivita/${d.place_id}`)}
                  labelRiga={(d) => `Apri la scheda di ${d.place_nome ?? 'negozio'}`}
                />
              );
            }
            if (righe[0].tipo === 'task') {
              return (
                <Tabella
                  righe={righe.map((r) => (r as Riga & { tipo: 'task' }).task)}
                  colonne={colonneTask}
                  chiaveRiga={(t) => t.id}
                  ordineIniziale={{ campo: 'scadenza', verso: 'asc' }}
                  onRiga={(t) => setTaskAperto(t)}
                  labelRiga={(t) => `Modifica il task «${t.titolo}»`}
                  totali={(righe) => ({
                    titolo: `Totale · ${righe.length} ${righe.length === 1 ? 'task' : 'task'}`,
                  })}
                />
              );
            }
            return (
              <Tabella
                righe={righe.map((r) => (r as Riga & { tipo: 'completa' }).place)}
                colonne={colonneCompleta}
                chiaveRiga={(p) => p.id}
                ordineIniziale={{ campo: 'nome', verso: 'asc' }}
                onRiga={(p) => setSel(p)}
                labelRiga={(p) => `Completa la visita da ${p.nome}`}
              />
            );
          }
          return item.tipo === 'richiamo' ? (
            <RigaRichiamo
              r={item.richiamo}
              onPress={() => router.push(`/(app)/attivita/${item.richiamo.place.id}`)}
              onChiudi={() => chiudi(item.richiamo)}
            />
          ) : item.tipo === 'followup' ? (
            <RigaFollowup
              d={item.deal}
              onPress={() => item.deal.place_id && router.push(`/(app)/attivita/${item.deal.place_id}`)}
            />
          ) : item.tipo === 'task' ? (
            <RigaTask t={item.task} onPress={() => setTaskAperto(item.task)} />
          ) : (
            <RigaCompleta p={item.place} onPress={() => setSel(item.place)} />
          );
        }}
      />
      {taskAperto ? (
        <TaskFormModal
          task={taskAperto}
          onClose={() => setTaskAperto(null)}
          onSalvato={() => {
            setTaskAperto(null);
            carica();
          }}
        />
      ) : null}
      <VisitaModal
        place={sel}
        onClose={() => setSel(null)}
        onDone={() => {
          setSel(null);
          carica();
        }}
      />
    </View>
  );
}

/** Un task nella coda, sul telefono: cosa fare, chi sentire, per quando. */
function RigaTask({ t, onPress }: { t: Task; onPress: () => void }) {
  const s = scadenzaInfo(t.scadenza);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.icona}>
        <Ionicons name="checkbox-outline" size={20} color={colors.navy} />
      </View>
      <View style={styles.info}>
        <View style={styles.titoloRow}>
          <PriorityBadge priorita={t.priorita} small />
          <Text numberOfLines={3} style={styles.nome}>{t.titolo}</Text>
          {s?.ritardo ? <StatusBadge small label="In ritardo" colore={colors.errore} /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            t.contatto?.nome ? `Sentire ${t.contatto.nome}` : t.place_nome,
            t.owner_nome,
            s ? s.txt : 'senza scadenza',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text style={styles.freccia}>Apri ›</Text>
    </Pressable>
  );
}

function RigaRichiamo({ r, onPress, onChiudi }: { r: Richiamo; onPress: () => void; onChiudi: () => void }) {
  const { place: p, visita, giorni, inRitardo } = r;
  const quando = giorni === 0 ? 'oggi' : giorni === 1 ? 'ieri' : `${giorni} giorni fa`;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.icona}>
        <LineaIcon linea={p.linea_ipotizzata} size={22} color={colors.navy} />
      </View>
      <View style={styles.info}>
        <View style={styles.titoloRow}>
          <PriorityBadge priorita={p.priorita} small />
          <Text numberOfLines={3} style={styles.nome}>
            {p.nome}
          </Text>
          {inRitardo ? <StatusBadge small label="In ritardo" colore={colors.errore} /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {LABEL_ESITO[visita.esito ?? ''] ?? 'Da ricontattare'} · visita {quando}
        </Text>
        {visita.note_post_meeting ? (
          <Text style={styles.nota} numberOfLines={1}>
            “{visita.note_post_meeting}”
          </Text>
        ) : null}
      </View>
      <View style={styles.azioniRiga}>
        <Pressable
          onPress={onChiudi}
          hitSlop={10}
          style={styles.chiudiRichiamo}
          accessibilityLabel={`Chiudi il richiamo di ${p.nome}`}
        >
          <Ionicons name="close" size={18} color={colors.grigio} />
        </Pressable>
        <Text style={styles.freccia}>Apri ›</Text>
      </View>
    </Pressable>
  );
}

function RigaFollowup({ d, onPress }: { d: TrattativaConLuogo; onPress: () => void }) {
  const sc = scadenzaInfo(d.scadenza);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.icona}>
        <LineaIcon linea={d.linea} size={22} color={colors.navy} />
      </View>
      <View style={styles.info}>
        <View style={styles.titoloRow}>
          <Text numberOfLines={3} style={styles.nome}>
            {d.place_nome ?? d.linea ?? 'Trattativa'}
          </Text>
          {sc.ritardo ? <StatusBadge small label="In ritardo" colore={colors.errore} /> : null}
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="person-circle-outline" size={14} color={colors.testoSoft} />
          <Text style={styles.meta} numberOfLines={1}>
            {d.owner_nome ?? 'Non attribuito'}
          </Text>
          <Text style={styles.metaSep}>·</Text>
          <Ionicons
            name="calendar-outline"
            size={13}
            color={sc.ritardo ? colors.errore : colors.testoSoft}
          />
          <Text style={[styles.meta, sc.ritardo && { color: colors.errore, fontWeight: '700' }]} numberOfLines={1}>
            {sc.data ? `${sc.data} · ${sc.txt}` : sc.txt}
          </Text>
        </View>
      </View>
      <Text style={styles.freccia}>Apri ›</Text>
    </Pressable>
  );
}

function RigaCompleta({ p, onPress }: { p: Place; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.icona}>
        <LineaIcon linea={p.linea_ipotizzata} size={22} color={colors.navy} />
      </View>
      <View style={styles.info}>
        <View style={styles.titoloRow}>
          <PriorityBadge priorita={p.priorita} small />
          <Text numberOfLines={3} style={styles.nome}>
            {p.nome}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[p.linea_ipotizzata, p.indirizzo].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <Text style={styles.freccia}>Completa ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filtri: { marginTop: 10 },
  sub: { color: colors.testoSoft, fontSize: 13 },
  tabNomeRiga: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabNome: { flex: 1, minWidth: 0, color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabSotto: { color: colors.grigio, fontSize: 11.5, lineHeight: 15 },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabRitardo: { color: colors.errore, fontWeight: '700' },
  list: { padding: spacing.lg, gap: 10 },
  sezione: {
    color: colors.testoSoft,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...shadow.card,
  },
  icona: { width: 46, height: 46, borderRadius: radius.m, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 3 },
  // Il badge "In ritardo" scende sotto quando il nome non ci sta: prima si
  // spartivano la riga e del negozio restava solo "Moncler…".
  titoloRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  nome: { flexShrink: 1, flexGrow: 1, minWidth: 140, color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  meta: { color: colors.testoSoft, fontSize: 13 },
  azioniRiga: { alignItems: 'flex-end', gap: 6 },
  chiudiRichiamo: { padding: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaSep: { color: colors.grigioChiaro, fontSize: 13 },
  nota: { color: colors.grigio, fontSize: 12, fontStyle: 'italic' },
  freccia: { color: colors.testoSoft, fontWeight: '600', fontSize: 14 },
});
