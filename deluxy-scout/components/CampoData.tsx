// CAMPO DATA — versione NATIVA (Android/iOS).
//
// Sul web c'è il gemello `CampoData.web.tsx`, che apre il calendario del
// browser. Qui resta il campo scritto a mano, com'era prima: la produzione di
// Scout è solo web (l'APK è una preview interna del 13/07), quindi tirarsi in
// casa una libreria di date picker per un ramo che nessuno usa sarebbe peso
// senza guadagno. Il valore è sempre `AAAA-MM-GG`, lo stesso che vuole il
// database, quindi i due rami restano intercambiabili.
import { StyleSheet, TextInput } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

export interface CampoDataProps {
  /** Data in formato ISO `AAAA-MM-GG`, oppure null/'' se non indicata. */
  valore: string | null;
  onCambia: (iso: string | null) => void;
  placeholder?: string;
}

export function CampoData({ valore, onCambia, placeholder = 'es. 2026-09-15' }: CampoDataProps) {
  return (
    <TextInput
      style={styles.input}
      value={valore ?? ''}
      onChangeText={(t) => onCambia(t.trim() || null)}
      placeholder={placeholder}
      placeholderTextColor={colors.grigio}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.testo,
  },
});
