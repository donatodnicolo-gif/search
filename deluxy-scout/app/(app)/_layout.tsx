import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { Loader } from '../_layout';

// Icone testuali semplici (niente dipendenze extra di icon set).
function TabIcon({ glifo, color }: { glifo: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{glifo}</Text>;
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return <Loader />;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.bianco,
        headerTitleStyle: { fontWeight: '800' },
        tabBarActiveTintColor: colors.oro,
        tabBarInactiveTintColor: colors.grigio,
        tabBarStyle: { backgroundColor: colors.bianco },
      }}
    >
      <Tabs.Screen
        name="mappa"
        options={{
          title: 'Mappa',
          tabBarIcon: ({ color }) => <TabIcon glifo="🗺️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="lista"
        options={{
          title: 'Target',
          tabBarIcon: ({ color }) => <TabIcon glifo="📋" color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <TabIcon glifo="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profilo"
        options={{
          title: 'Profilo',
          tabBarIcon: ({ color }) => <TabIcon glifo="👤" color={color} />,
        }}
      />
      {/* Rotte di dettaglio: raggiungibili via navigazione, non come tab. */}
      <Tabs.Screen name="attivita/[id]" options={{ href: null, title: 'Attività' }} />
      <Tabs.Screen name="visita/[placeId]" options={{ href: null, title: 'Nuova visita' }} />
      <Tabs.Screen name="contatto/[placeId]" options={{ href: null, title: 'Nuovo contatto' }} />
      <Tabs.Screen name="nuovo-target" options={{ href: null, title: 'Nuovo target' }} />
      <Tabs.Screen name="modifica/[id]" options={{ href: null, title: 'Modifica attività' }} />
      <Tabs.Screen name="visita-dettaglio/[id]" options={{ href: null, title: 'Dettaglio visita' }} />
    </Tabs>
  );
}
