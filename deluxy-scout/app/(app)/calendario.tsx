// Calendario: griglia mensile moderna e responsiva.
// - Su schermo largo (desktop): calendario grande con gli EVENTI dentro le celle
//   e il pannello del giorno affiancato → tutto visibile su una pagina.
// - Su mobile: griglia compatta con pallino conteggio + elenco del giorno sotto.
// Eventi = task con scadenza + follow-up trattative con scadenza. Filtro venditore
// e SYNC con calendari esterni (feed iCal).
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import { PageIntro } from '@/components/ui';
import { fetchCalToken, fetchTask, fetchTutteTrattative, urlFeedCalendario } from '@/lib/db';

interface Evento {
  id: string;
  data: string; // YYYY-MM-DD
  tipo: 'task' | 'trattativa';
  titolo: string;
  negozio: string | null;
  owner: string | null;
  placeId: string | null;
}

const GIORNI_SET = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (a: number, m: number, g: number) => `${a}-${pad(m + 1)}-${pad(g)}`;
function isoOggi(): string {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function Calendario() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 900; // desktop: calendario grande + pannello affiancato
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [venditore, setVenditore] = useState<string>('tutti');
  const [cursore, setCursore] = useState(() => {
    const d = new Date();
    return { anno: d.getFullYear(), mese: d.getMonth() };
  });
  const [giornoSel, setGiornoSel] = useState<string>(isoOggi());
  const [syncAperto, setSyncAperto] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [tasks, trattative] = await Promise.all([fetchTask(false), fetchTutteTrattative()]);
      const evTask: Evento[] = tasks
        .filter((t) => t.scadenza && !t.completata)
        .map((t) => ({ id: `t_${t.id}`, data: t.scadenza as string, tipo: 'task', titolo: t.titolo, negozio: t.place_nome ?? null, owner: t.owner_nome ?? null, placeId: t.place_id }));
      const evDeal: Evento[] = trattative
        .filter((d) => d.scadenza)
        .map((d) => ({ id: `d_${d.id}`, data: d.scadenza as string, tipo: 'trattativa', titolo: (d.linee?.length ? d.linee.join(', ') : d.linea) ?? d.titolo ?? 'Trattativa', negozio: d.place_nome ?? null, owner: d.owner_nome ?? null, placeId: d.place_id || null }));
      setEventi([...evTask, ...evDeal]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const venditori = useMemo(() => [...new Set(eventi.map((e) => e.owner).filter(Boolean) as string[])].sort(), [eventi]);
  const filtrati = useMemo(() => (venditore === 'tutti' ? eventi : eventi.filter((e) => e.owner === venditore)), [eventi, venditore]);
  const perGiorno = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of filtrati) {
      const l = m.get(e.data) ?? [];
      l.push(e);
      m.set(e.data, l);
    }
    return m;
  }, [filtrati]);

  // Celle della griglia (lunedì-first), con padding per settimane piene.
  const celle = useMemo(() => {
    const { anno, mese } = cursore;
    const offset = (new Date(anno, mese, 1).getDay() + 6) % 7;
    const giorniInMese = new Date(anno, mese + 1, 0).getDate();
    const c: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: giorniInMese }, (_, i) => i + 1)];
    while (c.length % 7 !== 0) c.push(null);
    return c;
  }, [cursore]);

  const oggi = isoOggi();
  const eventiGiorno = perGiorno.get(giornoSel) ?? [];
  const totMese = useMemo(() => {
    const pref = `${cursore.anno}-${pad(cursore.mese + 1)}-`;
    return filtrati.filter((e) => e.data.startsWith(pref)).length;
  }, [filtrati, cursore]);

  function cambiaMese(delta: number) {
    setCursore((c) => {
      const d = new Date(c.anno, c.mese + delta, 1);
      return { anno: d.getFullYear(), mese: d.getMonth() };
    });
  }
  function vaiOggi() {
    const d = new Date();
    setCursore({ anno: d.getFullYear(), mese: d.getMonth() });
    setGiornoSel(isoOggi());
  }

  // ── Calendario (griglia) ────────────────────────────────────────────────────
  const calendario = (
    <View style={isWide ? styles.calPane : undefined}>
      <View style={styles.meseRow}>
        <View style={styles.meseSx}>
          <Text style={styles.meseTxt}>
            {MESI[cursore.mese]} {cursore.anno}
          </Text>
          <Text style={styles.meseSub}>{totMese} in agenda</Text>
        </View>
        <View style={styles.navGruppo}>
          <Pressable onPress={vaiOggi} style={styles.oggiBtn}>
            <Text style={styles.oggiTxt}>Oggi</Text>
          </Pressable>
          <Pressable onPress={() => cambiaMese(-1)} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.testo} />
          </Pressable>
          <Pressable onPress={() => cambiaMese(1)} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.testo} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.calCard, isWide && styles.calCardWide]}>
        <View style={styles.grigliaHead}>
          {GIORNI_SET.map((g) => (
            <Text key={g} style={styles.giornoSet}>{g}</Text>
          ))}
        </View>
        <View style={styles.griglia}>
          {celle.map((g, idx) => {
            if (g == null) return <View key={`v${idx}`} style={[styles.cella, isWide ? styles.cellaWide : styles.cellaSquare]} />;
            const iso = isoOf(cursore.anno, cursore.mese, g);
            const evs = perGiorno.get(iso);
            const isOggiCell = iso === oggi;
            const isSel = iso === giornoSel;
            const scaduto = Boolean(evs && iso < oggi);
            return (
              <Pressable key={iso} style={[styles.cella, isWide ? styles.cellaWide : styles.cellaSquare]} onPress={() => setGiornoSel(iso)}>
                <View style={[styles.cellaBox, isWide && styles.cellaBoxWide, isSel && styles.cellaSel, isOggiCell && !isSel && styles.cellaOggi]}>
                  <Text style={[styles.cellaNum, isSel && styles.cellaNumSel, isOggiCell && !isSel && styles.cellaNumOggi]}>{g}</Text>
                  {isWide ? (
                    <View style={styles.cellEventi}>
                      {(evs ?? []).slice(0, 3).map((e) => (
                        <View
                          key={e.id}
                          style={[styles.cellChip, e.tipo === 'task' ? styles.cellChipTask : styles.cellChipDeal, scaduto && styles.cellChipScaduto]}
                        >
                          <Text style={[styles.cellChipTxt, isSel && { color: colors.bianco }]} numberOfLines={1}>{e.titolo}</Text>
                        </View>
                      ))}
                      {evs && evs.length > 3 ? <Text style={[styles.cellPiu, isSel && { color: colors.bianco }]}>+{evs.length - 3}</Text> : null}
                    </View>
                  ) : evs ? (
                    <View style={[styles.pallino, { backgroundColor: isSel ? colors.bianco : scaduto ? colors.errore : colors.oro }]}>
                      <Text style={[styles.pallinoTxt, { color: isSel ? colors.navy : colors.bianco }]}>{evs.length}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  // ── Pannello del giorno selezionato ─────────────────────────────────────────
  const pannelloGiorno = (
    <View style={isWide ? styles.dayPane : styles.dayStack}>
      <Text style={styles.giornoSelTitolo}>{etichettaGiornoSel(giornoSel)}</Text>
      {eventiGiorno.length === 0 ? (
        <View style={styles.vuotoBox}>
          <Ionicons name="calendar-clear-outline" size={22} color={colors.grigio} />
          <Text style={styles.vuoto}>Nessun appuntamento in questo giorno. Le scadenze di task e trattative compaiono qui automaticamente.</Text>
        </View>
      ) : (
        eventiGiorno.map((e) => (
          <Pressable
            key={e.id}
            style={styles.evento}
            disabled={!e.placeId}
            onPress={() => e.placeId && router.push(`/(app)/attivita/${e.placeId}`)}
          >
            <View style={[styles.tipoIcona, e.tipo === 'task' ? styles.tipoTask : styles.tipoDeal]}>
              <Ionicons name={e.tipo === 'task' ? 'checkbox-outline' : 'briefcase-outline'} size={15} color={colors.bianco} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eTitolo} numberOfLines={1}>{e.titolo}</Text>
              {e.negozio ? <Text style={styles.eMeta} numberOfLines={1}>{e.negozio}</Text> : null}
            </View>
            {e.owner ? <Text style={styles.eOwner} numberOfLines={1}>{e.owner}</Text> : null}
          </Pressable>
        ))
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <PageIntro testo="Gli appuntamenti con una scadenza: task e follow-up delle trattative. Tocca un giorno per vederne l'elenco." />
      <View style={styles.head}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtri}>
          <Chip label="Tutti" on={venditore === 'tutti'} onPress={() => setVenditore('tutti')} />
          {venditori.map((v) => (
            <Chip key={v} label={v} on={venditore === v} onPress={() => setVenditore(v)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        {isWide ? (
          <View style={styles.wideRow}>
            {calendario}
            {pannelloGiorno}
          </View>
        ) : (
          <>
            {calendario}
            {pannelloGiorno}
          </>
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setSyncAperto(true)}>
        <Ionicons name="sync-outline" size={18} color={colors.bianco} />
        <Text style={styles.fabTxt}>Sync calendario</Text>
      </Pressable>

      {syncAperto ? <SyncModal onClose={() => setSyncAperto(false)} /> : null}
    </View>
  );
}

function etichettaGiornoSel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const idx = (d.getDay() + 6) % 7; // lunedì-first
  return `${GIORNI_LUNGHI[idx]} ${d.getDate()} ${MESI[d.getMonth()].toLowerCase()}`;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function SyncModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchCalToken().then((t) => setUrl(t ? urlFeedCalendario(t) : null));
    }, []),
  );

  function copia() {
    if (!url) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiato(true);
        setTimeout(() => setCopiato(false), 2000);
      });
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitolo}>Sync con altri calendari</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>
          <Text style={styles.sheetSub}>
            Aggiungi questo calendario a Google, Apple o Outlook: si aggiorna da solo con i tuoi
            task e follow-up in scadenza. È in sola lettura.
          </Text>

          <Text style={styles.label}>Link di sottoscrizione (privato)</Text>
          <TextInput style={styles.urlInput} value={url ?? 'Caricamento…'} editable={false} multiline selectTextOnFocus />
          <Pressable style={styles.copiaBtn} onPress={copia} disabled={!url}>
            <Ionicons name={copiato ? 'checkmark' : 'copy-outline'} size={16} color={colors.bianco} />
            <Text style={styles.copiaTxt}>{copiato ? 'Copiato!' : 'Copia link'}</Text>
          </Pressable>

          <View style={styles.istruzioni}>
            <Text style={styles.istrTitolo}>Come aggiungerlo</Text>
            <Text style={styles.istr}>• <Text style={styles.b}>Google Calendar</Text>: Altri calendari → Da URL → incolla il link</Text>
            <Text style={styles.istr}>• <Text style={styles.b}>Apple Calendar</Text>: File → Nuova sottoscrizione calendario → incolla</Text>
            <Text style={styles.istr}>• <Text style={styles.b}>Outlook</Text>: Aggiungi calendario → Da Internet → incolla</Text>
          </View>
          <View style={styles.avvisoRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.attenzione} />
            <Text style={styles.avviso}>
              È un link segreto e personale: chi ce l'ha vede i tuoi appuntamenti. Non condividerlo.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { paddingTop: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, backgroundColor: colors.sfondo },
  filtri: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 6 },
  chip: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 180 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  body: { padding: spacing.md, paddingBottom: 96 },

  // Layout desktop: calendario + pannello affiancati.
  wideRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start', maxWidth: 1180, alignSelf: 'center', width: '100%' },
  calPane: { flex: 1 },
  dayPane: { width: 340, gap: spacing.xs },
  dayStack: { marginTop: spacing.md },

  meseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  meseSx: { gap: 1 },
  meseTxt: { fontSize: 22, fontWeight: '800', color: colors.testo, letterSpacing: -0.4 },
  meseSub: { fontSize: 12, color: colors.testoSoft, fontWeight: '600' },
  navGruppo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  oggiBtn: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, marginRight: 2 },
  oggiTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  navBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.fill },

  calCard: { backgroundColor: colors.bianco, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.sm },
  calCardWide: { padding: spacing.md, ...shadow.card },
  grigliaHead: { flexDirection: 'row' },
  giornoSet: { flex: 1, textAlign: 'center', color: colors.grigio, fontWeight: '800', fontSize: 11, paddingBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  griglia: { flexDirection: 'row', flexWrap: 'wrap' },
  cella: { width: `${100 / 7}%`, padding: 2 },
  cellaSquare: { aspectRatio: 1 },
  cellaWide: { minHeight: 104 },
  cellaBox: { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cellaBoxWide: { alignItems: 'stretch', justifyContent: 'flex-start', padding: 5, borderWidth: 1, borderColor: colors.grigioChiaro, gap: 3 },
  cellaSel: { backgroundColor: colors.navy, borderColor: colors.navy },
  cellaOggi: { borderWidth: 1.5, borderColor: colors.oro },
  cellaNum: { color: colors.testo, fontWeight: '600', fontSize: 14 },
  cellaNumSel: { color: colors.bianco, fontWeight: '800' },
  cellaNumOggi: { color: colors.goldStrong, fontWeight: '800' },
  // Chip evento dentro la cella (desktop)
  cellEventi: { gap: 2 },
  cellChip: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  cellChipTask: { backgroundColor: 'rgba(17,19,24,0.08)' },
  cellChipDeal: { backgroundColor: colors.goldSoft },
  cellChipScaduto: { backgroundColor: 'rgba(215,0,21,0.10)' },
  cellChipTxt: { fontSize: 11, fontWeight: '600', color: colors.testo },
  cellPiu: { fontSize: 10, fontWeight: '700', color: colors.testoSoft, paddingLeft: 3 },
  // Pallino conteggio (mobile)
  pallino: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  pallinoTxt: { fontSize: 10, fontWeight: '900' },

  giornoSelTitolo: { marginTop: spacing.md, marginBottom: spacing.sm, fontWeight: '700', color: colors.testo, fontSize: 16, textTransform: 'capitalize', letterSpacing: -0.2 },
  vuotoBox: { alignItems: 'center', gap: 8, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  vuoto: { color: colors.grigio, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  evento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.xs,
  },
  tipoIcona: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tipoTask: { backgroundColor: colors.navy },
  tipoDeal: { backgroundColor: colors.oro },
  eTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  eMeta: { color: colors.testoSoft, fontSize: 12 },
  eOwner: { color: colors.goldStrong, fontWeight: '800', fontSize: 12, maxWidth: 110 },
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
    ...shadow.float,
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
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitolo: { fontSize: 18, fontWeight: '900', color: colors.testo },
  sheetSub: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '800', color: colors.grigio, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  urlInput: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 12,
    color: colors.testo,
    minHeight: 54,
  },
  copiaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 12 },
  copiaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  istruzioni: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 4, marginTop: 4 },
  istrTitolo: { fontWeight: '800', color: colors.testo, fontSize: 13, marginBottom: 2 },
  istr: { color: colors.testoSoft, fontSize: 13, lineHeight: 19 },
  b: { fontWeight: '800', color: colors.testo },
  avvisoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  avviso: { flex: 1, color: colors.testoSoft, fontSize: 12, fontStyle: 'italic' },
});
