// RICHIESTE CLIENTI — le richieste saltuarie che arrivano al commerciale.
//
// Decisione dell'utente (26/08/2026): «il commerciale deve avere per le
// richieste saltuarie un applicativo dove inserirle e richiedere a FINANCE la
// fattura». Prima non c'era, e le due strade possibili erano tutte e due
// sbagliate: aprire una trattativa (la pipeline si riempie di evasioni e la
// stessa vendita vale due volte) o usare le richieste di pagamento (sono
// l'anello DOPO, e pretendono un importo che qui spesso ancora non c'è).
//
// ⚠️ Qui non si misura niente. Il registro dei risultati è FINANCE: da qui si
// CHIEDE il documento (pro-forma) e si tiene il suo riferimento — numero e
// link — mai una copia dei suoi importi.
//
// ⚠️ La pro-forma in FINANCE si emette a un PARTNER risolto per NOME: se il
// cliente là non c'è, il servizio risponde «Partner non trovato» con i
// candidati simili. Quell'errore si mostra per intero invece di tradurlo in un
// generico «non riuscito»: dice esattamente cosa manca e dove.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { useFocusEffect } from 'expo-router';
import { colors, radius, shadow, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { Foglio } from '@/components/Foglio';
import { CampoData } from '@/components/CampoData';
import { Tabella, dataBreve, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { avvisa, conferma } from '@/lib/dialoghi';
import {
  aggiornaRichiestaCliente,
  cercaPlaces,
  collegaProformaARichiesta,
  creaRichiestaCliente,
  eliminaRichiestaCliente,
  fetchRichiesteCliente,
  type PlaceLite,
} from '@/lib/db';
import { creaProformaDaRichiesta } from '@/lib/partner';
import {
  LABEL_CANALE_RICHIESTA,
  LABEL_STATO_RICHIESTA,
  type CanaleRichiesta,
  type RichiestaCliente,
  type StatoRichiestaCliente,
  type TipologiaRichiesta,
} from '@/types';

const CANALI: CanaleRichiesta[] = ['mail', 'telefono', 'whatsapp', 'di_persona', 'web', 'altro'];
const TIPOLOGIE: TipologiaRichiesta[] = ['b2b', 'maison'];
const LABEL_TIPOLOGIA: Record<TipologiaRichiesta, string> = {
  b2b: 'B2B (ricorrente)',
  maison: 'Maison (nuovo)',
};
const COLORE_STATO: Record<StatoRichiestaCliente, string> = {
  nuova: colors.oro,
  concordata: colors.blue,
  fatturata: colors.successo,
  persa: colors.grigio,
};

/** Legge un importo scritto all'italiana («1.500,50») senza inventare zeri. */
function leggiImporto(v: string): number | null {
  const s = v.trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function RichiesteClienti() {
  // Da 900px in su l'elenco è una tabella (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [righe, setRighe] = useState<RichiestaCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [formAperto, setFormAperto] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  // Di default si nascondono le chiuse: la schermata serve a lavorare, e un
  // elenco che cresce all'infinito smette di dire cosa c'è da fare.
  const [mostraChiuse, setMostraChiuse] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setRighe(await fetchRichiesteCliente());
    } catch (e: any) {
      setErrore(e?.message ?? 'Elenco non caricato.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const chiuse = useMemo(() => righe.filter((r) => r.stato === 'fatturata' || r.stato === 'persa'), [righe]);
  const dati = useMemo(
    () => (mostraChiuse ? righe : righe.filter((r) => r.stato !== 'fatturata' && r.stato !== 'persa')),
    [righe, mostraChiuse],
  );

  /**
   * Chiede il documento a FINANCE: nasce la pro-forma, e sulla richiesta resta
   * il riferimento. Serve l'importo — senza, non c'è niente da fatturare, e
   * mandare zero sarebbe emettere un documento sbagliato.
   */
  async function chiediFattura(r: RichiestaCliente) {
    if (inCorso) return;
    if (!r.importo) {
      avvisa(
        'Manca l’importo',
        'Prima si concorda il prezzo con il cliente: scrivilo nella richiesta, poi si può chiedere il documento a FINANCE.',
      );
      return;
    }
    conferma(
      'Chiedere la pro-forma a FINANCE?',
      `Per «${r.cliente}», ${importoBreve(r.importo)} — ${r.descrizione}.\n\nIl documento nasce in bozza su Deluxy Partner: l’invio al cliente resta un’azione di FINANCE.`,
      async () => {
        setInCorso(r.id);
        try {
          const pf = await creaProformaDaRichiesta({
            cliente: r.cliente,
            importo: r.importo!,
            causale: r.descrizione,
            scadenza: r.serve_entro,
          });
          await collegaProformaARichiesta(r.id, pf.riferimento, pf.url);
          await carica();
          avvisa('Pro-forma creata', `${pf.riferimento} è in bozza su Deluxy Partner.`);
        } catch (e: any) {
          // ⚠️ Il messaggio del servizio si mostra INTERO: «Partner non trovato»
          // con i candidati dice cosa fare, «non riuscito» manda a indovinare.
          avvisa('Pro-forma non creata', String(e?.message ?? e));
        } finally {
          setInCorso(null);
        }
      },
      { testoConferma: 'Chiedi il documento' },
    );
  }

  async function cambiaStato(r: RichiestaCliente, stato: StatoRichiestaCliente) {
    const prima = righe;
    setRighe((cur) => cur.map((x) => (x.id === r.id ? { ...x, stato } : x)));
    try {
      await aggiornaRichiestaCliente(r.id, { stato });
    } catch (e: any) {
      // Rollback: una riga che cambia da sola e poi torna al ricaricamento fa
      // credere fatta una cosa che non è successa.
      setRighe(prima);
      avvisa('Stato non aggiornato', String(e?.message ?? e));
    }
  }

  function elimina(r: RichiestaCliente) {
    conferma(
      'Eliminare la richiesta?',
      `«${r.descrizione}» di ${r.cliente} sparisce da qui. Se hai già chiesto la pro-forma, quella resta su Deluxy Partner e va annullata di là.`,
      async () => {
        const prima = righe;
        setRighe((cur) => cur.filter((x) => x.id !== r.id));
        try {
          await eliminaRichiestaCliente(r.id);
        } catch (e: any) {
          setRighe(prima);
          avvisa('Non eliminata', String(e?.message ?? e));
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  const azioniDi = (r: RichiestaCliente) => (
    <View style={styles.azioni}>
      {r.proforma_url ? (
        <Pressable
          style={styles.pfChip}
          hitSlop={6}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            // URL esterno (deluxy-partner): si apre col browser, non col router.
            Linking.openURL(r.proforma_url!);
          }}
          accessibilityLabel={`Apri ${r.proforma_numero} su Deluxy Partner`}
          {...({ title: 'Apri il documento su Deluxy Partner' } as any)}
        >
          <Ionicons name="document-text-outline" size={11} color={colors.goldStrong} />
          <Text style={styles.pfChipTxt}>{r.proforma_numero}</Text>
        </Pressable>
      ) : r.stato !== 'persa' ? (
        <Pressable
          style={[styles.btn, (!r.importo || inCorso === r.id) && styles.btnOff]}
          disabled={inCorso === r.id}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            chiediFattura(r);
          }}
        >
          {inCorso === r.id ? (
            <ActivityIndicator color={colors.bianco} size="small" />
          ) : (
            <Text style={styles.btnTxt}>Chiedi la fattura</Text>
          )}
        </Pressable>
      ) : null}
      {r.stato === 'concordata' ? (
        <Pressable
          style={styles.btnGhost}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            cambiaStato(r, 'fatturata');
          }}
        >
          <Text style={styles.btnGhostTxt}>Incassata</Text>
        </Pressable>
      ) : null}
      {r.stato === 'nuova' ? (
        <Pressable
          style={styles.btnGhost}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            cambiaStato(r, 'persa');
          }}
        >
          <Text style={styles.btnGhostTxt}>Persa</Text>
        </Pressable>
      ) : null}
      <Pressable
        hitSlop={8}
        onPress={(e: any) => {
          e?.stopPropagation?.();
          elimina(r);
        }}
        accessibilityLabel="Elimina la richiesta"
        {...({ title: 'Elimina' } as any)}
      >
        <Ionicons name="trash-outline" size={16} color={colors.errore} />
      </Pressable>
    </View>
  );

  const colonne: ColonnaTabella<RichiestaCliente>[] = [
    {
      chiave: 'cliente',
      label: 'Cliente',
      flex: 1,
      valore: (r) => r.cliente,
      cella: (r) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {r.cliente}
        </Text>
      ),
    },
    { chiave: 'descrizione', label: 'Cosa chiede', flex: 1.6, righe: 2, valore: (r) => r.descrizione },
    {
      chiave: 'importo',
      label: 'Importo',
      width: 96,
      destra: true,
      numerica: true,
      valore: (r) => r.importo,
      cella: (r) => (
        <Text style={[styles.tabImporto, !r.importo && styles.tabMuto]}>
          {r.importo ? importoBreve(r.importo) : 'da concordare'}
        </Text>
      ),
    },
    { chiave: 'canale', label: 'Arrivata', width: 92, valore: (r) => LABEL_CANALE_RICHIESTA[r.canale] },
    {
      chiave: 'serve',
      label: 'Serve entro',
      width: 92,
      destra: true,
      numerica: true,
      valore: (r) => r.serve_entro,
      cella: (r) => <Text style={styles.tabData}>{dataBreve(r.serve_entro)}</Text>,
    },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 132,
      valore: (r) => r.stato,
      cella: (r) => (
        <View style={styles.badgeCol}>
          <StatusBadge small label={LABEL_STATO_RICHIESTA[r.stato]} colore={COLORE_STATO[r.stato]} />
          <Text style={styles.tabTipologia}>{LABEL_TIPOLOGIA[r.tipologia]}</Text>
        </View>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        <View style={styles.headerScroll}>
          <PageIntro testo="Le richieste una tantum dei clienti che abbiamo già: una fornitura, un catering, un evento. Si scrivono qui — non aprono una trattativa, perché si evadono alle condizioni note — e da qui si chiede il documento a FINANCE, che resta il posto dove il risultato si misura." />
        </View>

        {chiuse.length ? (
          <Pressable style={styles.filtro} onPress={() => setMostraChiuse((v) => !v)}>
            <Ionicons name={mostraChiuse ? 'eye-off-outline' : 'eye-outline'} size={15} color={colors.testo} />
            <Text style={styles.filtroTxt}>
              {mostraChiuse ? 'Nascondi le chiuse' : `Mostra anche le chiuse (${chiuse.length})`}
            </Text>
          </Pressable>
        ) : null}

        {errore ? (
          <Text style={styles.errore}>
            <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
          </Text>
        ) : null}

        {!loading && !dati.length ? (
          <EmptyState
            loading={false}
            icona="reader-outline"
            titolo={righe.length ? 'Nessuna richiesta aperta' : 'Nessuna richiesta'}
            aiuto="Quando un cliente chiede una fornitura una tantum, scrivila qui col bottone in basso: resta fuori dalla pipeline e diventa una pro-forma quando il prezzo è concordato."
            azione="Nuova richiesta"
            onAzione={() => setFormAperto(true)}
          />
        ) : aTabella ? (
          <Tabella
            righe={dati}
            colonne={colonne}
            chiaveRiga={(r) => r.id}
            ordineIniziale={{ campo: 'serve', verso: 'asc' }}
            azioni={azioniDi}
            larghezzaAzioni={252}
          />
        ) : (
          dati.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.nome} numberOfLines={2}>
                  {r.cliente}
                </Text>
                <StatusBadge small label={LABEL_STATO_RICHIESTA[r.stato]} colore={COLORE_STATO[r.stato]} />
              </View>
              <Text style={styles.descrizione} numberOfLines={3}>
                {r.descrizione}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {r.importo ? importoBreve(r.importo) : 'importo da concordare'} · {LABEL_CANALE_RICHIESTA[r.canale]}
                {r.serve_entro ? ` · entro il ${dataBreve(r.serve_entro)}` : ''}
              </Text>
              {azioniDi(r)}
            </View>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)} accessibilityLabel="Nuova richiesta">
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

// ── Il form: cliente, cosa chiede, quanto (se già si sa) ─────────────────────
function NuovaRichiestaModal({ onClose, onCreata }: { onClose: () => void; onCreata: () => void }) {
  const [ricerca, setRicerca] = useState('');
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [scelto, setScelto] = useState<PlaceLite | null>(null);
  // ⚠️ Il nome resta scrivibile anche senza aggancio: un cliente può non essere
  // ancora in Scout, e bloccare l'inserimento su questo vorrebbe dire perdere
  // la richiesta (o inventare una scheda per far contento il form).
  const [cliente, setCliente] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [canale, setCanale] = useState<CanaleRichiesta>('mail');
  const [tipologia, setTipologia] = useState<TipologiaRichiesta>('b2b');
  const [serveEntro, setServeEntro] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const q = ricerca.trim();
    if (q.length < 2) {
      setRisultati([]);
      return;
    }
    const t = setTimeout(() => {
      cercaPlaces(q, 8)
        .then((r) => vivo && setRisultati(r))
        .catch(() => vivo && setRisultati([]));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [ricerca]);

  const valido = cliente.trim().length > 0 && descrizione.trim().length > 0;

  async function salva() {
    if (!valido || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      await creaRichiestaCliente({
        place_id: scelto?.id ?? null,
        cliente: cliente.trim(),
        descrizione: descrizione.trim(),
        importo: leggiImporto(importo),
        canale,
        tipologia,
        serve_entro: serveEntro,
        nota: nota.trim() || null,
      });
      onCreata();
    } catch (e: any) {
      setErrore(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Foglio
      titolo="Nuova richiesta"
      sottotitolo="Una richiesta una tantum di un cliente che abbiamo già. Non apre una trattativa."
      onClose={onClose}
      bloccaSfondo
      largo
    >
      <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: 8 }}>
        <Text style={styles.campoLabel}>Cliente</Text>
        {scelto ? (
          <View style={styles.sceltoRiga}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sceltoNome} numberOfLines={2}>
                {scelto.nome}
              </Text>
              {scelto.indirizzo ? (
                <Text style={styles.sceltoInd} numberOfLines={1}>
                  {scelto.indirizzo}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                setScelto(null);
                setRicerca('');
              }}
              hitSlop={8}
              accessibilityLabel="Cambia cliente"
            >
              <Ionicons name="swap-horizontal" size={20} color={colors.oro} />
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={ricerca}
              onChangeText={(v) => {
                setRicerca(v);
                setCliente(v);
              }}
              placeholder="Cerca fra i clienti, o scrivi il nome…"
              placeholderTextColor={colors.grigio}
              autoFocus
            />
            {risultati.map((p) => (
              <Pressable
                key={p.id}
                style={styles.risultato}
                onPress={() => {
                  setScelto(p);
                  setCliente(p.nome);
                }}
              >
                <Ionicons name="storefront-outline" size={15} color={colors.navy} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.risultatoNome} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  {p.indirizzo ? (
                    <Text style={styles.risultatoInd} numberOfLines={1}>
                      {p.indirizzo}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
            {ricerca.trim().length >= 2 && !risultati.length ? (
              <Text style={styles.nota}>
                Nessun cliente con questo nome in Scout: la richiesta si salva lo stesso col nome scritto qui sopra.
              </Text>
            ) : null}
          </>
        )}

        <Text style={styles.campoLabel}>Cosa chiede</Text>
        <TextInput
          style={[styles.input, styles.inputAlto]}
          value={descrizione}
          onChangeText={setDescrizione}
          placeholder="Es. catering per 40 persone, sede di Milano"
          placeholderTextColor={colors.grigio}
          multiline
        />

        <Text style={styles.campoLabel}>Importo concordato (facoltativo)</Text>
        <TextInput
          style={styles.input}
          value={importo}
          onChangeText={setImporto}
          placeholder="es. 1.500 — si può lasciare vuoto e scriverlo dopo"
          placeholderTextColor={colors.grigio}
          keyboardType="numeric"
        />

        <Text style={styles.campoLabel}>Com’è arrivata</Text>
        <View style={styles.chips}>
          {CANALI.map((c) => (
            <Chip key={c} label={LABEL_CANALE_RICHIESTA[c]} on={canale === c} onPress={() => setCanale(c)} />
          ))}
        </View>

        <Text style={styles.campoLabel}>Tipologia (per il budget)</Text>
        <View style={styles.chips}>
          {TIPOLOGIE.map((t) => (
            <Chip key={t} label={LABEL_TIPOLOGIA[t]} on={tipologia === t} onPress={() => setTipologia(t)} />
          ))}
        </View>

        <Text style={styles.campoLabel}>Serve entro (facoltativo)</Text>
        <CampoData valore={serveEntro} onCambia={setServeEntro} />

        <Text style={styles.campoLabel}>Note (facoltativo)</Text>
        <TextInput
          style={[styles.input, styles.inputAlto]}
          value={nota}
          onChangeText={setNota}
          placeholder="Quello che serve ricordare: condizioni, referente, vincoli…"
          placeholderTextColor={colors.grigio}
          multiline
        />

        {errore ? <Text style={styles.errore}>{errore}</Text> : null}

        <Pressable style={[styles.btnSalva, (!valido || salvando) && styles.btnOff]} disabled={!valido || salvando} onPress={salva}>
          {salvando ? (
            <ActivityIndicator color={colors.bianco} size="small" />
          ) : (
            <Text style={styles.btnSalvaTxt}>Salva la richiesta</Text>
          )}
        </Pressable>
      </ScrollView>
    </Foglio>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  filtro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filtroTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  errore: {
    color: colors.errore,
    fontWeight: '600',
    fontSize: 13,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  // Schede (telefono)
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nome: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  descrizione: { color: colors.testo, fontSize: 13.5, lineHeight: 18 },
  meta: { color: colors.testoSoft, fontSize: 12.5 },
  // Tabella (desktop)
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabImporto: { color: colors.testo, fontWeight: '700', fontSize: 13.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabMuto: { color: colors.grigio, fontWeight: '600', fontSize: 12 },
  tabTipologia: { color: colors.grigio, fontSize: 11, fontWeight: '600' },
  badgeCol: { gap: 3, alignItems: 'flex-start' },
  // Azioni
  azioni: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minWidth: 118, alignItems: 'center' },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12 },
  btnOff: { opacity: 0.45 },
  btnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12 },
  pfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pfChipTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  // Form
  campoLabel: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  inputAlto: { minHeight: 76, textAlignVertical: 'top' },
  nota: { color: colors.grigio, fontSize: 12.5, lineHeight: 17 },
  risultato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.sfondo,
  },
  risultatoNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  risultatoInd: { color: colors.testoSoft, fontSize: 12 },
  sceltoRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.sfondo,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sceltoNome: { color: colors.navy, fontWeight: '700', fontSize: 15 },
  sceltoInd: { color: colors.testoSoft, fontSize: 12.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  btnSalva: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  btnSalvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
});
