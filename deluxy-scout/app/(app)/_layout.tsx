import { Redirect, router, useNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { colors, radius, spacing } from '@/lib/theme';
import { Loader } from '../_layout';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Menu raggruppato per FLUSSO DI LAVORO commerciale (DS: sezioni con etichetta
// MAIUSCOLA). L'ordine segue la giornata del venditore: cosa fai oggi →
// trovi i clienti → li porti avanti → misuri → account.
type Voce = { name: string; label: string; icon: IconName; soloAdmin?: boolean };
const SEZIONI: { titolo: string; voci: Voce[] }[] = [
  {
    titolo: 'Operatività',
    voci: [
      { name: 'oggi', label: 'Oggi', icon: 'sunny-outline' },
      { name: 'task', label: 'I miei task', icon: 'checkbox-outline' },
      { name: 'calendario', label: 'Calendario', icon: 'calendar-outline' },
      { name: 'da-completare', label: 'Da fare', icon: 'time-outline' },
    ],
  },
  {
    titolo: 'Prospezione',
    voci: [
      { name: 'mappa', label: 'Mappa', icon: 'map-outline' },
      { name: 'lista', label: 'Target', icon: 'flag-outline' },
      { name: 'rubrica', label: 'Rubrica', icon: 'people-outline' },
      { name: 'script', label: 'Script', icon: 'document-text-outline' },
    ],
  },
  {
    titolo: 'Pipeline',
    voci: [
      { name: 'trattative', label: 'Trattative', icon: 'briefcase-outline' },
      { name: 'affiliazioni', label: 'Affiliazioni', icon: 'git-network-outline' },
      { name: 'pagamenti', label: 'Pagamenti', icon: 'cash-outline' },
    ],
  },
  {
    titolo: 'Andamento',
    voci: [
      { name: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
      { name: 'team', label: 'Team', icon: 'people-circle-outline', soloAdmin: true },
    ],
  },
  {
    titolo: 'Account',
    voci: [{ name: 'profilo', label: 'Profilo', icon: 'person-outline' }],
  },
];

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

// Contenuto del drawer: intestazione brand (logo D) + voci raggruppate per
// sezione, con etichetta MAIUSCOLA (Design System). La voce Team compare solo
// all'amministratore della rete.
function ContenutoDrawer({ admin, ...props }: any) {
  const state = props.state;
  const attuale: string | undefined = state?.routes?.[state.index]?.name;
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
      {SEZIONI.map((sez) => {
        const voci = sez.voci.filter((v) => !v.soloAdmin || admin);
        if (!voci.length) return null;
        return (
          <View key={sez.titolo} style={styles.sezione}>
            <Text style={styles.sezioneTitolo}>{sez.titolo}</Text>
            {voci.map((v) => (
              <DrawerItem
                key={v.name}
                label={v.label}
                focused={attuale === v.name}
                onPress={() => props.navigation.navigate(v.name)}
                icon={({ color, size }) => <Ionicons name={v.icon} size={size ?? 22} color={color} />}
                activeTintColor={colors.oro}
                inactiveTintColor={colors.testoSoft}
                activeBackgroundColor={colors.fillActive}
                labelStyle={styles.voceLabel}
                style={styles.voce}
              />
            ))}
          </View>
        );
      })}
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
        drawerContent={(props) => <ContenutoDrawer {...props} admin={admin} />}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bianco },
          headerTintColor: colors.testo,
          headerTitleStyle: { fontWeight: '600', letterSpacing: -0.3 },
          headerShadowVisible: false,
          headerLeft: () => <BtnMenu />,
          drawerType: 'front',
          drawerStyle: { backgroundColor: colors.bianco, width: 268, borderRightColor: colors.grigioChiaro },
        }}
      >
        {/* L'ordine e le icone del menu sono definiti in SEZIONI (drawer content). */}
        <Drawer.Screen name="oggi" options={{ title: 'Oggi' }} />
        <Drawer.Screen name="task" options={{ title: 'I miei task' }} />
        <Drawer.Screen name="calendario" options={{ title: 'Calendario' }} />
        <Drawer.Screen name="da-completare" options={{ title: 'Da fare' }} />
        <Drawer.Screen name="mappa" options={{ title: 'Mappa' }} />
        <Drawer.Screen name="lista" options={{ title: 'Target' }} />
        <Drawer.Screen name="rubrica" options={{ title: 'Rubrica' }} />
        <Drawer.Screen name="script" options={{ title: 'Script' }} />
        <Drawer.Screen name="trattative" options={{ title: 'Trattative' }} />
        <Drawer.Screen name="affiliazioni" options={{ title: 'Affiliazioni' }} />
        <Drawer.Screen name="pagamenti" options={{ title: 'Pagamenti' }} />
        <Drawer.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Drawer.Screen name="team" options={{ title: 'Team' }} />
        <Drawer.Screen name="profilo" options={{ title: 'Profilo' }} />

        {/* Rotte di dettaglio: nascoste dal menu, con freccia indietro */}
        <Drawer.Screen name="attivita/[id]" options={dettaglio('Attività')} />
        <Drawer.Screen name="visita/[placeId]" options={dettaglio('Nuova visita')} />
        <Drawer.Screen name="contatto/[placeId]" options={dettaglio('Nuovo contatto')} />
        <Drawer.Screen name="nuovo-target" options={dettaglio('Nuovo target')} />
        <Drawer.Screen name="modifica/[id]" options={dettaglio('Modifica attività')} />
        <Drawer.Screen name="visita-dettaglio/[id]" options={dettaglio('Dettaglio visita')} />
        <Drawer.Screen name="nascosti" options={dettaglio('Nascosti')} />
        <Drawer.Screen name="email-config" options={dettaglio('Email')} />
        <Drawer.Screen name="venditore/[ownerId]" options={dettaglio('Venditore')} />
        <Drawer.Screen name="invio/[scriptId]" options={dettaglio('Invio email')} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  headerBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  scroll: { paddingTop: 0, paddingBottom: spacing.lg },
  // Sezioni del menu (etichetta MAIUSCOLA DS + voci).
  sezione: { marginTop: spacing.sm, marginBottom: 2 },
  sezioneTitolo: {
    color: colors.testoSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    marginBottom: 2,
  },
  voce: { borderRadius: radius.md, marginHorizontal: 4, marginVertical: 0 },
  voceLabel: { fontSize: 15, fontWeight: '600', marginLeft: -12 },
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
