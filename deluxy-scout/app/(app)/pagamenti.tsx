// Pagamenti: da una TRATTATIVA vinta si crea una richiesta di pagamento al cliente
// (anche parziale/acconto) e si MONITORA l'esito dell'incasso (inviata → pagata /
// parziale / insoluta…). RLS: le proprie; l'admin (supervisione) le vede tutte.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { colors, labelFase, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import {
  aggiornaRichiestaPagamento,
  fetchRichiestePagamento,
  fetchTutteTrattative,
  inserisciRichiestaPagamento,
  type TrattativaConLuogo,
} from '@/lib/db';

const LABEL: Record<StatoPagamento, string> = {
  inviata: 'Inviata',
  in_attesa: 'In attesa',
  pagata: 'Pagata',
  parziale: 'Parziale',
  insoluta: 'Insoluta',
  annullata: 'Annullata',
};
const COLORE: Record<StatoPagamento, string> = {
  inviata: colors.attenzione,
  in_attesa: colors.navy,
  pagata: colors.successo,
  parziale: colors.oro,
  insoluta: colors.errore,
  annullata: colors.grigio,
};
const STATI: StatoPagamento[] = ['inviata', 'in_attesa', 'pagata', 'parziale', 'insoluta', 'annullata'];
const eur = (n: number) => '€ ' + Number(n).toLocaleString('it-IT');

export default function Pagamenti() {
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
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

  const tot = useMemo(() => {
    const aperte = righe.filter((r) => r.stato !== 'pagata' && r.stato !== 'annullata');
    const daIncassare = aperte.reduce((s, r) => s + (r.importo - r.importo_incassato), 0);
    const incassato = righe.reduce((s, r) => s + r.importo_incassato, 0);
    return { daIncassare, incassato };
  }, [righe]);

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          {righe.length} richieste · {eur(tot.daIncassare)} da incassare · {eur(tot.incassato)} incassati
          {admin ? ' · supervisione' : ''}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        {!loading && righe.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna richiesta. Creane una da una trattativa col + in basso.</Text>
        ) : null}
        {righe.map((r) => (
          <RigaPagamento
            key={r.id}
            r={r}
            mostraOwner={admin}
            espansa={espansa === r.id}
            onToggle={() => setEspansa(espansa === r.id ? null : r.id)}
            onSalva={carica}
          />
        ))}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Richiesta pagamento</Text>
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

function RigaPagamento({
  r,
  mostraOwner,
  espansa,
  onToggle,
  onSalva,
}: {
  r: RichiestaPagamento;
  mostraOwner: boolean;
  espansa: boolean;
  onToggle: () => void;
  onSalva: () => void;
}) {
  const [incassato, setIncassato] = useState(String(r.importo_incassato || ''));
  const residuo = r.importo - r.importo_incassato;

  async function cambiaStato(stato: StatoPagamento) {
    // Se segno "pagata", l'incassato = importo pieno; "parziale" lascia il valore.
    const patch: any = { stato };
    if (stato === 'pagata') patch.importo_incassato = r.importo;
    await aggiornaRichiestaPagamento(r.id, patch);
    onSalva();
  }
  async function salvaIncassato() {
    const n = Number(incassato.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
    const stato: StatoPagamento = n <= 0 ? r.stato : n >= r.importo ? 'pagata' : 'parziale';
    await aggiornaRichiestaPagamento(r.id, { importo_incassato: n, stato });
    onSalva();
  }

  return (
    <Pressable style={styles.card} onPress={onToggle}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cliente} numberOfLines={1}>{r.cliente}</Text>
          {r.causale ? <Text style={styles.causale} numberOfLines={espansa ? undefined : 1}>{r.causale}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.importo}>{eur(r.importo)}</Text>
          {r.importo_incassato > 0 && r.importo_incassato < r.importo ? (
            <Text style={styles.incassatoParz}>incassati {eur(r.importo_incassato)}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.metaRow}>
        <View style={[styles.badge, { backgroundColor: COLORE[r.stato] }]}>
          <Text style={styles.badgeTxt}>{LABEL[r.stato]}</Text>
        </View>
        {r.scadenza ? <Text style={styles.meta}>entro {r.scadenza.slice(5).split('-').reverse().join('/')}</Text> : null}
        {mostraOwner && r.owner_nome ? (
          <Text style={styles.meta}><Ionicons name="person-circle-outline" size={12} color={colors.testoSoft} /> {r.owner_nome}</Text>
        ) : null}
        <Text style={styles.data}>{r.created_at.slice(0, 10)}</Text>
      </View>

      {espansa ? (
        <View style={styles.espansa}>
          <Text style={styles.label}>Esito</Text>
          <View style={styles.statiRow}>
            {STATI.map((s) => (
              <Pressable
                key={s}
                style={[styles.statoChip, r.stato === s && { backgroundColor: COLORE[s], borderColor: COLORE[s] }]}
                onPress={() => cambiaStato(s)}
              >
                <Text style={[styles.statoChipTxt, r.stato === s && { color: colors.bianco }]}>{LABEL[s]}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Incassato (€) — residuo {eur(residuo > 0 ? residuo : 0)}</Text>
          <View style={styles.incassoRow}>
            <TextInput
              style={styles.incassoInput}
              value={incassato}
              onChangeText={setIncassato}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.grigio}
            />
            <Pressable style={styles.incassoBtn} onPress={salvaIncassato}>
              <Text style={styles.incassoBtnTxt}>Aggiorna</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Form: nuova richiesta a partire da una trattativa ──────────────────────────
function NuovaRichiestaModal({ onClose, onCreata }: { onClose: () => void; onCreata: () => void }) {
  const [trattative, setTrattative] = useState<TrattativaConLuogo[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [scelta, setScelta] = useState<TrattativaConLuogo | null>(null);
  const [cliente, setCliente] = useState('');
  const [importo, setImporto] = useState('');
  const [causale, setCausale] = useState('');
  const [scadenza, setScadenza] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const caricate = useRef(false);

  useEffect(() => {
    if (caricate.current) return;
    caricate.current = true;
    fetchTutteTrattative().then(setTrattative).catch(() => setTrattative([]));
  }, []);

  const risultati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    // Vinte prima (sono la fonte tipica di una richiesta di pagamento).
    const ord = [...trattative].sort((a, b) => (a.fase === 'closedwon' ? -1 : 0) - (b.fase === 'closedwon' ? -1 : 0));
    return ord
      .filter((d) => (q ? (d.place_nome ?? '').toLowerCase().includes(q) : true))
      .slice(0, 12);
  }, [trattative, ricerca]);

  function seleziona(d: TrattativaConLuogo) {
    setScelta(d);
    setCliente(d.place_nome ?? '');
    setImporto(d.valore_atteso != null ? String(d.valore_atteso) : '');
  }

  const valido = cliente.trim() && Number(importo.replace(',', '.')) > 0;

  async function salva() {
    if (!valido || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      await inserisciRichiestaPagamento({
        cliente: cliente.trim(),
        importo: Number(importo.replace(',', '.')),
        causale: causale.trim() || null,
        scadenza,
        deal_id: scelta && !scelta.id.startsWith('hs_') && !scelta.id.startsWith('ana_') ? scelta.id : null,
        place_id: scelta?.place_id || null,
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
            <Text style={styles.label}>Trattativa</Text>
            {scelta ? (
              <View style={styles.scelta}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sceltaNome} numberOfLines={1}>{scelta.place_nome ?? 'Trattativa'}</Text>
                  <Text style={styles.sceltaMeta}>
                    {labelFase[scelta.fase]}{scelta.valore_atteso != null ? ` · ${eur(scelta.valore_atteso)}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => setScelta(null)} hitSlop={8}>
                  <Ionicons name="swap-horizontal" size={20} color={colors.oro} />
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={ricerca}
                  onChangeText={setRicerca}
                  placeholder="Cerca la trattativa (per negozio)…"
                  placeholderTextColor={colors.grigio}
                  autoFocus
                />
                {risultati.map((d) => (
                  <Pressable key={d.id} style={styles.risultato} onPress={() => seleziona(d)}>
                    <Ionicons name="briefcase-outline" size={16} color={colors.testoSoft} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.risNome} numberOfLines={1}>{d.place_nome ?? 'Trattativa'}</Text>
                      <Text style={styles.risMeta}>
                        {labelFase[d.fase]}{d.valore_atteso != null ? ` · ${eur(d.valore_atteso)}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                <Text style={styles.notaLibero}>Oppure compila i campi sotto per una richiesta libera.</Text>
              </>
            )}

            <Text style={styles.label}>Cliente *</Text>
            <TextInput style={styles.input} value={cliente} onChangeText={setCliente} placeholder="Chi deve pagare" placeholderTextColor={colors.grigio} />
            <Text style={styles.label}>Importo richiesto (€) * — anche parziale/acconto</Text>
            <TextInput style={styles.input} value={importo} onChangeText={setImporto} placeholder="es. 500" placeholderTextColor={colors.grigio} keyboardType="decimal-pad" />
            <Text style={styles.label}>Causale</Text>
            <TextInput style={styles.input} value={causale} onChangeText={setCausale} placeholder="es. Acconto 30% ordine primavera" placeholderTextColor={colors.grigio} />
            <Text style={styles.label}>Scadenza incasso</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, !scadenza && styles.chipOn]} onPress={() => setScadenza(null)}>
                <Text style={[styles.chipTxt, !scadenza && styles.chipTxtOn]}>Nessuna</Text>
              </Pressable>
              {[7, 15, 30].map((g) => {
                const iso = isoTraGiorni(g);
                return (
                  <Pressable key={g} style={[styles.chip, scadenza === iso && styles.chipOn]} onPress={() => setScadenza(iso)}>
                    <Text style={[styles.chipTxt, scadenza === iso && styles.chipTxtOn]}>+{g}g</Text>
                  </Pressable>
                );
              })}
            </View>

            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
            <Pressable style={[styles.salva, (!valido || salvando) && styles.salvaOff]} disabled={!valido || salvando} onPress={salva}>
              {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.salvaTxt}>Crea richiesta</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function isoTraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  sub: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.md },
  list: { padding: spacing.md, paddingBottom: 96, gap: spacing.sm },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cliente: { fontWeight: '800', color: colors.navy, fontSize: 15 },
  causale: { color: colors.testoSoft, fontSize: 13 },
  importo: { color: colors.oro, fontWeight: '900', fontSize: 16 },
  incassatoParz: { color: colors.successo, fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { color: colors.bianco, fontWeight: '800', fontSize: 11 },
  meta: { color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  data: { color: colors.grigio, fontSize: 11, marginLeft: 'auto' },
  espansa: { gap: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: spacing.sm },
  statiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statoChip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.sfondo, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statoChipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 12 },
  incassoRow: { flexDirection: 'row', gap: 8 },
  incassoInput: { flex: 1, backgroundColor: colors.sfondo, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 15, color: colors.testo },
  incassoBtn: { backgroundColor: colors.navy, borderRadius: radius.md, paddingHorizontal: 16, justifyContent: 'center' },
  incassoBtnTxt: { color: colors.bianco, fontWeight: '800', fontSize: 13 },
  fab: {
    position: 'absolute', right: spacing.md, bottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.navy, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 18, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.sfondo, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitolo: { fontSize: 18, fontWeight: '900', color: colors.testo },
  label: { fontSize: 11, fontWeight: '800', color: colors.grigio, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  input: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 15, color: colors.testo },
  risultato: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9 },
  risNome: { fontWeight: '700', color: colors.testo, fontSize: 14 },
  risMeta: { color: colors.testoSoft, fontSize: 12 },
  notaLibero: { color: colors.grigio, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  scelta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.oro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sceltaNome: { fontWeight: '800', color: colors.testo, fontSize: 15 },
  sceltaMeta: { color: colors.testoSoft, fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  errore: { color: colors.errore, fontSize: 13 },
  salva: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  salvaOff: { opacity: 0.4 },
  salvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
