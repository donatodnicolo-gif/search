// Pagamenti: il commerciale apre una richiesta di pagamento (beneficiario, importo,
// causale); Finance la lavora cambiando stato (inviata → in lavorazione → pagata/
// rifiutata) con una nota. RLS: ognuno vede le proprie, Finance (admin) tutte.
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import type { RichiestaPagamento, StatoPagamento } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { aggiornaRichiestaPagamento, fetchRichiestePagamento, inserisciRichiestaPagamento } from '@/lib/db';

const LABEL_STATO: Record<StatoPagamento, string> = {
  inviata: 'Inviata',
  in_lavorazione: 'In lavorazione',
  pagata: 'Pagata',
  rifiutata: 'Rifiutata',
};
const COLORE_STATO: Record<StatoPagamento, string> = {
  inviata: colors.attenzione,
  in_lavorazione: colors.navy,
  pagata: colors.successo,
  rifiutata: colors.errore,
};
const STATI: StatoPagamento[] = ['inviata', 'in_lavorazione', 'pagata', 'rifiutata'];

export default function Pagamenti() {
  const { session } = useAuth();
  const finance = isAdmin(session?.user?.email);
  const [righe, setRighe] = useState<RichiestaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [formAperto, setFormAperto] = useState(false);
  const [espansa, setEspansa] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setRighe(await fetchRichiestePagamento());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const totaleAperto = useMemo(
    () =>
      righe
        .filter((r) => r.stato === 'inviata' || r.stato === 'in_lavorazione')
        .reduce((s, r) => s + r.importo, 0),
    [righe],
  );

  async function cambiaStato(r: RichiestaPagamento, stato: StatoPagamento) {
    setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, stato } : x)));
    try {
      await aggiornaRichiestaPagamento(r.id, { stato });
    } finally {
      carica();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          {righe.length} richieste · € {totaleAperto.toLocaleString('it-IT')} in attesa
          {finance ? ' · vista Finance' : ''}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        {!loading && righe.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna richiesta. Aprine una col + in basso.</Text>
        ) : null}
        {righe.map((r) => (
          <Pressable key={r.id} style={styles.card} onPress={() => setEspansa(espansa === r.id ? null : r.id)}>
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.beneficiario} numberOfLines={1}>{r.beneficiario}</Text>
                <Text style={styles.causale} numberOfLines={espansa === r.id ? undefined : 1}>{r.causale}</Text>
              </View>
              <Text style={styles.importo}>€ {r.importo.toLocaleString('it-IT')}</Text>
            </View>
            <View style={styles.metaRow}>
              <View style={[styles.statoBadge, { backgroundColor: COLORE_STATO[r.stato] }]}>
                <Text style={styles.statoTxt}>{LABEL_STATO[r.stato]}</Text>
              </View>
              {r.urgenza === 'urgente' ? <Text style={styles.urgente}>URGENTE</Text> : null}
              {finance && r.owner_nome ? (
                <Text style={styles.owner}>
                  <Ionicons name="person-circle-outline" size={12} color={colors.testoSoft} /> {r.owner_nome}
                </Text>
              ) : null}
              <Text style={styles.data}>{r.created_at.slice(0, 10)}</Text>
            </View>
            {r.nota_finance ? <Text style={styles.nota}>Finance: {r.nota_finance}</Text> : null}

            {/* Finance: cambio stato in linea. */}
            {finance && espansa === r.id ? (
              <View style={styles.statiRow}>
                {STATI.map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.statoChip, r.stato === s && { backgroundColor: COLORE_STATO[s], borderColor: COLORE_STATO[s] }]}
                    onPress={() => cambiaStato(r, s)}
                  >
                    <Text style={[styles.statoChipTxt, r.stato === s && { color: colors.bianco }]}>{LABEL_STATO[s]}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {espansa === r.id && r.iban ? <Text style={styles.iban}>IBAN: {r.iban}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova richiesta</Text>
      </Pressable>

      {formAperto ? (
        <NuovaRichiestaModal
          onClose={() => setFormAperto(false)}
          onCreata={() => {
            setFormAperto(false);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

function NuovaRichiestaModal({ onClose, onCreata }: { onClose: () => void; onCreata: () => void }) {
  const [beneficiario, setBeneficiario] = useState('');
  const [importo, setImporto] = useState('');
  const [causale, setCausale] = useState('');
  const [iban, setIban] = useState('');
  const [urgenza, setUrgenza] = useState<'normale' | 'urgente'>('normale');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const valido = beneficiario.trim() && causale.trim() && Number(importo.replace(',', '.')) > 0;

  async function salva() {
    if (!valido || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      await inserisciRichiestaPagamento({
        beneficiario: beneficiario.trim(),
        importo: Number(importo.replace(',', '.')),
        causale: causale.trim(),
        iban: iban.trim() || null,
        urgenza,
      });
      onCreata();
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitolo}>Richiesta di pagamento</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Beneficiario *</Text>
            <TextInput style={styles.input} value={beneficiario} onChangeText={setBeneficiario} placeholder="Chi va pagato" placeholderTextColor={colors.grigio} />
            <Text style={styles.label}>Importo (€) *</Text>
            <TextInput style={styles.input} value={importo} onChangeText={setImporto} placeholder="es. 250" placeholderTextColor={colors.grigio} keyboardType="decimal-pad" />
            <Text style={styles.label}>Causale *</Text>
            <TextInput style={styles.input} value={causale} onChangeText={setCausale} placeholder="Per cosa (es. omaggio cliente, rimborso...)" placeholderTextColor={colors.grigio} />
            <Text style={styles.label}>IBAN (opzionale)</Text>
            <TextInput style={styles.input} value={iban} onChangeText={setIban} placeholder="IT..." placeholderTextColor={colors.grigio} autoCapitalize="characters" />
            <Text style={styles.label}>Urgenza</Text>
            <View style={styles.urgRow}>
              {(['normale', 'urgente'] as const).map((u) => (
                <Pressable key={u} style={[styles.urgChip, urgenza === u && styles.urgChipOn]} onPress={() => setUrgenza(u)}>
                  <Text style={[styles.urgTxt, urgenza === u && styles.urgTxtOn]}>{u === 'normale' ? 'Normale' : 'Urgente'}</Text>
                </Pressable>
              ))}
            </View>
            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
            <Pressable style={[styles.salva, (!valido || salvando) && styles.salvaOff]} disabled={!valido || salvando} onPress={salva}>
              {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.salvaTxt}>Invia a Finance</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  sub: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.md },
  list: { padding: spacing.md, paddingBottom: 96, gap: spacing.sm },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  beneficiario: { fontWeight: '800', color: colors.navy, fontSize: 15 },
  causale: { color: colors.testoSoft, fontSize: 13 },
  importo: { color: colors.oro, fontWeight: '900', fontSize: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statoBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  statoTxt: { color: colors.bianco, fontWeight: '800', fontSize: 11 },
  urgente: { color: colors.errore, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },
  owner: { color: colors.testoSoft, fontSize: 12, fontWeight: '700' },
  data: { color: colors.grigio, fontSize: 11, marginLeft: 'auto' },
  nota: { color: colors.testoSoft, fontSize: 12, fontStyle: 'italic' },
  iban: { color: colors.grigio, fontSize: 12 },
  statiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  statoChip: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.sfondo,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statoChipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 12 },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.sfondo,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    maxHeight: '90%',
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitolo: { fontSize: 18, fontWeight: '900', color: colors.testo },
  label: { fontSize: 11, fontWeight: '800', color: colors.grigio, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.testo,
  },
  urgRow: { flexDirection: 'row', gap: 6 },
  urgChip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  urgChipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  urgTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  urgTxtOn: { color: colors.bianco },
  errore: { color: colors.errore, fontSize: 13 },
  salva: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  salvaOff: { opacity: 0.4 },
  salvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
