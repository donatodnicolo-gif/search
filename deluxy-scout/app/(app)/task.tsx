// Tasklist personale/di team: promemoria con priorità, scadenza e assegnazione.
// - "Miei": i task assegnati a me.
// - "Tutti": ciò che l'RLS concede (creati da me; se admin, di tutti).
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import type { Task } from '@/types';
import { colors, coloreProprita, radius, shadow, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { completaTask, eliminaTask, fetchTask } from '@/lib/db';
import { EmptyState, PageIntro } from '@/components/ui';
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

export default function TaskScreen() {
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
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

  const { aperti, fatti } = useMemo(() => {
    const aperti = tasks.filter((t) => !t.completata);
    const fatti = tasks.filter((t) => t.completata);
    return { aperti, fatti };
  }, [tasks]);

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

  return (
    <View style={styles.container}>
      <PageIntro testo="I tuoi promemoria e quelli assegnati al team: spunta un task quando è fatto, toccalo per modificarlo." />
      <View style={styles.head}>
        <View style={styles.toggle}>
          <Seg label="Assegnati a me" on={scope === 'miei'} onPress={() => setScope('miei')} />
          <Seg label={admin ? 'Tutti' : 'Assegnati/creati'} on={scope === 'tutti'} onPress={() => setScope('tutti')} />
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
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
            {aperti.map((t) => (
              <RigaTask key={t.id} t={t} mostraOwner={scope === 'tutti'} onEdit={() => setModal(t)} onToggle={() => toggle(t)} onDelete={() => rimuovi(t)} />
            ))}
          </>
        ) : null}

        {fatti.length > 0 ? (
          <>
            <Text style={[styles.sezione, { marginTop: spacing.lg }]}>Completati ({fatti.length})</Text>
            {fatti.map((t) => (
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
          {t.place_nome ? (
            <>
              <Text style={styles.metaSep}>·</Text>
              <Ionicons name="storefront-outline" size={12} color={colors.oro} />
              <Text style={[styles.meta, { color: colors.goldStrong }]} numberOfLines={1}>{t.place_nome}</Text>
            </>
          ) : null}
        </View>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggle: { flexDirection: 'row', backgroundColor: colors.grigioChiaro, borderRadius: radius.pill, padding: 3, alignSelf: 'flex-start' },
  seg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.bianco },
  segTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  segTxtOn: { color: colors.testo },
  content: { padding: spacing.md, paddingBottom: 96, gap: spacing.sm },
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
    borderRadius: radius.md,
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
  metaRitardo: { color: colors.errore, fontWeight: '800' },
  del: { width: 24, alignItems: 'flex-end' },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
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
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
});
