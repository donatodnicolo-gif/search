// Pianificazione settimanale: per ogni giorno della settimana le attività da
// fare (visite con le STRADE da battere, chiamate, appuntamenti, ufficio).
// Un'attività può valere solo per una settimana o ripetersi ogni settimana.
// DS: pagina con caption, card per giorno, chip a pillola, bottoni ink/fill,
// quattro stati (caricamento / vuoto / errore / dati).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { TIPI_PIANO, type PianoAttivita, type TipoPiano } from '@/types';
import { colors, iconaTipoPiano, labelTipoPiano, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { aggiornaPiano, eliminaPiano, fetchPiano, inserisciPiano } from '@/lib/db';
import {
  GIORNI_BREVI,
  GIORNI_SETTIMANA,
  attivitaDelGiorno,
  dataDelGiorno,
  etichettaSettimana,
  isoLocale,
  lunediDi,
  normalizzaStrade,
  spostaSettimana,
  urlStrada,
} from '@/lib/pianificazione';
import { Btn, EmptyState, PageIntro } from '@/components/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function Pianificazione() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const admin = isAdmin(session?.user?.email);
  const oggiIso = isoLocale(new Date());
  const [lunedi, setLunedi] = useState(() => lunediDi(new Date()));
  const [rows, setRows] = useState<PianoAttivita[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [scope, setScope] = useState<'miei' | 'tutti'>('miei');
  const [form, setForm] = useState<{ giorno: number; attivita?: PianoAttivita } | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setRows(await fetchPiano(lunedi));
    } catch (e: any) {
      setErrore(e?.message ?? 'Impossibile caricare il piano.');
    } finally {
      setLoading(false);
    }
  }, [lunedi]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const visibili = useMemo(
    () => (scope === 'miei' && uid ? rows.filter((r) => r.owner === uid) : rows),
    [rows, scope, uid],
  );

  async function rimuovi(a: PianoAttivita) {
    setRows((prev) => prev.filter((x) => x.id !== a.id));
    try {
      await eliminaPiano(a.id);
    } catch {
      carica();
    }
  }

  const settimanaCorrente = lunedi === lunediDi(new Date());

  return (
    <View style={styles.container}>
      <PageIntro testo="Il tuo piano della settimana, giorno per giorno: visite con le strade da battere, chiamate, appuntamenti. Le attività «ogni settimana» si ripetono da sole." />

      {/* Navigazione settimana */}
      <View style={styles.settimanaBar}>
        <Pressable style={styles.freccia} onPress={() => setLunedi((l) => spostaSettimana(l, -1))} accessibilityLabel="Settimana precedente">
          <Ionicons name="chevron-back" size={20} color={colors.testo} />
        </Pressable>
        <View style={styles.settimanaTitolo}>
          <Text style={styles.settimanaTxt}>{etichettaSettimana(lunedi)}</Text>
          {!settimanaCorrente ? (
            <Pressable onPress={() => setLunedi(lunediDi(new Date()))}>
              <Text style={styles.settimanaOggi}>Torna a questa settimana</Text>
            </Pressable>
          ) : (
            <Text style={styles.settimanaSotto}>Questa settimana</Text>
          )}
        </View>
        <Pressable style={styles.freccia} onPress={() => setLunedi((l) => spostaSettimana(l, 1))} accessibilityLabel="Settimana successiva">
          <Ionicons name="chevron-forward" size={20} color={colors.testo} />
        </Pressable>
      </View>

      {admin ? (
        <View style={styles.toggle}>
          <Seg label="Il mio piano" on={scope === 'miei'} onPress={() => setScope('miei')} />
          <Seg label="Tutto il team" on={scope === 'tutti'} onPress={() => setScope('tutti')} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}>
        {errore ? (
          <View style={styles.erroreBox}>
            <Text style={styles.erroreTxt}>{errore}</Text>
            <Text style={styles.erroreAiuto}>Se è la prima volta: la tabella «pianificazione» va creata con la migrazione 0030.</Text>
          </View>
        ) : null}

        {!loading && !errore && visibili.length === 0 ? (
          <EmptyState
            icona="calendar-number-outline"
            titolo="Settimana ancora vuota"
            aiuto="Aggiungi le attività giorno per giorno: per le visite indica le strade da battere, così il giro è già pronto."
            azione="Pianifica lunedì"
            onAzione={() => setForm({ giorno: 1 })}
          />
        ) : null}

        {[1, 2, 3, 4, 5, 6, 7].map((g) => {
          const dataIso = dataDelGiorno(lunedi, g);
          const oggi = dataIso === oggiIso;
          const lista = attivitaDelGiorno(visibili, lunedi, g);
          return (
            <View key={g} style={[styles.giorno, oggi && styles.giornoOggi]}>
              <View style={styles.giornoHead}>
                <View style={styles.giornoTitoloWrap}>
                  {oggi ? <View style={styles.dotOggi} /> : null}
                  <Text style={styles.giornoTitolo}>{GIORNI_SETTIMANA[g - 1]}</Text>
                  <Text style={styles.giornoData}>{dataIso.slice(8, 10)}/{dataIso.slice(5, 7)}</Text>
                  {oggi ? <Text style={styles.oggiTxt}>oggi</Text> : null}
                </View>
                <Btn tipo="secondario" small icona="add" label="Aggiungi" onPress={() => setForm({ giorno: g })} />
              </View>

              {loading && lista.length === 0 ? (
                <Text style={styles.vuoto}>Caricamento…</Text>
              ) : lista.length === 0 ? (
                <Text style={styles.vuoto}>Niente in programma.</Text>
              ) : (
                lista.map((a) => (
                  <RigaAttivita
                    key={a.id}
                    a={a}
                    mostraOwner={scope === 'tutti' && a.owner !== uid}
                    mia={a.owner === uid}
                    onEdit={() => setForm({ giorno: g, attivita: a })}
                    onDelete={() => rimuovi(a)}
                  />
                ))
              )}
            </View>
          );
        })}
      </ScrollView>

      {form ? (
        <PianoFormModal
          giorno={form.giorno}
          lunedi={lunedi}
          attivita={form.attivita}
          onClose={() => setForm(null)}
          onSalvato={() => {
            setForm(null);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

function Seg({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.seg, on && styles.segOn]} onPress={onPress}>
      <Text style={[styles.segTxt, on && styles.segTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function RigaAttivita({
  a,
  mostraOwner,
  mia,
  onEdit,
  onDelete,
}: {
  a: PianoAttivita;
  mostraOwner: boolean;
  mia: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.riga}>
      <Pressable style={styles.rigaMain} onPress={mia ? onEdit : undefined} disabled={!mia}>
        <View style={styles.rigaIcona}>
          <Ionicons name={iconaTipoPiano[a.tipo] as IconName} size={18} color={colors.goldStrong} />
        </View>
        <View style={styles.rigaInfo}>
          <Text style={styles.rigaTitolo} numberOfLines={2}>
            {a.titolo}
          </Text>
          <View style={styles.rigaMeta}>
            <Text style={styles.meta}>{labelTipoPiano[a.tipo]}</Text>
            {a.zona ? <Text style={styles.meta}>· {a.zona}</Text> : null}
            {a.settimana == null ? (
              <View style={styles.ripeti}>
                <Ionicons name="repeat-outline" size={12} color={colors.testoSoft} />
                <Text style={styles.meta}>ogni settimana</Text>
              </View>
            ) : null}
            {mostraOwner && a.owner_nome ? (
              <>
                <Ionicons name="person-circle-outline" size={13} color={colors.testoSoft} />
                <Text style={styles.meta}>{a.owner_nome}</Text>
              </>
            ) : null}
          </View>
          {a.tipo === 'visita' && a.strade.length ? (
            <View style={styles.strade}>
              {a.strade.map((s) => (
                <Pressable key={s} style={styles.strada} onPress={() => Linking.openURL(urlStrada(s, a.zona ?? 'Milano'))} hitSlop={4}>
                  <Ionicons name="navigate-outline" size={12} color={colors.testo} />
                  <Text style={styles.stradaTxt} numberOfLines={1}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {a.note ? <Text style={styles.note}>{a.note}</Text> : null}
        </View>
      </Pressable>
      {mia ? (
        <Pressable onPress={onDelete} hitSlop={8} style={styles.del} accessibilityLabel="Elimina attività">
          <Ionicons name="trash-outline" size={17} color={colors.grigio} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Form crea/modifica attività del piano ─────────────────────────────────────
function PianoFormModal({
  giorno,
  lunedi,
  attivita,
  onClose,
  onSalvato,
}: {
  giorno: number;
  lunedi: string;
  attivita?: PianoAttivita;
  onClose: () => void;
  onSalvato: () => void;
}) {
  const inModifica = !!attivita;
  const [tipo, setTipo] = useState<TipoPiano>(attivita?.tipo ?? 'visita');
  const [titolo, setTitolo] = useState(attivita?.titolo ?? '');
  const [giorni, setGiorni] = useState<number[]>(attivita ? [attivita.giorno_settimana] : [giorno]);
  const [ogniSettimana, setOgniSettimana] = useState(attivita ? attivita.settimana == null : false);
  const [strade, setStrade] = useState<string[]>(attivita?.strade ?? []);
  const [stradaInput, setStradaInput] = useState('');
  const [zona, setZona] = useState(attivita?.zona ?? '');
  const [note, setNote] = useState(attivita?.note ?? '');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Cambiando tipo, il titolo di default segue (se l'utente non l'ha scritto).
  useEffect(() => {
    setErrore(null);
  }, [tipo]);

  function toggleGiorno(g: number) {
    if (inModifica) {
      setGiorni([g]);
      return;
    }
    setGiorni((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].sort()));
  }

  function aggiungiStrade() {
    const nuove = normalizzaStrade(stradaInput);
    if (!nuove.length) return;
    setStrade((cur) => normalizzaStrade([...cur, ...nuove]));
    setStradaInput('');
  }

  async function salva() {
    if (salvando) return;
    const t = titolo.trim() || labelTipoPiano[tipo];
    if (!giorni.length) {
      setErrore('Scegli almeno un giorno.');
      return;
    }
    const stradeFinali = tipo === 'visita' ? normalizzaStrade([...strade, ...normalizzaStrade(stradaInput)]) : [];
    setSalvando(true);
    setErrore(null);
    try {
      const base = {
        tipo,
        titolo: t,
        strade: stradeFinali,
        zona: zona.trim() || null,
        note: note.trim() || null,
        settimana: ogniSettimana ? null : lunedi,
      };
      if (inModifica && attivita) {
        await aggiornaPiano(attivita.id, { ...base, giorno_settimana: giorni[0] });
      } else {
        await inserisciPiano(giorni.map((g) => ({ ...base, giorno_settimana: g })));
      }
      onSalvato();
    } catch (e: any) {
      setErrore(e?.message ?? 'Salvataggio non riuscito.');
      setSalvando(false);
    }
  }

  const placeholderTitolo: Record<TipoPiano, string> = {
    visita: 'es. Giro Quadrilatero',
    chiamate: 'es. Richiami fioristi',
    appuntamento: 'es. Incontro con Armani Fiori',
    ufficio: 'es. Preventivi e recap email',
    altro: 'Cosa c’è da fare',
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitolo}>{inModifica ? 'Modifica attività' : 'Nuova attività'}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Tipo di attività</Text>
            <View style={styles.chips}>
              {TIPI_PIANO.map((t) => (
                <Pressable key={t} style={[styles.chip, tipo === t && styles.chipOn]} onPress={() => setTipo(t)}>
                  <Ionicons name={iconaTipoPiano[t] as IconName} size={14} color={tipo === t ? colors.bianco : colors.testoSoft} />
                  <Text style={[styles.chipTxt, tipo === t && styles.chipTxtOn]}>{labelTipoPiano[t]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Titolo</Text>
            <TextInput
              style={styles.input}
              value={titolo}
              onChangeText={setTitolo}
              placeholder={placeholderTitolo[tipo]}
              placeholderTextColor={colors.grigio}
            />

            <Text style={styles.label}>{inModifica ? 'Giorno' : 'Giorni della settimana (uno o più)'}</Text>
            <View style={styles.chips}>
              {GIORNI_BREVI.map((g, i) => {
                const on = giorni.includes(i + 1);
                return (
                  <Pressable key={g} style={[styles.chipGiorno, on && styles.chipOn]} onPress={() => toggleGiorno(i + 1)}>
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLbl}>Ripeti ogni settimana</Text>
                <Text style={styles.switchSotto}>
                  {ogniSettimana ? 'Compare tutte le settimane in questi giorni.' : `Vale solo per la settimana ${etichettaSettimana(lunedi)}.`}
                </Text>
              </View>
              <Switch value={ogniSettimana} onValueChange={setOgniSettimana} trackColor={{ true: colors.oro }} />
            </View>

            {tipo === 'visita' ? (
              <>
                <Text style={styles.label}>Strade da battere</Text>
                <View style={styles.stradaRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={stradaInput}
                    onChangeText={setStradaInput}
                    placeholder="es. Via Montenapoleone, Via della Spiga"
                    placeholderTextColor={colors.grigio}
                    onSubmitEditing={aggiungiStrade}
                    blurOnSubmit={false}
                  />
                  <Btn tipo="secondario" small label="Aggiungi" onPress={aggiungiStrade} disabled={!stradaInput.trim()} />
                </View>
                {strade.length ? (
                  <View style={styles.strade}>
                    {strade.map((s) => (
                      <Pressable key={s} style={styles.stradaChip} onPress={() => setStrade((cur) => cur.filter((x) => x !== s))} hitSlop={4}>
                        <Text style={styles.stradaChipTxt}>{s}</Text>
                        <Ionicons name="close" size={13} color={colors.testoSoft} />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.aiuto}>Puoi scriverne più di una separate da virgola. Tocca una strada per toglierla.</Text>
                )}

                <Text style={styles.label}>Zona / città</Text>
                <TextInput
                  style={styles.input}
                  value={zona}
                  onChangeText={setZona}
                  placeholder="es. Milano centro (default: Milano)"
                  placeholderTextColor={colors.grigio}
                />
              </>
            ) : null}

            <Text style={styles.label}>Note</Text>
            <TextInput
              style={[styles.input, styles.area]}
              value={note}
              onChangeText={setNote}
              placeholder="Dettagli utili per quel giorno…"
              placeholderTextColor={colors.grigio}
              multiline
            />

            {errore ? <Text style={styles.erroreTxt}>{errore}</Text> : null}
          </ScrollView>

          <Pressable style={[styles.salva, salvando && styles.salvaOff]} disabled={salvando} onPress={salva}>
            {salvando ? (
              <ActivityIndicator color={colors.bianco} />
            ) : (
              <Text style={styles.salvaTxt}>
                {inModifica ? 'Salva modifiche' : giorni.length > 1 ? `Aggiungi a ${giorni.length} giorni` : 'Aggiungi al piano'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  settimanaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  freccia: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settimanaTitolo: { flex: 1, alignItems: 'center' },
  settimanaTxt: { color: colors.testo, fontWeight: '600', fontSize: 17, letterSpacing: -0.3 },
  settimanaSotto: { color: colors.testoSoft, fontSize: 12 },
  settimanaOggi: { color: colors.goldStrong, fontWeight: '600', fontSize: 12 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    padding: 3,
    alignSelf: 'flex-start',
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  seg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.bianco },
  segTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  segTxtOn: { color: colors.testo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  erroreBox: {
    backgroundColor: 'rgba(215, 0, 21, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(215, 0, 21, 0.15)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  erroreTxt: { color: colors.errore, fontWeight: '600', fontSize: 13.5 },
  erroreAiuto: { color: colors.testoSoft, fontSize: 12.5 },
  // Card giorno (DS: surface + hairline + radius-l)
  giorno: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: spacing.sm,
  },
  giornoOggi: { borderColor: colors.oro },
  giornoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  giornoTitoloWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dotOggi: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.oro },
  giornoTitolo: { color: colors.testo, fontWeight: '600', fontSize: 16, letterSpacing: -0.2 },
  giornoData: { color: colors.testoSoft, fontSize: 13 },
  oggiTxt: { color: colors.goldStrong, fontWeight: '600', fontSize: 12 },
  vuoto: { color: colors.grigio, fontSize: 13, fontStyle: 'italic' },
  riga: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  rigaMain: { flex: 1, flexDirection: 'row', gap: 10 },
  rigaIcona: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  rigaInfo: { flex: 1, gap: 3 },
  rigaTitolo: { color: colors.testo, fontWeight: '600', fontSize: 15 },
  rigaMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  meta: { color: colors.testoSoft, fontSize: 12.5 },
  ripeti: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  note: { color: colors.testoSoft, fontSize: 13, marginTop: 2 },
  strade: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  strada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  stradaTxt: { color: colors.testo, fontWeight: '600', fontSize: 12.5, flexShrink: 1 },
  del: { paddingTop: 8, width: 24, alignItems: 'flex-end' },
  // Sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.sfondo,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    paddingBottom: spacing.lg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
  },
  sheetTitolo: { fontSize: 18, fontWeight: '600', color: colors.testo, letterSpacing: -0.3 },
  sheetBody: { padding: spacing.md, gap: spacing.xs },
  label: { fontSize: 11, fontWeight: '600', color: colors.testoSoft, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  area: { minHeight: 70, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipGiorno: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 46,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testoSoft, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  switchLbl: { color: colors.testo, fontWeight: '600', fontSize: 14 },
  switchSotto: { color: colors.testoSoft, fontSize: 12 },
  stradaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stradaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stradaChipTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  aiuto: { color: colors.grigio, fontSize: 12 },
  salva: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  salvaOff: { opacity: 0.55 },
  salvaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 16 },
});
