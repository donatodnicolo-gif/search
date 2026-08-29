// ⭐ LA PIANIFICAZIONE COMMERCIALE (29/08/2026, richiesta dell'utente:
// «trasforma Da fare in Pianificazione. Mostra in primis un calendario dove il
// responsabile (flag nei team) deve fare una pianificazione commerciale per
// linea con target e obiettivi di conversione»).
//
// Il disegno segue la pratica dei piani vendita B2B (quota per periodo e per
// linea + obiettivo di conversione che rende il target verificabile): per ogni
// mese e linea si scrivono TARGET € e CONVERSIONE OBIETTIVO (trattative →
// ordini), e accanto si legge il REALE calcolato dai dati — mai ricopiato:
// ordini del mese per linea (valore e conteggio) e trattative aperte nel mese.
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
import { leggiImporto, scriviImporto } from '@/lib/importi';
import { importoBreve } from '@/components/Tabella';
import { Foglio } from '@/components/Foglio';
import { avvisa } from '@/lib/dialoghi';

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** YYYY-MM-01 del mese (indice 0-11) di un anno. */
const chiaveMese = (anno: number, m: number) => `${anno}-${String(m + 1).padStart(2, '0')}-01`;

/** Il reale di un mese per linea, dai dati che esistono già. */
interface RealeLinea {
  ordini: number;
  valoreOrdini: number;
  trattative: number; // solo quelle con created_at: la base si dichiara
}

export function PianoCommerciale() {
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth()); // 0-11
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

  /** mese (0-11) → linee pianificate, per accendere il calendario. */
  const pianiPerMese = useMemo(() => {
    const m = new Map<number, Pianificazione[]>();
    for (const r of righe) {
      const idx = Number(r.mese.slice(5, 7)) - 1;
      if (!m.has(idx)) m.set(idx, []);
      m.get(idx)!.push(r);
    }
    return m;
  }, [righe]);

  /** Il reale del mese selezionato, per linea. Confini in ora LOCALE. */
  const realePerLinea = useMemo(() => {
    const da = new Date(anno, mese, 1).getTime();
    const a = new Date(anno, mese + 1, 1).getTime();
    const dentro = (iso: string | null | undefined) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= da && t < a;
    };
    const m = new Map<string, RealeLinea>();
    const prendi = (linea: string | null | undefined) => {
      const k = (linea ?? 'Senza linea').trim() || 'Senza linea';
      if (!m.has(k)) m.set(k, { ordini: 0, valoreOrdini: 0, trattative: 0 });
      return m.get(k)!;
    };
    for (const o of ordini) {
      if (o.stato === 'annullato' || !dentro((o as any).created_at)) continue;
      const r = prendi(o.linea);
      r.ordini += 1;
      r.valoreOrdini += o.valore ?? 0;
    }
    for (const d of deals) {
      if (d.annullata_il || !dentro(d.created_at)) continue;
      prendi(d.linea).trattative += 1;
    }
    return m;
  }, [ordini, deals, anno, mese]);

  const pianoMese = pianiPerMese.get(mese) ?? [];
  const pianoDi = (linea: string) => pianoMese.find((p) => p.linea === linea) ?? null;
  // Le linee da mostrare: quelle pianificate + quelle con numeri reali nel mese.
  const lineeInVista = useMemo(() => {
    const s = new Set<string>(pianoMese.map((p) => p.linea));
    for (const [l, r] of realePerLinea) if (r.ordini || r.trattative) s.add(l);
    return [...s].sort((a, b) => a.localeCompare(b, 'it'));
  }, [pianoMese, realePerLinea]);

  const eMeseCorrente = anno === oggi.getFullYear() && mese === oggi.getMonth();

  return (
    <View style={styles.card}>
      <View style={styles.testata}>
        <Text style={styles.titolo}>Pianificazione commerciale</Text>
        {/* Anno: ‹ 2026 › */}
        <View style={styles.annoRiga}>
          <Pressable hitSlop={8} onPress={() => setAnno(anno - 1)} accessibilityLabel="Anno precedente">
            <Ionicons name="chevron-back" size={17} color={colors.testoSoft} />
          </Pressable>
          <Text style={styles.anno}>{anno}</Text>
          <Pressable hitSlop={8} onPress={() => setAnno(anno + 1)} accessibilityLabel="Anno successivo">
            <Ionicons name="chevron-forward" size={17} color={colors.testoSoft} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.sotto}>
        Il piano dell&apos;anno, mese per mese e linea per linea: target di venduto e obiettivo di conversione
        (trattative → ordini). Il reale arriva da ordini e trattative, mai ricopiato.
      </Text>

      {/* IL CALENDARIO: 12 mesi, si accende dove il piano c'è. */}
      <View style={styles.calendario}>
        {MESI.map((nome, i) => {
          const haPiano = (pianiPerMese.get(i) ?? []).length > 0;
          const selezionato = i === mese;
          const corrente = anno === oggi.getFullYear() && i === oggi.getMonth();
          return (
            <Pressable
              key={nome}
              style={[styles.meseCella, selezionato && styles.meseCellaSel]}
              onPress={() => setMese(i)}
              accessibilityLabel={`${MESI_LUNGHI[i]} ${anno}`}
              accessibilityState={{ selected: selezionato }}
            >
              <Text style={[styles.meseTxt, corrente && styles.meseCorrente, selezionato && styles.meseTxtSel]}>
                {nome}
              </Text>
              {/* Il dot dice «pianificato»: verde pieno; senza piano, vuoto. */}
              <View style={[styles.dot, haPiano ? styles.dotPieno : styles.dotVuoto]} />
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
        <Text style={styles.nota}>Carico piano e numeri del mese…</Text>
      ) : (
        <>
          <Text style={styles.meseTitolo}>
            {MESI_LUNGHI[mese]} {anno}
            {eMeseCorrente ? ' · mese corrente' : ''}
          </Text>

          {lineeInVista.length === 0 ? (
            <Text style={styles.nota}>
              Nessun piano e nessun movimento in questo mese.
              {responsabile ? ' Si comincia da «Pianifica il mese».' : ''}
            </Text>
          ) : (
            lineeInVista.map((linea) => {
              const p = pianoDi(linea);
              const r = realePerLinea.get(linea) ?? { ordini: 0, valoreOrdini: 0, trattative: 0 };
              const conv = r.trattative > 0 ? Math.round((r.ordini / r.trattative) * 100) : null;
              const quota = p?.target_valore ? Math.min(1, r.valoreOrdini / p.target_valore) : null;
              return (
                <View key={linea} style={styles.lineaRiga}>
                  <View style={styles.lineaTesta}>
                    <Text style={styles.lineaNome} numberOfLines={1}>{linea}</Text>
                    <Text style={styles.lineaNumeri}>
                      {importoBreve(r.valoreOrdini)}
                      {p?.target_valore != null ? ` / ${importoBreve(p.target_valore)}` : ' · senza target'}
                    </Text>
                  </View>
                  {/* La barra c'è solo col target: senza, non c'è una base. */}
                  {quota != null ? (
                    <View style={styles.barra}>
                      <View style={[styles.barraFill, { width: `${Math.round(quota * 100)}%` }, quota >= 1 && styles.barraPiena]} />
                    </View>
                  ) : null}
                  <Text style={styles.lineaMeta}>
                    {r.ordini} {r.ordini === 1 ? 'ordine' : 'ordini'} · {r.trattative}{' '}
                    {r.trattative === 1 ? 'trattativa aperta nel mese' : 'trattative aperte nel mese'}
                    {conv != null ? ` · conversione ${conv}%` : ' · conversione — (nessuna trattativa datata)'}
                    {p?.obiettivo_conversione != null ? ` (obiettivo ${p.obiettivo_conversione}%)` : ''}
                  </Text>
                </View>
              );
            })
          )}

          {responsabile ? (
            <Pressable style={styles.btnPianifica} onPress={() => setPianifica(true)}>
              <Ionicons name="flag-outline" size={15} color={colors.bianco} />
              <Text style={styles.btnPianificaTxt}>Pianifica {MESI_LUNGHI[mese]}</Text>
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
          anno={anno}
          mese={mese}
          esistenti={pianoMese}
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

/** Il foglio del responsabile: target e obiettivo per OGNI linea del mese. */
function FoglioPiano({
  anno,
  mese,
  esistenti,
  onClose,
  onSalvato,
}: {
  anno: number;
  mese: number;
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
  const [valori, setValori] = useState<Record<string, { target: string; conv: string }>>(() => {
    const v: Record<string, { target: string; conv: string }> = {};
    for (const l of linee) {
      const p = esistenti.find((x) => x.linea === l);
      v[l] = {
        target: p?.target_valore != null ? scriviImporto(p.target_valore) : '',
        conv: p?.obiettivo_conversione != null ? String(p.obiettivo_conversione) : '',
      };
    }
    return v;
  });
  const [salvando, setSalvando] = useState(false);
  const [erroreForm, setErroreForm] = useState<string | null>(null);

  async function salva() {
    if (salvando) return;
    // ⚠️ Un importo scritto male FERMA il salvataggio: buttato a null
    // cancellerebbe un target in silenzio.
    const daScrivere: { mese: string; linea: string; target_valore: number | null; obiettivo_conversione: number | null }[] = [];
    for (const l of linee) {
      const v = valori[l];
      let target: number | null = null;
      if (v.target.trim()) {
        target = leggiImporto(v.target);
        if (target === null) {
          setErroreForm(`«${v.target}» non è un importo (linea ${l}). Scrivilo come 1.500,50.`);
          return;
        }
      }
      let conv: number | null = null;
      if (v.conv.trim()) {
        conv = Number(v.conv.replace(',', '.'));
        if (!Number.isFinite(conv) || conv <= 0 || conv > 100) {
          setErroreForm(`La conversione della linea ${l} è una percentuale fra 1 e 100.`);
          return;
        }
      }
      const p = esistenti.find((x) => x.linea === l);
      const cambiata = (p?.target_valore ?? null) !== target || (p?.obiettivo_conversione ?? null) !== conv;
      if (cambiata) daScrivere.push({ mese: chiaveMese(anno, mese), linea: l, target_valore: target, obiettivo_conversione: conv });
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
    <Foglio titolo={`Pianifica ${MESI_LUNGHI[mese]} ${anno}`} sottotitolo="Target di venduto (€ IVA esclusa) e obiettivo di conversione trattative → ordini, per linea. Vuoto = quella linea resta senza piano." onClose={onClose} bloccaSfondo largo>
      <View style={{ gap: spacing.sm, paddingBottom: 8 }}>
        {linee.map((l) => (
          <View key={l} style={styles.formRiga}>
            <Text style={styles.formLinea} numberOfLines={1}>{l}</Text>
            <TextInput
              style={styles.formCampo}
              value={valori[l].target}
              onChangeText={(t) => setValori({ ...valori, [l]: { ...valori[l], target: t } })}
              placeholder="Target €"
              placeholderTextColor={colors.grigio}
              inputMode="decimal"
            />
            <TextInput
              style={[styles.formCampo, styles.formCampoConv]}
              value={valori[l].conv}
              onChangeText={(t) => setValori({ ...valori, [l]: { ...valori[l], conv: t } })}
              placeholder="Conv. %"
              placeholderTextColor={colors.grigio}
              inputMode="decimal"
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
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotPieno: { backgroundColor: colors.successo },
  dotVuoto: { backgroundColor: colors.grigioChiaro },
  meseTitolo: { fontSize: 11, fontWeight: '700', color: colors.testoSoft, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.xs },
  lineaRiga: { gap: 3, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.grigioChiaro },
  lineaTesta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  lineaNome: { fontWeight: '600', color: colors.navy, fontSize: 14, flexShrink: 1 },
  lineaNumeri: { fontWeight: '600', color: colors.testo, fontSize: 13, fontVariant: ['tabular-nums'] },
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
  formRiga: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  formLinea: { flex: 1, minWidth: 0, color: colors.navy, fontWeight: '600', fontSize: 13.5 },
  formCampo: {
    width: 110,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 16,
    color: colors.testo,
  },
  formCampoConv: { width: 84 },
  formAzioni: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  btnAnnulla: { borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.fill, minHeight: touchMin, justifyContent: 'center' },
  btnAnnullaTxt: { color: colors.testo, fontWeight: '600' },
  btnSalva: { borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.ink, minHeight: touchMin, justifyContent: 'center' },
  btnSalvaTxt: { color: colors.bianco, fontWeight: '600' },
});
