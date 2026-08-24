// Foglio — il contenitore unico delle finestre dell'app (DS §Componenti: card
// surface, radius-l, shadow-float). Su schermo stretto è un foglio che sale dal
// basso (pattern mobile); da 700px in su diventa una finestra CENTRATA con
// larghezza massima: un bottom-sheet steso su un monitor grande è una striscia
// che mette il titolo a sinistra, la × a destra e due metri di vuoto in mezzo.
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '@/lib/theme';

export function Foglio({
  titolo,
  sottotitolo,
  onClose,
  children,
  largo,
  bloccaSfondo,
}: {
  titolo: string;
  /** Una frase sotto il titolo che spiega cosa si sta facendo (DS: caption). */
  sottotitolo?: string;
  onClose: () => void;
  children: ReactNode;
  /** Finestra più larga (720 invece di 560) per contenuti a colonne. */
  largo?: boolean;
  /** Un form con dati scritti a metà non si chiude toccando fuori per sbaglio. */
  bloccaSfondo?: boolean;
}) {
  const { width } = useWindowDimensions();
  const centrato = width >= 700;
  return (
    <Modal visible transparent animationType={centrato ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable
        style={[styles.overlay, centrato ? styles.overlayCentro : styles.overlayBasso]}
        onPress={bloccaSfondo ? undefined : onClose}
      >
        {/* Il clic DENTRO la finestra non deve chiuderla: si ferma qui. */}
        <Pressable
          style={[styles.foglio, centrato ? [styles.foglioCentro, { maxWidth: largo ? 720 : 560 }] : styles.foglioBasso]}
          onPress={() => {}}
        >
          <View style={styles.testata}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titolo} numberOfLines={2}>{titolo}</Text>
              {sottotitolo ? <Text style={styles.sottotitolo}>{sottotitolo}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Chiudi" style={styles.chiudi}>
              <Ionicons name="close" size={22} color={colors.testoSoft} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  overlayBasso: { justifyContent: 'flex-end' },
  overlayCentro: { justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  foglio: { backgroundColor: colors.bianco, padding: spacing.md, gap: 8 },
  foglioBasso: {
    width: '100%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
  },
  foglioCentro: {
    width: '100%',
    borderRadius: radius.lg,
    maxHeight: '86%',
    ...shadow.float,
  },
  testata: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titolo: { color: colors.navy, fontWeight: '700', fontSize: 19, letterSpacing: -0.3 },
  sottotitolo: { color: colors.testoSoft, fontSize: 13, lineHeight: 18, marginTop: 3 },
  // Tocco comodo anche col mouse: la × in un quadratino che si vede all'hover.
  chiudi: { padding: 4, borderRadius: radius.sm },
});
