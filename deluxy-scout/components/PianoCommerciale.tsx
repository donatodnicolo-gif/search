// ⭐ LA PIANIFICAZIONE COMMERCIALE SETTIMANALE (29/08/2026, correzione chiesta
// dall'utente sulla prima versione mensile: «la pianificazione deve essere per
// settimana; deve essere anche discorsiva di quello che voglio dire; più
// focalizzata su numero clienti piuttosto che su €; la conversione non in %,
// la % la calcoli tu. Ad esempio per consegne dovremo capire che giro faranno
// a Milano, che settimana»).
//
// Quindi: per ogni SETTIMANA e linea il responsabile scrive IL PIANO A PAROLE
// (che giro, dove, quando) e QUANTI CLIENTI vuole chiudere. La conversione
// non si scrive mai: la calcola l'app da trattative e clienti reali della
// settimana — con la base dichiarata.
//
// ⚠️ Chi scrive è il RESPONSABILE (profiles.responsabile, assegnato dal Team)
// o l'admin; per tutti gli altri il piano è in sola lettura, e la RLS della
// tabella fa rispettare la stessa regola lato server — il bottone nascosto non
// è mai l'unica difesa.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Deal, Ordine, Pianificazione } from '@/types';
import { LINEE_ATTIVE } from '@/types';
import { colors, radius, spacing, touchMin } from '@/lib/theme';
import { fetchAllDeals, fetchOrdini, fetchPianificazioni, fetchProfiles, salvaPianificazione } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { importoBreve } from '@/components/Tabella';
import { Foglio } from '@/components/Foglio';
import { avvisa } from '@/lib/dialoghi';

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// ⚠️ Tutte le date sono in ora LOCALE, mai toISOString(): la sera in Italia
// l'UTC direbbe «ieri» ([[trappola-periodi-fuso-server]]).
/** Il LUNEDÌ della settimana di una data (nuova Date, l'argomento non si tocca). */
function lunediDi(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
/** YYYY-MM-DD locale: è la chiave della settimana sul database. */
const chiaveDi = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataDaChiave = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));

/** I lunedì delle settimane che TOCCANO un mese (anche a cavallo). */
function settimaneDelMese(anno: number, mese: number): Date[] {
  const fine = new Date(anno, mese + 1, 1);
  const out: Date[] = [];
  for (const d = lunediDi(new Date(anno, mese, 1)); d < fine; d.setDate(d.getDate() + 7)) out.push(new Date(d));
  return out;
}

/** «2–8 set», o «29 set – 5 ott» quando la settimana è a cavallo. */
function etichettaSettimana(lun: Date): string {
  const dom = new Date(lun);
  dom.setDate(dom.getDate() + 6);
  if (lun.getMonth() === dom.getMonth()) return `${lun.getDate()}–${dom.getDate()} ${MESI_BREVI[dom.getMonth()]}`;
  return `${lun.getDate()} ${MESI_BREVI[lun.getMonth()]} – ${dom.getDate()} ${MESI_BREVI[dom.getMonth()]}`;
}

/** Il reale di una settimana per linea, dai dati che esistono già. */
interface RealeLinea {
  clienti: Set<string>; // clienti DISTINTI con un ordine nella settimana
  ordini: number;
  valoreOrdini: number;
  trattative: number; // aperte nella settimana (solo con created_at: base dichiarata)
}

export function PianoCommerciale() {
  const oggi = new Date();
  const chiaveOggi = chiaveDi(lunediDi(oggi));
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth()); // 0-11, per la griglia
  const [settimana, setSettimana] = useState(chiaveOggi); // chiave del lunedì
  const [righe, setRighe] = useState<Pianificazione[]>([]);
  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [responsabile, setResponsabile] = useState(false);
  const [nomeResponsabile, setNomeResponsabile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [pianifica, setPianifica] = useState(false);
  const { session } = useAuth();

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [piani, ord, dls, profili] = await Promise.all([
        fetchPianificazioni(anno),
        fetchOrdini().catch(() => [] as Ordine[]),
        fetchAllDeals().catch(() => [] as Deal[]),
        fetchProfiles(),
      ]);
      setRighe(piani);
      setOrdini(ord);
      setDeals(dls);
      const io = profili.find((p) => p.id === session?.user?.id);
      setResponsabile(Boolean(io?.responsabile) || isAdmin(session?.user?.email));
      const resp = profili.find((p) => p.responsabile);
      setNomeResponsabile(resp ? (resp.nome || resp.email) : null);
    } catch (e: any) {
      // ⚠️ Un fallimento non è mai un calendario vuoto (Libro §6).
      setErrore(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [anno, session?.user?.id, session?.user?.email]);

  useEffect(() => {
    void carica();
  }, [carica]);

  /** chiave settimana (lunedì) → linee pianificate. */
  const pianiPerSettimana = useMemo(() => {
    const m = new Map<string, Pianificazione[]>();
    for (const r of righe) {
      if (!m.has(r.settimana)) m.set(r.settimana, []);
      m.get(r.settimana)!.push(r);
    }
    return m;
  }, [righe]);

  /** Le settimane del mese in griglia, con «ha un piano?» già calcolato. */
  const settimaneMese = useMemo(
    () =>
      settimaneDelMese(anno, mese).map((lun) => {
        const k = chiaveDi(lun);
        return { lun, k, etichetta: etichettaSettimana(lun), haPiano: (pianiPerSettimana.get(k) ?? []).length > 0 };
      }),
    [anno, mese, pianiPerSettimana],
  );

  /** Il dot del mese: si accende se ALMENO una sua settimana ha un piano. */
  const mesiConPiano = useMemo(() => {
    const out: boolean[] = [];
    for (let m = 0; m < 12; m++) out.push(settimaneDelMese(anno, m).some((lun) => (pianiPerSettimana.get(chiaveDi(lun)) ?? []).length > 0));
    return out;
  }, [anno, pianiPerSettimana]);

  // Cambiando mese/anno, la settimana scelta segue: quella corrente se tocca
  // il mese, altrimenti la prima del mese. (Senza, resterebbe selezionata una
  // settimana che la striscia non mostra più.)
  const scegliMese = (a: number, m: number) => {
    setAnno(a);
    setMese(m);
    const sett = settimaneDelMese(a, m);
    if (!sett.some((lun) => chiaveDi(lun) === settimana)) {
      const corrente = sett.find((lun) => chiaveDi(lun) === chiaveOggi);
      setSettimana(corrente ? chiaveOggi : chiaveDi(sett[0]));
    }
  };

  /** Il reale della settimana selezionata, per linea. Confini in ora LOCALE. */
  const realePerLinea = useMemo(() => {
    const lun = dataDaChiave(settimana);
    const da = lun.getTime();
    const fine = new Date(lun);
    fine.setDate(fine.getDate() + 7);
    const a = fine.getTime();
    const dentro = (iso: string | null | undefined) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= da && t < a;
    };
    const m = new Map<string, RealeLinea>();
    const prendi = (linea: string | null | undefined) => {
      const k = (linea ?? 'Senza linea').trim() || 'Senza linea';
      if (!m.has(k)) m.set(k, { clienti: new Set(), ordini: 0, valoreOrdini: 0, trattative: 0 });
      return m.get(k)!;
    };
    for (const o of ordini) {
      if (o.stato === 'annullato' || !dentro(o.created_at)) continue;
      const r = prendi(o.linea);
      r.ordini += 1;
      r.valoreOrdini += o.valore ?? 0;
      // Il cliente è UNO anche con tre ordini: si conta per identità, non per riga.
      r.clienti.add(o.place_id ?? o.cliente.trim().toLowerCase());
    }
    for (const d of deals) {
      if (d.annullata_il || !dentro(d.created_at)) continue;
      prendi(d.linea).trattative += 1;
    }
    return m;
  }, [ordini, deals, settimana]);

  const pianoSettimana = pianiPerSettimana.get(settimana) ?? [];
  const pianoDi = (linea: string) => pianoSettimana.find((p) => p.linea === linea) ?? null;
  // Le linee da mostrare: quelle pianificate + quelle con numeri reali.
  const lineeInVista = useMemo(() => {
    const s = new Set<string>(pianoSettimana.map((p) => p.linea));
    for (const [l, r] of realePerLinea) if (r.ordini || r.trattative) s.add(l);
    return [...s].sort((a, b) => a.localeCompare(b, 'it'));
  }, [pianoSettimana, realePerLinea]);

  const lunSel = dataDaChiave(settimana);
  const etichettaSel = etichettaSettimana(lunSel);
  const eSettimanaCorrente = settimana === chiaveOggi;

  return (
    <View style={styles.card}>
      <View style={styles.testata}>
        <Text style={styles.titolo}>Pianificazione commerciale</Text>
        {/* Anno: ‹ 2026 › */}
        <View style={styles.annoRiga}>
          <Pressable hitSlop={8} onPress={() => scegliMese(anno - 1, mese)} accessibilityLabel="Anno precedente">
            <Ionicons name="chevron-back" size={17} color={colors.testoSoft} />
          </Pressable>
          <Text style={styles.anno}>{anno}</Text>
          <Pressable hitSlop={8} onPress={() => scegliMese(anno + 1, mese)} accessibilityLabel="Anno successivo">
            <Ionicons name="chevron-forward" size={17} color={colors.testoSoft} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.sotto}>
        Il piano si scrive settimana per settimana, linea per linea: cosa si farà — il giro, le zone, le azioni —
        e quanti clienti si vogliono chiudere. La conversione non si scrive: la calcola l&apos;app da trattative e
        clienti reali.
      </Text>

      {/* IL CALENDARIO: 12 mesi per orientarsi, si accende dove un piano c'è. */}
      <View style={styles.calendario}>
        {MESI.map((nome, i) => {
          const selezionato = i === mese;
          const corrente = anno === oggi.getFullYear() && i === oggi.getMonth();
          return (
            <Pressable
              key={nome}
              style={[styles.meseCella, selezionato && styles.meseCellaSel]}
              onPress={() => scegliMese(anno, i)}
              accessibilityLabel={`${MESI_LUNGHI[i]} ${anno}`}
              accessibilityState={{ selected: selezionato }}
            >
              <Text style={[styles.meseTxt, corrente && styles.meseCorrente, selezionato && styles.meseTxtSel]}>
                {nome}
              </Text>
              {/* Il dot dice «c'è un piano»: verde pieno; senza piano, vuoto. */}
              <View style={[styles.dot, mesiConPiano[i] ? styles.dotPieno : styles.dotVuoto]} />
            </Pressable>
          );
        })}
      </View>

      {/* LE SETTIMANE del mese scelto: la pianificazione vive QUI. */}
      <View style={styles.settimane}>
        {settimaneMese.map((s) => {
          const selezionata = s.k === settimana;
          const corrente = s.k === chiaveOggi;
          return (
            <Pressable
              key={s.k}
              style={[styles.settCella, selezionata && styles.settCellaSel]}
              onPress={() => setSettimana(s.k)}
              accessibilityLabel={`Settimana ${s.etichetta}`}
              accessibilityState={{ selected: selezionata }}
            >
              <Text style={[styles.settTxt, corrente && styles.meseCorrente, selezionata && styles.settTxtSel]}>
                {s.etichetta}
              </Text>
              <View style={[styles.dot, s.haPiano ? styles.dotPieno : styles.dotVuoto]} />
            </Pressable>
          );
        })}
      </View>

      {errore ? (
        <View style={styles.erroreBox}>
          <Text style={styles.erroreTxt}>Il piano non si è caricato: {errore}</Text>
          <Pressable style={styles.btnRiprova} onPress={carica}>
            <Text style={styles.btnRiprovaTxt}>Riprova</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <Text style={styles.nota}>Carico piano e numeri della settimana…</Text>
      ) : (
        <>
          <Text style={styles.settTitolo}>
            Settimana {etichettaSel}
            {eSettimanaCorrente ? ' · settimana corrente' : ''}
          </Text>

          {lineeInVista.length === 0 ? (
            <Text style={styles.nota}>
              Nessun piano e nessun movimento in questa settimana.
              {responsabile ? ' Si comincia da «Pianifica la settimana».' : ''}
            </Text>
          ) : (
            lineeInVista.map((linea) => {
              const p = pianoDi(linea);
              const r = realePerLinea.get(linea) ?? { clienti: new Set<string>(), ordini: 0, valoreOrdini: 0, trattative: 0 };
              const clienti = r.clienti.size;
              const conv = r.trattative > 0 ? Math.round((clienti / r.trattative) * 100) : null;
              const quota = p?.target_clienti ? Math.min(1, clienti / p.target_clienti) : null;
              return (
                <View key={linea} style={styles.lineaRiga}>
                  <View style={styles.lineaTesta}>
                    <Text style={styles.lineaNome} numberOfLines={1}>{linea}</Text>
                    <Text style={styles.lineaNumeri}>
                      {p?.target_clienti != null
                        ? `${clienti} di ${p.target_clienti} ${p.target_clienti === 1 ? 'cliente' : 'clienti'}`
                        : `${clienti} ${clienti === 1 ? 'cliente' : 'clienti'} · senza target`}
                    </Text>
                  </View>
                  {/* IL PIANO A PAROLE: è il cuore della riga, non una nota. */}
                  {p?.descrizione ? <Text style={styles.lineaPiano}>{p.descrizione}</Text> : null}
                  {/* La barra c'è solo col target: senza, non c'è una base. */}
                  {quota != null ? (
                    <View style={styles.barra}>
                      <View style={[styles.barraFill, { width: `${Math.round(quota * 100)}%` }, quota >= 1 && styles.barraPiena]} />
                    </View>
                  ) : null}
                  <Text style={styles.lineaMeta}>
                    {r.trattative} {r.trattative === 1 ? 'trattativa aperta' : 'trattative aperte'} · {r.ordini}{' '}
                    {r.ordini === 1 ? 'ordine' : 'ordini'}
                    {r.valoreOrdini ? ` (${importoBreve(r.valoreOrdini)})` : ''}
                    {conv != null
                      ? ` · conversione ${conv}% (clienti / trattative della settimana)`
                      : ' · conversione — (nessuna trattativa aperta nella settimana)'}
                  </Text>
                </View>
              );
            })
          )}

          {responsabile ? (
            <Pressable style={styles.btnPianifica} onPress={() => setPianifica(true)}>
              <Ionicons name="flag-outline" size={15} color={colors.bianco} />
              <Text style={styles.btnPianificaTxt}>Pianifica la settimana {etichettaSel}</Text>
            </Pressable>
          ) : (
            <Text style={styles.nota}>
              {nomeResponsabile
                ? `Il piano lo scrive ${nomeResponsabile} (responsabile commerciale).`
                : 'Nessun responsabile commerciale assegnato: il flag si dà dalla schermata Team (admin).'}
            </Text>
          )}
        </>
      )}

      {pianifica ? (
        <FoglioPiano
          settimana={settimana}
          etichetta={etichettaSel}
          esistenti={pianoSettimana}
          onClose={() => setPianifica(false)}
          onSalvato={() => {
            setPianifica(false);
            void carica();
          }}
        />
      ) : null}
    </View>
  );
}

/** Il foglio del responsabile: piano a parole e clienti attesi, per OGNI linea. */
function FoglioPiano({
  settimana,
  etichetta,
  esistenti,
  onClose,
  onSalvato,
}: {
  settimana: string;
  etichetta: string;
  esistenti: Pianificazione[];
  onClose: () => void;
  onSalvato: () => void;
}) {
  // Le linee del catalogo + eventuali linee pianificate fuori catalogo.
  const linee = useMemo(() => {
    const s = new Set<string>(LINEE_ATTIVE);
    for (const p of esistenti) s.add(p.linea);
    return [...s];
  }, [esistenti]);
  const [valori, setValori] = useState<Record<string, { piano: string; clienti: string }>>(() => {
    const v: Record<string, { piano: string; clienti: string }> = {};
    for (const l of linee) {
      const p = esistenti.find((x) => x.linea === l);
      v[l] = {
        piano: p?.descrizione ?? '',
        clienti: p?.target_clienti != null ? String(p.target_clienti) : '',
      };
    }
    return v;
  });
  const [salvando, setSalvando] = useState(false);
  const [erroreForm, setErroreForm] = useState<string | null>(null);

  async function salva() {
    if (salvando) return;
    // ⚠️ Un numero scritto male FERMA il salvataggio: buttato a null
    // cancellerebbe un target in silenzio.
    const daScrivere: { settimana: string; linea: string; descrizione: string | null; target_clienti: number | null }[] = [];
    for (const l of linee) {
      const v = valori[l];
      let clienti: number | null = null;
      if (v.clienti.trim()) {
        if (!/^\d+$/.test(v.clienti.trim())) {
          setErroreForm(`«${v.clienti}» non è un numero di clienti (linea ${l}). Scrivi un numero intero, es. 3.`);
          return;
        }
        clienti = Number(v.clienti.trim());
      }
      const piano = v.piano.trim() || null;
      const p = esistenti.find((x) => x.linea === l);
      const cambiata = (p?.descrizione ?? null) !== piano || (p?.target_clienti ?? null) !== clienti;
      if (cambiata) daScrivere.push({ settimana, linea: l, descrizione: piano, target_clienti: clienti });
    }
    if (!daScrivere.length) {
      onClose();
      return;
    }
    setSalvando(true);
    setErroreForm(null);
    try {
      for (const riga of daScrivere) await salvaPianificazione(riga);
      onSalvato();
    } catch (e: any) {
      // La RLS che rifiuta arriva qui: si dice chi può scrivere, non un codice.
      const msg = String(e?.message ?? e);
      setErroreForm(
        /policy|row-level|violates/i.test(msg)
          ? 'Il piano lo può scrivere solo il responsabile commerciale (flag nel Team) o l\'amministratore.'
          : msg,
      );
      avvisa('Piano non salvato', msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Foglio titolo={`Pianifica la settimana ${etichetta}`} sottotitolo="Per ogni linea: cosa si farà, detto a parole, e quanti clienti si vogliono chiudere. Tutto vuoto = quella linea resta senza piano. La conversione la calcola l'app." onClose={onClose} bloccaSfondo largo>
      <View style={{ gap: spacing.md, paddingBottom: 8 }}>
        {linee.map((l) => (
          <View key={l} style={styles.formBlocco}>
            <View style={styles.formTesta}>
              <Text style={styles.formLinea} numberOfLines={1}>{l}</Text>
              <TextInput
                style={styles.formClienti}
                value={valori[l].clienti}
                onChangeText={(t) => setValori({ ...valori, [l]: { ...valori[l], clienti: t } })}
                placeholder="Clienti"
                placeholderTextColor={colors.grigio}
                inputMode="numeric"
              />
            </View>
            <TextInput
              style={styles.formPiano}
              value={valori[l].piano}
              onChangeText={(t) => setValori({ ...valori, [l]: { ...valori[l], piano: t } })}
              placeholder="Cosa faremo: es. giro Milano centro (Montenapoleone, Spiga) martedì e mercoledì"
              placeholderTextColor={colors.grigio}
              multiline
            />
          </View>
        ))}
        {erroreForm ? <Text style={styles.erroreTxt}>{erroreForm}</Text> : null}
        <View style={styles.formAzioni}>
          <Pressable style={styles.btnAnnulla} onPress={onClose}>
            <Text style={styles.btnAnnullaTxt}>Annulla</Text>
          </Pressable>
          <Pressable style={[styles.btnSalva, salvando && { opacity: 0.55 }]} disabled={salvando} onPress={salva}>
            <Text style={styles.btnSalvaTxt}>{salvando ? 'Salvataggio…' : 'Salva il piano'}</Text>
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
  },
  testata: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  titolo: { fontSize: 19, fontWeight: '600', color: colors.navy, letterSpacing: -0.4, flexShrink: 1 },
  annoRiga: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  anno: { fontSize: 15, fontWeight: '600', color: colors.testo, fontVariant: ['tabular-nums'] },
  sotto: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  calendario: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  meseCella: {
    flexGrow: 1,
    flexBasis: '14%',
    minWidth: 52,
    minHeight: touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radius.m,
    backgroundColor: colors.fill,
    paddingVertical: 8,
  },
  meseCellaSel: { backgroundColor: colors.ink },
  meseTxt: { fontSize: 12.5, fontWeight: '600', color: colors.testo },
  meseTxtSel: { color: colors.bianco },
  // «Oggi» in oro: è il punto da cui si conta (stesso segno del Calendario).
  meseCorrente: { color: colors.goldStrong },
  settimane: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  settCella: {
    flexGrow: 1,
    minWidth: 88,
    minHeight: touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  settCellaSel: { backgroundColor: colors.ink, borderColor: colors.ink },
  settTxt: { fontSize: 12.5, fontWeight: '600', color: colors.testo, fontVariant: ['tabular-nums'] },
  settTxtSel: { color: colors.bianco },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotPieno: { backgroundColor: colors.successo },
  dotVuoto: { backgroundColor: colors.grigioChiaro },
  settTitolo: { fontSize: 11, fontWeight: '700', color: colors.testoSoft, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.xs },
  lineaRiga: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.grigioChiaro },
  lineaTesta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  lineaNome: { fontWeight: '600', color: colors.navy, fontSize: 14, flexShrink: 1 },
  lineaNumeri: { fontWeight: '600', color: colors.testo, fontSize: 13, fontVariant: ['tabular-nums'] },
  lineaPiano: { color: colors.testo, fontSize: 13, lineHeight: 19 },
  barra: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  barraFill: { height: 6, backgroundColor: colors.navy },
  barraPiena: { backgroundColor: colors.successo },
  lineaMeta: { color: colors.testoSoft, fontSize: 12, lineHeight: 17 },
  nota: { color: colors.testoSoft, fontSize: 12.5, fontStyle: 'italic' },
  btnPianifica: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 12,
    minHeight: touchMin,
    marginTop: spacing.xs,
  },
  btnPianificaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 14.5 },
  erroreBox: { backgroundColor: colors.erroreSoft, borderRadius: radius.m, padding: spacing.sm, gap: 6 },
  erroreTxt: { color: colors.errore, fontSize: 12.5 },
  btnRiprova: { alignSelf: 'flex-start', backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  btnRiprovaTxt: { color: colors.testo, fontWeight: '600', fontSize: 12.5 },
  formBlocco: { gap: 6 },
  formTesta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  formLinea: { flex: 1, minWidth: 0, color: colors.navy, fontWeight: '600', fontSize: 13.5 },
  formClienti: {
    width: 84,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 16,
    color: colors.testo,
  },
  formPiano: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.testo,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  formAzioni: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  btnAnnulla: { borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.fill, minHeight: touchMin, justifyContent: 'center' },
  btnAnnullaTxt: { color: colors.testo, fontWeight: '600' },
  btnSalva: { borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.ink, minHeight: touchMin, justifyContent: 'center' },
  btnSalvaTxt: { color: colors.bianco, fontWeight: '600' },
});
