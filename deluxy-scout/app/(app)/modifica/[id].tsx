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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { CategoryRule, Place, Priorita, Profilo, StatoAffiliazione } from '@/types';
import { STATI_AFFILIAZIONE, affiliazioneDaStatoPlace, statoPlaceDaAffiliazione } from '@/types';
import { coloreAffiliazione, colors, labelAffiliazione, radius, spacing } from '@/lib/theme';
import { aggiornaPlace, fetchPlace, fetchProfiles, nomeDaProfilo, sincronizzaPlaceRegistro } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { caricaRegole } from '@/lib/categoryRules';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Loader } from '../../_layout';

const PRIORITA: Priorita[] = ['P1', 'P2', 'P3'];

export default function ModificaAttivita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<Place | null>(null);
  const [regole, setRegole] = useState<Omit<CategoryRule, 'id'>[]>([]);
  const [profili, setProfili] = useState<Profilo[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  const [nome, setNome] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [zona, setZona] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [priorita, setPriorita] = useState<Priorita>('P3');
  // Stato = gli 8 stati di Anagrafiche (StatoAffiliazione). Lo stato di pipeline
  // interno di Scout viene derivato al salvataggio.
  const [statoAff, setStatoAff] = useState<StatoAffiliazione>('prospect');
  // Account = venditore che segue il cliente (memorizzato come nome, = campo del registro).
  const [account, setAccount] = useState<string | null>(null);
  const [linee, setLinee] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [p, r, prof] = await Promise.all([fetchPlace(id), caricaRegole(), fetchProfiles()]);
      setRegole(r);
      setProfili(prof);
      if (p) {
        setPlace(p);
        setNome(p.nome);
        setIndirizzo(p.indirizzo ?? '');
        setZona(p.zona ?? '');
        setCategoria(p.categoria);
        setPriorita(p.priorita);
        // Stato "vero" da Anagrafiche se presente, altrimenti derivato dallo stato di pipeline.
        setStatoAff(p.stato_affiliazione ?? affiliazioneDaStatoPlace[p.stato] ?? 'prospect');
        setAccount(p.anagrafiche_account ?? null);
        setLinee(p.linee_ipotizzate ?? (p.linea_ipotizzata ? [p.linea_ipotizzata] : []));
      }
      setLoading(false);
    })();
  }, [id]);

  const categorie = useMemo(
    () => Array.from(new Set(regole.map((r) => r.categoria))).sort(),
    [regole],
  );

  // Venditori assegnabili come account: i membri del team (per nome). Se il
  // cliente ha già un account che non è tra i profili (es. impostato nel registro),
  // lo aggiungo comunque così resta visibile e selezionato.
  const venditori = useMemo(() => {
    const nomi = profili.map(nomeDaProfilo);
    if (account && !nomi.includes(account)) nomi.push(account);
    return Array.from(new Set(nomi)).sort();
  }, [profili, account]);

  async function salva() {
    if (!place) return;
    if (!nome.trim()) {
      avvisa('Nome mancante', 'Il nome non può essere vuoto.');
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
        stato_affiliazione: statoAff,
        // Deriva lo stato di pipeline dallo stato di Anagrafiche (percorso/filtri coerenti).
        stato: statoPlaceDaAffiliazione[statoAff],
        anagrafiche_account: account,
        linea_ipotizzata: linee[0] ?? null,
        linee_ipotizzate: linee,
      });
      // Propaga lo stato (e gli interessi) al registro Anagrafiche.
      sincronizzaPlaceRegistro(place.id).catch(() => {});
      // Drawer senza stack lineare: torniamo al dettaglio, non alla Mappa.
      router.replace(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile salvare le modifiche.');
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
              <Pressable key={p} onPress={() => setPriorita(p)} style={[styles.chip, styles.chipPrio, priorita === p && styles.chipPrioOn]}>
                <PriorityBadge priorita={p} small />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Stato</Text>
          <View style={styles.chipWrap}>
            {STATI_AFFILIAZIONE.map((s) => {
              const on = statoAff === s;
              return (
                <Pressable key={s} onPress={() => setStatoAff(s)} style={[styles.chip, styles.chipStato, on && styles.chipOn]}>
                  <View style={[styles.dot, { backgroundColor: on ? colors.bianco : coloreAffiliazione[s] }]} />
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{labelAffiliazione[s]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Account (venditore)</Text>
          <Text style={styles.hint}>Il venditore che segue questo cliente. Al salvataggio viene aggiornato anche su Anagrafiche.</Text>
          <View style={styles.chipWrap}>
            <Chip label="Nessuno" on={!account} onPress={() => setAccount(null)} />
            {venditori.map((v) => (
              <Chip key={v} label={v} on={account === v} onPress={() => setAccount(v)} />
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
  hint: { color: colors.grigio, fontSize: 12, marginTop: -2, marginBottom: 8 },
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
  // Priorità: NON riempire di navy (il badge interno non si leggerebbe), ma
  // evidenziare la selezione con un anello scuro su sfondo chiaro.
  chipPrio: { paddingHorizontal: 10 },
  chipPrioOn: { borderColor: colors.navy, borderWidth: 2, backgroundColor: colors.fillActive },
  chipStato: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
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
