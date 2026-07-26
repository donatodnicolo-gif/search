import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Le azioni rapide in fondo a una scheda di elenco: cerchietti allineati a
 * destra. Erano nate in Clienti; stanno qui perché **Prospect e Clienti devono
 * avere lo stesso identico stile** (richiesta utente) e con due copie separate
 * sarebbero tornati a divergere al primo ritocco.
 */
export function AzioniRiga({ children }: { children: ReactNode }) {
  return <View style={styles.riga}>{children}</View>;
}

/** Un singolo cerchietto. Se `attiva` è falsa resta visibile ma spento. */
export function IconaAzione({
  nome,
  attiva,
  label,
  onPress,
}: {
  nome: IconName;
  attiva: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.icona, !attiva && styles.spenta]}
      disabled={!attiva}
      hitSlop={8}
      onPress={(e) => {
        // La scheda intera è premibile: senza questo si aprirebbe il dettaglio.
        (e as any)?.stopPropagation?.();
        onPress();
      }}
      accessibilityLabel={label}
    >
      <Ionicons name={nome} size={18} color={colors.navy} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  riga: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  icona: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.sfondo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spenta: { opacity: 0.35 },
});
