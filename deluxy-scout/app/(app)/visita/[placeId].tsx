import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { EsitoVisita, Linea, Place } from '@/types';
import { LINEE_STANDBY } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchLinee, fetchPlace, aggiornaStatoPlace, caricaFotoVetrina, inserisciVisita } from '@/lib/db';
import { posizioneCorrente, type Coord } from '@/lib/location';
import { accodaVisita, flushCoda, isOnline, statoDaEsito } from '@/lib/syncQueue';
import { syncVisita } from '@/lib/hubspot';
import { programmaRecapEmail } from '@/lib/reminders';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { BoxIpotesi } from '@/components/BoxIpotesi';
import { EsitoButtons } from '@/components/EsitoButtons';
import { Loader } from '../../_layout';

export default function NuovaVisita() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const router = useRouter();

  const [place, setPlace] = useState<Place | null>(null);
  const [linee, setLinee] = useState<Linea[]>([]);
  const [pos, setPos] = useState<Coord | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  // Campi visita
  const [linea, setLinea] = useState<string | null>(null);
  const [aggancio, setAggancio] = useState<string>('');
  const [crossSell, setCrossSell] = useState<string[]>([]);
  const [esito, setEsito] = useState<EsitoVisita | null>(null);
  const [briefing, setBriefing] = useState('');
  const [notePost, setNotePost] = useState('');
  const [analisi, setAnalisi] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [concorrenti, setConcorrenti] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!placeId) return;
      const [p, ls] = await Promise.all([fetchPlace(placeId), fetchLinee()]);
      setPlace(p);
      setLinee(ls);
      setLinea(p?.linea_ipotizzata ?? null);
      setAggancio(p?.aggancio_apertura ?? '');
      setLoading(false);
      // Check-in: cattura posizione al momento dell'apertura.
      posizioneCorrente().then(setPos);
    })();
  }, [placeId]);

  const lineePrimarie = useMemo(
    () => linee.filter((l) => l.attiva_bool && !LINEE_STANDBY.includes(l.nome)),
    [linee],
  );
  const lineeCrossSell = useMemo(
    () => linee.filter((l) => LINEE_STANDBY.includes(l.nome)),
    [linee],
  );

  // Linee di interesse selezionate (primaria + cross-sell), come contesto ai concorrenti.
  const interessi = useMemo(
    () => [linea, ...crossSell].filter(Boolean).join(', '),
    [linea, crossSell],
  );

  const toggleCross = useCallback((nome: string) => {
    setCrossSell((cur) => (cur.includes(nome) ? cur.filter((n) => n !== nome) : [...cur, nome]));
  }, []);

  async function scegliFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permesso fotocamera negato');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) setFotoUri(res.assets[0].uri);
  }

  async function salva() {
    if (!place) return;
    // Next-step OBBLIGATORIO (regola Fase 3).
    if (!nextStep.trim()) {
      Alert.alert('Next step obbligatorio', 'Inserisci il prossimo passo prima di salvare.');
      return;
    }
    if (!esito) {
      Alert.alert('Esito mancante', 'Seleziona un esito della visita.');
      return;
    }
    setSalvataggio(true);

    const { data: userRes } = await supabase.auth.getUser();
    const payload = {
      place_id: place.id,
      data: new Date().toISOString(),
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      esito,
      briefing: briefing.trim() || null,
      note_post_meeting: notePost.trim() || null,
      esito_analisi: analisi.trim() || null,
      next_step: nextStep.trim(),
      linea_proposta: linea,
      cross_sell: crossSell.length ? crossSell : null,
      concorrenti: concorrenti.trim() || null,
      foto_url: null as string | null,
      owner: userRes.user?.id ?? null,
    };

    try {
      const online = await isOnline();
      if (!online) {
        // OFFLINE: salva in coda locale con badge "da sincronizzare".
        await accodaVisita({
          localId: localId(),
          payload,
          fotoLocalUri: fotoUri,
          createdAt: new Date().toISOString(),
          retries: 0,
        });
        await programmaRecapEmail({ esito, nomeAttivita: place.nome, placeId: place.id });
        Alert.alert('Salvata offline', 'La visita verrà sincronizzata al ritorno online.');
        router.replace(`/(app)/attivita/${place.id}`);
        return;
      }

      // ONLINE: foto → visita → stato → HubSpot.
      let fotoUrl: string | null = null;
      if (fotoUri) fotoUrl = await caricaFotoVetrina(fotoUri, place.id);
      const visita = await inserisciVisita({ ...payload, foto_url: fotoUrl });
      await aggiornaStatoPlace(place.id, statoDaEsito[esito]);
      if (env.hubspotSyncUrl()) {
        syncVisita(visita.id).catch(() => {
          /* se fallisce, resta hubspot_synced=false: la coda riproverà */
        });
      }
      await programmaRecapEmail({ esito, nomeAttivita: place.nome, placeId: place.id });
      // Tenta anche di svuotare eventuali visite rimaste in coda.
      flushCoda().catch(() => {});
      Alert.alert('Visita salvata', 'Sincronizzata su Supabase.');
      router.replace(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      // Fallback: se qualcosa va storto online, accoda comunque per non perdere dati.
      await accodaVisita({
        localId: localId(),
        payload,
        fotoLocalUri: fotoUri,
        createdAt: new Date().toISOString(),
        retries: 0,
      });
      Alert.alert(
        'Salvata in coda',
        `Il salvataggio online non è riuscito: la visita verrà inviata automaticamente appena possibile.${e?.message ? `\n(Dettaglio: ${e.message})` : ''}`,
      );
      router.replace(`/(app)/attivita/${place.id}`);
    } finally {
      setSalvataggio(false);
    }
  }

  if (loading) return <Loader />;
  if (!place) return <Text style={styles.err}>Attività non trovata.</Text>;

  return (
    <>
      <Stack.Screen options={{ title: 'Nuova visita' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.nome}>{place.nome}</Text>
          <Text style={styles.checkin}>
            <Ionicons name="location-outline" size={14} color={colors.testoSoft} />{' '}
            {pos ? 'Check-in acquisito' : 'Acquisizione posizione…'}
          </Text>

          {/* Ipotesi editabile */}
          <BoxIpotesi linea={linea} aggancio={aggancio} />

          <Label>Linea proposta (primaria)</Label>
          <View style={styles.chipWrap}>
            {lineePrimarie.map((l) => (
              <Chip key={l.id} label={l.nome} on={linea === l.nome} onPress={() => setLinea(l.nome)} />
            ))}
          </View>

          <Label>Aggancio di apertura</Label>
          <TextInput
            style={styles.input}
            value={aggancio}
            onChangeText={setAggancio}
            placeholder="Come apri la conversazione…"
            placeholderTextColor={colors.grigio}
          />

          {/* Cross-sell: linee in standby, sezione separata (mai come primaria) */}
          <Label>Altre linee da proporre</Label>
          <View style={styles.chipWrap}>
            {lineeCrossSell.map((l) => (
              <Chip key={l.id} label={l.nome} on={crossSell.includes(l.nome)} onPress={() => toggleCross(l.nome)} standby />
            ))}
          </View>

          <Label>Esito</Label>
          <EsitoButtons value={esito} onChange={setEsito} />

          <Label>Briefing</Label>
          <TextInput style={[styles.input, styles.area]} value={briefing} onChangeText={setBriefing} multiline placeholder="Contesto pre-visita… (usa il microfono della tastiera per dettare)" placeholderTextColor={colors.grigio} />

          <Label>Note post meeting</Label>
          <TextInput style={[styles.input, styles.area]} value={notePost} onChangeText={setNotePost} multiline placeholder="Cosa è emerso…" placeholderTextColor={colors.grigio} />

          <Label>Esito e analisi</Label>
          <TextInput style={[styles.input, styles.area]} value={analisi} onChangeText={setAnalisi} multiline placeholder="Analisi e prossime mosse…" placeholderTextColor={colors.grigio} />

          <Label>Concorrenti già presenti</Label>
          {interessi ? <Text style={styles.hint}>Per le linee di interesse: {interessi}</Text> : null}
          <TextInput
            style={[styles.input, styles.area]}
            value={concorrenti}
            onChangeText={setConcorrenti}
            multiline
            placeholder="Chi serve già il negozio? (es. Glovo per le consegne, Catering X…)"
            placeholderTextColor={colors.grigio}
          />

          <Label>Next step *</Label>
          <TextInput style={styles.input} value={nextStep} onChangeText={setNextStep} placeholder="Obbligatorio: il prossimo passo" placeholderTextColor={colors.grigio} />

          <Pressable style={styles.foto} onPress={scegliFoto}>
            {fotoUri ? (
              <Image source={{ uri: fotoUri }} style={styles.fotoImg} />
            ) : (
              <View style={styles.fotoVuota}>
                <Ionicons name="camera-outline" size={22} color={colors.testoSoft} />
                <Text style={styles.fotoTxt}>Foto vetrina</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={[styles.salva, salvataggio && styles.salvaOff]}
            onPress={salva}
            disabled={salvataggio}
          >
            <Text style={styles.salvaTxt}>{salvataggio ? 'Salvataggio…' : 'Salva visita'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Chip({ label, on, onPress, standby }: { label: string; on: boolean; onPress: () => void; standby?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && (standby ? styles.chipStandbyOn : styles.chipOn)]}
    >
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

// Id locale per la coda offline.
function localId(): string {
  return `loc_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.xs },
  err: { padding: spacing.lg, color: colors.errore },
  nome: { fontSize: 22, fontWeight: '900', color: colors.navy },
  checkin: { color: colors.testoSoft, marginBottom: spacing.sm, fontWeight: '600' },
  label: { color: colors.navy, fontWeight: '800', fontSize: 14, marginTop: spacing.md, marginBottom: 6 },
  hint: { color: colors.testoSoft, fontSize: 12, marginBottom: 6 },
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
  area: { minHeight: 90, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipStandbyOn: { backgroundColor: colors.oro, borderColor: colors.oro },
  chipTxt: { color: colors.navy, fontWeight: '700' },
  chipTxtOn: { color: colors.bianco },
  foto: {
    marginTop: spacing.md,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.grigio,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.bianco,
  },
  fotoImg: { width: '100%', height: '100%' },
  fotoVuota: { alignItems: 'center', gap: 4 },
  fotoTxt: { color: colors.testoSoft, fontWeight: '700' },
  // Azione primaria DS: pillola nera (ink), mai oro.
  salva: {
    marginTop: spacing.lg,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 18,
    alignItems: 'center',
  },
  salvaOff: { opacity: 0.55 },
  salvaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 17 },
});
