import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { Visit } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchVisit } from '@/lib/db';
import { Loader } from '../../_layout';

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_target: 'Non target',
  chiuso: 'Chiuso',
};

export default function DettaglioVisita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setVisit(await fetchVisit(id));
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <Loader />;
  if (!visit) return <Text style={styles.err}>Visita non trovata.</Text>;

  return (
    <>
      <Stack.Screen options={{ title: 'Dettaglio visita' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.data}>{new Date(visit.data).toLocaleString('it-IT')}</Text>
          <View style={styles.esitoPill}>
            <Text style={styles.esitoTxt}>{visit.esito ? LABEL_ESITO[visit.esito] : '—'}</Text>
          </View>
        </View>
        {!visit.hubspot_synced ? <Text style={styles.pendingTxt}>⏳ In attesa di sync HubSpot</Text> : null}

        {visit.linea_proposta ? <Campo label="Linea proposta" valore={visit.linea_proposta} /> : null}
        {visit.cross_sell?.length ? <Campo label="Cross-sell" valore={visit.cross_sell.join(', ')} /> : null}
        <Campo label="Briefing" valore={visit.briefing} />
        <Campo label="Note post meeting" valore={visit.note_post_meeting} />
        <Campo label="Esito e analisi" valore={visit.esito_analisi} />
        <Campo label="Next step" valore={visit.next_step} evidenzia />

        {visit.foto_url ? (
          <>
            <Text style={styles.label}>Foto vetrina</Text>
            <Image source={{ uri: visit.foto_url }} style={styles.foto} resizeMode="cover" />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function Campo({ label, valore, evidenzia }: { label: string; valore: string | null; evidenzia?: boolean }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.valore, evidenzia && styles.valoreEvidenza]}>{valore?.trim() || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  err: { padding: spacing.lg, color: colors.errore },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  data: { fontSize: 15, fontWeight: '800', color: colors.navy },
  esitoPill: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  esitoTxt: { color: colors.bianco, fontWeight: '800', fontSize: 12 },
  pendingTxt: { color: colors.attenzione, fontWeight: '700', marginTop: spacing.xs },
  campo: { marginTop: spacing.md },
  label: { color: colors.oro, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, marginTop: spacing.md },
  valore: { color: colors.testo, fontSize: 15, lineHeight: 21 },
  valoreEvidenza: { fontWeight: '800', color: colors.navy },
  foto: { width: '100%', height: 220, borderRadius: radius.md, marginTop: spacing.xs, backgroundColor: colors.grigioChiaro },
});
