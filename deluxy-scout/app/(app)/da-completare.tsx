// Sezione "Da fare": la coda operativa del venditore.
// 1) Da ricontattare — negozi la cui ultima visita chiede un seguito
//    (interessato → recap entro 3 giorni, da richiamare → entro 7).
// 2) Da completare — visite segnate sul campo ma senza contatto/note.
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import { EmptyState, StatusBadge } from '@/components/ui';
import { LineaIcon } from '@/components/LineaIcon';
import {
  fetchAllVisits,
  fetchDaCompletare,
  fetchPlaces,
  fetchTutteTrattative,
  type TrattativaConLuogo,
} from '@/lib/db';
import { daRicontattare, followupAffiliazioni, type Richiamo } from '@/lib/metrics';
import { PriorityBadge } from '@/components/PriorityBadge';
import { VisitaModal } from '@/components/VisitaModal';

type Riga =
  | { tipo: 'richiamo'; richiamo: Richiamo }
  | { tipo: 'followup'; deal: TrattativaConLuogo }
  | { tipo: 'completa'; place: Place };

// Info scadenza follow-up: testo relativo + flag ritardo + data breve.
function scadenzaInfo(iso: string | null): { txt: string; ritardo: boolean; data: string | null } {
  if (!iso) return { txt: 'Senza scadenza', ritardo: false, data: null };
  const d = new Date(iso + 'T00:00:00');
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const gg = Math.round((d.getTime() - oggi.getTime()) / 86400000);
  const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const txt =
    gg === 0 ? 'scade oggi' : gg === 1 ? 'scade domani' : gg === -1 ? 'scaduta ieri' : gg < 0 ? `scaduta ${-gg} giorni fa` : `tra ${gg} giorni`;
  return { txt, ritardo: gg < 0, data };
}

const LABEL_ESITO: Record<string, string> = {
  interessato: 'Interessato — inviare recap',
  da_richiamare: 'Da richiamare',
};

export default function DaCompletare() {
  const router = useRouter();
  const [richiami, setRichiami] = useState<Richiamo[]>([]);
  const [daCompletare, setDaCompletare] = useState<Place[]>([]);
  const [followup, setFollowup] = useState<TrattativaConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Place | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [dc, places, visits, trattative] = await Promise.all([
        fetchDaCompletare(),
        fetchPlaces(),
        fetchAllVisits(),
        fetchTutteTrattative(),
      ]);
      setDaCompletare(dc);
      setRichiami(daRicontattare(places, visits));
      // Follow-up affiliazioni/re-seller aperti, prima i più urgenti (scaduti in cima).
      const fu = followupAffiliazioni(trattative).sort((a, b) => {
        if (!a.scadenza) return 1;
        if (!b.scadenza) return -1;
        return a.scadenza < b.scadenza ? -1 : a.scadenza > b.scadenza ? 1 : 0;
      });
      setFollowup(fu);
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
    ...(followup.length
      ? [{ title: `Follow-up affiliazioni (${followup.length})`, data: followup.map((d): Riga => ({ tipo: 'followup', deal: d })) }]
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
        keyExtractor={(r) =>
          r.tipo === 'richiamo' ? `r-${r.richiamo.place.id}` : r.tipo === 'followup' ? `f-${r.deal.id}` : `c-${r.place.id}`
        }
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            icona="checkmark-done-outline"
            titolo="Niente da fare"
            aiuto="Quando una visita chiede un seguito o resta da completare, la trovi in questa coda."
            loading={loading}
          />
        }
        renderSectionHeader={({ section }) => <Text style={styles.sezione}>{section.title}</Text>}
        renderItem={({ item }) =>
          item.tipo === 'richiamo' ? (
            <RigaRichiamo r={item.richiamo} onPress={() => router.push(`/(app)/attivita/${item.richiamo.place.id}`)} />
          ) : item.tipo === 'followup' ? (
            <RigaFollowup
              d={item.deal}
              onPress={() => item.deal.place_id && router.push(`/(app)/attivita/${item.deal.place_id}`)}
            />
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
          {inRitardo ? <StatusBadge small label="In ritardo" colore={colors.errore} /> : null}
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

function RigaFollowup({ d, onPress }: { d: TrattativaConLuogo; onPress: () => void }) {
  const sc = scadenzaInfo(d.scadenza);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.icona}>
        <LineaIcon linea={d.linea} size={22} color={colors.navy} />
      </View>
      <View style={styles.info}>
        <View style={styles.titoloRow}>
          <Text style={styles.nome} numberOfLines={1}>
            {d.place_nome ?? d.linea ?? 'Trattativa'}
          </Text>
          {sc.ritardo ? <StatusBadge small label="In ritardo" colore={colors.errore} /> : null}
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="person-circle-outline" size={14} color={colors.testoSoft} />
          <Text style={styles.meta} numberOfLines={1}>
            {d.owner_nome ?? 'Non attribuito'}
          </Text>
          <Text style={styles.metaSep}>·</Text>
          <Ionicons
            name="calendar-outline"
            size={13}
            color={sc.ritardo ? colors.errore : colors.testoSoft}
          />
          <Text style={[styles.meta, sc.ritardo && { color: colors.errore, fontWeight: '800' }]} numberOfLines={1}>
            {sc.data ? `${sc.data} · ${sc.txt}` : sc.txt}
          </Text>
        </View>
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
  sezione: {
    color: colors.testoSoft,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...shadow.card,
  },
  icona: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 3 },
  titoloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flexShrink: 1, color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  meta: { color: colors.testoSoft, fontSize: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaSep: { color: colors.grigioChiaro, fontSize: 13 },
  nota: { color: colors.grigio, fontSize: 12, fontStyle: 'italic' },
  freccia: { color: colors.oro, fontWeight: '800', fontSize: 14 },
});
