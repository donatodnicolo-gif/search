// Tasklist personale del venditore: promemoria con priorità e scadenza.
// Privata (RLS owner-only). Non sostituisce "Da fare" (coda derivata dai dati):
// qui il venditore scrive i propri task liberi.
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import type { Priorita, Task } from '@/types';
import { colors, coloreProprita, radius, spacing } from '@/lib/theme';
import { completaTask, eliminaTask, fetchMieiTask, inserisciTask } from '@/lib/db';

const PRIORITA: { v: Priorita; label: string }[] = [
  { v: 'P1', label: 'Alta' },
  { v: 'P2', label: 'Media' },
  { v: 'P3', label: 'Bassa' },
];

function isoTraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function scadenzaInfo(iso: string | null): { txt: string; ritardo: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const gg = Math.round((d.getTime() - oggi.getTime()) / 86400000);
  const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rel =
    gg === 0 ? 'oggi' : gg === 1 ? 'domani' : gg === -1 ? 'ieri' : gg < 0 ? `${-gg}g fa` : `tra ${gg}g`;
  return { txt: `${data} · ${rel}`, ritardo: gg < 0 };
}

const SCAD_OPT: { label: string; giorni: number | null }[] = [
  { label: 'Nessuna', giorni: null },
  { label: 'Oggi', giorni: 0 },
  { label: 'Domani', giorni: 1 },
  { label: '+7g', giorni: 7 },
];

export default function TaskScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [titolo, setTitolo] = useState('');
  const [priorita, setPriorita] = useState<Priorita>('P2');
  const [scadenza, setScadenza] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await fetchMieiTask());
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function aggiungi() {
    const t = titolo.trim();
    if (!t || salvando) return;
    setSalvando(true);
    try {
      await inserisciTask({ titolo: t, priorita, scadenza });
      setTitolo('');
      setScadenza(null);
      setPriorita('P2');
      await carica();
    } finally {
      setSalvando(false);
    }
  }

  async function toggle(task: Task) {
    // Aggiornamento ottimistico + persistenza.
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      {/* Nuovo task */}
      <View style={styles.addCard}>
        <TextInput
          style={styles.input}
          value={titolo}
          onChangeText={setTitolo}
          placeholder="Nuovo task…"
          placeholderTextColor={colors.grigio}
          onSubmitEditing={aggiungi}
          returnKeyType="done"
        />
        <View style={styles.rigaOpt}>
          <Text style={styles.optLabel}>Priorità</Text>
          <View style={styles.chips}>
            {PRIORITA.map((p) => (
              <Pressable
                key={p.v}
                style={[
                  styles.chip,
                  priorita === p.v && { backgroundColor: coloreProprita[p.v], borderColor: coloreProprita[p.v] },
                ]}
                onPress={() => setPriorita(p.v)}
              >
                <Text style={[styles.chipTxt, priorita === p.v && styles.chipTxtOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.rigaOpt}>
          <Text style={styles.optLabel}>Scadenza</Text>
          <View style={styles.chips}>
            {SCAD_OPT.map((o) => {
              const iso = o.giorni == null ? null : isoTraGiorni(o.giorni);
              const on = scadenza === iso;
              return (
                <Pressable
                  key={o.label}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setScadenza(iso)}
                >
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Pressable
          style={[styles.addBtn, (!titolo.trim() || salvando) && styles.addBtnOff]}
          disabled={!titolo.trim() || salvando}
          onPress={aggiungi}
        >
          {salvando ? (
            <ActivityIndicator color={colors.bianco} />
          ) : (
            <Text style={styles.addBtnTxt}>Aggiungi task</Text>
          )}
        </Pressable>
      </View>

      {loading && tasks.length === 0 ? (
        <Text style={styles.vuoto}>Caricamento…</Text>
      ) : aperti.length === 0 && fatti.length === 0 ? (
        <Text style={styles.vuoto}>Nessun task. Aggiungine uno qui sopra 👆</Text>
      ) : null}

      {aperti.length > 0 ? (
        <>
          <Text style={styles.sezione}>Da fare ({aperti.length})</Text>
          {aperti.map((t) => (
            <RigaTask key={t.id} t={t} onToggle={() => toggle(t)} onDelete={() => rimuovi(t)} />
          ))}
        </>
      ) : null}

      {fatti.length > 0 ? (
        <>
          <Text style={[styles.sezione, { marginTop: spacing.lg }]}>Completati ({fatti.length})</Text>
          {fatti.map((t) => (
            <RigaTask key={t.id} t={t} onToggle={() => toggle(t)} onDelete={() => rimuovi(t)} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function RigaTask({ t, onToggle, onDelete }: { t: Task; onToggle: () => void; onDelete: () => void }) {
  const sc = scadenzaInfo(t.scadenza);
  return (
    <View style={styles.riga}>
      <Pressable onPress={onToggle} hitSlop={8} style={styles.check}>
        <Ionicons
          name={t.completata ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={t.completata ? colors.successo : coloreProprita[t.priorita]}
        />
      </Pressable>
      <View style={styles.rigaInfo}>
        <Text style={[styles.titolo, t.completata && styles.titoloFatto]} numberOfLines={2}>
          {t.titolo}
        </Text>
        {sc || !t.completata ? (
          <View style={styles.metaRow}>
            {!t.completata ? <View style={[styles.dot, { backgroundColor: coloreProprita[t.priorita] }]} /> : null}
            {sc ? (
              <>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={sc.ritardo && !t.completata ? colors.errore : colors.testoSoft}
                />
                <Text style={[styles.meta, sc.ritardo && !t.completata && styles.metaRitardo]}>{sc.txt}</Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
      <Pressable onPress={onDelete} hitSlop={8} style={styles.del}>
        <Ionicons name="trash-outline" size={18} color={colors.grigio} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  addCard: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.sfondo,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.testo,
  },
  rigaOpt: { gap: 4 },
  optLabel: { fontSize: 11, fontWeight: '800', color: colors.grigio, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.sfondo,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  addBtn: {
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 2,
  },
  addBtnOff: { opacity: 0.4 },
  addBtnTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.lg, fontStyle: 'italic' },
  sezione: {
    color: colors.oro,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  metaRitardo: { color: colors.errore, fontWeight: '800' },
  del: { width: 24, alignItems: 'flex-end' },
});
