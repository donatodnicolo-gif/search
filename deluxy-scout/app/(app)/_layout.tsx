import { Redirect, router, useNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { usePreferiti, rimuoviPreferito } from '@/lib/preferiti';
import { colors, radius, spacing } from '@/lib/theme';
import { Loader } from '../_layout';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Menu raggruppato per FLUSSO DI LAVORO commerciale (DS: sezioni con etichetta
// MAIUSCOLA). L'ordine segue la giornata del venditore: cosa fai oggi →
// trovi i clienti → li porti avanti → misuri → account.
type Voce = { name: string; label: string; icon: IconName; soloAdmin?: boolean; route?: string; params?: Record<string, string> };
// Il menù segue il flusso di vendita (docs/VISIONE-COMMERCIALE.md):
// cosa faccio ORA → i CANALI dove nascono le occasioni → la VENDITA (funnel:
// trattative → ordini → clienti) → gli strumenti di supporto → i risultati.
const SEZIONI: { titolo: string; voci: Voce[] }[] = [
  {
    titolo: 'Vendere oggi',
    voci: [
      { name: 'oggi', label: 'Oggi', icon: 'sunny-outline' },
      { name: 'da-completare', label: 'Da fare', icon: 'time-outline' },
    ],
  },
  {
    // I 3 canali di acquisizione: territorio, telefono, web.
    titolo: 'Canali',
    voci: [
      { name: 'mappa', label: 'Territorio · Mappa', icon: 'map-outline' },
      { name: 'affiliazioni', label: 'Chiamate · Affiliazioni', icon: 'call-outline' },
      { name: 'lead', label: 'Richieste Web', icon: 'globe-outline' },
    ],
  },
  {
    // I livelli del rapporto (lib/livelli.ts), ognuno la sua area: prospect
    // (scelto, da contattare) → lead (contatto avviato) → cliente. Dormienti e
    // persi stanno insieme in una scheda a parte: sono i rapporti da riattivare.
    titolo: 'Contatti',
    voci: [
      { name: 'lista-prospect', route: 'lista', params: { vista: 'prospect' }, label: 'Selezionati', icon: 'star-outline' },
      { name: 'lista-lead', route: 'lista', params: { vista: 'lead' }, label: 'Prospect', icon: 'people-outline' },
      { name: 'clienti', label: 'Clienti', icon: 'storefront-outline' },
      { name: 'lista-inattivi', route: 'lista', params: { vista: 'inattivi' }, label: 'Dormienti e persi', icon: 'moon-outline' },
    ],
  },
  {
    titolo: 'Vendita',
    voci: [
      { name: 'trattative', label: 'Trattative', icon: 'briefcase-outline' },
      { name: 'ordini', label: 'Ordini', icon: 'receipt-outline' },
      { name: 'pagamenti', label: 'Pagamenti', icon: 'wallet-outline' },
    ],
  },
  {
    titolo: 'Strumenti',
    voci: [
      { name: 'rubrica', label: 'Rubrica', icon: 'people-outline' },
      { name: 'script', label: 'Script', icon: 'mail-outline' },
      { name: 'task', label: 'I miei task', icon: 'checkmark-circle-outline' },
      { name: 'calendario', label: 'Calendario', icon: 'calendar-outline' },
    ],
  },
  {
    titolo: 'Andamento',
    voci: [
      { name: 'dashboard', label: 'Dashboard', icon: 'analytics-outline' },
      { name: 'storico', label: 'Storico', icon: 'time-outline' },
      { name: 'team', label: 'Team', icon: 'people-circle-outline', soloAdmin: true },
    ],
  },
  {
    titolo: 'Account',
    voci: [{ name: 'profilo', label: 'Profilo', icon: 'person-outline' }],
  },
];

// Pulsante ☰ nell'header. Su desktop la sidebar è permanente: il pulsante la
// COLLASSA (solo icone) o la ESPANDE (icone + testo). Su mobile apre/chiude
// l'overlay. Testuale così è sempre visibile anche sul web.
function BtnMenu({ isWide, onToggleEspansa }: { isWide: boolean; onToggleEspansa: () => void }) {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => (isWide ? onToggleEspansa() : nav.dispatch(DrawerActions.toggleDrawer()))}
      style={styles.headerBtn}
      accessibilityLabel={isWide ? 'Espandi/riduci menu' : 'Apri menu'}
    >
      <Ionicons name="menu-outline" size={26} color={colors.testo} />
    </Pressable>
  );
}

// Una voce del menu: riga icona + testo (spazio corretto). In modalità rail
// (collassata) mostra solo l'icona centrata. Attiva = sfondo fill-active +
// icona/testo oro.
function VoceMenu({
  voce,
  focused,
  espansa,
  onPress,
}: {
  voce: Voce;
  focused: boolean;
  espansa: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={voce.label}
      style={[styles.voce, espansa ? styles.voceEspansa : styles.voceRail, focused && styles.voceOn]}
    >
      <Ionicons name={voce.icon} size={20} color={focused ? colors.oro : colors.testoSoft} />
      {espansa ? (
        <Text style={[styles.voceLabel, focused && styles.voceLabelOn]} numberOfLines={1}>
          {voce.label}
        </Text>
      ) : null}
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

// Sotto-menu "Preferiti": gli indirizzi salvati dalla Mappa. Tap = apre la Mappa
// centrata lì; la × lo rimuove. Non compare se non ce ne sono.
function SezionePreferiti({ onVai }: { onVai: (p: { lat: number; lng: number; indirizzo: string }) => void }) {
  const preferiti = usePreferiti();
  if (!preferiti.length) return null;
  return (
    <View style={styles.prefWrap}>
      {preferiti.map((p) => (
        <View key={p.id} style={styles.prefRow}>
          <Pressable style={styles.prefTap} onPress={() => onVai({ lat: p.lat, lng: p.lng, indirizzo: p.indirizzo })}>
            <Ionicons name="bookmark" size={14} color={colors.oro} />
            <Text style={styles.prefLabel} numberOfLines={1}>{p.etichetta}</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => rimuoviPreferito(p.id)} accessibilityLabel="Rimuovi preferito">
            <Ionicons name="close" size={15} color={colors.testoSoft} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// Contenuto del drawer: brand (logo D) + voci raggruppate per sezione (etichetta
// MAIUSCOLA, DS) + footer utente (avatar iniziali, nome/ruolo, logout). La voce
// Team compare solo all'amministratore della rete.
function ContenutoDrawer({ admin, espansa = true, onToggle, ...props }: any) {
  const { session, signOut } = useAuth();
  const state = props.state;
  const rottaCorrente = state?.routes?.[state.index];
  const attuale: string | undefined = rottaCorrente?.name;
  // Vista corrente della pagina /lista (prospect/lead/inattivi), per accendere
  // la voce giusta quando più voci puntano alla stessa schermata.
  const vistaCorrente: string | undefined = (rottaCorrente?.params as any)?.vista;
  // Una voce è "attiva" se combacia la schermata e — quando c'è — anche la vista.
  const voceAttiva = (v: Voce) => {
    const rotta = v.route ?? v.name;
    if (rotta !== attuale) return false;
    if (v.params?.vista) return v.params.vista === vistaCorrente;
    // Voci senza vista (es. Clienti) non devono accendersi su una lista con vista.
    return rotta !== 'lista' || !vistaCorrente;
  };
  const email = session?.user?.email ?? '';
  const iniziali = email ? email.replace(/@.*/, '').slice(0, 2).toUpperCase() : 'DX';
  const nome = email ? email.replace(/@.*/, '') : 'Utente';

  return (
    <View style={styles.drawerRoot}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.scroll}>
        {/* Brand + toggle collassa (solo desktop, quando onToggle è passato) */}
        <View style={[styles.brand, !espansa && styles.brandRail]}>
          <View style={styles.logoQuad}>
            <Text style={styles.logoD}>D</Text>
          </View>
          {espansa ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.logo}>DELUXY</Text>
              <Text style={styles.sub}>Scout</Text>
            </View>
          ) : null}
          {onToggle ? (
            <Pressable onPress={onToggle} hitSlop={8} style={styles.collassaBtn} accessibilityLabel={espansa ? 'Riduci menu' : 'Espandi menu'}>
              <Ionicons name={espansa ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.testoSoft} />
            </Pressable>
          ) : null}
        </View>

        {SEZIONI.map((sez) => {
          const voci = sez.voci.filter((v) => !v.soloAdmin || admin);
          if (!voci.length) return null;
          return (
            <View key={sez.titolo} style={styles.sezione}>
              {espansa ? <Text style={styles.sezioneTitolo}>{sez.titolo}</Text> : <View style={styles.railDivider} />}
              {voci.map((v) => (
                <View key={v.name}>
                  <VoceMenu voce={v} focused={voceAttiva(v)} espansa={espansa} onPress={() => props.navigation.navigate(v.route ?? v.name, v.params)} />
                  {/* Preferiti: annidati sotto la voce "Mappa" (solo a menu espanso). */}
                  {v.name === 'mappa' && espansa ? (
                    <SezionePreferiti onVai={(p) => props.navigation.navigate('mappa', { lat: String(p.lat), lng: String(p.lng), indirizzo: p.indirizzo })} />
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
      </DrawerContentScrollView>

      {/* Footer utente (DS): avatar iniziali su gold-soft, nome + ruolo, logout. */}
      <View style={[styles.footer, !espansa && styles.footerRail]}>
        <Pressable style={[styles.utente, espansa && { flex: 1 }]} onPress={() => props.navigation.navigate('profilo')} accessibilityLabel="Profilo">
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{iniziali}</Text>
          </View>
          {espansa ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.utenteNome} numberOfLines={1}>{nome}</Text>
              <Text style={styles.utenteRuolo}>{admin ? 'Amministratore' : 'Venditore'}</Text>
            </View>
          ) : null}
        </Pressable>
        {espansa ? (
          <Pressable style={styles.logoutBtn} onPress={signOut} accessibilityLabel="Esci">
            <Ionicons name="log-out-outline" size={20} color={colors.testoSoft} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 900; // desktop: sidebar permanente, collassabile a rail
  const [espansaState, setEspansaState] = useState(true);
  if (loading) return <Loader />;
  if (!session) return <Redirect href="/(auth)/login" />;
  const admin = isAdmin(session.user?.email);

  // Su mobile la sidebar è un overlay: quando aperta è sempre espansa.
  const espansa = isWide ? espansaState : true;
  const toggleEspansa = () => setEspansaState((v) => !v);

  // Schermata di dettaglio: fuori dal menu + freccia indietro al posto del ☰.
  const dettaglio = (title: string) => ({
    title,
    drawerItemStyle: { display: 'none' as const },
    headerLeft: () => <BtnIndietro />,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        // Default del Drawer = 'firstRoute': il back tornava SEMPRE alla prima
        // schermata ("Oggi"). Con 'history' torna all'ultima visitata davvero,
        // così ‹ Indietro riporta alla schermata precedente per tutte le rotte.
        backBehavior="history"
        drawerContent={(props) => <ContenutoDrawer {...props} admin={admin} espansa={espansa} onToggle={isWide ? toggleEspansa : undefined} />}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bianco },
          headerTintColor: colors.testo,
          headerTitleStyle: { fontWeight: '600', letterSpacing: -0.3 },
          headerShadowVisible: false,
          headerLeft: () => <BtnMenu isWide={isWide} onToggleEspansa={toggleEspansa} />,
          // Desktop: permanente (sempre visibile, collassa a rail). Mobile: overlay.
          drawerType: isWide ? 'permanent' : 'front',
          drawerStyle: { backgroundColor: colors.bianco, width: isWide && !espansaState ? 76 : 264, borderRightWidth: 1, borderRightColor: colors.grigioChiaro },
        }}
      >
        {/* L'ordine e le icone del menu sono definiti in SEZIONI (drawer content). */}
        <Drawer.Screen name="oggi" options={{ title: 'Oggi' }} />
        <Drawer.Screen name="task" options={{ title: 'I miei task' }} />
        <Drawer.Screen name="calendario" options={{ title: 'Calendario' }} />
        <Drawer.Screen name="da-completare" options={{ title: 'Da fare' }} />
        <Drawer.Screen name="mappa" options={{ title: 'Mappa' }} />
        <Drawer.Screen name="lista" options={{ title: 'Prospect e Lead' }} />
        <Drawer.Screen name="rubrica" options={{ title: 'Rubrica' }} />
        <Drawer.Screen name="script" options={{ title: 'Script' }} />
        <Drawer.Screen name="trattative" options={{ title: 'Trattative' }} />
        <Drawer.Screen name="ordini" options={{ title: 'Ordini' }} />
        <Drawer.Screen name="lead" options={{ title: 'Richieste Web' }} />
        <Drawer.Screen name="clienti" options={{ title: 'Clienti' }} />
        <Drawer.Screen name="affiliazioni" options={{ title: 'Affiliazioni' }} />
        <Drawer.Screen name="pagamenti" options={{ title: 'Pagamenti' }} />
        <Drawer.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Drawer.Screen name="storico" options={{ title: 'Storico' }} />
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
        <Drawer.Screen name="impostazioni" options={dettaglio('Impostazioni')} />
        <Drawer.Screen name="email-config" options={dettaglio('Email')} />
        <Drawer.Screen name="linee-interesse" options={dettaglio('Linee di interesse')} />
        <Drawer.Screen name="venditore/[ownerId]" options={dettaglio('Venditore')} />
        <Drawer.Screen name="invio/[scriptId]" options={dettaglio('Invio email')} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  headerBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  drawerRoot: { flex: 1, backgroundColor: colors.bianco },
  scroll: { paddingTop: 0, paddingBottom: spacing.sm },
  // Sezioni del menu (etichetta MAIUSCOLA DS + voci).
  sezione: { marginTop: spacing.sm, marginBottom: 2 },
  sezioneTitolo: {
    color: colors.testoSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    marginBottom: 4,
  },
  // Voce: riga icona + testo con spazio corretto. Rail = solo icona centrata.
  voce: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, marginHorizontal: 8, marginVertical: 1 },
  voceEspansa: { gap: spacing.sm, paddingHorizontal: 12, paddingVertical: 10 },
  voceRail: { justifyContent: 'center', paddingVertical: 11, marginHorizontal: 10 },
  voceOn: { backgroundColor: colors.fillActive },
  voceLabel: { fontSize: 14, fontWeight: '600', color: colors.testoSoft, letterSpacing: -0.1 },
  voceLabelOn: { color: colors.oro, fontWeight: '700' },
  railDivider: { height: 1, backgroundColor: colors.grigioChiaro, marginHorizontal: 14, marginBottom: 4, marginTop: 2 },
  // Preferiti annidati sotto "Mappa": rientrati, con filo verticale a sinistra.
  prefWrap: { marginLeft: 24, marginRight: 8, borderLeftWidth: 1, borderLeftColor: colors.grigioChiaro, paddingLeft: 6, marginBottom: 2 },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.sm },
  prefTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  prefLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.testoSoft, letterSpacing: -0.1 },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
  },
  brandRail: { justifyContent: 'center', paddingHorizontal: 0, gap: 4 },
  collassaBtn: { padding: 6, borderRadius: radius.sm },
  logoQuad: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoD: { color: colors.oro, fontSize: 25, fontWeight: '700', fontFamily: 'Georgia, serif' },
  logo: { color: colors.testo, fontSize: 17, fontWeight: '700', letterSpacing: 2 },
  sub: { color: colors.testoSoft, fontSize: 12 },
  // Footer utente (DS): avatar iniziali su gold-soft + nome/ruolo + logout.
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  footerRail: { justifyContent: 'center', paddingHorizontal: 0 },
  utente: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: colors.goldStrong, fontWeight: '800', fontSize: 13 },
  utenteNome: { color: colors.testo, fontWeight: '600', fontSize: 13.5, textTransform: 'capitalize' },
  utenteRuolo: { color: colors.testoSoft, fontSize: 11.5 },
  logoutBtn: { padding: 8, borderRadius: radius.sm },
});
