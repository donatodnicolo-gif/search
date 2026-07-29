// "Invia mail" a un Prospect: scegli lo script dalla libreria (o creane uno
// nuovo) e vai alla schermata di invio. Lo script è il testo, l'invio resta
// quello di sempre — con revisione e conferma esplicita, mai automatico.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchScript, LABEL_TIPO, type ScriptEmail } from '@/lib/script';
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
  const scelti: Destinatario[] = places?.length ? places : place ? [place] : [];

  useEffect(() => {
    fetchScript()
      .then(setScript)
      .catch(() => setScript([]));
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

  // Con più negozi il titolo dice quanti sono: «Mail a 12 negozi» è
  // un'informazione che serve prima di premere, non dopo.
  const titolo =
    scelti.length === 1 ? `Mail a ${scelti[0].nome}` : `Mail a ${scelti.length} negozi`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.titolo} numberOfLines={2}>
              {titolo}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>
          <Text style={styles.aiuto}>
            Scegli lo script: nella schermata d&apos;invio selezioni i contatti, rivedi il testo e
            confermi. Niente parte da solo.
          </Text>

          {script === null ? (
            <ActivityIndicator color={colors.oro} style={{ marginVertical: spacing.md }} />
          ) : (
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
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
            </ScrollView>
          )}

          {/* Due cose diverse, e la differenza conta:
              · NUOVA MAIL = la scrivi ora e parte ora, in libreria non ci va.
                È il caso più frequente, quindi sta sopra e in nero.
              · NUOVO SCRIPT = un modello da riusare, e porta in Script. */}
          <Pressable style={styles.btnNuovo} onPress={nuovaMail}>
            <Ionicons name="create-outline" size={16} color={colors.bianco} />
            <Text style={styles.btnNuovoTxt}>Nuova mail</Text>
          </Pressable>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.sfondo,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titolo: { color: colors.navy, fontWeight: '800', fontSize: 17, flex: 1 },
  aiuto: { color: colors.testoSoft, fontSize: 13 },
  vuoto: { color: colors.grigio, fontStyle: 'italic', fontSize: 13 },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    padding: spacing.md,
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
});
