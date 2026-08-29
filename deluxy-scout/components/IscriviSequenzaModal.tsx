// «Mettilo in sequenza»: si sceglie il percorso di solleciti e il negozio ci
// entra. Da qui in poi le scadenze le tiene l'app.
//
// Mostra solo le sequenze ACCESE e con almeno un passo: una sequenza senza
// passi non manderebbe mai niente, e una spenta nemmeno — proporle vorrebbe
// dire far credere di aver messo in moto qualcosa.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Foglio } from '@/components/Foglio';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { avvisa } from '@/lib/dialoghi';
import { fetchPassi, fetchSequenze, iscrivi, type PassoSequenza, type Sequenza } from '@/lib/sequenze';
import { fetchScript, type ScriptEmail } from '@/lib/script';

export function IscriviSequenzaModal({
  place,
  onClose,
  onFatto,
}: {
  place: Pick<Place, 'id' | 'nome'>;
  onClose: () => void;
  onFatto?: () => void;
}) {
  const router = useRouter();
  const [sequenze, setSequenze] = useState<Sequenza[] | null>(null);
  const [passi, setPassi] = useState<Record<string, PassoSequenza[]>>({});
  const [script, setScript] = useState<ScriptEmail[]>([]);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, sc] = await Promise.all([fetchSequenze(), fetchScript().catch(() => [])]);
        const attive = s.filter((x) => x.attiva);
        const mappa: Record<string, PassoSequenza[]> = {};
        for (const seq of attive) mappa[seq.id] = await fetchPassi(seq.id).catch(() => []);
        setPassi(mappa);
        setScript(sc);
        setSequenze(attive.filter((x) => (mappa[x.id] ?? []).length > 0));
      } catch (e: any) {
        // Quasi sempre: migrazione 0050 non applicata. Detto a parole.
        const msg = String(e?.message ?? '');
        setErrore(
          /sequenz|PGRST205|does not exist/i.test(msg)
            ? 'Le sequenze hanno bisogno della migrazione 0050, non ancora applicata al database.'
            : msg || 'Non è stato possibile leggere le sequenze.',
        );
        setSequenze([]);
      }
    })();
  }, []);

  const titolo = (id: string | null) => script.find((s) => s.id === id)?.titolo ?? 'testo';

  async function metti(s: Sequenza) {
    setSalvo(s.id);
    try {
      const r = await iscrivi(s.id, place.id);
      onClose();
      avvisa(
        r.nuova ? 'In sequenza' : 'C’era già',
        r.nuova
          ? `${place.nome} entra in «${s.nome}». Il primo testo compare in coda in Sequenze: parte quando lo confermi.`
          : `${place.nome} era già in «${s.nome}»: non l’ho iscritto due volte, sarebbero stati due solleciti in parallelo.`,
      );
      onFatto?.();
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile iscriverlo.');
    } finally {
      setSalvo(null);
    }
  }

  return (
    <Foglio
      titolo={`Metti ${place.nome} in sequenza`}
      sottotitolo="L’app terrà il conto delle scadenze. Se il cliente risponde la sequenza si ferma da sé, e prima di ogni invio controlla che non abbia già risposto."
      onClose={onClose}
    >
          {errore ? <Text style={styles.errore}>{errore}</Text> : null}

          {sequenze === null ? (
            <ActivityIndicator color={colors.navy} style={{ marginVertical: spacing.lg }} />
          ) : sequenze.length === 0 && !errore ? (
            <View style={styles.vuoto}>
              <Text style={styles.vuotoTxt}>
                Nessuna sequenza pronta. Ne serve una accesa e con almeno un passo: una senza passi non
                manderebbe mai niente.
              </Text>
              <Pressable
                style={styles.btnPri}
                onPress={() => {
                  onClose();
                  router.push('/(app)/sequenze');
                }}
              >
                <Text style={styles.btnPriTxt}>Vai a Sequenze</Text>
              </Pressable>
            </View>
          ) : (
            // View e non ScrollView: il tetto e lo scroll li dà il corpo del
            // Foglio — due ScrollView annidate sullo stesso asse sono vietate
            // (Libro v1.7 §9).
            <View style={{ gap: 8 }}>
              {sequenze.map((s) => {
                const suoi = passi[s.id] ?? [];
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.riga, salvo === s.id && styles.rigaSalvo]}
                    disabled={Boolean(salvo)}
                    onPress={() => metti(s)}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rigaNome} numberOfLines={2}>{s.nome}</Text>
                      {/* Il percorso per esteso: si sceglie sapendo cosa
                          riceverà il cliente e quando, non a scatola chiusa. */}
                      <Text style={styles.rigaPassi} numberOfLines={3}>
                        {suoi
                          .map((p, i) => (i === 0 ? `subito: ${titolo(p.script_id)}` : `+${p.giorni_attesa}g: ${titolo(p.script_id)}`))
                          .join(' · ')}
                      </Text>
                    </View>
                    {salvo === s.id ? (
                      <ActivityIndicator size="small" color={colors.ink} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.testoSoft} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
    </Foglio>
  );
}

const styles = StyleSheet.create({
  errore: { color: colors.errore, fontSize: 13, fontWeight: '600' },
  vuoto: { gap: spacing.sm, alignItems: 'flex-start', paddingVertical: spacing.sm },
  vuotoTxt: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
  },
  rigaSalvo: { opacity: 0.6 },
  rigaNome: { color: colors.navy, fontWeight: '700', fontSize: 14.5 },
  rigaPassi: { color: colors.testoSoft, fontSize: 12, lineHeight: 16, marginTop: 2 },
  btnPri: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
  btnPriTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
});
