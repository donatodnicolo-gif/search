// Pop-up "sono stato qui": esito (obbligatorio) + contatto (opzionale) + note.
// Si può salvare subito oppure posticipare (il negozio resta "da completare").
//
// ⚠️ Quello che si scrive qui **non si perde**: mentre si digita la bozza va da
// sola nel database (tabella `bozze_visita`) e alla riapertura torna com'era.
// Prima bastava chiudere il pop-up — o che lo chiudesse il telefono — per
// buttare via tutto: sul campo, con una mano sola, succedeva di continuo.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EsitoVisita, Place } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchBozzaVisita, registraVisitaRapida, salvaBozzaVisita, segnaVisitatoDaCompletare } from '@/lib/db';
import { EsitoButtons } from '@/components/EsitoButtons';
import { Foglio } from '@/components/Foglio';

export function VisitaModal({
  place,
  onClose,
  onDone,
}: {
  place: Place | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [esito, setEsito] = useState<EsitoVisita | null>(null);
  const [nome, setNome] = useState('');
  const [ruolo, setRuolo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [decisore, setDecisore] = useState(false);
  const [note, setNote] = useState('');
  const [concorrenti, setConcorrenti] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // 'no' = niente da salvare · 'attesa' = sta per partire · 'ok' = salvata.
  const [bozza, setBozza] = useState<'no' | 'attesa' | 'ok'>('no');
  // Finché la bozza precedente non è stata riletta, non si salva niente:
  // altrimenti il primo autosave (a campi ancora vuoti) cancellerebbe proprio
  // gli appunti che stiamo per ricaricare.
  const pronto = useRef(false);

  // Reset dei campi ad ogni apertura su un negozio diverso, poi si ricarica la
  // bozza di quel negozio se c'è.
  useEffect(() => {
    let vivo = true;
    pronto.current = false;
    setEsito(null);
    setNome('');
    setRuolo('');
    setTelefono('');
    setEmail('');
    setDecisore(false);
    setNote('');
    setConcorrenti('');
    setErrore(null);
    setBusy(false);
    setBozza('no');
    if (!place?.id) return;
    const id = place.id;
    (async () => {
      const b = await fetchBozzaVisita(id);
      if (!vivo) return;
      if (b) {
        setEsito((b.esito as EsitoVisita) ?? null);
        setNome(b.nome ?? '');
        setRuolo(b.ruolo ?? '');
        setTelefono(b.telefono ?? '');
        setEmail(b.email ?? '');
        setDecisore(Boolean(b.decisore));
        setNote(b.note ?? '');
        setConcorrenti(b.concorrenti ?? '');
        setBozza('ok');
      }
      // Solo ora l'autosave può partire: da qui in poi ogni modifica è una
      // scelta di chi scrive, non il rimbalzo del ripristino.
      pronto.current = true;
    })();
    return () => {
      vivo = false;
    };
  }, [place?.id]);

  // L'autosave vero e proprio: mezzo secondo dopo l'ultimo tasto, così non si
  // scrive nel database a ogni lettera.
  const campi = { esito, nome, ruolo, telefono, email, decisore, note, concorrenti };
  const serialized = JSON.stringify(campi);
  useEffect(() => {
    if (!place?.id || !pronto.current) return;
    // Un pop-up aperto e mai toccato non merita una riga nel database.
    const vuoto = !esito && !nome && !ruolo && !telefono && !email && !note && !concorrenti && !decisore;
    if (vuoto) return;
    setBozza('attesa');
    const id = place.id;
    const t = setTimeout(() => {
      salvaBozzaVisita(id, campi)
        .then(() => setBozza('ok'))
        // Muto di proposito: si sta ancora scrivendo, e un errore ogni tre
        // lettere sarebbe peggio del danno. Il salvataggio vero è «Salva visita».
        .catch(() => setBozza('no'));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, place?.id]);

  if (!place) return null;

  // Linee di interesse del negozio, come contesto ai concorrenti.
  const interessi = (place.linee_ipotizzate?.length
    ? place.linee_ipotizzate
    : [place.linea_ipotizzata].filter(Boolean)
  ).join(', ');

  async function salva() {
    if (!esito) {
      setErrore('Scegli l’esito della visita.');
      return;
    }
    // La nota è obbligatoria solo quando l'esito merita un seguito.
    const serveNota = esito === 'interessato' || esito === 'da_richiamare';
    if (serveNota && !note.trim()) {
      setErrore('Aggiungi una nota: servirà per il recap o il richiamo.');
      return;
    }
    setBusy(true);
    setErrore(null);
    try {
      await registraVisitaRapida(place!.id, {
        esito,
        note,
        concorrenti,
        contatto: nome.trim()
          ? { nome, ruolo, telefono, email, is_decisore: decisore }
          : undefined,
      });
      onDone();
    } catch (e) {
      setErrore((e as Error).message);
      setBusy(false);
    }
  }

  async function posticipa() {
    setBusy(true);
    setErrore(null);
    try {
      await segnaVisitatoDaCompletare(place!.id);
      onDone();
    } catch (e) {
      setErrore((e as Error).message);
      setBusy(false);
    }
  }

  return (
    // Chiudere toccando fuori qui è SICURO: la bozza si salva da sola mentre
    // si scrive, quindi niente va perso (vedi commento in testa al file).
    <Foglio titolo={`Visita · ${place.nome}`} onClose={onClose}>
          {place.aggancio_apertura ? (
            <Text style={styles.aggancio} numberOfLines={2}>
              <Ionicons name="chatbubble-outline" size={12} color={colors.testoSoft} /> {place.aggancio_apertura}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={styles.sezione}>Com’è andata?</Text>
            <EsitoButtons value={esito} onChange={setEsito} />

            <Text style={styles.sezione}>Contatto (opzionale)</Text>
            <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Nome referente" placeholderTextColor={colors.grigio} />
            <TextInput style={styles.input} value={ruolo} onChangeText={setRuolo} placeholder="Ruolo" placeholderTextColor={colors.grigio} />
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.flex]} value={telefono} onChangeText={setTelefono} placeholder="Telefono" keyboardType="phone-pad" placeholderTextColor={colors.grigio} />
              <TextInput style={[styles.input, styles.flex]} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.grigio} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>È il decisore</Text>
              <Switch value={decisore} onValueChange={setDecisore} trackColor={{ true: colors.oro }} />
            </View>

            <Text style={styles.sezione}>Note visita</Text>
            <TextInput
              style={[styles.input, styles.note]}
              value={note}
              onChangeText={setNote}
              placeholder="Com'è andata, prossimo passo…"
              placeholderTextColor={colors.grigio}
              multiline
            />

            <Text style={styles.sezione}>Concorrenti già presenti</Text>
            {interessi ? <Text style={styles.hint}>Per: {interessi}</Text> : null}
            <TextInput
              style={[styles.input, styles.note]}
              value={concorrenti}
              onChangeText={setConcorrenti}
              placeholder="Chi serve già il negozio? (es. Glovo, Catering X…)"
              placeholderTextColor={colors.grigio}
              multiline
            />

            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          </ScrollView>

          {/* Dire che la bozza è al sicuro serve: senza, chi chiude il pop-up
              non ha modo di sapere che ritroverà quello che ha scritto. */}
          {bozza !== 'no' ? (
            <Text style={styles.bozza}>
              <Ionicons
                name={bozza === 'ok' ? 'cloud-done-outline' : 'cloud-upload-outline'}
                size={12}
                color={colors.testoSoft}
              />{' '}
              {bozza === 'ok' ? 'Bozza salvata: puoi chiudere e riprendere dopo.' : 'Salvataggio della bozza…'}
            </Text>
          ) : null}

          <View style={styles.azioni}>
            <Pressable style={[styles.btn, styles.btnSec]} onPress={posticipa} disabled={busy}>
              <Text style={styles.btnSecTxt}>Compila dopo</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPri]} onPress={salva} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.btnPriTxt}>Salva visita</Text>}
            </Pressable>
          </View>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  aggancio: { color: colors.testoSoft, fontSize: 13, fontStyle: 'italic', marginBottom: spacing.sm },
  hint: { color: colors.testoSoft, fontSize: 12, marginTop: -spacing.xs },
  body: { paddingBottom: spacing.md, gap: spacing.sm },
  sezione: { color: colors.oro, fontWeight: '800', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing.sm },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.testo,
  },
  note: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  switchLbl: { color: colors.navy, fontWeight: '600' },
  errore: { color: colors.errore, fontWeight: '600', marginTop: spacing.sm },
  bozza: { color: colors.testoSoft, fontSize: 12, marginTop: spacing.xs, textAlign: 'center' },
  azioni: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  btnSec: { backgroundColor: colors.fill, borderWidth: 0 },
  btnSecTxt: { color: colors.testo, fontWeight: '600' },
  btnPri: { backgroundColor: colors.ink },
  btnPriTxt: { color: colors.bianco, fontWeight: '600', fontSize: 16 },
});
