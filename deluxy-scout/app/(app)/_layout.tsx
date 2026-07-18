import { Redirect, router, useNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { colors, radius, spacing } from '@/lib/theme';
import { Loader } from '../_layout';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Icone del menu in stile line-art (SF Symbols), tinta oro/muted dal navigatore.
function DrawerIcon({ name, color, size }: { name: IconName; color: string; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

// Pulsante ☰ nell'header: apre/chiude il menu laterale. Testuale così è
// sempre visibile anche sul web (l'icona di default usa un font non caricato).
function BtnMenu() {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => nav.dispatch(DrawerActions.toggleDrawer())}
      style={styles.headerBtn}
      accessibilityLabel="Apri menu"
    >
      <Ionicons name="menu-outline" size={26} color={colors.testo} />
    </Pressable>
  );
}

// Pulsante ‹ Indietro per le schermate di dettaglio.
function BtnIndietro() {
  return (
    <Pressable onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Indietro">
      <Ionicons name="chevron-back" size={26} color={colors.testo} />
    </Pressable>
  );
}

// Contenuto del drawer con intestazione brand (logo D) + voci.
function ContenutoDrawer(props: any) {
  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.scroll}>
      <View style={styles.brand}>
        <View style={styles.logoQuad}>
          <Text style={styles.logoD}>D</Text>
        </View>
        <View>
          <Text style={styles.logo}>DELUXY</Text>
          <Text style={styles.sub}>Scout</Text>
        </View>
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return <Loader />;
  if (!session) return <Redirect href="/(auth)/login" />;
  const admin = isAdmin(session.user?.email);

  // Schermata di dettaglio: fuori dal menu + freccia indietro al posto del ☰.
  const dettaglio = (title: string) => ({
    title,
    drawerItemStyle: { display: 'none' as const },
    headerLeft: () => <BtnIndietro />,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <ContenutoDrawer {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bianco },
          headerTintColor: colors.testo,
          headerTitleStyle: { fontWeight: '600', letterSpacing: -0.3 },
          headerShadowVisible: false,
          headerLeft: () => <BtnMenu />,
          drawerType: 'front',
          drawerStyle: { backgroundColor: colors.bianco, width: 268, borderRightColor: colors.grigioChiaro },
          drawerActiveTintColor: colors.oro,
          drawerInactiveTintColor: colors.testoSoft,
          drawerActiveBackgroundColor: colors.fillActive,
          drawerLabelStyle: { fontSize: 15, fontWeight: '600', marginLeft: -12 },
          drawerItemStyle: { borderRadius: radius.md, paddingHorizontal: 4 },
        }}
      >
        <Drawer.Screen name="mappa" options={{ title: 'Mappa', drawerIcon: ({ color, size }) => <DrawerIcon name="map-outline" color={color} size={size ?? 22} /> }} />
        <Drawer.Screen name="lista" options={{ title: 'Target', drawerIcon: ({ color, size }) => <DrawerIcon name="flag-outline" color={color} size={size ?? 22} /> }} />
        <Drawer.Screen name="rubrica" options={{ title: 'Rubrica', drawerIcon: ({ color, size }) => <DrawerIcon name="people-outline" color={color} size={size ?? 22} /> }} />
        <Drawer.Screen name="trattative" options={{ title: 'Trattative', drawerIcon: ({ color, size }) => <DrawerIcon name="briefcase-outline" color={color} size={size ?? 22} /> }} />
        <Drawer.Screen name="affiliazioni" options={{ title: 'Affiliazioni', drawerIcon: ({ color, size }) => <DrawerIcon name="git-network-outline" color={color} size={size ?? 22} /> }} />
        <Drawer.Screen name="da-completare" options={{ title: 'Da fare', drawerIcon: ({ color, size }) => <DrawerIcon name="time-outline" color={color} size={size ?? 22} /> }} />
        <Drawer.Screen name="task" options={{ title: 'I miei task', drawerIcon: ({ color, size }) => <DrawerIcon name="checkbox-outline" color={color} size={size ?? 22} /> }} />
        <Drawer.Screen name="dashboard" options={{ title: 'Dashboard', drawerIcon: ({ color, size }) => <DrawerIcon name="stats-chart-outline" color={color} size={size ?? 22} /> }} />
        {/* Team: visibile solo all'amministratore della rete (gate anche nella schermata). */}
        <Drawer.Screen
          name="team"
          options={
            admin
              ? { title: 'Team', drawerIcon: ({ color, size }) => <DrawerIcon name="people-circle-outline" color={color} size={size ?? 22} /> }
              : { drawerItemStyle: { display: 'none' as const } }
          }
        />
        <Drawer.Screen name="profilo" options={{ title: 'Profilo', drawerIcon: ({ color, size }) => <DrawerIcon name="person-outline" color={color} size={size ?? 22} /> }} />

        {/* Rotte di dettaglio: nascoste dal menu, con freccia indietro */}
        <Drawer.Screen name="attivita/[id]" options={dettaglio('Attività')} />
        <Drawer.Screen name="visita/[placeId]" options={dettaglio('Nuova visita')} />
        <Drawer.Screen name="contatto/[placeId]" options={dettaglio('Nuovo contatto')} />
        <Drawer.Screen name="nuovo-target" options={dettaglio('Nuovo target')} />
        <Drawer.Screen name="modifica/[id]" options={dettaglio('Modifica attività')} />
        <Drawer.Screen name="visita-dettaglio/[id]" options={dettaglio('Dettaglio visita')} />
        <Drawer.Screen name="nascosti" options={dettaglio('Nascosti')} />
        <Drawer.Screen name="venditore/[ownerId]" options={dettaglio('Venditore')} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  headerBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  headerIco: { fontSize: 22, color: colors.testo },
  headerFreccia: { fontSize: 30, color: colors.testo, marginTop: -6, fontWeight: '400' },
  scroll: { paddingTop: 0 },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
  },
  logoQuad: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoD: { color: colors.oro, fontSize: 26, fontWeight: '700', fontFamily: 'Georgia, serif' },
  logo: { color: colors.testo, fontSize: 18, fontWeight: '700', letterSpacing: 2 },
  sub: { color: colors.testoSoft, fontSize: 12 },
});
