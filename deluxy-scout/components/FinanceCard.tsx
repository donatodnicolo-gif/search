// Card FINANCE sulla scheda del cliente: quanto sta facendo in termini di
// fatturato (anno) e andamento mensile, letti da Deluxy Partner (FINANCE) via
// la Edge Function `proforma` (azione 'riepilogo'). Si mostra solo se il cliente
// è nel FINANCE e l'endpoint è disponibile; altrimenti non compare.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { riepilogoFinanziario, type RiepilogoFinanziario } from '@/lib/partner';

const MESI = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];
const eur = (n: number) => '€ ' + Math.round(n).toLocaleString('it-IT');

export function FinanceCard({ nomeCliente, mostra }: { nomeCliente: string; mostra: boolean }) {
  const [stato, setStato] = useState<'loading' | 'ok' | 'vuoto'>('loading');
  const [r, setR] = useState<RiepilogoFinanziario | null>(null);

  useEffect(() => {
    if (!mostra || !nomeCliente.trim()) {
      setStato('vuoto');
      return;
    }
    let vivo = true;
    riepilogoFinanziario(nomeCliente)
      .then((res) => {
        if (!vivo) return;
        if (res?.trovato && (res.fatturato != null || (res.mesi?.length ?? 0) > 0)) {
          setR(res);
          setStato('ok');
        } else {
          setStato('vuoto');
        }
      })
      .catch(() => vivo && setStato('vuoto'));
    return () => {
      vivo = false;
    };
  }, [nomeCliente, mostra]);

  // Non mostrare nulla se non c'è nulla da mostrare (endpoint assente, cliente
  // non nel FINANCE, ecc.): la card compare solo quando ha dati veri.
  if (stato === 'vuoto') return null;

  if (stato === 'loading') {
    return (
      <View style={styles.card}>
        <View style={styles.head}>
          <Ionicons name="trending-up-outline" size={16} color={colors.goldStrong} />
          <Text style={styles.titolo}>Finance</Text>
        </View>
        <ActivityIndicator color={colors.testoSoft} size="small" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
      </View>
    );
  }

  const mesi = r?.mesi ?? [];
  const max = Math.max(1, ...mesi.map((m) => m.valore));
  const varPct = r?.variazionePct;
  const su = (varPct ?? 0) >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="trending-up-outline" size={16} color={colors.goldStrong} />
        <Text style={styles.titolo}>Finance{r?.anno ? ` · ${r.anno}` : ''}</Text>
      </View>

      <View style={styles.kpiRow}>
        <View>
          <Text style={styles.kpiLabel}>Fatturato anno</Text>
          <Text style={styles.kpiValore}>{r?.fatturato != null ? eur(r.fatturato) : '—'}</Text>
        </View>
        {varPct != null ? (
          <View style={styles.varBox}>
            <Ionicons name={su ? 'arrow-up' : 'arrow-down'} size={13} color={su ? colors.successo : colors.errore} />
            <Text style={[styles.varTxt, { color: su ? colors.successo : colors.errore }]}>
              {Math.abs(varPct).toFixed(0)}%
            </Text>
            <Text style={styles.varNota}>vs anno prec.</Text>
          </View>
        ) : null}
      </View>

      {mesi.length ? (
        <View style={styles.chart}>
          {mesi.map((m) => (
            <View key={m.mese} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${Math.round((m.valore / max) * 100)}%` }]} />
              </View>
              <Text style={styles.barLabel}>{MESI[(m.mese - 1) % 12]}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.nota}>Dati da Deluxy Partner (Finance).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bianco, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titolo: { color: colors.testo, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  kpiRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  kpiLabel: { color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  kpiValore: { color: colors.testo, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 1 },
  varBox: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  varTxt: { fontWeight: '800', fontSize: 14 },
  varNota: { color: colors.grigio, fontSize: 11, marginLeft: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 76, marginTop: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 3 },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: colors.sfondo, borderRadius: 4, overflow: 'hidden' },
  bar: { width: '100%', backgroundColor: colors.gold, borderRadius: 4, minHeight: 2 },
  barLabel: { color: colors.grigio, fontSize: 9, fontWeight: '600' },
  nota: { color: colors.grigio, fontSize: 11, fontStyle: 'italic' },
});
