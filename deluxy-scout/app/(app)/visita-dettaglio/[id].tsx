import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { Visit } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchVisit } from '@/lib/db';
import { StatusBadge } from '@/components/ui';
import { Loader } from '../../_layout';

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_target: 'Non target',
  chiuso: 'Chiuso',
};

// Colore semantico DS per l'esito visita (badge a pillola con dot).
const COLORE_ESITO: Record<string, string> = {
  interessato: colors.successo,
  da_richiamare: colors.attenzione,
  non_target: colors.grigio,
  chiuso: colors.blue,
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
          <StatusBadge
            label={visit.esito ? LABEL_ESITO[visit.esito] ?? visit.esito : '—'}
            colore={visit.esito ? COLORE_ESITO[visit.esito] ?? colors.grigio : colors.grigio}
          />
        </View>
        {!visit.hubspot_synced ? (
          <Text style={styles.pendingTxt}>
            <Ionicons name="time-outline" size={13} color={colors.attenzione} /> In attesa di invio a HubSpot
          </Text>
        ) : null}

        {/* I motivi della visita (migr. 0053). Le visite di prima hanno solo
            `linea_proposta`: si mostra quella, senza far sparire lo storico. */}
        {visit.motivi?.length ? (
          <Campo label="Motivo della visita" valore={visit.motivi.join(', ')} />
        ) : visit.linea_proposta ? (
          <Campo label="Motivo della visita" valore={visit.linea_proposta} />
        ) : null}
        {visit.cross_sell?.length ? <Campo label="Cross-sell" valore={visit.cross_sell.join(', ')} /> : null}
        {visit.concorrenti ? <Campo label="Concorrenti già presenti" valore={visit.concorrenti} /> : null}
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
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  err: { padding: spacing.xxl, color: colors.errore },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  data: { fontSize: 15, fontWeight: '700', color: colors.navy },
  pendingTxt: { color: colors.attenzione, fontWeight: '700', marginTop: spacing.xs },
  campo: { marginTop: spacing.lg },
  label: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4, marginTop: spacing.lg },
  valore: { color: colors.testo, fontSize: 15, lineHeight: 21 },
  valoreEvidenza: { fontWeight: '700', color: colors.navy },
  foto: { width: '100%', height: 220, borderRadius: radius.m, marginTop: spacing.xs, backgroundColor: colors.grigioChiaro },
});
