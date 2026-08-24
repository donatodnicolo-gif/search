// Lead web — la coda di qualificazione del canale internet
// (docs/VISIONE-COMMERCIALE.md). Un lead entra qui (form del sito via API,
// mail, social, o inserito a mano), e SI LAVORA: o diventa una trattativa
// (canale web) agganciata a un negozio, o si scarta. Un lead "nuovo" più
// vecchio di 2 giorni è in ritardo: sul web chi non risponde subito perde.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
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
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import {
  cercaPlaces,
  creaLead,
  eliminaLead,
  fetchLeads,
  qualificaLead,
  scartaLead,
  type PlaceLite,
} from '@/lib/db';
import { urlMessaggioAiMail } from '@/lib/aimail';
import { fetchCorpoMail } from '@/lib/mail';
import { avvisa, conferma } from '@/lib/dialoghi';
import type { FonteLead, Lead } from '@/types';
import { GIORNI_RISPOSTA_LEAD } from '@/lib/cadenze';
import { importaRichiesteDaMail } from '@/lib/mail';

const FONTI: { valore: FonteLead; label: string }[] = [
  { valore: 'sito', label: 'Sito' },
  { valore: 'mail', label: 'Mail' },
  { valore: 'social', label: 'Social' },
  { valore: 'passaparola', label: 'Passaparola' },
  { valore: 'altro', label: 'Altro' },
];

function etaGiorni(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

export default function LeadWeb() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statoFiltro, setStatoFiltro] = useState<string>('nuovo');
  const [formAperto, setFormAperto] = useState(false);
  const [daQualificare, setDaQualificare] = useState<Lead | null>(null);
  const [importando, setImportando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setLeads(await fetchLeads());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const dati = useMemo(() => leads.filter((l) => l.stato === statoFiltro), [leads, statoFiltro]);
  const nNuovi = leads.filter((l) => l.stato === 'nuovo').length;

  /** Tira dentro la posta della casella commerciale: ogni mail è una richiesta. */
  async function importaDallaMail() {
    if (importando) return;
    setImportando(true);
    try {
      const { lette, importate, scartate, automatiche, interne, mittentiScartati } = await importaRichiesteDaMail();
      await carica();
      // ⚠️ Il taglio si DICHIARA. Un import che dice «0 nuove» dopo aver letto
      // 30 mail sembra un guasto; e un filtro silenzioso che un giorno taglia
      // un cliente vero non lo scopre nessuno. Si dice quante, perché, e da
      // quali indirizzi — le mail restano comunque nella casella.
      const perche = [
        automatiche ? `${automatiche} ${automatiche === 1 ? 'automatica' : 'automatiche'}` : '',
        interne ? `${interne} da noi` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const notaScarto = scartate
        ? `\n\nNon sono richieste e restano fuori: ${scartate} (${perche}).${
            mittentiScartati.length ? ` Da: ${mittentiScartati.join(', ')}.` : ''
          }`
        : '';
      avvisa(
        importate ? 'Richieste importate' : 'Nessuna nuova richiesta',
        (importate
          ? `${importate} nuove richieste dalla casella commerciale (su ${lette} mail lette).`
          : `Nessuna mail nuova da importare: le ${lette} lette erano già in elenco o non sono richieste.`) + notaScarto,
      );
    } catch (e: any) {
      avvisa('Importazione non riuscita', e?.message ?? 'Riprova più tardi.');
    } finally {
      setImportando(false);
    }
  }

  // La mail aperta per intero (il testo salvato al momento dell'import).
  const [daLeggere, setDaLeggere] = useState<Lead | null>(null);

  // Il testo intero della mail aperta: si chiede ad AI Mail solo quando serve.
  const [corpo, setCorpo] = useState('');
  const [corpoStato, setCorpoStato] = useState<'fermo' | 'carico' | 'ok' | 'ripiego'>('fermo');
  const [corpoErrore, setCorpoErrore] = useState('');

  function apriMessaggio(l: Lead) {
    setDaLeggere(l);
    setCorpo('');
    setCorpoErrore('');
    const rif = l.mail_ref || l.mail_id;
    if (!rif) {
      // Richiesta inserita a mano: non c'è nessuna mail da andare a prendere.
      setCorpoStato('fermo');
      return;
    }
    setCorpoStato('carico');
    fetchCorpoMail(rif)
      .then((r) => {
        setCorpo(r.testo || '');
        setCorpoStato(r.testo ? 'ok' : 'ripiego');
      })
      .catch((e) => {
        setCorpoErrore((e as Error)?.message ?? '');
        setCorpoStato('ripiego');
      });
  }

  /** Elimina una richiesta: sparisce dalla coda, in tutti e tre i filtri. */
  function elimina(l: Lead) {
    conferma(
      'Eliminare la richiesta?',
      '«' + l.nome + '» sparisce dalla coda e non torna. La mail resta nella casella: qui si cancella solo la richiesta.',
      async () => {
        const prima = leads;
        setLeads((cur) => cur.filter((x) => x.id !== l.id));
        try {
          await eliminaLead(l.id);
        } catch (e) {
          // Se il server rifiuta, la riga TORNA: una lista che si accorcia da
          // sola fa credere fatta una cosa che non è successa.
          setLeads(prima);
          avvisa('Non eliminata', (e as Error)?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  async function scarta(l: Lead) {
    try {
      await scartaLead(l.id);
      carica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Operazione non riuscita.');
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.head, contenutoCentrato]}>
        <PageIntro testo="Le richieste arrivate dal web e dalla casella commerciale: qualificale agganciandole a un negozio — nasce la trattativa, canale web — oppure scartale. Rispondere entro 2 giorni: sul web chi tarda perde." />
        <Pressable style={[styles.btnImporta, importando && { opacity: 0.5 }]} disabled={importando} onPress={importaDallaMail}>
          <Ionicons name="mail-outline" size={15} color={colors.navy} />
          <Text style={styles.btnImportaTxt}>
            {importando ? 'Leggo la posta…' : 'Importa da commerciale@deluxy.it'}
          </Text>
        </Pressable>
        <View style={styles.chips}>
          {[
            { v: 'nuovo', label: `Nuovi${nNuovi ? ` (${nNuovi})` : ''}` },
            { v: 'qualificato', label: 'Qualificati' },
            { v: 'scartato', label: 'Scartati' },
          ].map((c) => (
            <Pressable key={c.v} onPress={() => setStatoFiltro(c.v)} style={[styles.chip, statoFiltro === c.v && styles.chipOn]}>
              <Text style={[styles.chipTxt, statoFiltro === c.v && styles.chipTxtOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={dati}
        keyExtractor={(l) => l.id}
        contentContainerStyle={[styles.list, contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="globe-outline"
            titolo={statoFiltro === 'nuovo' ? 'Nessuna richiesta da qualificare' : 'Niente qui'}
            aiuto="Le richieste arrivano dal sito (via API) o si inseriscono col bottone +. Ogni richiesta qualificata diventa una trattativa sul canale web."
          />
        }
        renderItem={({ item }) => {
          const eta = etaGiorni(item.created_at);
          const ritardo = item.stato === 'nuovo' && eta >= GIORNI_RISPOSTA_LEAD;
          // La scheda intera apre la mail: è la prima cosa che si vuole fare su
          // una richiesta, e cercare il link in fondo era un passaggio in più.
          // Ma solo se c'è davvero qualcosa da leggere: le richieste inserite a
          // mano non hanno mail, e un pop-up vuoto è peggio di un clic che non
          // fa niente.
          const leggibile = !!(item.messaggio || item.mail_ref || item.mail_id);
          // Le azioni dentro la scheda non devono far scattare anche il pop-up:
          // sul web l'evento risale, quindi lo si ferma qui.
          const solo = (fn: () => void) => (e?: any) => {
            e?.stopPropagation?.();
            fn();
          };
          return (
            <Pressable
              style={({ hovered }: any) => [styles.card, leggibile && hovered && styles.cardHover]}
              onPress={leggibile ? () => apriMessaggio(item) : undefined}
              disabled={!leggibile}
              accessibilityRole={leggibile ? 'button' : undefined}
              accessibilityLabel={leggibile ? `Apri il messaggio di ${item.nome}` : undefined}
            >
              <View style={styles.cardHead}>
                <Text numberOfLines={3} style={styles.nome}>{item.nome}</Text>
                <Text style={[styles.eta, ritardo && styles.ritardo]}>
                  {eta === 0 ? 'oggi' : `${eta}g fa`}{ritardo ? ' · in ritardo' : ''}
                </Text>
              </View>
              {item.messaggio ? <Text style={styles.messaggio} numberOfLines={2}>{item.messaggio}</Text> : null}
              <View style={styles.metaRow}>
                <StatusBadge small label={FONTI.find((f) => f.valore === item.fonte)?.label ?? item.fonte} colore={colors.blue} />
                {item.contatto ? <Text style={styles.meta} numberOfLines={1}>{item.contatto}</Text> : null}
              </View>
              {item.stato === 'nuovo' ? (
                <View style={styles.azioni}>
                  <Pressable style={styles.btn} onPress={solo(() => setDaQualificare(item))}>
                    <Ionicons name="briefcase-outline" size={15} color={colors.bianco} />
                    <Text style={styles.btnTxt}>Qualifica → trattativa</Text>
                  </Pressable>
                  <Pressable style={styles.btnGhost} onPress={solo(() => scarta(item))}>
                    <Text style={styles.btnGhostTxt}>Scarta</Text>
                  </Pressable>
                </View>
              ) : item.stato === 'qualificato' ? (
                <Pressable onPress={solo(() => router.push('/(app)/trattative'))}>
                  <Text style={styles.link}>Vedi la trattativa generata ›</Text>
                </Pressable>
              ) : null}

              {/* Azioni sulla MAIL, valide in qualunque stato: leggerla per
                  intero e toglierla di mezzo sono cose che servono anche su una
                  richiesta già lavorata o scartata. */}
              <View style={styles.azioniMail}>
                {leggibile ? (
                  <Pressable hitSlop={6} onPress={solo(() => apriMessaggio(item))}>
                    <Text style={styles.azioneTxt}>Apri il messaggio</Text>
                  </Pressable>
                ) : null}
                {item.mail_ref ? (
                  <>
                    <Text style={styles.sep}>·</Text>
                    <Pressable hitSlop={6} onPress={solo(() => Linking.openURL(urlMessaggioAiMail(item.mail_ref!)))}>
                      <Text style={styles.azioneTxt}>Vedila in AI Mail</Text>
                    </Pressable>
                  </>
                ) : null}
                <Text style={styles.sep}>·</Text>
                <Pressable hitSlop={6} onPress={solo(() => elimina(item))}>
                  <Text style={[styles.azioneTxt, styles.azionePericolo]}>Elimina</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova richiesta</Text>
      </Pressable>

      {formAperto ? <NuovoLeadModal onClose={() => setFormAperto(false)} onSalvato={() => { setFormAperto(false); carica(); }} /> : null}
      {daLeggere ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setDaLeggere(null)}>
          {/* Si chiude anche toccando fuori: qui non si sta scrivendo niente,
              è una lettura, e un pop-up che si chiude solo dalla × sembra
              bloccato. Il clic dentro non deve risalire fino allo sfondo. */}
          <Pressable style={styles.overlay} onPress={() => setDaLeggere(null)}>
            <Pressable style={styles.sheetMail} onPress={() => {}}>
              <View style={styles.sheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitolo} numberOfLines={2}>{daLeggere.nome}</Text>
                  {daLeggere.contatto ? <Text style={styles.meta}>{daLeggere.contatto}</Text> : null}
                </View>
                <Pressable onPress={() => setDaLeggere(null)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={colors.testoSoft} />
                </Pressable>
              </View>

              <ScrollView style={styles.corpoBox} contentContainerStyle={{ paddingBottom: 8 }}>
                {corpoStato === 'carico' ? (
                  <Text style={styles.corpoAttesa}>Prendo il testo da AI Mail…</Text>
                ) : null}
                {/* Il testo intero se AI Mail lo dà; se no resta l'anteprima
                    salvata all'import, che è meglio di niente ma è solo l'inizio. */}
                <Text style={styles.corpoMail} selectable>
                  {corpo || daLeggere.messaggio || 'Nessun testo disponibile.'}
                </Text>
                {corpoStato === 'ripiego' ? (
                  <Text style={styles.corpoNota}>
                    Questo è l’estratto salvato all’import: il testo intero non è arrivato
                    {corpoErrore ? ` (${corpoErrore})` : ''}.
                  </Text>
                ) : null}
              </ScrollView>

              <View style={styles.azioniMail}>
                {daLeggere.mail_ref ? (
                  <Pressable hitSlop={6} onPress={() => Linking.openURL(urlMessaggioAiMail(daLeggere.mail_ref!))}>
                    <Text style={styles.azioneTxt}>Aprila in AI Mail</Text>
                  </Pressable>
                ) : null}
                {daLeggere.stato === 'nuovo' ? (
                  <>
                    <Text style={styles.sep}>·</Text>
                    <Pressable
                      hitSlop={6}
                      onPress={() => {
                        const l = daLeggere;
                        setDaLeggere(null);
                        setDaQualificare(l);
                      }}
                    >
                      <Text style={styles.azioneTxt}>Qualifica</Text>
                    </Pressable>
                  </>
                ) : null}
                <Text style={styles.sep}>·</Text>
                <Pressable
                  hitSlop={6}
                  onPress={() => {
                    const l = daLeggere;
                    setDaLeggere(null);
                    elimina(l);
                  }}
                >
                  <Text style={[styles.azioneTxt, styles.azionePericolo]}>Elimina</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {daQualificare ? (
        <QualificaModal
          lead={daQualificare}
          onClose={() => setDaQualificare(null)}
          onFatto={() => {
            setDaQualificare(null);
            carica();
            avvisa('Trattativa aperta', 'Richiesta qualificata: trova la trattativa (canale web) in Trattative.');
          }}
        />
      ) : null}
    </View>
  );
}

// ── Nuovo lead a mano ─────────────────────────────────────────────────────────
function NuovoLeadModal({ onClose, onSalvato }: { onClose: () => void; onSalvato: () => void }) {
  const [nome, setNome] = useState('');
  const [contatto, setContatto] = useState('');
  const [fonte, setFonte] = useState<FonteLead>('sito');
  const [messaggio, setMessaggio] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      await creaLead({ nome, contatto, fonte, messaggio });
      onSalvato();
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
            <Text style={styles.sheetTitolo}>Nuova richiesta</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.campoLabel}>Chi ci ha contattato</Text>
            <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="nome persona o azienda" placeholderTextColor={colors.grigio} autoFocus />
            <Text style={styles.campoLabel}>Contatto (email o telefono)</Text>
            <TextInput style={styles.input} value={contatto} onChangeText={setContatto} placeholder="es. maria@negozio.it" placeholderTextColor={colors.grigio} autoCapitalize="none" />
            <Text style={styles.campoLabel}>Fonte</Text>
            <View style={styles.chips}>
              {FONTI.map((f) => (
                <Pressable key={f.valore} onPress={() => setFonte(f.valore)} style={[styles.chip, fonte === f.valore && styles.chipOn]}>
                  <Text style={[styles.chipTxt, fonte === f.valore && styles.chipTxtOn]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.campoLabel}>Cosa chiede</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} value={messaggio} onChangeText={setMessaggio} placeholder="es. preventivo consegne weekend" placeholderTextColor={colors.grigio} multiline />
            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          </ScrollView>
          <Pressable style={[styles.btn, styles.btnLargo, (!nome.trim() || salvando) && { opacity: 0.5 }]} disabled={!nome.trim() || salvando} onPress={salva}>
            <Text style={styles.btnTxt}>{salvando ? 'Salvo…' : 'Salva richiesta'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Qualifica: scegli il negozio → nasce la trattativa (canale web) ───────────
function QualificaModal({ lead, onClose, onFatto }: { lead: Lead; onClose: () => void; onFatto: () => void }) {
  // Chi ci ha scritto è una persona vera, con nome e recapito: se non lo si
  // salva ora, va ridigitato dopo nella scheda del negozio.
  const [conContatto, setConContatto] = useState(Boolean(lead.contatto));
  const [ricerca, setRicerca] = useState(lead.nome);
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        setRisultati(await cercaPlaces(ricerca));
      } catch {
        setRisultati([]);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [ricerca]);

  async function scegli(p: PlaceLite) {
    if (salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      await qualificaLead(lead, p.id, conContatto);
      onFatto();
    } catch (e: any) {
      setErrore(e?.message ?? 'Qualifica non riuscita');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitolo}>A quale negozio appartiene?</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>
          <Text style={styles.qualificaNota}>
            «{lead.nome}»{lead.messaggio ? ` — ${lead.messaggio.slice(0, 80)}` : ''}. Scegli il negozio: la trattativa nasce lì, canale web.
          </Text>
          <TextInput style={styles.input} value={ricerca} onChangeText={setRicerca} placeholder="Cerca negozio per nome…" placeholderTextColor={colors.grigio} autoFocus />
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {risultati.map((p) => (
              <Pressable key={p.id} style={styles.risultato} onPress={() => scegli(p)}>
                <Ionicons name="storefront-outline" size={16} color={colors.testoSoft} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={3} style={styles.risNome}>{p.nome}</Text>
                  {p.indirizzo ? <Text style={styles.risInd} numberOfLines={1}>{p.indirizzo}</Text> : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
          {errore ? <Text style={styles.errore}>{errore}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  azioniMail: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  azioneTxt: { color: colors.navy, fontSize: 12.5, fontWeight: '600' },
  azionePericolo: { color: colors.errore },
  sep: { color: colors.grigio, fontSize: 12 },
  corpoMail: { color: colors.testo, fontSize: 14.5, lineHeight: 23 },
  corpoBox: { maxHeight: 380, marginVertical: spacing.sm },
  corpoAttesa: { color: colors.testoSoft, fontSize: 13, marginBottom: 6 },
  corpoNota: { color: colors.testoSoft, fontSize: 12, marginTop: 10, fontStyle: 'italic' },
  sheetMail: {
    backgroundColor: colors.bianco,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    maxHeight: '88%',
  },
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { padding: spacing.md, gap: spacing.sm },
  btnImporta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingVertical: 9 },
  btnImportaTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 90 },
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 7 },
  // Sul web è l'unico segnale che la scheda si apre: sul telefono lo dice il
  // link «Apri il messaggio», che infatti resta.
  cardHover: { backgroundColor: colors.fill },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  eta: { color: colors.testoSoft, fontSize: 12 },
  ritardo: { color: colors.errore, fontWeight: '800' },
  messaggio: { color: colors.testo, fontSize: 13.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { color: colors.testoSoft, fontSize: 12.5 },
  azioni: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  btnLargo: { marginTop: spacing.sm },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12.5 },
  btnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  link: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.sfondo, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, gap: 8, maxHeight: '85%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitolo: { color: colors.navy, fontWeight: '800', fontSize: 17 },
  campoLabel: { color: colors.testoSoft, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  input: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.testo, fontSize: 14 },
  errore: { color: colors.errore, fontSize: 13, fontWeight: '700' },
  qualificaNota: { color: colors.testoSoft, fontSize: 13 },
  risultato: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: 10 },
  risNome: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  risInd: { color: colors.testoSoft, fontSize: 12 },
});
