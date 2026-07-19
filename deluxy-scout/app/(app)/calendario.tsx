// Calendario: tutti gli "appuntamenti" datati (task con scadenza + follow-up delle
// trattative) raggruppati per giorno, con CHI li avrà (assegnatario/owner) e filtro
// per venditore. I task rispettano la privacy RLS (i propri + creati; admin: tutti);
// i follow-up delle trattative sono visibili a tutti gli autenticati.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchTask, fetchTutteTrattative } from '@/lib/db';

interface Evento {
  id: string;
  data: string; // YYYY-MM-DD
  tipo: 'task' | 'trattativa';
  titolo: string;
  negozio: string | null;
  owner: string | null;
  placeId: string | null;
}

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function giorniDaOggi(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - oggi.getTime()) / 86400000);
}
function etichettaGiorno(iso: string): string {
  const gg = giorniDaOggi(iso);
  if (gg === 0) return 'Oggi';
  if (gg === 1) return 'Domani';
  if (gg === -1) return 'Ieri';
  const d = new Date(iso + 'T00:00:00');
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

export default function Calendario() {
  const router = useRouter();
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [venditore, setVenditore] = useState<string>('tutti');

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [tasks, trattative] = await Promise.all([fetchTask(false), fetchTutteTrattative()]);
      const evTask: Evento[] = tasks
        .filter((t) => t.scadenza && !t.completata)
        .map((t) => ({
          id: `t_${t.id}`,
          data: t.scadenza as string,
          tipo: 'task',
          titolo: t.titolo,
          negozio: t.place_nome ?? null,
          owner: t.owner_nome ?? null,
          placeId: t.place_id,
        }));
      const evDeal: Evento[] = trattative
        .filter((d) => d.scadenza)
        .map((d) => ({
          id: `d_${d.id}`,
          data: d.scadenza as string,
          tipo: 'trattativa',
          titolo: (d.linee?.length ? d.linee.join(', ') : d.linea) ?? d.titolo ?? 'Trattativa',
          negozio: d.place_nome ?? null,
          owner: d.owner_nome ?? null,
          placeId: d.place_id || null,
        }));
      setEventi([...evTask, ...evDeal]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const venditori = useMemo(() => {
    const set = new Set(eventi.map((e) => e.owner).filter(Boolean) as string[]);
    return [...set].sort();
  }, [eventi]);

  const sezioni = useMemo(() => {
    const filtrati = venditore === 'tutti' ? eventi : eventi.filter((e) => e.owner === venditore);
    const perGiorno = new Map<string, Evento[]>();
    for (const e of filtrati) {
      const l = perGiorno.get(e.data) ?? [];
      l.push(e);
      perGiorno.set(e.data, l);
    }
    return [...perGiorno.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([giorno, items]) => ({ title: etichettaGiorno(giorno), ritardo: giorniDaOggi(giorno) < 0, data: items }));
  }, [eventi, venditore]);

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>Task e follow-up datati — chi ce l'ha e quando.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtri}>
          <Chip label="Tutti" on={venditore === 'tutti'} onPress={() => setVenditore('tutti')} />
          {venditori.map((v) => (
            <Chip key={v} label={v} on={venditore === v} onPress={() => setVenditore(v)} />
          ))}
        </ScrollView>
      </View>

      <SectionList
        sections={sezioni as any}
        keyExtractor={(e: any) => e.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <Text style={styles.vuoto}>{loading ? 'Caricamento…' : 'Nessun appuntamento in calendario.'}</Text>
        }
        renderSectionHeader={({ section }: any) => (
          <Text style={[styles.giorno, section.ritardo && styles.giornoRitardo]}>
            {section.title}
            {section.ritardo ? ' · in ritardo' : ''}
          </Text>
        )}
        renderItem={({ item }: { item: Evento }) => (
          <Pressable
            style={styles.evento}
            disabled={!item.placeId}
            onPress={() => item.placeId && router.push(`/(app)/attivita/${item.placeId}`)}
          >
            <View style={[styles.tipoIcona, item.tipo === 'task' ? styles.tipoTask : styles.tipoDeal]}>
              <Ionicons
                name={item.tipo === 'task' ? 'checkbox-outline' : 'briefcase-outline'}
                size={16}
                color={colors.bianco}
              />
            </View>
            <View style={styles.info}>
              <Text style={styles.titolo} numberOfLines={1}>{item.titolo}</Text>
              <View style={styles.metaRow}>
                {item.negozio ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    <Ionicons name="storefront-outline" size={11} color={colors.testoSoft} /> {item.negozio}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.ownerBox}>
              <Ionicons name="person-circle-outline" size={14} color={colors.oro} />
              <Text style={styles.ownerTxt} numberOfLines={1}>{item.owner ?? 'Non attribuito'}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { paddingTop: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, backgroundColor: colors.sfondo },
  sub: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  filtri: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 6 },
  chip: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 180 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  giorno: {
    color: colors.oro,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  giornoRitardo: { color: colors.errore },
  evento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.xs,
  },
  tipoIcona: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tipoTask: { backgroundColor: colors.navy },
  tipoDeal: { backgroundColor: colors.oro },
  info: { flex: 1, gap: 2 },
  titolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: colors.testoSoft, fontSize: 12 },
  ownerBox: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 120 },
  ownerTxt: { color: colors.goldStrong, fontWeight: '800', fontSize: 12 },
});
