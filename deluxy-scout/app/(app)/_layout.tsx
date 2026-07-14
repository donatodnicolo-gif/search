import { Redirect, router, useNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DrawerActions } from '@react-navigation/native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing } from '@/lib/theme';
import { Loader } from '../_layout';

// Icone testuali semplici (niente dipendenze extra di icon set).
function DrawerIcon({ glifo }: { glifo: string }) {
  return <Text style={{ fontSize: 20 }}>{glifo}</Text>;
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
      <Text style={styles.headerIco}>☰</Text>
    </Pressable>
  );
}

// Pulsante ‹ Indietro per le schermate di dettaglio.
function BtnIndietro() {
  return (
    <Pressable onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Indietro">
      <Text style={styles.headerFreccia}>‹</Text>
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
        <Drawer.Screen name="mappa" options={{ title: 'Mappa', drawerIcon: () => <DrawerIcon glifo="🗺️" /> }} />
        <Drawer.Screen name="lista" options={{ title: 'Target', drawerIcon: () => <DrawerIcon glifo="📋" /> }} />
        <Drawer.Screen name="rubrica" options={{ title: 'Rubrica', drawerIcon: () => <DrawerIcon glifo="📇" /> }} />
        <Drawer.Screen name="trattative" options={{ title: 'Trattative', drawerIcon: () => <DrawerIcon glifo="💼" /> }} />
        <Drawer.Screen name="da-completare" options={{ title: 'Da fare', drawerIcon: () => <DrawerIcon glifo="📝" /> }} />
        <Drawer.Screen name="dashboard" options={{ title: 'Dashboard', drawerIcon: () => <DrawerIcon glifo="📊" /> }} />
        <Drawer.Screen name="profilo" options={{ title: 'Profilo', drawerIcon: () => <DrawerIcon glifo="👤" /> }} />

        {/* Rotte di dettaglio: nascoste dal menu, con freccia indietro */}
        <Drawer.Screen name="attivita/[id]" options={dettaglio('Attività')} />
        <Drawer.Screen name="visita/[placeId]" options={dettaglio('Nuova visita')} />
        <Drawer.Screen name="contatto/[placeId]" options={dettaglio('Nuovo contatto')} />
        <Drawer.Screen name="nuovo-target" options={dettaglio('Nuovo target')} />
        <Drawer.Screen name="modifica/[id]" options={dettaglio('Modifica attività')} />
        <Drawer.Screen name="visita-dettaglio/[id]" options={dettaglio('Dettaglio visita')} />
        <Drawer.Screen name="nascosti" options={dettaglio('Nascosti')} />
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
