import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import type { CategoryRule } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { caricaRegole, regolaPerCategoria } from '@/lib/categoryRules';
import { inserisciPlace } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { posizioneCorrente, type Coord } from '@/lib/location';
import { BoxIpotesi } from '@/components/BoxIpotesi';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Loader } from '../_layout';

export default function NuovoTarget() {
  const router = useRouter();
  const [regole, setRegole] = useState<Omit<CategoryRule, 'id'>[]>([]);
  const [pos, setPos] = useState<Coord | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  const [nome, setNome] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [zona, setZona] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [lineeOverride, setLineeOverride] = useState<string[] | null>(null);

  useEffect(() => {
    (async () => {
      setRegole(await caricaRegole());
      setLoading(false);
      posizioneCorrente().then(setPos);
    })();
  }, []);

  // Categorie uniche disponibili (dal set di regole).
  const categorie = useMemo(
    () => Array.from(new Set(regole.map((r) => r.categoria))).sort(),
    [regole],
  );

  // Ipotesi pre-calcolata dalla categoria scelta.
  const ipotesi = useMemo(
    () => (categoria ? regolaPerCategoria(categoria, regole) : null),
    [categoria, regole],
  );

  // Tipologia di interesse effettiva: la scelta manuale ha la precedenza sull'ipotesi.
  const lineeScelte = lineeOverride ?? (ipotesi?.linea_ipotizzata ? [ipotesi.linea_ipotizzata] : []);

  async function salva() {
    if (!nome.trim()) {
      avvisa('Nome mancante', 'Inserisci il nome dell’attività.');
      return;
    }
    if (!pos) {
      avvisa('Posizione non disponibile', 'Attendi il check-in GPS o riprova.');
      return;
    }
    setSalvataggio(true);
    try {
      const regola = ipotesi ?? regolaPerCategoria('altro', regole);
      const place = await inserisciPlace({
        nome: nome.trim(),
        indirizzo: indirizzo.trim() || null,
        lat: pos.lat,
        lng: pos.lng,
        categoria: categoria,
        settore: null,
        zona: zona.trim() || null,
        priorita: regola?.priorita ?? 'P3',
        linea_ipotizzata: lineeScelte[0] ?? regola?.linea_ipotizzata ?? null,
        linee_ipotizzate: lineeScelte.length ? lineeScelte : regola?.linea_ipotizzata ? [regola.linea_ipotizzata] : null,
        aggancio_apertura: regola?.aggancio_apertura ?? null,
      });
      router.replace(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile salvare il target.');
    } finally {
      setSalvataggio(false);
    }
  }

  if (loading) return <Loader />;

  return (
    <>
      <Stack.Screen options={{ title: 'Nuovo target' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.checkin}>
            <Ionicons name="location-outline" size={14} color={colors.testoSoft} />{' '}
            {pos ? 'Posizione acquisita' : 'Acquisizione posizione…'}
          </Text>

          <Text style={styles.label}>Nome attività *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Es. Boutique Aurea" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Indirizzo</Text>
          <TextInput style={styles.input} value={indirizzo} onChangeText={setIndirizzo} placeholder="Via, numero, città" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Zona</Text>
          <TextInput style={styles.input} value={zona} onChangeText={setZona} placeholder="Es. Quadrilatero, Brera…" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.chipWrap}>
            {categorie.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategoria(c)}
                style={[styles.chip, categoria === c && styles.chipOn]}
              >
                <Text style={[styles.chipTxt, categoria === c && styles.chipTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {ipotesi ? (
            <View style={{ marginTop: spacing.md }}>
              <View style={styles.prioRow}>
                <Text style={styles.label}>Priorità automatica</Text>
                <PriorityBadge priorita={ipotesi.priorita} small />
              </View>
              <BoxIpotesi linea={ipotesi.linea_ipotizzata} aggancio={ipotesi.aggancio_apertura} />
            </View>
          ) : null}

          <Text style={styles.label}>Tipologia di interesse (linea)</Text>
          <LineaSelector value={lineeScelte} onChange={setLineeOverride} />

          <Pressable style={[styles.salva, salvataggio && styles.salvaOff]} onPress={salva} disabled={salvataggio}>
            <Text style={styles.salvaTxt}>{salvataggio ? 'Salvataggio…' : 'Crea target'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  checkin: { color: colors.testoSoft, fontWeight: '600', marginBottom: spacing.sm },
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  prioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
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
