// ⭐ LA SETTIMANA GIORNO PER GIORNO (migr. 0122, 07/09/2026 — richiesta
// dell'utente fatta da un altro account e rifatta qui): per ogni giorno le
// attività del commerciale — visite, chiamate, appuntamenti, ufficio — anche
// su più giorni insieme, solo per questa settimana oppure ogni settimana; per
// le visite le STRADE da battere, da aprire in Google Maps con un tocco.
//
// Sta SOTTO la Pianificazione commerciale (PianoCommerciale.tsx), nella
// stessa schermata: quella è il piano della squadra per settimana × linea
// (cosa vogliamo chiudere), questa è l'agenda di chi va sul territorio (dove
// vado martedì). Ognuna ha la sua settimana: l'agenda parte da quella
// corrente, che è dove si guarda quasi sempre.
//
// ⚠️ Scout è un'app di squadra: il piano dei colleghi si LEGGE («Tutta la
// squadra»); si scrive solo il proprio. Lo dice la RLS, non il bottone.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PianoGiorno, TipoAttivitaPiano } from '@/types';
import { TIPI_ATTIVITA_PIANO } from '@/types';
import { colors, radius, spacing, touchMin } from '@/lib/theme';
import { isoOggi } from '@/lib/giorni';
import {
  GIORNI_BREVI,
  GIORNI_SETTIMANA,
  attivitaDelGiorno,
  daIso,
  dataDelGiorno,
  etichettaSettimana,
  giornoSettimanaDi,
  lunediDi,
  normalizzaStrade,
  spostaSettimana,
  urlStrada,
} from '@/lib/pianificazione-settimana';
import { aggiornaAttivitaPiano, eliminaAttivitaPiano, fetchPianoGiorni, inserisciAttivitaPiano } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { Foglio } from '@/components/Foglio';
import { avvisa, conferma } from '@/lib/dialoghi';

const ICONA_TIPO = Object.fromEntries(TIPI_ATTIVITA_PIANO.map((t) => [t.valore, t.icona])) as Record<TipoAttivitaPiano, any>;
const LABEL_TIPO = Object.fromEntries(TIPI_ATTIVITA_PIANO.map((t) => [t.valore, t.label])) as Record<TipoAttivitaPiano, string>;

export function PianoSettimana() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const oggi = isoOggi();
  const [lunedi, setLunedi] = useState(() => lunediDi(oggi));
  const [tutti, setTutti] = useState(false);
  const [righe, setRighe] = useState<PianoGiorno[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [form, setForm] = useState<null | { giorno: number; attivita?: PianoGiorno }>(null);
  const { width } = useWindowDimensions();
  const aColonne = width >= 900;

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setRighe(await fetchPianoGiorni(lunedi, { tutti }));
    } catch (e: any) {
      // Si dice: un'agenda vuota per un errore sembrerebbe «nessun piano».
      setErrore(e?.message ?? 'L’agenda non si è caricata.');
    } finally {
      setLoading(false);
    }
  }, [lunedi, tutti]);

  useEffect(() => {
    carica();
  }, [carica]);

  const giorni = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 7].map((g) => {
        const data = dataDelGiorno(lunedi, g);
        return { g, data, attivita: attivitaDelGiorno(righe, lunedi, g), eOggi: data === oggi };
      }),
    [righe, lunedi, oggi],
  );
  const eCorrente = lunedi === lunediDi(oggi);
  const totale = righe.length;

  function apriStrada(strada: string, zona: string | null) {
    Linking.openURL(urlStrada(strada, zona)).catch(() => avvisa('Non si apre', 'Google Maps non risponde.'));
  }

  return (
    <View style={styles.card}>
      <View style={styles.testata}>
        <Text style={styles.titolo}>La settimana giorno per giorno</Text>
        <View style={styles.nav}>
          <Pressable hitSlop={8} onPress={() => setLunedi((l) => spostaSettimana(l, -1))} accessibilityLabel="Settimana precedente">
            <Ionicons name="chevron-back" size={17} color={colors.testoSoft} />
          </Pressable>
          <Text style={styles.navTxt}>{etichettaSettimana(lunedi)}</Text>
          <Pressable hitSlop={8} onPress={() => setLunedi((l) => spostaSettimana(l, 1))} accessibilityLabel="Settimana successiva">
            <Ionicons name="chevron-forward" size={17} color={colors.testoSoft} />
          </Pressable>
          {!eCorrente ? (
            <Pressable style={styles.oggiBtn} onPress={() => setLunedi(lunediDi(oggi))}>
              <Text style={styles.oggiBtnTxt}>Oggi</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.sotto}>
        Cosa fai ogni giorno: visite, chiamate, appuntamenti. Per le visite scrivi le strade da battere: si aprono
        in Google Maps con un tocco. Un&apos;attività può ripetersi ogni settimana. In Oggi compare il piano del giorno.
      </Text>
      <View style={styles.chips}>
        <Pressable style={[styles.chip, !tutti && styles.chipOn]} onPress={() => setTutti(false)} accessibilityState={{ selected: !tutti }}>
          <Text style={[styles.chipTxt, !tutti && styles.chipTxtOn]}>Il mio piano</Text>
        </Pressable>
        <Pressable style={[styles.chip, tutti && styles.chipOn]} onPress={() => setTutti(true)} accessibilityState={{ selected: tutti }}>
          <Text style={[styles.chipTxt, tutti && styles.chipTxtOn]}>Tutta la squadra</Text>
        </Pressable>
        <Text style={styles.conteggio}>
          {loading ? 'carico…' : `${totale} ${totale === 1 ? 'attività' : 'attività'} in settimana`}
        </Text>
      </View>

      {errore ? (
        <View style={styles.erroreBox}>
          <Text style={styles.erroreTxt}>{errore}</Text>
          <Pressable style={styles.btnRiprova} onPress={carica}>
            <Text style={styles.btnRiprovaTxt}>Riprova</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={aColonne ? styles.griglia : styles.elenco}>
        {giorni.map((d) => (
          <View key={d.g} style={[aColonne ? styles.colonna : styles.giornoRiga, d.eOggi && styles.giornoOggi]}>
            <View style={styles.giornoTesta}>
              <Text style={[styles.giornoNome, d.eOggi && styles.giornoNomeOggi]}>
                {aColonne ? GIORNI_BREVI[d.g - 1] : GIORNI_SETTIMANA[d.g - 1]} {daIso(d.data).getDate()}
                {d.eOggi ? ' · oggi' : ''}
              </Text>
              <Pressable
                hitSlop={6}
                style={styles.piu}
                onPress={() => setForm({ giorno: d.g })}
                accessibilityLabel={`Aggiungi un'attività di ${GIORNI_SETTIMANA[d.g - 1]}`}
              >
                <Ionicons name="add" size={17} color={colors.navy} />
              </Pressable>
            </View>
            {d.attivita.length === 0 ? (
              <Text style={styles.vuoto}>—</Text>
            ) : (
              d.attivita.map((a) => {
                const mia = a.owner === uid;
                return (
                  <Pressable
                    key={a.id}
                    style={[styles.attivita, !mia && styles.attivitaAltrui]}
                    onPress={() => (mia ? setForm({ giorno: d.g, attivita: a }) : undefined)}
                    disabled={!mia}
                    accessibilityLabel={mia ? `Modifica «${a.titolo}»` : `${a.titolo} di ${a.owner_nome ?? 'un collega'}`}
                  >
                    <View style={styles.attTesta}>
                      <Ionicons name={ICONA_TIPO[a.tipo] ?? 'ellipse-outline'} size={14} color={colors.navy} />
                      <Text style={styles.attTitolo} numberOfLines={2}>{a.titolo}</Text>
                      {a.settimana == null ? (
                        <Ionicons name="repeat-outline" size={13} color={colors.grigio} {...({ title: 'Ogni settimana' } as any)} />
                      ) : null}
                    </View>
                    {tutti && a.owner_nome ? <Text style={styles.attMeta}>{a.owner_nome}</Text> : null}
                    {a.zona ? <Text style={styles.attMeta}>{a.zona}</Text> : null}
                    {a.strade?.length ? (
                      <View style={styles.strade}>
                        {a.strade.map((s) => (
                          <Pressable
                            key={s}
                            style={styles.strada}
                            onPress={(e: any) => {
                              e?.stopPropagation?.();
                              apriStrada(s, a.zona);
                            }}
                            accessibilityLabel={`Apri ${s} in Google Maps`}
                          >
                            <Ionicons name="navigate-outline" size={11} color={colors.navy} />
                            <Text style={styles.stradaTxt} numberOfLines={1}>{s}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {a.note ? <Text style={styles.attNote} numberOfLines={3}>{a.note}</Text> : null}
                  </Pressable>
                );
              })
            )}
          </View>
        ))}
      </View>

      {form ? (
        <FormAttivita
          lunedi={lunedi}
          giornoIniziale={form.giorno}
          attivita={form.attivita}
          onClose={() => setForm(null)}
          onSalvata={() => {
            setForm(null);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

// ── Il foglio: nuova attività (anche su più giorni) o modifica di una riga ─────
function FormAttivita({
  lunedi,
  giornoIniziale,
  attivita,
  onClose,
  onSalvata,
}: {
  lunedi: string;
  giornoIniziale: number;
  attivita?: PianoGiorno;
  onClose: () => void;
  onSalvata: () => void;
}) {
  const inModifica = !!attivita;
  const [titolo, setTitolo] = useState(attivita?.titolo ?? '');
  const [tipo, setTipo] = useState<TipoAttivitaPiano>(attivita?.tipo ?? 'visita');
  const [giorni, setGiorni] = useState<number[]>([attivita?.giorno_settimana ?? giornoIniziale]);
  const [ricorrente, setRicorrente] = useState(attivita ? attivita.settimana == null : false);
  const [zona, setZona] = useState(attivita?.zona ?? '');
  const [strade, setStrade] = useState((attivita?.strade ?? []).join('\n'));
  const [note, setNote] = useState(attivita?.note ?? '');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function toggleGiorno(g: number) {
    // In modifica la riga è UN giorno: si sposta, non si moltiplica. Per
    // aggiungere giorni si crea un'attività nuova.
    if (inModifica) return setGiorni([g]);
    setGiorni((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].sort()));
  }

  async function salva() {
    if (salvando) return;
    setErrore(null);
    if (!titolo.trim()) return setErrore('Scrivi cosa farai.');
    if (!giorni.length) return setErrore('Scegli almeno un giorno.');
    setSalvando(true);
    try {
      const stradeNorm = tipo === 'visita' ? normalizzaStrade(strade) : [];
      if (inModifica && attivita) {
        await aggiornaAttivitaPiano(attivita.id, {
          titolo: titolo.trim(),
          tipo,
          giorno_settimana: giorni[0],
          settimana: ricorrente ? null : lunedi,
          zona: zona.trim() || null,
          strade: stradeNorm,
          note: note.trim() || null,
        });
      } else {
        await inserisciAttivitaPiano({
          giorni,
          settimana: ricorrente ? null : lunedi,
          tipo,
          titolo,
          strade: stradeNorm,
          zona: zona.trim() || null,
          note: note.trim() || null,
        });
      }
      onSalvata();
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stata salvata.');
      setSalvando(false);
    }
  }

  function chiediElimina() {
    if (!attivita) return;
    conferma(
      'Togliere l’attività?',
      `«${attivita.titolo}» di ${GIORNI_SETTIMANA[attivita.giorno_settimana - 1].toLowerCase()}${attivita.settimana == null ? ' (ogni settimana)' : ''}.`,
      async () => {
        try {
          await eliminaAttivitaPiano(attivita.id);
          onSalvata();
        } catch (e: any) {
          avvisa('Non è stata tolta', e?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Togli', distruttivo: true },
    );
  }

  return (
    <Foglio
      titolo={inModifica ? 'Modifica attività' : 'Nuova attività'}
      sottotitolo={`Settimana ${etichettaSettimana(lunedi)}. Scegli i giorni, il tipo e — per le visite — le strade da battere.`}
      onClose={onClose}
      bloccaSfondo
    >
      <View style={styles.form}>
        <Text style={styles.label}>Cosa</Text>
        <TextInput
          style={styles.input}
          value={titolo}
          onChangeText={setTitolo}
          placeholder="es. giro Brera, chiamate ai lead della settimana"
          placeholderTextColor={colors.grigio}
          autoFocus={!inModifica}
        />

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chips}>
          {TIPI_ATTIVITA_PIANO.map((t) => (
            <Pressable
              key={t.valore}
              style={[styles.chip, tipo === t.valore && styles.chipOn]}
              onPress={() => setTipo(t.valore)}
              accessibilityState={{ selected: tipo === t.valore }}
            >
              <Ionicons name={t.icona as any} size={13} color={tipo === t.valore ? colors.bianco : colors.testo} />
              <Text style={[styles.chipTxt, tipo === t.valore && styles.chipTxtOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{inModifica ? 'Giorno' : 'Giorni (uno o più)'}</Text>
        <View style={styles.chips}>
          {GIORNI_BREVI.map((g, i) => {
            const on = giorni.includes(i + 1);
            return (
              <Pressable
                key={g}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => toggleGiorno(i + 1)}
                accessibilityState={{ selected: on }}
                accessibilityLabel={GIORNI_SETTIMANA[i]}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{g}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Quando</Text>
        <View style={styles.chips}>
          <Pressable style={[styles.chip, !ricorrente && styles.chipOn]} onPress={() => setRicorrente(false)} accessibilityState={{ selected: !ricorrente }}>
            <Text style={[styles.chipTxt, !ricorrente && styles.chipTxtOn]}>Solo questa settimana</Text>
          </Pressable>
          <Pressable style={[styles.chip, ricorrente && styles.chipOn]} onPress={() => setRicorrente(true)} accessibilityState={{ selected: ricorrente }}>
            <Ionicons name="repeat-outline" size={13} color={ricorrente ? colors.bianco : colors.testo} />
            <Text style={[styles.chipTxt, ricorrente && styles.chipTxtOn]}>Ogni settimana</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Zona (facoltativa)</Text>
        <TextInput
          style={styles.input}
          value={zona}
          onChangeText={setZona}
          placeholder="es. Milano centro, Monza"
          placeholderTextColor={colors.grigio}
        />

        {tipo === 'visita' ? (
          <>
            <Text style={styles.label}>Strade da battere — una per riga</Text>
            <TextInput
              style={[styles.input, styles.inputLungo]}
              value={strade}
              onChangeText={setStrade}
              placeholder={'Via Montenapoleone\nVia della Spiga\nCorso Como'}
              placeholderTextColor={colors.grigio}
              multiline
            />
            <Text style={styles.aiuto}>Ogni strada diventa un tocco che apre Google Maps (con la zona, se scritta; se no Milano).</Text>
          </>
        ) : null}

        <Text style={styles.label}>Note (facoltative)</Text>
        <TextInput
          style={[styles.input, styles.inputLungo]}
          value={note}
          onChangeText={setNote}
          placeholder="es. portare i campioni, chiedere del titolare"
          placeholderTextColor={colors.grigio}
          multiline
        />

        {errore ? <Text style={styles.erroreTxt}>{errore}</Text> : null}

        <View style={styles.formAzioni}>
          {inModifica ? (
            <Pressable style={styles.btnElimina} disabled={salvando} onPress={chiediElimina}>
              <Ionicons name="trash-outline" size={15} color={colors.errore} />
              <Text style={styles.btnEliminaTxt}>Togli</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable style={styles.btnAnnulla} onPress={onClose}>
            <Text style={styles.btnAnnullaTxt}>Annulla</Text>
          </Pressable>
          <Pressable style={[styles.btnSalva, salvando && { opacity: 0.55 }]} disabled={salvando} onPress={salva}>
            <Text style={styles.btnSalvaTxt}>
              {salvando ? 'Salvataggio…' : inModifica ? 'Salva' : giorni.length > 1 ? `Aggiungi su ${giorni.length} giorni` : 'Aggiungi'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  testata: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  titolo: { fontSize: 19, fontWeight: '600', color: colors.navy, letterSpacing: -0.4, flexShrink: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navTxt: { fontSize: 14, fontWeight: '600', color: colors.testo, fontVariant: ['tabular-nums'] },
  oggiBtn: { marginLeft: 4, backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  oggiBtnTxt: { color: colors.testo, fontWeight: '600', fontSize: 12 },
  sotto: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '600', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  conteggio: { color: colors.testoSoft, fontSize: 12, marginLeft: 4 },
  griglia: { flexDirection: 'row', gap: 6, marginTop: 2 },
  elenco: { gap: 6, marginTop: 2 },
  colonna: { flex: 1, minWidth: 0, backgroundColor: colors.fill, borderRadius: radius.m, padding: 8, gap: 6, minHeight: 120 },
  giornoRiga: { backgroundColor: colors.fill, borderRadius: radius.m, padding: 8, gap: 6 },
  // Oggi in oro: è il punto da cui si conta (stesso segno del Calendario).
  giornoOggi: { borderWidth: 1, borderColor: colors.goldStrong },
  giornoTesta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  giornoNome: { fontSize: 12.5, fontWeight: '700', color: colors.testo, flexShrink: 1 },
  giornoNomeOggi: { color: colors.goldStrong },
  piu: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bianco },
  vuoto: { color: colors.grigio, fontSize: 12, textAlign: 'center', paddingVertical: 6 },
  attivita: { backgroundColor: colors.bianco, borderRadius: radius.s, padding: 8, gap: 4, borderWidth: 1, borderColor: colors.hairline },
  attivitaAltrui: { opacity: 0.85 },
  attTesta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  attTitolo: { flex: 1, minWidth: 0, color: colors.testo, fontWeight: '600', fontSize: 13, lineHeight: 17 },
  attMeta: { color: colors.testoSoft, fontSize: 11.5 },
  attNote: { color: colors.testoSoft, fontSize: 11.5, lineHeight: 15, fontStyle: 'italic' },
  strade: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  strada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  stradaTxt: { color: colors.navy, fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  erroreBox: { backgroundColor: colors.erroreSoft, borderRadius: radius.m, padding: spacing.sm, gap: 6 },
  erroreTxt: { color: colors.errore, fontSize: 12.5 },
  btnRiprova: { alignSelf: 'flex-start', backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  btnRiprovaTxt: { color: colors.testo, fontWeight: '600', fontSize: 12.5 },
  form: { gap: spacing.xs, paddingBottom: 8 },
  label: { fontSize: 12.5, fontWeight: '500', color: colors.testoSoft, marginTop: spacing.sm },
  aiuto: { color: colors.testoSoft, fontSize: 12, lineHeight: 16 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.testo,
  },
  inputLungo: { minHeight: 72, textAlignVertical: 'top' },
  formAzioni: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  btnAnnulla: { borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.fill, minHeight: touchMin, justifyContent: 'center' },
  btnAnnullaTxt: { color: colors.testo, fontWeight: '600' },
  btnSalva: { borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.ink, minHeight: touchMin, justifyContent: 'center' },
  btnSalvaTxt: { color: colors.bianco, fontWeight: '600' },
  btnElimina: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 4 },
  btnEliminaTxt: { color: colors.errore, fontWeight: '600', fontSize: 13 },
});
