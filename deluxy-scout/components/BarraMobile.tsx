// Barra di navigazione in basso, SOLO su schermo stretto (DS §Navigazione:
// «Mobile: la sidebar diventa tab bar o menu»). Sul telefono il menu dietro
// l'hamburger costringe a due tocchi fuori portata di pollice per le quattro
// schermate che un venditore apre tutto il giorno: qui stanno a un tocco.
// La quinta voce apre il menu completo (il drawer di sempre, che resta).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/lib/theme';
import { apriMenu } from '@/lib/navRef';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const VOCI: { rotta: string; label: string; icon: IconName }[] = [
  { rotta: '/oggi', label: 'Oggi', icon: 'sunny-outline' },
  { rotta: '/mappa', label: 'Mappa', icon: 'map-outline' },
  { rotta: '/trattative', label: 'Trattative', icon: 'briefcase-outline' },
  { rotta: '/lead', label: 'Richieste', icon: 'globe-outline' },
];

export function BarraMobile() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barra, { paddingBottom: Math.max(insets.bottom, 4) }]}>
      {VOCI.map((v) => {
        // Prefisso, non uguaglianza: dentro un dettaglio raggiunto da una tab
        // l'indicatore attivo non si spegne (Libro §2).
        const attiva = pathname === v.rotta || pathname.startsWith(`${v.rotta}/`);
        return (
          <Pressable
            key={v.rotta}
            style={styles.voce}
            onPress={() => router.navigate(v.rotta as any)}
            accessibilityRole="button"
            accessibilityLabel={v.label}
            accessibilityState={{ selected: attiva }}
          >
            <Ionicons name={v.icon} size={22} color={attiva ? colors.oro : colors.testoSoft} />
            <Text style={[styles.label, attiva && styles.labelOn]} numberOfLines={1}>{v.label}</Text>
          </Pressable>
        );
      })}
      <Pressable style={styles.voce} onPress={apriMenu} accessibilityRole="button" accessibilityLabel="Apri il menu completo">
        <Ionicons name="menu-outline" size={22} color={colors.testoSoft} />
        <Text style={styles.label}>Menu</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    backgroundColor: colors.bianco,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
    paddingTop: 6,
    paddingHorizontal: spacing.xs,
  },
  // Tocco da 44pt e passa: tutta la colonna è premibile, non solo l'icona.
  voce: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  label: { fontSize: 11.5, fontWeight: '500', color: colors.testoSoft },
  // Attiva = icona oro + peso: la label resta testo (DS: oro solo accento).
  labelOn: { color: colors.testo, fontWeight: '600' },
});
