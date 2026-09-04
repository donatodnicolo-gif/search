// Tasklist personale/di team: promemoria con priorità, scadenza e assegnazione.
// - «I miei task»: assegnati a me **o creati da me** (31/08/2026). Chi delega
//   resta responsabile di ciò che ha chiesto: un task scritto per un collega
//   spariva dalla vista di chi l'aveva appena creato.
// - «Di tutta la squadra»: tutti, per chiunque (migr. 0108). Prima la lettura
//   era ristretta e per un venditore quel filtro mostrava le stesse righe
//   dell'altro — un elenco che prometteva più di quello che dava.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { DealStage, Task } from '@/types';
import { colors, coloreProprita, labelFase, radius, shadow, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { completaTask, eliminaTask, fetchTask } from '@/lib/db';
import { CampoCerca, EmptyState, PageIntro } from '@/components/ui';
import { PriorityBadge } from '@/components/PriorityBadge';
import { TaskFormModal } from '@/components/TaskFormModal';

function scadenzaInfo(iso: string | null): { txt: string; ritardo: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const gg = Math.round((d.getTime() - oggi.getTime()) / 86400000);
  const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rel =
    gg === 0 ? 'oggi' : gg === 1 ? 'domani' : gg === -1 ? 'ieri' : gg < 0 ? `${-gg} giorni fa` : `tra ${gg} giorni`;
  return { txt: `${data} · ${rel}`, ritardo: gg < 0 };
}

/** Come si chiama la trattativa collegata: l'oggetto (o la linea), e l'esito se è chiusa. */
function etichettaTrattativa(t: Task): string | null {
  const d = t.trattativa;
  if (!d) return null;
  const cosa = d.oggetto?.trim() || d.linea?.trim() || 'Trattativa';
  const chiusa = d.fase === 'closedwon' || d.fase === 'closedlost';
  return chiusa ? `${cosa} · ${labelFase[d.fase as DealStage].toLowerCase()}` : cosa;
}

/**
 * ⭐ I DETTAGLI DEL TASK (04/09/2026, segnalazione dell'utente: «nelle task che
 * si creano anche da trattative non si vedono i dettagli»). Il task nato dalla
 * prossima attività di una trattativa portava negozio, nota e — da oggi — la
 * trattativa stessa (migr. 0117), ma la riga mostrava solo il titolo: chi lo
 * leggeva non sapeva di cosa fosse né poteva aprire la trattativa. Stesso
 * blocco in tabella e in scheda, così i due vestiti dicono le stesse cose.
 */
function DettagliTask({ t, inTabella }: { t: Task; inTabella?: boolean }) {
  const router = useRouter();
  const trattativa = etichettaTrattativa(t);
  const nulla = !t.place_nome && !t.contatto?.nome && !trattativa && !t.note;
  if (nulla) return null;
  return (
    <View style={styles.dettagli}>
      {t.place_nome ? (
        <View style={styles.dettRiga}>
          <Ionicons name="storefront-outline" size={12} color={colors.testoSoft} />
          <Text style={styles.dettTxt} numberOfLines={inTabella ? 1 : 2}>{t.place_nome}</Text>
        </View>
      ) : null}
      {t.contatto?.nome ? (
        <View style={styles.dettRiga}>
          <Ionicons name="person-outline" size={12} color={colors.testoSoft} />
          <Text style={styles.dettTxt} numberOfLines={1}>
            {t.contatto.nome}
            {t.contatto.telefono ? ` · ${t.contatto.telefono}` : ''}
          </Text>
        </View>
      ) : null}
      {trattativa && t.trattativa ? (
        // Il tap apre LA trattativa, non il task: si ferma l'evento della riga.
        <Pressable
          style={styles.dettRiga}
          hitSlop={4}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            router.push(`/(app)/trattative?apri=${t.trattativa!.id}`);
          }}
          accessibilityRole="link"
          accessibilityLabel={`Apri la trattativa ${trattativa}`}
        >
          <Ionicons name="briefcase-outline" size={12} color={colors.navy} />
          <Text style={styles.dettLink} numberOfLines={1}>Trattativa: {trattativa}</Text>
        </Pressable>
      ) : null}
      {t.note ? (
        <Text style={styles.nota} numberOfLines={2}>{t.note}</Text>
      ) : null}
    </View>
  );
}

export default function TaskScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'miei' | 'tutti'>('miei');
  const [modal, setModal] = useState<'nuovo' | Task | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await fetchTask(scope === 'miei'));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // Ricerca su ogni elenco (Libro v1.9 §8-bis — mancava, 28/08/2026).
  const [cerca, setCerca] = useState('');
  const { aperti, fatti } = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const nrm = (v: unknown) => String(v ?? '').toLowerCase();
    const visibili = q
      ? tasks.filter((t) =>
          [t.titolo, t.place_nome, t.owner_nome, t.contatto?.nome, t.note, etichettaTrattativa(t)].some((v) => nrm(v).includes(q)),
        )
      : tasks;
    const aperti = visibili.filter((t) => !t.completata);
    const fatti = visibili.filter((t) => t.completata);
    return { aperti, fatti };
  }, [tasks, cerca]);

  async function toggle(task: Task) {
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, completata: !x.completata } : x)));
    try {
      await completaTask(task.id, !task.completata);
    } finally {
      carica();
    }
  }

  async function rimuovi(task: Task) {
    setTasks((prev) => prev.filter((x) => x.id !== task.id));
    try {
      await eliminaTask(task.id);
    } finally {
      carica();
    }
  }

  // Da 900px in su le due sezioni sono TABELLE (le righe-scheda sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const colonne: ColonnaTabella<Task>[] = [
    {
      chiave: 'fatto',
      label: '',
      width: 34,
      fissa: true,
      valore: () => null,
      cella: (t) => (
        <Pressable
          onPress={(e: any) => {
            e?.stopPropagation?.();
            toggle(t);
          }}
          hitSlop={8}
          accessibilityLabel={t.completata ? 'Riapri il task' : 'Segna come fatto'}
        >
          <Ionicons
            name={t.completata ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={t.completata ? colors.successo : coloreProprita[t.priorita]}
          />
        </Pressable>
      ),
    },
    {
      chiave: 'titolo',
      label: 'Task',
      flex: 1.6,
      valore: (t) => t.titolo,
      cella: (t) => (
        <View style={{ gap: 2 }}>
          <Text style={[styles.tabTitolo, t.completata && styles.titoloFatto]} numberOfLines={2}>
            {t.titolo}
          </Text>
          <DettagliTask t={t} inTabella />
        </View>
      ),
    },
    {
      chiave: 'priorita',
      label: 'Priorità',
      width: 66,
      valore: (t) => t.priorita,
      cella: (t) => (t.completata ? <Text style={styles.tabMuto}>—</Text> : <PriorityBadge priorita={t.priorita} small />),
    },
    {
      chiave: 'scadenza',
      label: 'Scadenza',
      width: 120,
      destra: true,
      numerica: true,
      valore: (t) => t.scadenza ?? null,
      cella: (t) => {
        const sc = scadenzaInfo(t.scadenza);
        if (!sc) return <Text style={styles.tabMuto}>—</Text>;
        return (
          <Text style={[styles.tabData, sc.ritardo && !t.completata && styles.metaRitardo]} numberOfLines={2}>
            {sc.txt}
          </Text>
        );
      },
    },
    { chiave: 'assegnato', label: 'Assegnato a', flex: 0.7, valore: (t) => t.owner_nome ?? null },
    {
      chiave: 'elimina',
      label: '',
      width: 36,
      fissa: true,
      valore: () => null,
      cella: (t) => (
        <Pressable
          hitSlop={8}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            rimuovi(t);
          }}
          accessibilityLabel="Elimina il task"
          {...({ title: 'Elimina' } as any)}
        >
          <Ionicons name="trash-outline" size={16} color={colors.errore} />
        </Pressable>
      ),
    },
  ];
  const tabellaDi = (righe: Task[]) => (
    <Tabella
      righe={righe}
      colonne={colonne}
      chiaveRiga={(t) => t.id}
      ordineIniziale={{ campo: 'scadenza', verso: 'asc' }}
      onRiga={(t) => setModal(t)}
      labelRiga={(t) => `Modifica «${t.titolo}»`}
    
            totali={(righe) => ({
              titolo: `Totale · ${righe.length} ${righe.length === 1 ? 'task' : 'task'}`,
            })}
          />
  );

  return (
    <View style={styles.container}>
      <PageIntro testo="I tuoi promemoria e quelli assegnati al team: spunta un task quando è fatto, toccalo per modificarlo." />
      <View style={{ paddingHorizontal: spacing.lg, marginTop: 8 }}>
        <CampoCerca valore={cerca} onCambia={setCerca} placeholder="Cerca per titolo, negozio, contatto o assegnatario…" />
      </View>
      <View style={styles.head}>
        <View style={styles.toggle}>
          <Seg label="I miei task" on={scope === 'miei'} onPress={() => setScope('miei')} />
          <Seg label="Di tutta la squadra" on={scope === 'tutti'} onPress={() => setScope('tutti')} />
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        {tasks.length === 0 ? (
          <EmptyState
            icona="checkbox-outline"
            titolo="Nessun task"
            aiuto="Creane uno col bottone Nuovo task in basso: scadenza, priorità e assegnatario."
            loading={loading}
          />
        ) : null}

        {aperti.length > 0 ? (
          <>
            <Text style={styles.sezione}>Da fare ({aperti.length})</Text>
            {aTabella
              ? tabellaDi(aperti)
              : aperti.map((t) => (
                  <RigaTask key={t.id} t={t} mostraOwner={scope === 'tutti'} onEdit={() => setModal(t)} onToggle={() => toggle(t)} onDelete={() => rimuovi(t)} />
                ))}
          </>
        ) : null}

        {fatti.length > 0 ? (
          <>
            <Text style={[styles.sezione, { marginTop: spacing.xxl }]}>Completati ({fatti.length})</Text>
            {aTabella
              ? tabellaDi(fatti)
              : fatti.map((t) => (
                  <RigaTask key={t.id} t={t} mostraOwner={scope === 'tutti'} onEdit={() => setModal(t)} onToggle={() => toggle(t)} onDelete={() => rimuovi(t)} />
                ))}
          </>
        ) : null}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setModal('nuovo')}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuovo task</Text>
      </Pressable>

      {modal ? (
        <TaskFormModal
          task={modal === 'nuovo' ? undefined : modal}
          onClose={() => setModal(null)}
          onSalvato={() => {
            setModal(null);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

function Seg({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.seg, on && styles.segOn]} onPress={onPress}>
      <Text style={[styles.segTxt, on && styles.segTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function RigaTask({
  t,
  mostraOwner,
  onEdit,
  onToggle,
  onDelete,
}: {
  t: Task;
  mostraOwner: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const sc = scadenzaInfo(t.scadenza);
  // Mostra l'assegnatario quando si vede "Tutti", oppure quando il task è stato
  // creato da qualcun altro (te l'hanno assegnato / l'hai assegnato tu).
  const mostraAssegnatario = mostraOwner || (t.creato_da && t.owner && t.creato_da !== t.owner);
  return (
    <View style={styles.riga}>
      <Pressable onPress={onToggle} hitSlop={8} style={styles.check}>
        <Ionicons
          name={t.completata ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={t.completata ? colors.successo : coloreProprita[t.priorita]}
        />
      </Pressable>
      <Pressable style={styles.rigaInfo} onPress={onEdit}>
        <Text style={[styles.titolo, t.completata && styles.titoloFatto]} numberOfLines={2}>
          {t.titolo}
        </Text>
        <View style={styles.metaRow}>
          {!t.completata ? <PriorityBadge priorita={t.priorita} small /> : null}
          {sc ? (
            <>
              <Ionicons name="calendar-outline" size={12} color={sc.ritardo && !t.completata ? colors.errore : colors.testoSoft} />
              <Text style={[styles.meta, sc.ritardo && !t.completata && styles.metaRitardo]}>{sc.txt}</Text>
            </>
          ) : null}
          {mostraAssegnatario && t.owner_nome ? (
            <>
              {sc ? <Text style={styles.metaSep}>·</Text> : null}
              <Ionicons name="person-circle-outline" size={13} color={colors.testoSoft} />
              <Text style={styles.meta} numberOfLines={1}>{t.owner_nome}</Text>
            </>
          ) : null}
        </View>
        {/* Negozio, contatto, trattativa e nota: prima c'era solo il negozio. */}
        <DettagliTask t={t} />
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={8} style={styles.del}>
        <Ionicons name="trash-outline" size={18} color={colors.grigio} />
      </Pressable>
    </View>
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
  toggle: { flexDirection: 'row', backgroundColor: colors.grigioChiaro, borderRadius: radius.pill, padding: 3, alignSelf: 'flex-start' },
  seg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.bianco },
  segTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  segTxtOn: { color: colors.testo },
  content: { padding: spacing.lg, paddingBottom: 96, gap: spacing.sm },
  sezione: {
    color: colors.testoSoft,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  check: { width: 26 },
  rigaInfo: { flex: 1, gap: 2 },
  titolo: { color: colors.testo, fontWeight: '700', fontSize: 15 },
  titoloFatto: { color: colors.grigio, textDecorationLine: 'line-through', fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaSep: { color: colors.grigioChiaro, fontSize: 12 },
  meta: { color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  metaRitardo: { color: colors.errore, fontWeight: '700' },
  tabTitolo: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  dettagli: { gap: 2, marginTop: 2 },
  dettRiga: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%' },
  dettTxt: { color: colors.testoSoft, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  // Il link alla trattativa: il colore dice «si apre», senza oro (DS: l'oro non è un'azione).
  dettLink: { color: colors.navy, fontSize: 12, fontWeight: '600', flexShrink: 1, textDecorationLine: 'underline' },
  nota: { color: colors.grigio, fontSize: 12, lineHeight: 16 },
  tabMuto: { color: colors.grigio, fontSize: 12.5 },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  del: { width: 24, alignItems: 'flex-end' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 12,
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
});
