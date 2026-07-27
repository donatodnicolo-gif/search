// «Quando ci vado?» — la data che ci si dà per andare a trovare un negozio.
//
// ⚠️ Non è la data della visita fatta (`visits.data`): è un'intenzione, e come
// tale si può spostare o togliere. Serve a rispondere a «cosa faccio giovedì».
//
// Niente librerie di calendario: sul telefono, in piedi davanti a una vetrina,
// le scelte rapide bastano quasi sempre; sul web c'è anche il campo data del
// browser per i casi in cui si programma la settimana da seduti.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Place } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { pianificaVisita } from '@/lib/db';
import { giornoBreve } from '@/lib/statoVisita';

/** "2026-07-30" del giorno fra N giorni: la forma che vuole una colonna `date`. */
function fraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  // Niente toISOString(): converte in UTC e in Italia, di sera, sposta al
  // giorno prima. La data qui è un giorno del calendario, non un istante.
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const gg = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${gg}`;
}

const RAPIDE: { label: string; giorni: number }[] = [
  { label: 'Oggi', giorni: 0 },
  { label: 'Domani', giorni: 1 },
  { label: 'Fra 3 giorni', giorni: 3 },
  { label: 'Fra una settimana', giorni: 7 },
];

export function PianificaVisitaModal({
  place,
  onClose,
  onDone,
}: {
  place: Place | null;
  onClose: () => void;
  /** Chiamata a salvataggio riuscito, con la data scelta (o null se tolta). */
  onDone: (giorno: string | null) => void;
}) {
  const [giorno, setGiorno] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    setGiorno(place?.visita_pianificata ?? '');
    setErrore(null);
    setBusy(false);
  }, [place?.id, place?.visita_pianificata]);

  if (!place) return null;

  async function salva(valore: string | null) {
    setBusy(true);
    setErrore(null);
    try {
      await pianificaVisita(place!.id, valore);
      onDone(valore);
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile salvare la data.');
      setBusy(false);
    }
  }

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text numberOfLines={2} style={styles.titolo}>
            Quando ci vai? · {place.nome}
          </Text>
          <Text style={styles.aiuto}>
            È la data che ti dai tu. Quando registri la visita sparisce da sola.
          </Text>

          <View style={styles.chips}>
            {RAPIDE.map((r) => {
              const valore = fraGiorni(r.giorni);
              const scelto = giorno === valore;
              return (
                <Pressable
                  key={r.label}
                  onPress={() => setGiorno(valore)}
                  style={[styles.chip, scelto && styles.chipOn]}
                  disabled={busy}
                >
                  <Text style={[styles.chipTxt, scelto && styles.chipTxtOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {Platform.OS === 'web' ? (
            // Il campo data del browser: per programmare una settimana intera
            // da seduti, le scelte rapide non bastano.
            <input
              type="date"
              value={giorno}
              min={fraGiorni(0)}
              onChange={(e: any) => setGiorno(e.target.value)}
              style={{
                marginTop: spacing.md,
                padding: 12,
                fontSize: 15,
                borderRadius: radius.md,
                border: `1px solid ${colors.grigioChiaro}`,
                background: colors.bianco,
                color: colors.testo,
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          ) : null}

          {giorno ? (
            <Text style={styles.scelto}>
              <Ionicons name="calendar-outline" size={13} color={colors.testo} /> {giornoBreve(giorno)}
            </Text>
          ) : null}

          {errore ? <Text style={styles.errore}>{errore}</Text> : null}

          <View style={styles.azioni}>
            {/* Togliere la data è un'azione a sé: un giro saltato non deve
                restare in agenda per sempre. */}
            <Pressable
              style={[styles.btn, styles.btnSec]}
              onPress={() => salva(null)}
              disabled={busy || !place.visita_pianificata}
            >
              <Text style={[styles.btnSecTxt, !place.visita_pianificata && styles.spento]}>Togli la data</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPri]} onPress={() => salva(giorno || null)} disabled={busy || !giorno}>
              {busy ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.btnPriTxt}>Salva</Text>}
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
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.grigioChiaro, marginBottom: spacing.sm },
  titolo: { fontSize: 18, fontWeight: '900', color: colors.navy },
  aiuto: { color: colors.testoSoft, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  scelto: { color: colors.testo, fontWeight: '700', fontSize: 13.5, marginTop: spacing.md },
  errore: { color: colors.errore, fontWeight: '600', marginTop: spacing.sm },
  azioni: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  btnSec: { backgroundColor: colors.fill },
  btnSecTxt: { color: colors.testo, fontWeight: '600' },
  spento: { opacity: 0.4 },
  btnPri: { backgroundColor: colors.ink },
  btnPriTxt: { color: colors.bianco, fontWeight: '600', fontSize: 16 },
});
