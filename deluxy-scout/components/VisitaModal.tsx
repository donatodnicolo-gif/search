// Pop-up "sono stato qui": esito (obbligatorio) + contatto (opzionale) + note.
// Si può salvare subito oppure posticipare (il negozio resta "da completare").
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { registraVisitaRapida, segnaVisitatoDaCompletare } from '@/lib/db';
import { EsitoButtons } from '@/components/EsitoButtons';

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

  // Reset dei campi ad ogni apertura su un negozio diverso.
  useEffect(() => {
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
  }, [place?.id]);

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
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={styles.titolo} numberOfLines={1}>
            Visita · {place.nome}
          </Text>
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

          <View style={styles.azioni}>
            <Pressable style={[styles.btn, styles.btnSec]} onPress={posticipa} disabled={busy}>
              <Text style={styles.btnSecTxt}>Compila dopo</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPri]} onPress={salva} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.btnPriTxt}>Salva visita</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.sfondo,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: '88%',
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.grigioChiaro, marginBottom: spacing.sm },
  titolo: { fontSize: 18, fontWeight: '900', color: colors.navy, marginBottom: spacing.sm },
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
  azioni: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  btnSec: { backgroundColor: colors.fill, borderWidth: 0 },
  btnSecTxt: { color: colors.testo, fontWeight: '600' },
  btnPri: { backgroundColor: colors.ink },
  btnPriTxt: { color: colors.bianco, fontWeight: '600', fontSize: 16 },
});
