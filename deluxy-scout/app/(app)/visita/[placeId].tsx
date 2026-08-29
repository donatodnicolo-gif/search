import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
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
import type { EsitoVisita, Linea, Place, Task } from '@/types';
import { LINEE_STANDBY, canonizzaLinee } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchLinee, fetchPlace, aggiornaStatoPlace, caricaFotoVetrina, inserisciVisita } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { posizioneCorrente, type Coord } from '@/lib/location';
import { accodaVisita, flushCoda, isOnline, statoDaEsito } from '@/lib/syncQueue';
import { syncVisita } from '@/lib/hubspot';
import { programmaRecapEmail } from '@/lib/reminders';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { EsitoButtons } from '@/components/EsitoButtons';
import { PianificaVisitaModal } from '@/components/PianificaVisitaModal';
import { giornoBreve } from '@/lib/statoVisita';
import { TaskFormModal } from '@/components/TaskFormModal';
import { fetchTaskPlace } from '@/lib/db';
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
  // ⚠️ Perché si è andati: **uno o più motivi**, non uno solo (richiesta utente
  // del 29/07/2026). In un negozio si entra per più ragioni insieme — «gli
  // parlo delle consegne e già che ci sono del gifting» — e sceglierne una
  // faceva perdere l'altra metà del motivo per cui ci si è andati. Il primo
  // resta in `visits.linea_proposta`, che leggono già storico, export e HubSpot.
  const [motivi, setMotivi] = useState<string[]>([]);
  const [aggancio, setAggancio] = useState<string>('');
  const [crossSell, setCrossSell] = useState<string[]>([]);
  const [esito, setEsito] = useState<EsitoVisita | null>(null);
  const [briefing, setBriefing] = useState('');
  const [notePost, setNotePost] = useState('');
  const [analisi, setAnalisi] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [concorrenti, setConcorrenti] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  // Task del negozio: si aprono da qui, senza uscire dalla visita — «richiamalo
  // lunedì» va scritto mentre lo si pensa, non dopo essere tornati indietro.
  const [taskAperto, setTaskAperto] = useState(false);
  const [taskPlace, setTaskPlace] = useState<Task[]>([]);
  const [pianificaAperta, setPianificaAperta] = useState(false);

  useEffect(() => {
    (async () => {
      if (!placeId) return;
      const [p, ls, tk] = await Promise.all([
        fetchPlace(placeId),
        fetchLinee(),
        fetchTaskPlace(placeId).catch(() => [] as Task[]),
      ]);
      setPlace(p);
      setLinee(ls);
      setTaskPlace(tk);
      // Il motivo parte da ciò che il negozio ha già segnato: è l'ipotesi più
      // probabile, e resta togliibile.
      setMotivi(canonizzaLinee(p?.linee_ipotizzate ?? (p?.linea_ipotizzata ? [p.linea_ipotizzata] : [])));
      setAggancio(p?.aggancio_apertura ?? '');
      setLoading(false);
      // Check-in: cattura posizione al momento dell'apertura.
      posizioneCorrente().then(setPos);
    })();
  }, [placeId]);

  /** Gli interessi già segnati sul negozio (dal registro o messi qui). */
  const interessiSegnati = useMemo(
    () => canonizzaLinee(place?.linee_ipotizzate ?? (place?.linea_ipotizzata ? [place.linea_ipotizzata] : [])),
    [place],
  );

  const lineePrimarie = useMemo(
    () => linee.filter((l) => l.attiva_bool && !LINEE_STANDBY.includes(l.nome)),
    [linee],
  );
  const lineeCrossSell = useMemo(
    () => linee.filter((l) => LINEE_STANDBY.includes(l.nome)),
    [linee],
  );

  // Linee di interesse selezionate (motivi + cross-sell), come contesto ai concorrenti.
  const interessi = useMemo(
    () => [...motivi, ...crossSell].filter(Boolean).join(', '),
    [motivi, crossSell],
  );

  const toggleCross = useCallback((nome: string) => {
    setCrossSell((cur) => (cur.includes(nome) ? cur.filter((n) => n !== nome) : [...cur, nome]));
  }, []);

  const toggleMotivo = useCallback((nome: string) => {
    setMotivi((cur) => (cur.includes(nome) ? cur.filter((n) => n !== nome) : [...cur, nome]));
  }, []);

  /**
   * I motivi selezionabili: le linee attive **più** quelli già scelti che non
   * sono fra queste. Senza l'unione, un interesse ereditato dal registro ma non
   * più in catalogo resterebbe selezionato **senza il suo chip**: nel salvataggio
   * ci sarebbe, ma sullo schermo non si vedrebbe e non si potrebbe togliere.
   */
  const opzioniMotivo = useMemo(() => {
    const nomi: string[] = lineePrimarie.map((l) => l.nome);
    return [...nomi, ...motivi.filter((m) => !nomi.includes(m))];
  }, [lineePrimarie, motivi]);

  async function scegliFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      avvisa('Permesso fotocamera negato');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) setFotoUri(res.assets[0].uri);
  }

  async function salva() {
    if (!place) return;
    // Next-step OBBLIGATORIO (regola Fase 3).
    if (!nextStep.trim()) {
      avvisa('Next step obbligatorio', 'Inserisci il prossimo passo prima di salvare.');
      return;
    }
    if (!esito) {
      avvisa('Esito mancante', 'Seleziona un esito della visita.');
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
      // Il primo motivo resta dov'era: storico, export CSV e `hubspot-sync`
      // (che ci costruisce il nome della deal) leggono `linea_proposta`.
      linea_proposta: motivi[0] ?? null,
      motivi: motivi.length ? motivi : null,
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
        avvisa('Salvata offline', 'La visita verrà sincronizzata al ritorno online.');
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
      avvisa('Visita salvata', 'Sincronizzata su Supabase.');
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
      avvisa(
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

          {/* Quando ci vai: la data che ci si dà (`places.visita_pianificata`),
              non quella della visita fatta. Si sposta e si toglie. */}
          <Pressable style={styles.quando} onPress={() => setPianificaAperta(true)}>
            <Ionicons name="calendar-outline" size={18} color={colors.testo} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.quandoLbl}>Quando ci vai</Text>
              <Text style={styles.quandoVal} numberOfLines={1}>
                {place.visita_pianificata ? giornoBreve(place.visita_pianificata) : 'Nessuna data — tocca per metterla'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.grigio} />
          </Pressable>

          {/* Cosa il negozio ha GIÀ segnato: si entra sapendo di cosa gli
              interessa parlare, invece di riaprire la scheda per ricordarlo. */}
          <Label>Interessi già segnati</Label>
          {interessiSegnati.length ? (
            <View style={styles.chipWrap}>
              {interessiSegnati.map((nome) => (
                <View key={nome} style={styles.chipFermo}>
                  <Ionicons name="pricetag-outline" size={12} color={colors.testoSoft} />
                  <Text style={styles.chipFermoTxt}>{nome}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.hint}>
              Nessun interesse segnato per questo negozio. Si impostano dalla sua scheda, in «Tipologia di interesse».
            </Text>
          )}

          <Label>Motivo della visita — scegline uno o più</Label>
          <Text style={styles.hint}>
            Perché ci vai. Parte da quello che il negozio ha già segnato: togli o aggiungi.
          </Text>
          <View style={styles.chipWrap}>
            {opzioniMotivo.map((nome) => (
              <Chip key={nome} label={nome} on={motivi.includes(nome)} onPress={() => toggleMotivo(nome)} />
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

          <Label obbligatorio>Esito</Label>
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

          <Label obbligatorio>Next step</Label>
          <TextInput style={styles.input} value={nextStep} onChangeText={setNextStep} placeholder="Il prossimo passo — es. «richiamare giovedì per il preventivo»" placeholderTextColor={colors.grigio} />

          {/* Il next step è una frase; il task è una cosa con una data e un
              nome sopra. Aprirlo da qui evita di uscire dalla visita per
              scriverlo — che è il modo più sicuro di non scriverlo. */}
          <View style={styles.taskBox}>
            <View style={styles.taskTesta}>
              <Text style={styles.taskTitolo}>
                Task del negozio{taskPlace.length ? ` (${taskPlace.filter((t) => !t.completata).length} da fare)` : ''}
              </Text>
              <Pressable style={styles.btnTask} onPress={() => setTaskAperto(true)}>
                <Ionicons name="add" size={15} color={colors.bianco} />
                <Text style={styles.btnTaskTxt}>Nuovo task</Text>
              </Pressable>
            </View>
            {taskPlace.filter((t) => !t.completata).slice(0, 3).map((t) => (
              <Text key={t.id} style={styles.taskRiga} numberOfLines={1}>
                • {t.titolo}
                {t.scadenza ? ` — entro il ${new Date(t.scadenza).toLocaleDateString('it-IT')}` : ''}
              </Text>
            ))}
          </View>

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

      {pianificaAperta ? (
        <PianificaVisitaModal
          place={place}
          onClose={() => setPianificaAperta(false)}
          onDone={(giorno) => {
            setPlace({ ...place, visita_pianificata: giorno });
            setPianificaAperta(false);
          }}
        />
      ) : null}

      {taskAperto ? (
        <TaskFormModal
          placeId={place.id}
          placeNome={place.nome}
          onClose={() => setTaskAperto(false)}
          onSalvato={async () => {
            setTaskAperto(false);
            setTaskPlace(await fetchTaskPlace(place.id).catch(() => taskPlace));
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Etichetta di campo. `obbligatorio` mette un asterisco rosso e la parola:
 * prima l'unico segnale era un `*` nel testo del Next step, e l'Esito — che è
 * obbligatorio uguale — non lo diceva affatto: lo si scopriva al salvataggio,
 * con un avviso, dopo aver compilato tutto il resto.
 */
function Label({ children, obbligatorio }: { children: ReactNode; obbligatorio?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}
      {obbligatorio ? <Text style={styles.obbligatorio}> * obbligatorio</Text> : null}
    </Text>
  );
}

function Chip({ label, on, onPress, standby }: { label: string; on: boolean; onPress: () => void; standby?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && (standby ? styles.chipStandbyOn : styles.chipOn)]}
    >
      <Text style={[styles.chipTxt, on && (standby ? styles.chipTxtStandbyOn : styles.chipTxtOn)]}>{label}</Text>
    </Pressable>
  );
}

// Id locale per la coda offline.
function localId(): string {
  return `loc_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xs },
  err: { padding: spacing.xxl, color: colors.errore },
  nome: { fontSize: 22, fontWeight: '600', color: colors.navy, letterSpacing: -0.5 },
  checkin: { color: colors.testoSoft, marginBottom: spacing.sm, fontWeight: '600' },
  label: { color: colors.navy, fontWeight: '700', fontSize: 14, marginTop: spacing.lg, marginBottom: 6 },
  obbligatorio: { color: colors.errore, fontWeight: '700', fontSize: 12 },
  quando: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  quandoLbl: { color: colors.testoSoft, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  quandoVal: { color: colors.testo, fontWeight: '700', fontSize: 14, marginTop: 1 },
  hint: { color: colors.testoSoft, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
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
  // ⚠️ D23 (Libro UX cap.5): l'oro non è uno stato di selezione. Il cross-sell
  // «in standby» si distingue dalla linea primaria (navy pieno) con una selezione
  // NEUTRA — fill grigio + bordo marcato + testo scuro — non con l'oro brand.
  chipStandbyOn: { backgroundColor: colors.fillActive, borderColor: colors.hairlineStrong },
  chipTxt: { color: colors.navy, fontWeight: '700' },
  chipTxtOn: { color: colors.bianco },
  chipTxtStandbyOn: { color: colors.navy },
  // Solo da leggere: non si preme, e si vede che non si preme.
  chipFermo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipFermoTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  taskBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    padding: spacing.lg,
    gap: 6,
  },
  taskTesta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  taskTitolo: { flex: 1, color: colors.navy, fontWeight: '700', fontSize: 14, minWidth: 120 },
  btnTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnTaskTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13 },
  taskRiga: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  foto: {
    marginTop: spacing.lg,
    height: 120,
    borderRadius: radius.m,
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
    marginTop: spacing.xxl,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 18,
    alignItems: 'center',
  },
  salvaOff: { opacity: 0.55 },
  salvaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 17 },
});
