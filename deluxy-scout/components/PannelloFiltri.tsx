import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * Contenitore dei filtri di una lista, richiudibile.
 *
 * I filtri vanno a capo (in orizzontale restavano tagliati fuori schermo), ma
 * così sul telefono occupavano più di una schermata intera prima della prima
 * riga: la sezione diventava inutilizzabile. Qui stanno dietro un bottone.
 *
 * Di default: **chiusi sul telefono**, aperti da 900px in su (dove c'è spazio
 * e la sidebar è già permanente). Il numero di filtri attivi è sempre visibile
 * sul bottone, così non si resta con una lista filtrata senza capire perché.
 */
export function PannelloFiltri({
  attivi = 0,
  onAzzera,
  children,
}: {
  /** Quanti filtri sono attualmente applicati (0 = nessuno). */
  attivi?: number;
  /** Se passato, compare "Azzera" accanto al bottone quando c'è almeno un filtro. */
  onAzzera?: () => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const schermoLargo = width >= 900;
  const [aperto, setAperto] = useState(schermoLargo);

  return (
    <View style={styles.wrap}>
      <View style={styles.barra}>
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
            Filtri{attivi > 0 ? ` (${attivi})` : ''}
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
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  bottone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
