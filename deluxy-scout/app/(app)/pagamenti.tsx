// Pagamenti: da una TRATTATIVA vinta si crea una richiesta di pagamento al cliente
// (anche parziale/acconto) e si MONITORA l'esito dell'incasso (inviata → pagata /
// parziale / insoluta…). RLS: le proprie; l'admin (supervisione) le vede tutte.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  aggiornaRataPagata,
  aggiornaRichiestaPagamento,
  fetchPreferenzaProforma,
  fetchRichiestePagamento,
  fetchTutteTrattative,
  inserisciRichiestaPagamento,
  salvaRiferimentoProforma,
  type TrattativaConLuogo,
} from '@/lib/db';
import { confermaPagamentoProforma, creaProformaDaRichiesta } from '@/lib/partner';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';

const LABEL: Record<StatoPagamento, string> = {
  inviata: 'Inviata',
  in_attesa: 'In attesa',
  pagata: 'Pagata',
  parziale: 'Parziale',
  insoluta: 'Insoluta',
  annullata: 'Annullata',
};
// Colori semantici DS: blue = in corso, orange = da gestire, green = ok,
// purple = stato intermedio, red = problema, grigio = neutro.
const COLORE: Record<StatoPagamento, string> = {
  inviata: colors.blue,
  in_attesa: colors.attenzione,
  pagata: colors.successo,
  parziale: colors.purple,
  insoluta: colors.errore,
  annullata: colors.grigio,
};
const STATI: StatoPagamento[] = ['inviata', 'in_attesa', 'pagata', 'parziale', 'insoluta', 'annullata'];
const eur = (n: number) => '€ ' + Number(n).toLocaleString('it-IT');
const ddmm = (iso: string | null) => (iso ? iso.slice(5).split('-').reverse().join('/') : null);

type RataForm = { key: number; etichetta: string; modo: 'valore' | 'percentuale'; valore: string; scadenza: string | null };
function importoRata(r: RataForm, totale: number): number {
  const v = Number((r.valore || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  return r.modo === 'percentuale' ? Math.round((totale * v) / 100) : v;
}

export default function Pagamenti() {
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const [righe, setRighe] = useState<RichiestaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [formAperto, setFormAperto] = useState(false);
  const [espansa, setEspansa] = useState<string | null>(null);
  const [storicoAperto, setStoricoAperto] = useState(false);

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

  // Le annullate escono dalla lista operativa e finiscono nello Storico in fondo.
  const { attive, annullate } = useMemo(
    () => ({
      attive: righe.filter((r) => r.stato !== 'annullata'),
      annullate: righe.filter((r) => r.stato === 'annullata'),
    }),
    [righe],
  );

  return (
    <View style={styles.container}>
      <PageIntro testo="Chiedi l'incasso di una trattativa vinta (anche un acconto o più rate) e segui qui l'esito dei pagamenti." />
      <View style={styles.head}>
        <Text style={styles.sub}>
          {righe.length} richieste · {eur(tot.daIncassare)} da incassare · {eur(tot.incassato)} incassati
          {admin ? ' · vedi anche quelle del team' : ''}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        {!loading && righe.length === 0 ? (
          <EmptyState
            icona="cash-outline"
            titolo="Nessuna richiesta di pagamento"
            aiuto="Quando chiudi una trattativa, crea da qui la richiesta di incasso per il cliente e monitorane l'esito."
            azione="Nuova richiesta"
            onAzione={() => setFormAperto(true)}
          />
        ) : null}
        {!loading && righe.length > 0 && attive.length === 0 ? (
          <Text style={styles.notaVuota}>Nessuna richiesta attiva: sono tutte nello Storico qui sotto.</Text>
        ) : null}
        {attive.map((r) => (
          <RigaPagamento
            key={r.id}
            r={r}
            mostraOwner={admin}
            espansa={espansa === r.id}
            onToggle={() => setEspansa(espansa === r.id ? null : r.id)}
            onSalva={carica}
          />
        ))}

        {/* Storico: le richieste annullate, fuori dalla lista operativa. */}
        {annullate.length > 0 ? (
          <>
            <Pressable style={styles.storicoHead} onPress={() => setStoricoAperto((v) => !v)}>
              <Ionicons name="archive-outline" size={15} color={colors.testoSoft} />
              <Text style={styles.storicoTitolo}>
                Storico · {annullate.length} annullat{annullate.length === 1 ? 'a' : 'e'}
              </Text>
              <Ionicons name={storicoAperto ? 'chevron-up' : 'chevron-down'} size={15} color={colors.grigio} />
            </Pressable>
            {storicoAperto
              ? annullate.map((r) => (
                  <RigaPagamento
                    key={r.id}
                    r={r}
                    mostraOwner={admin}
                    espansa={espansa === r.id}
                    onToggle={() => setEspansa(espansa === r.id ? null : r.id)}
                    onSalva={carica}
                  />
                ))
              : null}
          </>
        ) : null}
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

  // Incasso completo + pro-forma collegata → comunica il pagamento a Deluxy
  // Partner (PATCH /api/proforma via Edge Function: la pro-forma passa a
  // "fatturata"). Idempotente e best effort: se Partner non risponde l'incasso
  // resta registrato qui e si può ritentare (o confermare da Deluxy Partner).
  async function comunicaProforma(stato: StatoPagamento) {
    if (stato !== 'pagata' || !r.proforma_numero) return;
    try {
      await confermaPagamentoProforma(r.proforma_numero);
    } catch (e) {
      console.warn(`Pro-forma ${r.proforma_numero}: conferma pagamento non riuscita`, e);
    }
  }

  async function cambiaStato(stato: StatoPagamento) {
    // Se segno "pagata", l'incassato = importo pieno; "parziale" lascia il valore.
    const patch: any = { stato };
    if (stato === 'pagata') patch.importo_incassato = r.importo;
    await aggiornaRichiestaPagamento(r.id, patch);
    await comunicaProforma(stato);
    onSalva();
  }
  async function salvaIncassato() {
    const n = Number(incassato.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
    const stato: StatoPagamento = n <= 0 ? r.stato : n >= r.importo ? 'pagata' : 'parziale';
    await aggiornaRichiestaPagamento(r.id, { importo_incassato: n, stato });
    await comunicaProforma(stato);
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
        <StatusBadge small label={LABEL[r.stato]} colore={COLORE[r.stato]} />
        {r.rate && r.rate.length ? (
          <Text style={styles.meta}>{r.rate.filter((x) => x.pagata).length}/{r.rate.length} rate</Text>
        ) : r.scadenza ? (
          <Text style={styles.meta}>entro {ddmm(r.scadenza)}</Text>
        ) : null}
        {r.proforma_numero ? (
          <Pressable
            style={styles.pfChip}
            hitSlop={6}
            onPress={(e) => {
              (e as any)?.stopPropagation?.();
              if (r.proforma_url) Linking.openURL(r.proforma_url);
            }}
            accessibilityLabel={`Apri pro-forma ${r.proforma_numero} su Deluxy Partner`}
          >
            <Ionicons name="document-text-outline" size={11} color={colors.goldStrong} />
            <Text style={styles.pfChipTxt}>{r.proforma_numero}</Text>
          </Pressable>
        ) : null}
        {mostraOwner && r.owner_nome ? (
          <Text style={styles.meta}><Ionicons name="person-circle-outline" size={12} color={colors.testoSoft} /> {r.owner_nome}</Text>
        ) : null}
        <Text style={styles.data}>{r.created_at.slice(0, 10).split('-').reverse().join('/')}</Text>
        <Ionicons name={espansa ? 'chevron-up' : 'chevron-down'} size={15} color={colors.grigio} />
      </View>
      {!espansa ? <Text style={styles.hint}>Tocca per aggiornare stato e incassi</Text> : null}

      {espansa ? (
        <View style={styles.espansa}>
          {r.rate && r.rate.length ? (
            <>
              <Text style={styles.label}>Rate — spunta quelle incassate</Text>
              {r.rate.map((rt) => (
                <Pressable
                  key={rt.id}
                  style={styles.rataMon}
                  onPress={async () => {
                    const stato = await aggiornaRataPagata({ id: rt.id, richiesta_id: r.id }, !rt.pagata);
                    await comunicaProforma(stato);
                    onSalva();
                  }}
                >
                  <Ionicons
                    name={rt.pagata ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={rt.pagata ? colors.successo : colors.grigio}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rataMonNome, rt.pagata && styles.rataMonPagata]}>
                      {rt.etichetta || 'Rata'}
                      {rt.modo === 'percentuale' && rt.percentuale != null ? ` · ${rt.percentuale}%` : ''}
                    </Text>
                    {rt.scadenza ? <Text style={styles.rataMonScad}>entro {ddmm(rt.scadenza)}</Text> : null}
                  </View>
                  <Text style={styles.rataMonImp}>{eur(rt.importo)}</Text>
                </Pressable>
              ))}
              <Text style={styles.label}>Stato dell'incasso</Text>
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
            </>
          ) : (
            <>
              <Text style={styles.label}>Stato dell'incasso</Text>
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
            </>
          )}
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
  const [rate, setRate] = useState<RataForm[]>([]);
  // Attiva di default; si disattiva da Profilo → Pagamenti (preferenza per utente).
  const [conProforma, setConProforma] = useState(true);
  const [avvisoProforma, setAvvisoProforma] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const caricate = useRef(false);
  // Se la richiesta è già stata creata (ma la pro-forma no), non ricrearla.
  const richiestaCreata = useRef(false);
  const ultimaCreata = useRef<string | null>(null);

  useEffect(() => {
    if (caricate.current) return;
    caricate.current = true;
    fetchTutteTrattative().then(setTrattative).catch(() => setTrattative([]));
    // Preferenza dell'utente (Profilo → Pagamenti): resta true se non impostata.
    fetchPreferenzaProforma().then(setConProforma).catch(() => {});
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

  const totaleImporto = Number(importo.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  const assegnato = rate.reduce((s, r) => s + importoRata(r, totaleImporto), 0);
  const valido = cliente.trim() && totaleImporto > 0;

  async function salva() {
    if (!valido || salvando) return;
    setSalvando(true);
    setErrore(null);
    setAvvisoProforma(null);
    try {
      if (!richiestaCreata.current) {
        await inserisciRichiestaPagamento({
          cliente: cliente.trim(),
          importo: totaleImporto,
          causale: causale.trim() || null,
          scadenza,
          deal_id: scelta && !scelta.id.startsWith('hs_') && !scelta.id.startsWith('ana_') ? scelta.id : null,
          place_id: scelta?.place_id || null,
          rate: rate.length
            ? rate.map((r) => ({
                etichetta: r.etichetta.trim() || null,
                modo: r.modo,
                percentuale: r.modo === 'percentuale' ? Number(r.valore.replace(',', '.')) || 0 : null,
                importo: importoRata(r, totaleImporto),
                scadenza: r.scadenza,
              }))
            : undefined,
        }).then((nuova) => {
          richiestaCreata.current = true;
          ultimaCreata.current = nuova.id;
        });
      }

      // Pro-forma su Deluxy Partner (opzionale): la richiesta resta valida
      // anche se l'emissione fallisce — si può ritentare o farla dall'app Partner.
      if (conProforma) {
        try {
          const pf = await creaProformaDaRichiesta({
            cliente: cliente.trim(),
            importo: totaleImporto,
            causale: causale.trim() || null,
            scadenza,
          });
          if (ultimaCreata.current) await salvaRiferimentoProforma(ultimaCreata.current, pf.riferimento, pf.url);
        } catch (e: any) {
          setAvvisoProforma(
            `Richiesta creata, ma pro-forma non emessa: ${e?.message ?? 'errore sconosciuto'} ` +
              'Puoi ritentare con "Crea richiesta" o emetterla da Deluxy Partner.',
          );
          setSalvando(false);
          return;
        }
      }
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
                    <Text style={[styles.chipTxt, scadenza === iso && styles.chipTxtOn]}>entro {g} gg</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Split in rate: per valore € o % del totale, ognuna con scadenza */}
            <View style={styles.rateHead}>
              <Text style={styles.label}>Rate di pagamento</Text>
              <Pressable
                onPress={() =>
                  setRate((rs) => [...rs, { key: Date.now() + rs.length, etichetta: '', modo: 'percentuale', valore: '', scadenza: null }])
                }
                hitSlop={8}
              >
                <Text style={styles.aggiungiRata}>+ Aggiungi rata</Text>
              </Pressable>
            </View>
            {rate.length === 0 ? (
              <Text style={styles.notaLibero}>
                Senza rate il pagamento è unico. Con "+ Aggiungi rata" dividi l'importo (es. acconto 30% e saldo).
              </Text>
            ) : (
              rate.map((rt, idx) => (
                <View key={rt.key} style={styles.rataRow}>
                  <View style={styles.rataTop}>
                    <TextInput
                      style={styles.rataEtich}
                      value={rt.etichetta}
                      onChangeText={(t) => setRate((rs) => rs.map((x) => (x.key === rt.key ? { ...x, etichetta: t } : x)))}
                      placeholder={idx === 0 ? 'Nome rata (es. Acconto)' : 'Nome rata (es. Saldo)'}
                      placeholderTextColor={colors.grigio}
                    />
                    <Pressable onPress={() => setRate((rs) => rs.filter((x) => x.key !== rt.key))} hitSlop={8} accessibilityLabel="Elimina rata">
                      <Ionicons name="trash-outline" size={18} color={colors.grigio} />
                    </Pressable>
                  </View>
                  <View style={styles.rataQuanto}>
                    <Text style={styles.rataMiniLabel}>Quanto</Text>
                    <View style={styles.modoToggle}>
                      {(['percentuale', 'valore'] as const).map((m) => (
                        <Pressable
                          key={m}
                          style={[styles.modoBtn, rt.modo === m && styles.modoBtnOn]}
                          onPress={() => setRate((rs) => rs.map((x) => (x.key === rt.key ? { ...x, modo: m } : x)))}
                          accessibilityLabel={m === 'percentuale' ? 'In percentuale del totale' : 'In euro'}
                        >
                          <Text style={[styles.modoTxt, rt.modo === m && styles.modoTxtOn]}>{m === 'percentuale' ? '% del totale' : '€'}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      style={styles.rataVal}
                      value={rt.valore}
                      onChangeText={(t) => setRate((rs) => rs.map((x) => (x.key === rt.key ? { ...x, valore: t } : x)))}
                      placeholder="Valore"
                      placeholderTextColor={colors.grigio}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.rataCalc}>= {eur(importoRata(rt, totaleImporto))}</Text>
                  </View>
                  <View style={styles.rataBottom}>
                    <Text style={styles.rataMiniLabel}>Scadenza</Text>
                    <View style={styles.chipRow}>
                      <Pressable style={[styles.chipMini, !rt.scadenza && styles.chipOn]} onPress={() => setRate((rs) => rs.map((x) => (x.key === rt.key ? { ...x, scadenza: null } : x)))}>
                        <Text style={[styles.chipTxt, !rt.scadenza && styles.chipTxtOn]}>Nessuna</Text>
                      </Pressable>
                      {[15, 30, 60].map((g) => {
                        const iso = isoTraGiorni(g);
                        return (
                          <Pressable key={g} style={[styles.chipMini, rt.scadenza === iso && styles.chipOn]} onPress={() => setRate((rs) => rs.map((x) => (x.key === rt.key ? { ...x, scadenza: iso } : x)))}>
                            <Text style={[styles.chipTxt, rt.scadenza === iso && styles.chipTxtOn]}>entro {g} gg</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ))
            )}
            {rate.length ? (
              <Text style={[styles.notaLibero, Math.abs(assegnato - totaleImporto) > 0.5 && { color: colors.errore }]}>
                Rate per {eur(assegnato)} su {eur(totaleImporto)} totali
                {totaleImporto - assegnato !== 0 ? ` · mancano ${eur(totaleImporto - assegnato)}` : ' · tutto assegnato ✓'}
              </Text>
            ) : null}

            {/* Pro-forma su Deluxy Partner (opzionale) */}
            <Pressable style={styles.proformaRow} onPress={() => setConProforma((v) => !v)}>
              <Ionicons
                name={conProforma ? 'checkbox' : 'square-outline'}
                size={20}
                color={conProforma ? colors.ink : colors.grigio}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.proformaTitolo}>Emetti anche la pro-forma su Deluxy Partner</Text>
                <Text style={styles.proformaNota}>
                  Il cliente dev'essere un partner del registro. L'importo è inteso IVA inclusa: in pro-forma
                  l'imponibile viene scorporato (22%). Attiva di default — si disattiva da Profilo → Pagamenti.
                </Text>
              </View>
            </Pressable>

            {avvisoProforma ? <Text style={styles.errore}>{avvisoProforma}</Text> : null}
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
  notaVuota: { color: colors.grigio, fontSize: 13, textAlign: 'center', marginVertical: spacing.sm },
  hint: { color: colors.grigio, fontSize: 11 },
  storicoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
  },
  storicoTitolo: { flex: 1, color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cliente: { fontWeight: '800', color: colors.navy, fontSize: 15 },
  causale: { color: colors.testoSoft, fontSize: 13 },
  importo: { color: colors.oro, fontWeight: '900', fontSize: 16 },
  incassatoParz: { color: colors.successo, fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { color: colors.testoSoft, fontSize: 12, fontWeight: '600' },
  data: { color: colors.grigio, fontSize: 11, marginLeft: 'auto' },
  espansa: { gap: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: spacing.sm },
  statiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statoChip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.sfondo, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statoChipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 12 },
  incassoRow: { flexDirection: 'row', gap: 8 },
  incassoInput: { flex: 1, backgroundColor: colors.sfondo, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 15, color: colors.testo },
  incassoBtn: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: 18, justifyContent: 'center' },
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
  pfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pfChipTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 11 },
  proformaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  proformaTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  proformaNota: { color: colors.grigio, fontSize: 12, lineHeight: 16, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  errore: { color: colors.errore, fontSize: 13 },
  // Editor rate
  rateHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  aggiungiRata: { color: colors.oro, fontWeight: '800', fontSize: 13 },
  rataRow: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, padding: 10, gap: 8 },
  rataTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rataEtich: { flex: 1, backgroundColor: colors.sfondo, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 7, fontSize: 13, color: colors.testo },
  rataQuanto: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rataMiniLabel: { color: colors.grigio, fontSize: 11, fontWeight: '700', width: 62 },
  modoToggle: { flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.grigioChiaro },
  modoBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.sfondo },
  modoBtnOn: { backgroundColor: colors.navy },
  modoTxt: { fontWeight: '700', fontSize: 12.5, color: colors.testoSoft },
  modoTxtOn: { color: colors.bianco },
  rataVal: { width: 76, backgroundColor: colors.sfondo, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 7, fontSize: 13, color: colors.testo, textAlign: 'right' },
  rataBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rataCalc: { color: colors.goldStrong, fontWeight: '800', fontSize: 13, marginLeft: 'auto' },
  chipMini: { backgroundColor: colors.sfondo, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  // Monitoraggio rate
  rataMon: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rataMonNome: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  rataMonPagata: { color: colors.grigio, textDecorationLine: 'line-through' },
  rataMonScad: { color: colors.testoSoft, fontSize: 12 },
  rataMonImp: { color: colors.oro, fontWeight: '800', fontSize: 14 },
  salva: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  salvaOff: { opacity: 0.4 },
  salvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
