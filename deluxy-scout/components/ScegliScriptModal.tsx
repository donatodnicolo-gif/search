// "Invia mail" a un Prospect: scegli lo script dalla libreria (o creane uno
// nuovo) e vai alla schermata di invio. Lo script è il testo, l'invio resta
// quello di sempre — con revisione e conferma esplicita, mai automatico.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Foglio } from '@/components/Foglio';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchScript, LABEL_TIPO, type ScriptEmail } from '@/lib/script';
import { fetchRecapitiPlace } from '@/lib/db';
import { urlScriviAiMail } from '@/lib/aimail';
import type { Place } from '@/types';

type Destinatario = Pick<Place, 'id' | 'nome'>;

/**
 * Scelta dello script per scrivere a **uno o più** negozi.
 *
 * Basta `{ id, nome }`: così lo usano sia le liste che hanno un `Place` intero
 * sia i Clienti, che lavorano su una riga più leggera.
 */
export function ScegliScriptModal({
  place,
  places,
  onClose,
}: {
  /** Un solo negozio (uso storico: l'azione mail su una riga). */
  place?: Destinatario;
  /** Più negozi insieme, dalla scelta multipla. */
  places?: Destinatario[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [script, setScript] = useState<ScriptEmail[] | null>(null);
  // Gli indirizzi dei negozi scelti: servono solo alla finestra di AI Mail,
  // che vuole un destinatario nell'URL. L'invio di Scout se li ricava da sé.
  const [recapiti, setRecapiti] = useState<Map<string, string>>(new Map());
  const scelti: Destinatario[] = places?.length ? places : place ? [place] : [];

  useEffect(() => {
    fetchScript()
      .then(setScript)
      .catch(() => setScript([]));
    fetchRecapitiPlace()
      .then((m) => {
        const soli = new Map<string, string>();
        for (const [id, r] of m) if (r.email) soli.set(id, r.email);
        setRecapiti(soli);
      })
      .catch(() => {});
  }, []);

  const destinatari = () => `?place=${scelti.map((p) => p.id).join(',')}`;

  function scegli(s: ScriptEmail) {
    onClose();
    // Si porta dietro i negozi: nella schermata d'invio i loro contatti
    // risultano già selezionati, invece di ripescarli fra tutti.
    router.push(`/(app)/invio/${s.id}${destinatari()}`);
  }

  /** Mail scritta al momento: stesso percorso d'invio, senza modello. */
  function nuovaMail() {
    onClose();
    router.push(`/(app)/invio/nuovo${destinatari()}`);
  }

  /**
   * Apre la finestra «scrivi» di AI Mail con il destinatario già dentro.
   *
   * È la strada per scriverla a mano da lì: la mail parte dalla casella
   * collegata ad AI Mail e la copia resta in «Inviata». In cambio si perde
   * quello che sa fare l'invio di Scout — più negozi insieme, variabili,
   * formattazione, e la traccia in `contatti_avviati` che fa diventare Lead il
   * negozio. Per questo sta come terza scelta e non al posto delle altre.
   */
  function scriviInAiMail() {
    const indirizzi = scelti.map((p) => recapiti.get(p.id)).filter(Boolean) as string[];
    if (!indirizzi.length) return;
    onClose();
    Linking.openURL(
      urlScriviAiMail({
        a: indirizzi.join(', '),
        rif: scelti.length === 1 ? scelti[0].nome : `${scelti.length} negozi`,
      }),
    );
  }

  // Con più negozi il titolo dice quanti sono: «Mail a 12 negozi» è
  // un'informazione che serve prima di premere, non dopo.
  const titolo =
    scelti.length === 1 ? `Mail a ${scelti[0].nome}` : `Mail a ${scelti.length} negozi`;

  return (
    <Foglio
      titolo={titolo}
      sottotitolo="Scegli lo script: nella schermata d'invio selezioni i contatti, rivedi il testo e confermi. Niente parte da solo."
      onClose={onClose}
    >
          {script === null ? (
            <ActivityIndicator color={colors.navy} style={{ marginVertical: spacing.lg }} />
          ) : (
            // View e non ScrollView: il tetto e lo scroll li dà il corpo del
            // Foglio — due ScrollView annidate sullo stesso asse sono vietate
            // (Libro v1.7 §9).
            <View style={{ gap: 8 }}>
              {script.length === 0 ? (
                <Text style={styles.vuoto}>Nessuno script in libreria: creane uno.</Text>
              ) : (
                script.map((s) => (
                  <Pressable key={s.id} style={styles.riga} onPress={() => scegli(s)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rigaTitolo} numberOfLines={1}>{s.titolo}</Text>
                      <Text style={styles.rigaMeta} numberOfLines={1}>
                        {LABEL_TIPO[s.tipo]}
                        {s.oggetto ? ` · ${s.oggetto}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.grigio} />
                  </Pressable>
                ))
              )}
            </View>
          )}

          {/* Due cose diverse, e la differenza conta:
              · NUOVA MAIL = la scrivi ora e parte ora, in libreria non ci va.
                È il caso più frequente, quindi sta sopra e in nero.
              · NUOVO SCRIPT = un modello da riusare, e porta in Script. */}
          <Pressable style={styles.btnNuovo} onPress={nuovaMail}>
            <Ionicons name="create-outline" size={16} color={colors.bianco} />
            <Text style={styles.btnNuovoTxt}>Nuova mail</Text>
          </Pressable>
          {/* Terza strada: la finestra di AI Mail. Un destinatario alla volta e
              senza variabili, ma si scrive di là e la copia resta in «Inviata».
              Spenta se del negozio non abbiamo nessun indirizzo: una finestra
              «scrivi a nessuno» non serve. */}
          {(() => {
            const conMail = scelti.filter((p) => recapiti.get(p.id)).length;
            return (
              <Pressable style={[styles.btnSec, !conMail && styles.off]} onPress={scriviInAiMail} disabled={!conMail}>
                <Ionicons name="open-outline" size={15} color={colors.testo} />
                <Text style={styles.btnSecTxt} numberOfLines={1}>
                  {conMail ? 'Scrivi in AI Mail' : 'Scrivi in AI Mail — nessun indirizzo'}
                </Text>
              </Pressable>
            );
          })()}

          <Pressable
            style={styles.btnSec}
            onPress={() => {
              onClose();
              router.push('/(app)/script');
            }}
          >
            <Ionicons name="add" size={15} color={colors.testo} />
            <Text style={styles.btnSecTxt}>Nuovo script da riusare</Text>
          </Pressable>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  vuoto: { color: colors.grigio, fontStyle: 'italic', fontSize: 13 },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    padding: spacing.lg,
  },
  rigaTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  rigaMeta: { color: colors.testoSoft, fontSize: 12.5, marginTop: 1 },
  btnNuovo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 11,
  },
  btnNuovoTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
  btnSec: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  btnSecTxt: { color: colors.testo, fontWeight: '700', fontSize: 13 },
  off: { opacity: 0.45 },
});
