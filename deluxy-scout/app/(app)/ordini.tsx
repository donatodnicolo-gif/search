// Ordini — il punto d'arrivo del funnel: cosa abbiamo CHIUSO davvero.
// Nasce automaticamente dalla trattativa vinta (docs/VISIONE-COMMERCIALE.md);
// qui si segue solo l'incasso: da incassare → incassato (o annullato).
// La pipeline dice quanto stiamo trattando; questa pagina quanto abbiamo chiuso.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { Tabella, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { aggiornaOrdine, fetchOrdini, type OrdineConLuogo } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';

const STATI: { valore: OrdineConLuogo['stato']; label: string; colore: string }[] = [
  { valore: 'da_incassare', label: 'Da incassare', colore: '#B7791F' },
  { valore: 'incassato', label: 'Incassato', colore: '#2F7D46' },
  { valore: 'annullato', label: 'Annullato', colore: '#B3261E' },
];
const labelStatoOrdine = Object.fromEntries(STATI.map((s) => [s.valore, s.label]));
const coloreStatoOrdine = Object.fromEntries(STATI.map((s) => [s.valore, s.colore]));

function euro(n: number | null): string {
  return n != null ? `€ ${n.toLocaleString('it-IT')}` : '—';
}
function dataIt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function Ordini() {
  const router = useRouter();
  const [ordini, setOrdini] = useState<OrdineConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statoFiltro, setStatoFiltro] = useState<string | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setOrdini(await fetchOrdini());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // Tipologie di interesse presenti fra gli ordini.
  const lineePresenti = useMemo(
    () => [...new Set(ordini.map((o) => o.linea).filter(Boolean) as string[])].sort(),
    [ordini],
  );

  const dati = useMemo(
    () =>
      ordini.filter(
        (o) => (!statoFiltro || o.stato === statoFiltro) && (!lineaFiltro || o.linea === lineaFiltro),
      ),
    [ordini, statoFiltro, lineaFiltro],
  );

  const totali = useMemo(() => {
    const anno = new Date().getFullYear();
    const validi = ordini.filter((o) => o.stato !== 'annullato' && new Date(o.created_at).getFullYear() === anno);
    return {
      chiusoAnno: validi.reduce((s, o) => s + (o.valore ?? 0), 0),
      daIncassare: ordini.filter((o) => o.stato === 'da_incassare').reduce((s, o) => s + (o.valore ?? 0), 0),
    };
  }, [ordini]);

  // Da 900px in su l'elenco è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;

  const colonne: ColonnaTabella<OrdineConLuogo>[] = [
    {
      chiave: 'cliente',
      label: 'Cliente',
      flex: 1.2,
      valore: (o) => o.place_nome ?? o.cliente,
      cella: (o) => (
        <View>
          <Text style={styles.tabNome} numberOfLines={2}>{o.place_nome ?? o.cliente}</Text>
          {o.descrizione ? <Text style={styles.descr} numberOfLines={1}>{o.descrizione}</Text> : null}
        </View>
      ),
    },
    { chiave: 'linea', label: 'Linea', flex: 0.7, valore: (o) => o.linea ?? null },
    { chiave: 'canale', label: 'Canale', width: 80, valore: (o) => o.canale ?? null },
    {
      chiave: 'valore',
      label: 'Valore',
      width: 92,
      destra: true,
      numerica: true,
      valore: (o) => o.valore,
      cella: (o) => <Text style={styles.tabValore}>{importoBreve(o.valore)}</Text>,
    },
    {
      chiave: 'quando',
      label: 'Creato',
      width: 82,
      destra: true,
      numerica: true,
      valore: (o) => o.created_at,
      cella: (o) => <Text style={styles.tabData}>{dataIt(o.created_at)}</Text>,
    },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 108,
      valore: (o) => o.stato,
      cella: (o) => <StatusBadge small label={labelStatoOrdine[o.stato]} colore={coloreStatoOrdine[o.stato]} />,
    },
    {
      chiave: 'azioni',
      label: '',
      width: 210,
      fissa: true,
      valore: () => null,
      cella: (o) => (
        <View style={styles.tabAzioni}>
          {o.stato === 'da_incassare' ? (
            <>
              <Pressable style={styles.btn} onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'incassato'); }}>
                <Text style={styles.btnTxt}>Incassato</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'annullato'); }}>
                <Text style={styles.btnGhostTxt}>Annulla</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.btnGhost} onPress={(e: any) => { e?.stopPropagation?.(); cambiaStato(o, 'da_incassare'); }}>
              <Text style={styles.btnGhostTxt}>Da incassare</Text>
            </Pressable>
          )}
        </View>
      ),
    },
  ];

  async function cambiaStato(o: OrdineConLuogo, stato: OrdineConLuogo['stato']) {
    try {
      await aggiornaOrdine(o.id, {
        stato,
        incassato_il: stato === 'incassato' ? new Date().toISOString().slice(0, 10) : null,
      });
      carica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Aggiornamento non riuscito.');
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.head, contenutoCentrato]}>
        <PageIntro testo="Gli ordini nati dalle trattative vinte. La pipeline dice quanto stai trattando: qui vedi quanto hai chiuso, e cosa resta da incassare." />
        <Text style={styles.sub}>
          Chiuso {new Date().getFullYear()}: <Text style={styles.subForte}>{euro(totali.chiusoAnno)}</Text>
          {'  ·  '}Da incassare: <Text style={styles.subForte}>{euro(totali.daIncassare)}</Text>
        </Text>
        <View style={styles.chips}>
          <Chip label="Tutti" on={!statoFiltro} onPress={() => setStatoFiltro(null)} />
          {STATI.map((s) => (
            <Chip key={s.valore} label={s.label} on={statoFiltro === s.valore} onPress={() => setStatoFiltro((c) => (c === s.valore ? null : s.valore))} />
          ))}
        </View>
        {lineePresenti.length ? (
          <View style={styles.chips}>
            <Text style={styles.gruppoTitolo}>Interessi</Text>
            <Chip label="Tutti" on={!lineaFiltro} onPress={() => setLineaFiltro(null)} />
            {lineePresenti.map((l) => (
              <Chip key={l} label={l} on={lineaFiltro === l} onPress={() => setLineaFiltro((c) => (c === l ? null : l))} />
            ))}
          </View>
        ) : null}
      </View>

      <FlatList
        // In tabella la FlatList riceve UNA riga con l'intero elenco.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(o: any) => (aTabella ? 'tabella' : (o as OrdineConLuogo).id)}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="receipt-outline"
            titolo="Ancora nessun ordine"
            aiuto="Quando chiudi una trattativa come «vinta», l'ordine nasce qui da solo, pronto da seguire fino all'incasso."
            azione="Vai alle Trattative"
            onAzione={() => router.push('/(app)/trattative')}
          />
        }
        renderItem={({ item }) =>
          aTabella ? (
            <Tabella
              righe={item as OrdineConLuogo[]}
              colonne={colonne}
              chiaveRiga={(o) => o.id}
              ordineIniziale={{ campo: 'quando', verso: 'desc' }}
              onRiga={(o) => o.place_id && router.push(`/(app)/attivita/${o.place_id}`)}
              labelRiga={(o) => `Apri la scheda di ${o.place_nome ?? o.cliente}`}
            />
          ) : (
            (() => {
              const o = item as OrdineConLuogo;
              return (
                <View style={styles.card}>
                  <View style={styles.cardHead}>
                    <Pressable style={{ flex: 1 }} onPress={() => o.place_id && router.push(`/(app)/attivita/${o.place_id}`)}>
                      <Text numberOfLines={3} style={styles.nome}>{o.place_nome ?? o.cliente}</Text>
                      {o.descrizione ? <Text style={styles.descr} numberOfLines={1}>{o.descrizione}</Text> : null}
                    </Pressable>
                    <Text style={styles.valore}>{euro(o.valore)}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <StatusBadge small label={labelStatoOrdine[o.stato]} colore={coloreStatoOrdine[o.stato]} />
                    {o.canale ? <Text style={styles.meta}>canale {o.canale}</Text> : null}
                    {o.linea ? <Text style={styles.meta}>{o.linea}</Text> : null}
                    <Text style={styles.meta}>{dataIt(o.created_at)}</Text>
                  </View>
                  <View style={styles.azioni}>
                    {o.stato === 'da_incassare' ? (
                      <>
                        <Pressable style={styles.btn} onPress={() => cambiaStato(o, 'incassato')}>
                          <Ionicons name="checkmark-circle-outline" size={15} color={colors.bianco} />
                          <Text style={styles.btnTxt}>Segna incassato</Text>
                        </Pressable>
                        <Pressable style={styles.btnGhost} onPress={() => cambiaStato(o, 'annullato')}>
                          <Text style={styles.btnGhostTxt}>Annulla</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable style={styles.btnGhost} onPress={() => cambiaStato(o, 'da_incassare')}>
                        <Text style={styles.btnGhostTxt}>Riporta a «da incassare»</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })()
          )
        }
      />
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.sfondo },
  sub: { color: colors.testoSoft, fontSize: 13 },
  subForte: { color: colors.navy, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', marginRight: 2 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  descr: { color: colors.testoSoft, fontSize: 12.5, fontStyle: 'italic', marginTop: 1 },
  valore: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabValore: { color: colors.testo, fontWeight: '700', fontSize: 13.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabAzioni: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { color: colors.testoSoft, fontSize: 12 },
  azioni: { flexDirection: 'row', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12.5 },
  btnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
});
