// Card "Eleonor": riepilogo AI delle trattative (come vanno, azioni prioritarie,
// cosa richiede attenzione). Vive nella sezione Andamento (Dashboard).
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import type { TrattativaConLuogo } from '@/lib/db';
import { riepilogoTrattative, type RiepilogoTrattative } from '@/lib/assistente';

export function AssistenteCard({ trattative, contesto = '' }: { trattative: TrattativaConLuogo[]; contesto?: string }) {
  const [stato, setStato] = useState<'idle' | 'loading' | 'fatto' | 'errore'>('idle');
  const [r, setR] = useState<RiepilogoTrattative | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function genera() {
    setStato('loading');
    setErrore(null);
    try {
      const res = await riepilogoTrattative(trattative, contesto);
      setR(res);
      setStato('fatto');
    } catch (e: any) {
      setErrore(e?.message ?? 'Riprova più tardi.');
      setStato('errore');
    }
  }

  return (
    <View style={styles.aiCard}>
      <View style={styles.aiHead}>
        <View style={styles.aiTitoloRow}>
          <Ionicons name="sparkles-outline" size={16} color={colors.goldStrong} />
          <Text style={styles.aiTitolo}>Eleonor</Text>
        </View>
        <Pressable style={styles.aiBtn} onPress={genera} disabled={stato === 'loading'}>
          {stato === 'loading' ? (
            <ActivityIndicator color={colors.bianco} size="small" />
          ) : (
            <Text style={styles.aiBtnTxt}>{stato === 'fatto' ? 'Aggiorna' : 'Riassumi'}</Text>
          )}
        </Pressable>
      </View>

      {stato === 'idle' ? (
        <Text style={styles.aiHint}>
          Eleonor riassume come vanno le {trattative.length} trattative {contesto ? 'filtrate' : 'in elenco'}: cosa
          sta andando bene e cosa richiede attenzione.
        </Text>
      ) : null}

      {stato === 'errore' ? <Text style={styles.aiErrore}>{errore}</Text> : null}

      {stato === 'fatto' && r ? (
        r.disponibile === false || r.reason === 'ai_non_configurata' ? (
          <Text style={styles.aiHint}>Eleonor non è ancora attiva (manca la chiave del modello AI).</Text>
        ) : r.vuoto ? (
          <Text style={styles.aiHint}>Nessuna trattativa da riassumere con questi filtri.</Text>
        ) : (
          <View style={styles.aiBody}>
            {r.aggregati ? (
              <View style={styles.aiKpiRow}>
                <Text style={styles.aiKpi}>{r.aggregati.aperte} aperte · {r.aggregati.valore_aperto_txt}</Text>
                {r.aggregati.in_ritardo ? <Text style={[styles.aiKpi, { color: colors.errore }]}>{r.aggregati.in_ritardo} in ritardo</Text> : null}
              </View>
            ) : null}
            {r.sintesi ? <Text style={styles.aiSintesi}>{r.sintesi}</Text> : null}
            {r.azioni?.length ? (
              <>
                <Text style={styles.aiSezione}>Azioni prioritarie</Text>
                {r.azioni.map((a, i) => (
                  <View key={i} style={styles.aiVoce}>
                    <Ionicons name="arrow-forward" size={13} color={colors.goldStrong} style={{ marginTop: 2 }} />
                    <Text style={styles.aiVoceTxt}>{a}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {r.attenzione?.length ? (
              <>
                <Text style={styles.aiSezione}>Attenzione</Text>
                {r.attenzione.map((a, i) => (
                  <View key={i} style={styles.aiVoce}>
                    <Ionicons name="alert-circle-outline" size={13} color={colors.attenzione} style={{ marginTop: 2 }} />
                    <Text style={styles.aiVoceTxt}>{a}</Text>
                  </View>
                ))}
              </>
            ) : null}
            <Text style={styles.aiNota}>Sintesi generata da Eleonor — verifica sempre prima di agire.</Text>
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  aiCard: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 8,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiTitoloRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTitolo: { color: colors.testo, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  aiBtn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8, minWidth: 84, alignItems: 'center' },
  aiBtnTxt: { color: colors.bianco, fontWeight: '600', fontSize: 13.5 },
  aiHint: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  aiErrore: { color: colors.errore, fontSize: 13 },
  aiBody: { gap: 6 },
  aiKpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  aiKpi: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '700' },
  aiSintesi: { color: colors.testo, fontSize: 14, lineHeight: 20 },
  aiSezione: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 },
  aiVoce: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  aiVoceTxt: { flex: 1, color: colors.testo, fontSize: 13.5, lineHeight: 19 },
  aiNota: { color: colors.grigio, fontSize: 11, fontStyle: 'italic', marginTop: 6 },
});
