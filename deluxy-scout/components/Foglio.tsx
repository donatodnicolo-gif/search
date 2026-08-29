// Foglio — il contenitore unico delle finestre dell'app (DS §Componenti: card
// surface, radius-l, shadow-float). Su schermo stretto è un foglio che sale dal
// basso (pattern mobile); da 700px in su diventa una finestra CENTRATA con
// larghezza massima: un bottom-sheet steso su un monitor grande è una striscia
// che mette il titolo a sinistra, la × a destra e due metri di vuoto in mezzo.
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
          {/* ⚠️ IL CONTENUTO SCORRE (27/08/2026). Prima i `children` stavano
              nudi qui dentro, e il foglio ha un tetto d'altezza (88% dello
              schermo): tutto quello che non ci stava usciva dal bordo e
              diventava IRRAGGIUNGIBILE — il Modal è `position: fixed`, quindi
              nemmeno la pagina sotto scorreva. Sul telefono il foglio di
              modifica di un ordine sforava di ~61px (109 con il negozio
              collegato): fuori restava per intero il bottone «Salva le
              modifiche», cioè la schermata non si poteva usare.
              Sta qui e non nei singoli fogli perché il tetto è di QUESTO
              componente: metterlo di là voleva dire ricordarselo ogni volta —
              e infatti quattro fogli su undici se l'erano dimenticato.
              `keyboardShouldPersistTaps`: senza, il primo tocco su un bottone
              serve solo a chiudere la tastiera. */}
          <ScrollView
            style={styles.corpo}
            contentContainerStyle={styles.corpoDentro}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim },
  overlayBasso: { justifyContent: 'flex-end' },
  overlayCentro: { justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  // ⚠️ Il padding sta nel CORPO, non nel foglio: se stesse qui, scorrendo il
  // contenuto si vedrebbe il bordo inferiore staccarsi dal testo.
  foglio: { backgroundColor: colors.bianco, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: 8 },
  // `flexShrink: 1` è ciò che fa rispettare il tetto d'altezza al corpo:
  // senza, la View cresce col contenuto e lo scroll non si attiva mai.
  corpo: { flexShrink: 1 },
  corpoDentro: { gap: 8, paddingBottom: spacing.lg },
  foglioBasso: {
    width: '100%',
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    maxHeight: '88%',
  },
  foglioCentro: {
    width: '100%',
    borderRadius: radius.l,
    maxHeight: '86%',
    ...shadow.float,
  },
  testata: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titolo: { color: colors.navy, fontWeight: '700', fontSize: 19, letterSpacing: -0.3 },
  sottotitolo: { color: colors.testoSoft, fontSize: 13, lineHeight: 18, marginTop: 3 },
  // Tocco comodo anche col mouse: la × in un quadratino che si vede all'hover.
  chiudi: { padding: 4, borderRadius: radius.s },
});
