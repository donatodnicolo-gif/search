// Dettaglio venditore (aperto dalla dashboard Team, solo admin): attività
// giorno per giorno con le KPI, e nome modificabile dall'amministratore.
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Place, Profilo, Visit } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { aggiornaNomeProfilo, fetchAllVisits, fetchPlaces, fetchProfilo } from '@/lib/db';
import { attivitaPerGiorno, nomeVenditore, visiteUltimi7Giorni, type GiornoAttivita } from '@/lib/metrics';
import { StatCard } from '@/components/StatCard';

const ESITO_LABEL: Record<string, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_target: 'Non target',
  chiuso: 'Chiuso',
};
const ESITO_COLORE: Record<string, string> = {
  interessato: colors.successo,
  da_richiamare: colors.attenzione,
  non_target: colors.grigio,
  chiuso: colors.oro,
};

export default function VenditoreDettaglio() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);

  const [visits, setVisits] = useState<Visit[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [loading, setLoading] = useState(true);
  const [modificaNome, setModificaNome] = useState(false);
  const [nomeInput, setNomeInput] = useState('');
  const [salvo, setSalvo] = useState(false);

  // owner reale: 'none' nella rotta rappresenta le visite non attribuite (owner null).
  const owner = ownerId === 'none' ? null : (ownerId ?? null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [v, p, pr] = await Promise.all([
        fetchAllVisits(),
        fetchPlaces(),
        owner ? fetchProfilo(owner) : Promise.resolve(null),
      ]);
      setVisits(v);
      setPlaces(p);
      setProfilo(pr);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const mappaProfili = useMemo(() => new Map(profilo ? [[profilo.id, profilo]] : []), [profilo]);
  const nomiPlace = useMemo(() => new Map(places.map((p) => [p.id, p.nome])), [places]);
  const mie = useMemo(() => visits.filter((v) => (v.owner ?? null) === owner), [visits, owner]);
  const giorni = useMemo(() => attivitaPerGiorno(visits, owner), [visits, owner]);
  const nome = nomeVenditore(owner, mappaProfili);

  if (!admin) return <Redirect href="/(app)/dashboard" />;

  async function salvaNome() {
    if (!owner) return;
    setSalvo(true);
    try {
      await aggiornaNomeProfilo(owner, nomeInput);
      setProfilo((p) => (p ? { ...p, nome: nomeInput.trim() || null } : p));
      setModificaNome(false);
    } catch {
      // 0014 non applicata o RLS: lascia il campo aperto, l'admin riprova.
    } finally {
      setSalvo(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: nome }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Intestazione: nome + editing (admin) */}
        <View style={styles.headCard}>
          {modificaNome ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={nomeInput}
                onChangeText={setNomeInput}
                placeholder="Nome venditore"
                placeholderTextColor={colors.grigio}
                autoFocus
              />
              <Pressable style={styles.editBtn} onPress={salvaNome} disabled={salvo}>
                {salvo ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.editBtnTxt}>Salva</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={styles.nomeRow}>
              <Text style={styles.nome} numberOfLines={1}>
                {nome}
              </Text>
              {owner ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setNomeInput(profilo?.nome ?? '');
                    setModificaNome(true);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.oro} />
                </Pressable>
              ) : null}
            </View>
          )}
          {profilo?.email ? <Text style={styles.email}>{profilo.email}</Text> : null}
        </View>

        <View style={styles.cards}>
          <StatCard label="Visite ultimi 7 giorni" valore={visiteUltimi7Giorni(mie)} sub={`${mie.length} totali`} accent />
          <StatCard label="Giorni attivi" valore={giorni.length} />
        </View>

        <Text style={styles.sezione}>Attività giorno per giorno</Text>
        {loading ? (
          <Text style={styles.vuoto}>Caricamento…</Text>
        ) : giorni.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna visita registrata.</Text>
        ) : (
          giorni.map((g) => (
            <GiornoCard key={g.giorno} g={g} nomiPlace={nomiPlace} onVisita={(id) => router.push(`/(app)/visita-dettaglio/${id}`)} />
          ))
        )}
      </ScrollView>
    </>
  );
}

function GiornoCard({
  g,
  nomiPlace,
  onVisita,
}: {
  g: GiornoAttivita;
  nomiPlace: Map<string, string>;
  onVisita: (visitId: string) => void;
}) {
  return (
    <View style={styles.giorno}>
      <View style={styles.giornoHead}>
        <Text style={styles.giornoData}>{formattaGiorno(g.giorno)}</Text>
        <Text style={styles.giornoTot}>{g.totale} visite</Text>
      </View>
      {/* KPI del giorno */}
      <View style={styles.kpiRow}>
        {g.interessati ? <Kpi label="interessati" n={g.interessati} colore={colors.successo} /> : null}
        {g.daRichiamare ? <Kpi label="da richiam." n={g.daRichiamare} colore={colors.attenzione} /> : null}
        {g.chiusi ? <Kpi label="chiusi" n={g.chiusi} colore={colors.oro} /> : null}
        {g.nonTarget ? <Kpi label="non target" n={g.nonTarget} colore={colors.grigio} /> : null}
        {g.contatti ? <Kpi label="contatti" n={g.contatti} colore={colors.navy} /> : null}
      </View>
      {/* Visite del giorno */}
      {g.visite.map((v) => (
        <Pressable key={v.id} style={styles.visita} onPress={() => onVisita(v.id)}>
          <View style={[styles.dot, { backgroundColor: ESITO_COLORE[v.esito ?? ''] ?? colors.grigio }]} />
          <View style={styles.visitaInfo}>
            <Text style={styles.visitaNegozio} numberOfLines={1}>
              {nomiPlace.get(v.place_id) ?? 'Attività'}
            </Text>
            <Text style={styles.visitaMeta} numberOfLines={1}>
              {ora(v.data)}
              {v.esito ? ` · ${ESITO_LABEL[v.esito] ?? v.esito}` : ''}
              {v.note_post_meeting ? ` · ${v.note_post_meeting}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.grigio} />
        </Pressable>
      ))}
    </View>
  );
}

function Kpi({ label, n, colore }: { label: string; n: number; colore: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiN, { color: colore }]}>{n}</Text>
      <Text style={styles.kpiL}>{label}</Text>
    </View>
  );
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

// 'YYYY-MM-DD' → 'lun 15 lug 2026' (nomi IT senza dipendere dal locale runtime).
function formattaGiorno(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${GIORNI[dt.getUTCDay()]} ${d} ${MESI[m - 1]} ${y}`;
}

// Ora locale 'HH:MM' dall'ISO della visita.
function ora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },

  headCard: {
    backgroundColor: colors.bianco,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  nomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  nome: { flexShrink: 1, color: colors.navy, fontWeight: '900', fontSize: 22, letterSpacing: -0.4 },
  email: { color: colors.testoSoft, fontSize: 13, marginTop: 2 },
  editRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  editInput: {
    flex: 1,
    backgroundColor: colors.sfondo,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.testo,
  },
  editBtn: { backgroundColor: colors.ink, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12 },
  editBtnTxt: { color: colors.bianco, fontWeight: '700' },

  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sezione: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.oro,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  vuoto: { color: colors.grigio, fontStyle: 'italic' },

  giorno: {
    backgroundColor: colors.bianco,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  giornoHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.sm },
  giornoData: { color: colors.navy, fontWeight: '800', fontSize: 16, textTransform: 'capitalize' },
  giornoTot: { color: colors.testoSoft, fontSize: 13, fontWeight: '600' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  kpi: { minWidth: 56 },
  kpiN: { fontWeight: '800', fontSize: 18 },
  kpiL: { color: colors.testoSoft, fontSize: 11, fontWeight: '600' },

  visita: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.grigioChiaro },
  dot: { width: 9, height: 9, borderRadius: 5 },
  visitaInfo: { flex: 1 },
  visitaNegozio: { color: colors.navy, fontWeight: '700', fontSize: 15 },
  visitaMeta: { color: colors.testoSoft, fontSize: 12 },
});
