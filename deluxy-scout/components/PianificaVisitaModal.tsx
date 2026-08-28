// «Quando ci vado?» — la data che ci si dà per andare a trovare un negozio.
//
// ⚠️ Non è la data della visita fatta (`visits.data`): è un'intenzione, e come
// tale si può spostare o togliere. Serve a rispondere a «cosa faccio giovedì».
//
// Niente librerie di calendario: sul telefono, in piedi davanti a una vetrina,
// le scelte rapide bastano quasi sempre; sul web c'è anche il campo data del
// browser per i casi in cui si programma la settimana da seduti.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Foglio } from '@/components/Foglio';
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
      const msg = String(e?.message ?? '');
      // PostgREST qui dice «Could not find the 'visita_pianificata' column …
      // in the schema cache», che è vero ma incomprensibile: vuol dire solo
      // che la migrazione 0047 non è ancora stata applicata.
      setErrore(
        /visita_pianificata|schema cache/i.test(msg)
          ? 'Questa funzione ha bisogno della migrazione 0047 (non ancora applicata al database). La data non può essere salvata finché non viene lanciata.'
          : msg || 'Non è stato possibile salvare la data.',
      );
      setBusy(false);
    }
  }

  return (
    <Foglio
      titolo={`Quando ci vai? · ${place.nome}`}
      sottotitolo="È la data che ti dai tu. Quando registri la visita sparisce da sola."
      onClose={onClose}
    >
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
                marginTop: spacing.lg,
                padding: 12,
                fontSize: 15,
                borderRadius: radius.m,
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
    </Foglio>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.xs },
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
  scelto: { color: colors.testo, fontWeight: '700', fontSize: 13.5, marginTop: spacing.lg },
  errore: { color: colors.errore, fontWeight: '600', marginTop: spacing.sm },
  azioni: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xxl },
  btn: { flex: 1, borderRadius: radius.m, paddingVertical: 15, alignItems: 'center' },
  btnSec: { backgroundColor: colors.fill },
  btnSecTxt: { color: colors.testo, fontWeight: '600' },
  spento: { opacity: 0.4 },
  btnPri: { backgroundColor: colors.ink },
  btnPriTxt: { color: colors.bianco, fontWeight: '600', fontSize: 16 },
});
