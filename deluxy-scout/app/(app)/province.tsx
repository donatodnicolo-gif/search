// Rotta /province — resta come scorciatoia diretta alla copertura.
//
// ⚠️ Il contenuto è tutto in components/CoperturaProvince.tsx, perché la stessa
// tabella vive dentro «Affiliazioni · Copertura»: due copie divergono al primo
// ritocco, e qui è già successo che la stessa regola fosse scritta in due punti.
// Dal menu si arriva alla vista unita; questa rotta serve ai link già in giro.
import { ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, contenutoCentrato } from '@/lib/theme';
import { PageIntro } from '@/components/ui';
import { CoperturaProvince } from '@/components/CoperturaProvince';

export default function Province() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.list, contenutoCentrato]}>
      <PageIntro testo="Tutte le province italiane, comprese quelle dove non abbiamo ancora niente: sono il motivo per cui la schermata esiste. Tocca una provincia per vedere chi c'è da chiamare." />
      <CoperturaProvince />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
});
