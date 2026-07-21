// Affiliazioni: le attività della linea Re-seller (fioristi/pasticcerie) da reclutare
// come affiliati su deluxy.it. Per ciascuna: dati anagrafici, bottone "Chiama" (apre il
// telefono e registra la chiamata) e lo "step" di stato (i 7 valori del registro).
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, coloreAffiliazione, labelAffiliazione, radius, spacing } from '@/lib/theme';
import { aggiornaStarred, aggiornaStatoAffiliazione, fetchAffiliazioni, registraChiamata } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { STATI_AFFILIAZIONE, type AffiliazioneRow, type StatoAffiliazione } from '@/types';
import { AnagraficaRegistroCard } from '@/components/AnagraficaRegistroCard';
import { EmptyState, PageIntro } from '@/components/ui';

type FiltroAff = StatoAffiliazione | 'tutti' | 'selezionati';

const FILTRI: FiltroAff[] = ['tutti', 'selezionati', ...STATI_AFFILIAZIONE];

function etichettaFiltro(f: FiltroAff, nSel: number): string {
  if (f === 'tutti') return 'Tutti';
  if (f === 'selezionati') return `Selezionati${nSel ? ` (${nSel})` : ''}`;
  return labelAffiliazione[f];
}

function quando(iso: string | null): string {
  if (!iso) return 'mai chiamato';
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (giorni <= 0) return 'chiamato oggi';
  if (giorni === 1) return 'chiamato ieri';
  if (giorni < 30) return `chiamato ${giorni} giorni fa`;
  return `chiamato ${Math.floor(giorni / 30)} mesi fa`;
}

export default function Affiliazioni() {
  const [righe, setRighe] = useState<AffiliazioneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<FiltroAff>('tutti');
  const nSel = useMemo(() => righe.filter((r) => r.starred).length, [righe]);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setRighe(await fetchAffiliazioni());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    return righe.filter((r) => {
      if (filtro === 'selezionati') { if (!r.starred) return false; }
      else if (filtro !== 'tutti' && r.stato_affiliazione !== filtro) return false;
      if (!q) return true;
      return [r.nome, r.indirizzo, r.zona, r.referente, r.telefono]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [righe, query, filtro]);

  async function chiama(r: AffiliazioneRow) {
    if (!r.telefono) {
      avvisa('Nessun numero', 'Questa affiliazione non ha un telefono in rubrica.');
      return;
    }
    // Registra la chiamata (best-effort) e apri il dialer.
    registraChiamata(r.id).then(carica).catch(() => {});
    const tel = r.telefono.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${tel}`).catch(() =>
      avvisa('Impossibile chiamare', 'Compone il numero manualmente: ' + r.telefono),
    );
  }

  async function cambiaStato(r: AffiliazioneRow, stato: StatoAffiliazione) {
    setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, stato_affiliazione: stato } : x)));
    try {
      await aggiornaStatoAffiliazione(r.id, stato);
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Stato non salvato.');
      carica();
    }
  }

  // Seleziona/deseleziona l'affiliazione da contattare (stesso flag della stella in mappa).
  async function seleziona(r: AffiliazioneRow) {
    const nuovo = !r.starred;
    setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, starred: nuovo } : x)));
    try {
      await aggiornaStarred(r.id, nuovo);
    } catch {
      setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, starred: r.starred } : x)));
    }
  }

  return (
    <View style={styles.container}>
      <PageIntro testo="Fioristi e pasticcerie da reclutare come affiliati. La stella li mette tra i Selezionati da contattare; Chiama registra la chiamata e apre il telefono." />
      <View style={styles.head}>
        <Text style={styles.sub}>
          {righe.length} affiliazioni · fioristi e pasticcerie da reclutare
        </Text>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per nome, città, referente…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtri}>
          {FILTRI.map((f) => (
            <Pressable key={f} onPress={() => setFiltro(f)} style={[styles.chip, filtro === f && styles.chipOn]}>
              <Text style={[styles.chipTxt, filtro === f && styles.chipTxtOn]}>
                {etichettaFiltro(f, nSel)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={dati}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="git-network-outline"
            titolo="Nessuna affiliazione qui"
            aiuto="Prova ad azzerare i filtri o la ricerca. Le affiliazioni sono i negozi della linea Re-seller importati dal registro."
          />
        }
        renderItem={({ item }) => (
          <Card
            item={item}
            onChiama={() => chiama(item)}
            onStato={(s) => cambiaStato(item, s)}
            onSeleziona={() => seleziona(item)}
          />
        )}
      />
    </View>
  );
}

function Card({
  item,
  onChiama,
  onStato,
  onSeleziona,
}: {
  item: AffiliazioneRow;
  onChiama: () => void;
  onStato: (s: StatoAffiliazione) => void;
  onSeleziona: () => void;
}) {
  const [apriStep, setApriStep] = useState(false);
  const [apriRegistro, setApriRegistro] = useState(false);
  const stato = item.stato_affiliazione ?? 'prospect';
  return (
    <View style={[styles.card, item.starred && styles.cardSel]}>
      <View style={styles.cardTop}>
        {/* Selettore "da contattare": stella → Selezionati (stesso flag della Mappa). */}
        <Pressable
          style={[styles.selBtn, item.starred && styles.selBtnOn]}
          onPress={onSeleziona}
          hitSlop={8}
          accessibilityLabel={item.starred ? 'Togli dai selezionati' : 'Seleziona da contattare'}
        >
          <Ionicons name={item.starred ? 'star' : 'star-outline'} size={18} color={item.starred ? colors.bianco : colors.grigio} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.nome} numberOfLines={1}>{item.nome}</Text>
          {item.indirizzo ? <Text style={styles.meta} numberOfLines={1}>{item.indirizzo}</Text> : null}
          {item.telefono ? (
            <Pressable onPress={onChiama} hitSlop={6}>
              <Text style={styles.tel}>
                <Ionicons name="call" size={12} color={colors.successo} /> {item.telefono}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.metaLeggero}>Nessun numero in rubrica</Text>
          )}
          <View style={styles.refRow}>
            {item.referente ? <Text style={styles.meta}>{item.referente}</Text> : null}
            <Text style={styles.metaLeggero}>· {quando(item.ultima_chiamata)}</Text>
          </View>
        </View>
        <Pressable style={[styles.btnChiama, !item.telefono && styles.btnChiamaOff]} onPress={onChiama}>
          <Ionicons name="call-outline" size={16} color={colors.bianco} />
          <Text style={styles.btnChiamaTxt}>Chiama</Text>
        </Pressable>
      </View>

      {/* Step: stato corrente → tap per espandere e cambiarlo. */}
      <Pressable style={styles.statoRow} onPress={() => setApriStep((v) => !v)}>
        <View style={[styles.dot, { backgroundColor: coloreAffiliazione[stato] }]} />
        <Text style={styles.statoTxt}>
          Stato: {labelAffiliazione[stato]}
          {!apriStep ? <Text style={styles.statoHint}>  ·  tocca per cambiare</Text> : null}
        </Text>
        <Ionicons name={apriStep ? 'chevron-up' : 'chevron-down'} size={15} color={colors.grigio} />
      </Pressable>
      {apriStep ? (
        <View style={styles.stepWrap}>
          {STATI_AFFILIAZIONE.map((s) => (
            <Pressable
              key={s}
              onPress={() => { onStato(s); setApriStep(false); }}
              style={[styles.stepChip, s === stato && { borderColor: coloreAffiliazione[s], backgroundColor: coloreAffiliazione[s] }]}
            >
              <Text style={[styles.stepTxt, s === stato && styles.stepTxtOn]}>{labelAffiliazione[s]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Dati LIVE dal registro Anagrafiche (stato, interessi, referenti) — on demand. */}
      <Pressable style={styles.statoRow} onPress={() => setApriRegistro((v) => !v)}>
        <Ionicons name="library-outline" size={15} color={colors.oro} />
        <Text style={styles.statoTxt}>Registro Anagrafiche</Text>
        <Ionicons name={apriRegistro ? 'chevron-up' : 'chevron-down'} size={15} color={colors.grigio} />
      </Pressable>
      {apriRegistro ? <AnagraficaRegistroCard nome={item.nome} citta={item.zona} compatta /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { paddingTop: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, backgroundColor: colors.sfondo },
  sub: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  search: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  filtri: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 6 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  cardSel: { borderColor: colors.oro, backgroundColor: colors.goldSoft },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  selBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: colors.grigioChiaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  selBtnOn: { backgroundColor: colors.oro, borderColor: colors.oro },
  nome: { fontSize: 16, fontWeight: '800', color: colors.navy },
  meta: { color: colors.testoSoft, fontSize: 13 },
  metaLeggero: { color: colors.grigio, fontSize: 12 },
  tel: { color: colors.successo, fontSize: 14, fontWeight: '700', marginTop: 3 },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  btnChiama: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnChiamaOff: { opacity: 0.55 },
  btnChiamaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13 },
  statoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statoTxt: { flex: 1, color: colors.navy, fontWeight: '600', fontSize: 13 },
  statoHint: { color: colors.grigio, fontWeight: '400', fontSize: 11 },
  stepWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  stepChip: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.sfondo,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  stepTxt: { color: colors.navy, fontWeight: '600', fontSize: 12 },
  stepTxtOn: { color: colors.bianco },
});
