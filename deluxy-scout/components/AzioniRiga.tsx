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
  evidenza,
  label,
  onPress,
}: {
  nome: IconName;
  attiva: boolean;
  /** Pieno invece che vuoto: quell'azione è già stata usata su questa riga
   *  (es. la visita è in agenda). Si legge dalla fila, senza aprire la scheda. */
  evidenza?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.icona, !attiva && styles.spenta, evidenza && styles.piena]}
      disabled={!attiva}
      hitSlop={8}
      onPress={(e) => {
        // La scheda intera è premibile: senza questo si aprirebbe il dettaglio.
        (e as any)?.stopPropagation?.();
        onPress();
      }}
      accessibilityLabel={label}
      // Sul web diventa un tooltip: l'etichetta è l'unico posto dove sta
      // scritto per esteso cosa fa il cerchietto.
      {...({ title: label } as any)}
    >
      <Ionicons name={nome} size={18} color={evidenza ? colors.bianco : colors.navy} />
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
  piena: { backgroundColor: colors.ink, borderColor: colors.ink },
});
