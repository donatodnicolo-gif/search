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

type Colonna = 'negozio' | 'trattativa' | 'linea' | 'fase' | 'valore' | 'aperta' | 'scadenza' | 'azione';

/** gg/mm/aa compatto, sia per date pure («2026-09-01») sia per timestamp. */
function dataBreve(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Oggi in AAAA-MM-GG LOCALE: toISOString è UTC e la sera in Italia sposta al
 *  giorno prima — una scadenza di oggi sembrerebbe scaduta dopo le 22. */
function oggiLocale(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
        if (c === 'trattativa') return d.titolo ?? null;
        if (c === 'linea') return (d.linee?.length ? d.linee.join(', ') : d.linea) ?? null;
        if (c === 'fase') return ordineFasi.indexOf(d.fase);
        if (c === 'valore') return d.valore_atteso;
        if (c === 'aperta') return d.created_at ?? null;
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
          { c: 'trattativa' as const, label: 'Trattativa', stile: styles.colLinea },
          { c: 'linea' as const, label: 'Linea', stile: styles.colTag },
          { c: 'fase' as const, label: 'Fase', stile: styles.colFase },
          { c: 'valore' as const, label: 'Valore', stile: styles.colDx },
          { c: 'aperta' as const, label: 'Aperta', stile: styles.colData },
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
        // Titolo e linea sono DUE informazioni: il titolo è come si chiama la
        // trattativa (spesso assente sui deal nati da una visita), la linea è
        // il servizio in gioco. Prima stavano fuse in una colonna sola.
        const titoloTxt = d.titolo ?? '—';
        const lineaTxt = (d.linee?.length ? d.linee.join(', ') : d.linea) ?? '—';
        const daRegistro = d.origine === 'anagrafiche';
        const statoReg = (d.anagrafiche_stato ?? 'in_trattativa') as StatoAffiliazione;
        // Scadenza passata su una trattativa ancora aperta: in rosso.
        const scaduta =
          !!d.scadenza && d.scadenza < oggiLocale() && d.fase !== 'closedwon' && d.fase !== 'closedlost';
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
            <Text style={styles.cellaLinea} numberOfLines={2}>{titoloTxt}</Text>
            <Text style={styles.cellaTag} numberOfLines={2}>{lineaTxt}</Text>
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
            <Text style={styles.cellaData}>{dataBreve(d.created_at)}</Text>
            <Text style={[styles.cellaData, scaduta && styles.cellaScaduta]}>{dataBreve(d.scadenza)}</Text>
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
  colNegozio: { flex: 1.3, minWidth: 0 },
  colLinea: { flex: 1, minWidth: 0 },
  colTag: { flex: 0.9, minWidth: 0 },
  colFase: { width: 140 },
  colDx: { width: 90, alignItems: 'flex-end' },
  colData: { width: 76, alignItems: 'flex-end' },
  negozio: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  sotto: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  cellaLinea: { flex: 1, minWidth: 0, color: colors.testo, fontSize: 13, lineHeight: 17 },
  cellaTag: { flex: 0.9, minWidth: 0, color: colors.testoSoft, fontSize: 12.5, lineHeight: 16 },
  cellaValore: {
    width: 90,
    textAlign: 'right',
    color: colors.testo,
    fontWeight: '700',
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  cellaData: {
    width: 76,
    textAlign: 'right',
    color: colors.testoSoft,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  cellaAzione: { flex: 1.2, minWidth: 0, color: colors.testoSoft, fontSize: 12.5, lineHeight: 16 },
  cellaScaduta: { color: colors.errore, fontWeight: '700' },
});
