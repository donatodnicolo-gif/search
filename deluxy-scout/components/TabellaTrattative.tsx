// La vista a TABELLA delle trattative (schermo largo). DS §Tabelle: dentro una
// card, intestazioni 12px non urlate e ordinabili, hover leggero, numeri a
// destra con tabular-nums, «—» nelle celle vuote. Il confine largo/stretto lo
// decide la schermata: qui si disegna e basta.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { coloreAffiliazione, coloreFase, colors, labelAffiliazione, labelFase, radius, shadow, spacing } from '@/lib/theme';
import { StatusBadge } from '@/components/ui';
import { frecciaOrdine, ordinaRighe, useOrdinamento } from '@/lib/ordinamento';
import type { TrattativaConLuogo } from '@/lib/db';
import type { DealStage, StatoAffiliazione } from '@/types';
import { useMemo } from 'react';

type Colonna = 'negozio' | 'linea' | 'fase' | 'valore' | 'scadenza' | 'azione';

function formattaData(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

export function TabellaTrattative({
  righe,
  ordineFasi,
  onApri,
  onNegozio,
}: {
  righe: TrattativaConLuogo[];
  /** L'ordine della pipeline: la colonna Fase si ordina per posizione, non per alfabeto. */
  ordineFasi: readonly DealStage[];
  onApri: (d: TrattativaConLuogo) => void;
  onNegozio: (placeId: string) => void;
}) {
  // Default: valore più alto in cima — in una colonna di soldi si guarda chi
  // conta di più (regola di lib/ordinamento, come Copertura e Affiliazioni).
  const { ordine, ordinaPer } = useOrdinamento<Colonna>({ campo: 'valore', verso: 'desc' }, ['valore', 'fase']);
  const ordinate = useMemo(
    () =>
      ordinaRighe(righe, ordine, (d, c) => {
        if (c === 'negozio') return d.place_nome ?? '';
        if (c === 'linea') return d.titolo ?? (d.linee?.length ? d.linee.join(', ') : d.linea) ?? '';
        if (c === 'fase') return ordineFasi.indexOf(d.fase);
        if (c === 'valore') return d.valore_atteso;
        if (c === 'scadenza') return d.scadenza;
        return d.next_action ?? null;
      }),
    [righe, ordine, ordineFasi],
  );

  return (
    <View style={styles.card}>
      <View style={[styles.riga, styles.intesta]}>
        {([
          { c: 'negozio' as const, label: 'Negozio', stile: styles.colNegozio },
          { c: 'linea' as const, label: 'Trattativa', stile: styles.colLinea },
          { c: 'fase' as const, label: 'Fase', stile: styles.colFase },
          { c: 'valore' as const, label: 'Valore', stile: styles.colDx },
          { c: 'scadenza' as const, label: 'Scadenza', stile: styles.colData },
          { c: 'azione' as const, label: 'Prossima azione', stile: styles.colLinea },
        ]).map((h) => (
          <Pressable key={h.c} style={h.stile} onPress={() => ordinaPer(h.c)}>
            <Text style={[styles.th, ordine.campo === h.c && styles.thOn]}>
              {h.label}
              {frecciaOrdine(ordine, h.c)}
            </Text>
          </Pressable>
        ))}
        <View style={{ width: 16 }} />
      </View>
      {ordinate.map((d) => {
        const lineaTxt = d.titolo ?? (d.linee?.length ? d.linee.join(', ') : d.linea) ?? '—';
        const daRegistro = d.origine === 'anagrafiche';
        const statoReg = (d.anagrafiche_stato ?? 'in_trattativa') as StatoAffiliazione;
        return (
          <Pressable
            key={d.id}
            style={({ hovered }: any) => [styles.riga, hovered && styles.rigaHover]}
            onPress={() => onApri(d)}
            accessibilityRole="button"
            accessibilityLabel={`Apri la trattativa di ${d.place_nome ?? 'negozio'}`}
          >
            {/* Il nome apre la SCHEDA del negozio (nelle schede era il clic sul
                titolo del gruppo); il resto della riga apre la trattativa.
                L'evento interno si ferma, o partirebbero tutti e due. */}
            <Pressable
              style={styles.colNegozio}
              disabled={!d.place_id}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                if (d.place_id) onNegozio(d.place_id);
              }}
            >
              <Text style={styles.negozio} numberOfLines={1}>{d.place_nome ?? '—'}</Text>
              {d.place_account ? <Text style={styles.sotto} numberOfLines={1}>{d.place_account}</Text> : null}
            </Pressable>
            <Text style={styles.cellaLinea} numberOfLines={2}>{lineaTxt}</Text>
            <View style={styles.colFase}>
              {daRegistro ? (
                <StatusBadge small label={labelAffiliazione[statoReg] ?? statoReg} colore={coloreAffiliazione[statoReg] ?? colors.grigio} />
              ) : (
                <StatusBadge small label={labelFase[d.fase]} colore={coloreFase[d.fase]} />
              )}
            </View>
            <Text style={styles.cellaValore}>
              {/* ⚠️ L'it-IT non raggruppa le 4 cifre senza useGrouping:'always':
                  «1500» in una colonna di importi si legge male. */}
              {d.valore_atteso
                ? `€ ${d.valore_atteso.toLocaleString('it-IT', { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions)}`
                : '—'}
            </Text>
            <Text style={styles.cellaData}>{d.scadenza ? formattaData(d.scadenza) : '—'}</Text>
            <Text style={styles.cellaAzione} numberOfLines={2}>{d.next_action || '—'}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.grigio} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    overflow: 'hidden',
    ...shadow.card,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  intesta: { backgroundColor: colors.sfondo, paddingVertical: 8 },
  rigaHover: { backgroundColor: 'rgba(120,120,128,0.05)' },
  th: { color: colors.grigio, fontSize: 12, fontWeight: '500' },
  thOn: { color: colors.testo, fontWeight: '700' },
  colNegozio: { flex: 1.4, minWidth: 0 },
  colLinea: { flex: 1.2, minWidth: 0 },
  colFase: { width: 150 },
  colDx: { width: 95, alignItems: 'flex-end' },
  colData: { width: 88, alignItems: 'flex-end' },
  negozio: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  sotto: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  cellaLinea: { flex: 1.2, minWidth: 0, color: colors.testo, fontSize: 13, lineHeight: 17 },
  cellaValore: {
    width: 95,
    textAlign: 'right',
    color: colors.testo,
    fontWeight: '700',
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  cellaData: {
    width: 88,
    textAlign: 'right',
    color: colors.testoSoft,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  cellaAzione: { flex: 1.2, minWidth: 0, color: colors.testoSoft, fontSize: 12.5, lineHeight: 16 },
});
