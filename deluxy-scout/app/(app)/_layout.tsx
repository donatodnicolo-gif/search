import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing } from '@/lib/theme';
import { Loader } from '../_layout';

// Icone testuali semplici (niente dipendenze extra di icon set).
function DrawerIcon({ glifo }: { glifo: string }) {
  return <Text style={{ fontSize: 20 }}>{glifo}</Text>;
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

  const nascosta = { drawerItemStyle: { display: 'none' as const } };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <ContenutoDrawer {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bianco },
          headerTintColor: colors.testo,
          headerTitleStyle: { fontWeight: '600', letterSpacing: -0.3 },
          headerShadowVisible: false,
          drawerType: 'front',
          drawerStyle: { backgroundColor: colors.bianco, width: 268, borderRightColor: colors.grigioChiaro },
          drawerActiveTintColor: colors.oro,
          drawerInactiveTintColor: colors.testoSoft,
          drawerActiveBackgroundColor: colors.fillActive,
          drawerLabelStyle: { fontSize: 15, fontWeight: '600', marginLeft: -12 },
          drawerItemStyle: { borderRadius: radius.md, paddingHorizontal: 4 },
        }}
      >
        <Drawer.Screen name="mappa" options={{ title: 'Mappa', drawerIcon: () => <DrawerIcon glifo="🗺️" /> }} />
        <Drawer.Screen name="lista" options={{ title: 'Target', drawerIcon: () => <DrawerIcon glifo="📋" /> }} />
        <Drawer.Screen name="rubrica" options={{ title: 'Rubrica', drawerIcon: () => <DrawerIcon glifo="📇" /> }} />
        <Drawer.Screen name="trattative" options={{ title: 'Trattative', drawerIcon: () => <DrawerIcon glifo="💼" /> }} />
        <Drawer.Screen name="da-completare" options={{ title: 'Da fare', drawerIcon: () => <DrawerIcon glifo="📝" /> }} />
        <Drawer.Screen name="dashboard" options={{ title: 'Dashboard', drawerIcon: () => <DrawerIcon glifo="📊" /> }} />
        <Drawer.Screen name="profilo" options={{ title: 'Profilo', drawerIcon: () => <DrawerIcon glifo="👤" /> }} />

        {/* Rotte di dettaglio: raggiungibili via navigazione, nascoste dal menu */}
        <Drawer.Screen name="attivita/[id]" options={{ ...nascosta, title: 'Attività' }} />
        <Drawer.Screen name="visita/[placeId]" options={{ ...nascosta, title: 'Nuova visita' }} />
        <Drawer.Screen name="contatto/[placeId]" options={{ ...nascosta, title: 'Nuovo contatto' }} />
        <Drawer.Screen name="nuovo-target" options={{ ...nascosta, title: 'Nuovo target' }} />
        <Drawer.Screen name="modifica/[id]" options={{ ...nascosta, title: 'Modifica attività' }} />
        <Drawer.Screen name="visita-dettaglio/[id]" options={{ ...nascosta, title: 'Dettaglio visita' }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
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
