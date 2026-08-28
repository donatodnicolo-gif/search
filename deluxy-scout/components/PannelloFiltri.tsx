import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touchMin } from '@/lib/theme';
import { RigaChips } from './ui';

/**
 * Contenitore dei filtri di una lista, richiudibile (Libro UX&UI v1.2 §8:
 * il pannello contiene l'ECCEDENZA della zona filtri; la dimensione primaria
 * sta FUORI, come riga a sé, sopra o accanto a questo bottone).
 *
 * I filtri vanno a capo (in orizzontale restavano tagliati fuori schermo), ma
 * così sul telefono occupavano più di una schermata intera prima della prima
 * riga: la sezione diventava inutilizzabile. Qui stanno dietro un bottone.
 *
 * **Chiuso di default su ogni viewport, anche desktop** (scelta utente): la
 * lista si vede subito, i filtri si aprono quando servono. Il numero di filtri
 * attivi è sempre visibile sul bottone, così non si resta con una lista
 * filtrata senza capire perché.
 */
export function PannelloFiltri({
  attivi = 0,
  onAzzera,
  risultati,
  dentroUnBloccoSpaziato,
  primaria,
  children,
}: {
  /** Quanti filtri sono attualmente applicati (0 = nessuno). */
  attivi?: number;
  /** Se passato, compare "Azzera" accanto al bottone quando c'è almeno un filtro. */
  onAzzera?: () => void;
  /**
   * Quante righe mostra la lista col filtro corrente. A pannello APERTO il
   * bottone diventa «Mostra N risultati»: il pannello inline copre la lista e
   * senza questo numero non si vede l'effetto del filtro mentre lo si imposta.
   * ⚠️ Passare la STESSA fonte del ContoRighe, mai un secondo calcolo.
   */
  risultati?: number;
  /**
   * Quando il pannello sta già dentro un contenitore col suo padding
   * (es. la testata di Ordini). ⚠️ Senza, il rientro si SOMMA — stessa
   * trappola documentata su PageIntro.
   */
  dentroUnBloccoSpaziato?: boolean;
  /**
   * La DIMENSIONE PRIMARIA della zona filtri (Libro v1.2 §8): i suoi chip
   * si rendono nella STESSA riga del bottone «Filtri (N)» e vanno a capo
   * insieme — una riga sola invece di due impilate.
   */
  primaria?: ReactNode;
  children: ReactNode;
}) {
  // Chiusi sempre, anche su desktop (scelta utente): la lista si vede subito e
  // i filtri si aprono quando servono. Il conteggio sul bottone dice se ce n'è
  // qualcuno attivo, così una lista ridotta non sembra mai vuota senza motivo.
  const [aperto, setAperto] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={[styles.barra, dentroUnBloccoSpaziato && { paddingHorizontal: 0 }]}>
        {/* La primaria vive in una corsia propria: su mobile scorre (Libro
            v1.3 §8.9) mentre «Filtri (N)» e «Azzera» restano fissi fuori. */}
        {primaria != null ? (
          <View style={styles.corsiaPrimaria}>
            <RigaChips>{primaria}</RigaChips>
          </View>
        ) : null}
        <Pressable
          onPress={() => setAperto((v) => !v)}
          style={[styles.bottone, attivi > 0 && styles.bottoneAttivo]}
          accessibilityLabel={aperto ? 'Nascondi i filtri' : 'Mostra i filtri'}
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={attivi > 0 ? colors.bianco : colors.testo}
          />
          <Text style={[styles.bottoneTxt, attivi > 0 && styles.bottoneTxtAttivo]}>
            {aperto && risultati != null
              ? `Mostra ${risultati} risultat${risultati === 1 ? 'o' : 'i'}`
              : `Filtri${attivi > 0 ? ` (${attivi})` : ''}`}
          </Text>
          <Ionicons
            name={aperto ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={attivi > 0 ? colors.bianco : colors.grigio}
          />
        </Pressable>
        {attivi > 0 && onAzzera ? (
          <Pressable onPress={onAzzera} style={styles.azzera} hitSlop={6}>
            <Ionicons name="close-circle" size={14} color={colors.testoSoft} />
            <Text style={styles.azzeraTxt}>Azzera</Text>
          </Pressable>
        ) : null}
      </View>
      {aperto ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  barra: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  // La corsia prende lo spazio che resta accanto al bottone; minWidth 0
  // permette allo ScrollView interno di stringersi invece di spingere fuori
  // «Filtri (N)».
  corsiaPrimaria: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  bottone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    // Bersaglio touch ≥44px (Libro UX cap.10 §1 / WCAG): prima ~33px.
    minHeight: touchMin,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  bottoneAttivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  bottoneTxt: { color: colors.testo, fontSize: 13, fontWeight: '600' },
  bottoneTxtAttivo: { color: colors.bianco },
  azzera: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  azzeraTxt: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '600' },
});
