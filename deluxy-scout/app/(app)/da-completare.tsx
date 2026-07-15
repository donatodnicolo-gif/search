// Sezione "Da fare": la coda operativa del venditore.
// 1) Da ricontattare — negozi la cui ultima visita chiede un seguito
//    (interessato → recap entro 3 giorni, da richiamare → entro 7).
// 2) Da completare — visite segnate sul campo ma senza contatto/note.
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { LineaIcon } from '@/components/LineaIcon';
import { fetchAllVisits, fetchDaCompletare, fetchPlaces } from '@/lib/db';
import { daRicontattare, type Richiamo } from '@/lib/metrics';
import { PriorityBadge } from '@/components/PriorityBadge';
import { VisitaModal } from '@/components/VisitaModal';

type Riga =
  | { tipo: 'richiamo'; richiamo: Richiamo }
  | { tipo: 'completa'; place: Place };

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato — inviare recap',
  da_richiamare: 'Da richiamare',
};

export default function DaCompletare() {
  const router = useRouter();
  const [richiami, setRichiami] = useState<Richiamo[]>([]);
  const [daCompletare, setDaCompletare] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Place | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [dc, places, visits] = await Promise.all([
        fetchDaCompletare(),
        fetchPlaces(),
        fetchAllVisits(),
      ]);
      setDaCompletare(dc);
      setRichiami(daRicontattare(places, visits));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const sezioni = [
    ...(richiami.length
      ? [{ title: `Da ricontattare (${richiami.length})`, data: richiami.map((r): Riga => ({ tipo: 'richiamo', richiamo: r })) }]
      : []),
    ...(daCompletare.length
      ? [{ title: `Da completare (${daCompletare.length})`, data: daCompletare.map((p): Riga => ({ tipo: 'completa', place: p })) }]
      : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          Richiami in scadenza e visite da completare — la tua coda di lavoro.
        </Text>
      </View>
      <SectionList
        sections={sezioni}
        keyExtractor={(r) => (r.tipo === 'richiamo' ? `r-${r.richiamo.place.id}` : `c-${r.place.id}`)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <Text style={styles.vuoto}>{loading ? 'Caricamento…' : 'Niente da fare 🎉'}</Text>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sezione}>{section.title}</Text>}
        renderItem={({ item }) =>
          item.tipo === 'richiamo' ? (
            <RigaRichiamo r={item.richiamo} onPress={() => router.push(`/(app)/attivita/${item.richiamo.place.id}`)} />
          ) : (
            <RigaCompleta p={item.place} onPress={() => setSel(item.place)} />
          )
        }
      />
      <VisitaModal
        place={sel}
        onClose={() => setSel(null)}
        onDone={() => {
          setSel(null);
          carica();
        }}
      />
    </View>
  );
}

function RigaRichiamo({ r, onPress }: { r: Richiamo; onPress: () => void }) {
  const { place: p, visita, giorni, inRitardo } = r;
  const quando = giorni === 0 ? 'oggi' : giorni === 1 ? 'ieri' : `${giorni} giorni fa`;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.icona}>
        <LineaIcon linea={p.linea_ipotizzata} size={22} color={colors.navy} />
      </View>
      <View style={styles.info}>
        <View style={styles.titoloRow}>
          <PriorityBadge priorita={p.priorita} small />
          <Text style={styles.nome} numberOfLines={1}>
            {p.nome}
          </Text>
          {inRitardo ? (
            <View style={styles.ritardo}>
              <Text style={styles.ritardoTxt}>IN RITARDO</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {LABEL_ESITO[visita.esito ?? ''] ?? 'Da ricontattare'} · visita {quando}
        </Text>
        {visita.note_post_meeting ? (
          <Text style={styles.nota} numberOfLines={1}>
            “{visita.note_post_meeting}”
          </Text>
        ) : null}
      </View>
      <Text style={styles.freccia}>Apri ›</Text>
    </Pressable>
  );
}

function RigaCompleta({ p, onPress }: { p: Place; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.icona}>
        <LineaIcon linea={p.linea_ipotizzata} size={22} color={colors.navy} />
      </View>
      <View style={styles.info}>
        <View style={styles.titoloRow}>
          <PriorityBadge priorita={p.priorita} small />
          <Text style={styles.nome} numberOfLines={1}>
            {p.nome}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[p.linea_ipotizzata, p.indirizzo].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <Text style={styles.freccia}>Completa ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sub: { color: colors.testoSoft, fontSize: 13 },
  list: { padding: spacing.md, gap: 10 },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  sezione: {
    color: colors.oro,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bianco,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  icona: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#F0ECE2', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 3 },
  titoloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flexShrink: 1, color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  meta: { color: colors.testoSoft, fontSize: 13 },
  nota: { color: colors.grigio, fontSize: 12, fontStyle: 'italic' },
  ritardo: { backgroundColor: colors.attenzione, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  ritardoTxt: { color: colors.bianco, fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  freccia: { color: colors.oro, fontWeight: '800', fontSize: 14 },
});
