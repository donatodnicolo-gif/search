import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { CategoryRule, Place, Priorita, StatoPlace } from '@/types';
import { colors, labelStato, radius, spacing } from '@/lib/theme';
import { aggiornaPlace, fetchPlace } from '@/lib/db';
import { caricaRegole } from '@/lib/categoryRules';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Loader } from '../../_layout';

const PRIORITA: Priorita[] = ['P1', 'P2', 'P3'];
const STATI: StatoPlace[] = ['da_visitare', 'visitato', 'cliente', 'perso'];

export default function ModificaAttivita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<Place | null>(null);
  const [regole, setRegole] = useState<Omit<CategoryRule, 'id'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  const [nome, setNome] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [zona, setZona] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [priorita, setPriorita] = useState<Priorita>('P3');
  const [stato, setStato] = useState<StatoPlace>('da_visitare');
  const [linee, setLinee] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [p, r] = await Promise.all([fetchPlace(id), caricaRegole()]);
      setRegole(r);
      if (p) {
        setPlace(p);
        setNome(p.nome);
        setIndirizzo(p.indirizzo ?? '');
        setZona(p.zona ?? '');
        setCategoria(p.categoria);
        setPriorita(p.priorita);
        setStato(p.stato);
        setLinee(p.linee_ipotizzate ?? (p.linea_ipotizzata ? [p.linea_ipotizzata] : []));
      }
      setLoading(false);
    })();
  }, [id]);

  const categorie = useMemo(
    () => Array.from(new Set(regole.map((r) => r.categoria))).sort(),
    [regole],
  );

  async function salva() {
    if (!place) return;
    if (!nome.trim()) {
      Alert.alert('Nome mancante', 'Il nome non può essere vuoto.');
      return;
    }
    setSalvataggio(true);
    try {
      await aggiornaPlace(place.id, {
        nome: nome.trim(),
        indirizzo: indirizzo.trim() || null,
        zona: zona.trim() || null,
        categoria,
        priorita,
        stato,
        linea_ipotizzata: linee[0] ?? null,
        linee_ipotizzate: linee,
      });
      // Drawer senza stack lineare: torniamo al dettaglio, non alla Mappa.
      router.replace(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      Alert.alert('Errore', e?.message ?? 'Impossibile salvare le modifiche.');
    } finally {
      setSalvataggio(false);
    }
  }

  if (loading) return <Loader />;
  if (!place) return <Text style={styles.err}>Attività non trovata.</Text>;

  return (
    <>
      <Stack.Screen options={{ title: 'Modifica attività' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nome *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Indirizzo</Text>
          <TextInput style={styles.input} value={indirizzo} onChangeText={setIndirizzo} placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Zona</Text>
          <TextInput style={styles.input} value={zona} onChangeText={setZona} placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.chipWrap}>
            {categorie.map((c) => (
              <Chip key={c} label={c} on={categoria === c} onPress={() => setCategoria(c)} />
            ))}
          </View>

          <Text style={styles.label}>Tipologia di interesse (linea)</Text>
          <LineaSelector value={linee} onChange={setLinee} />

          <Text style={styles.label}>Priorità</Text>
          <View style={styles.chipWrap}>
            {PRIORITA.map((p) => (
              <Pressable key={p} onPress={() => setPriorita(p)} style={[styles.chip, priorita === p && styles.chipOn]}>
                <PriorityBadge priorita={p} small />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Stato</Text>
          <View style={styles.chipWrap}>
            {STATI.map((s) => (
              <Chip key={s} label={labelStato[s]} on={stato === s} onPress={() => setStato(s)} />
            ))}
          </View>

          <Pressable style={[styles.salva, salvataggio && styles.salvaOff]} onPress={salva} disabled={salvataggio}>
            <Text style={styles.salvaTxt}>{salvataggio ? 'Salvataggio…' : 'Salva modifiche'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
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
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  err: { padding: spacing.lg, color: colors.errore },
  label: { color: colors.oro, fontWeight: '800', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: 6 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.testo,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  salva: {
    marginTop: spacing.lg,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  salvaOff: { opacity: 0.55 },
  salvaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 17 },
});
