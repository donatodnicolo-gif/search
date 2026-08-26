// PREVENTIVI FORNITORI — i prezzi che chiediamo per un lavoro specifico.
//
// Un cliente chiede qualcosa fuori standard; si chiede il prezzo a due o tre
// fornitori e si sceglie. Prima quei numeri stavano su WhatsApp: dopo una
// settimana nessuno sapeva più chi avesse offerto cosa.
//
// La schermata è fatta per la domanda vera — «quanto ci costa, e da chi?» —
// quindi ogni lavoro mostra i suoi preventivi affiancati, col più basso in
// evidenza e la differenza rispetto a lui.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { avvisa, conferma } from '@/lib/dialoghi';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { CampoData } from '@/components/CampoData';
import { urlMessaggioAiMail } from '@/lib/aimail';
import { cercaPlaces, fetchTutteTrattative, type PlaceLite, type TrattativaConLuogo } from '@/lib/db';
import { LINEE_ATTIVE } from '@/types';
import {
  aggiornaLavoro,
  aggiungiPreventivo,
  confronto,
  creaLavoro,
  eliminaLavoro,
  eliminaPreventivo,
  fetchLavori,
  LABEL_STATO_PREVENTIVO,
  scegliPreventivo,
  type LavoroConPreventivi,
  type Preventivo,
} from '@/lib/preventivi';

const euro = (n: number | null | undefined) =>
  n == null ? '—' : `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const COLORE_STATO: Record<string, string> = {
  richiesto: colors.grigio,
  ricevuto: colors.blue,
  scelto: colors.successo,
  scartato: colors.errore,
};

export default function Preventivi() {
  const [lavori, setLavori] = useState<LavoroConPreventivi[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);
  const [soloAperti, setSoloAperti] = useState(true);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setLavori(await fetchLavori());
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      // Il caso più probabile è la migrazione non applicata: dirlo a parole,
      // non lasciare l'errore tecnico di PostgREST.
      setErrore(
        /lavori|preventivi|PGRST205|does not exist|schema cache/i.test(msg)
          ? 'I preventivi hanno bisogno della migrazione 0055, non ancora applicata al database. Si applica con APPLICA-MIGRAZIONI.cmd.'
          : msg || 'Non è stato possibile caricare i preventivi.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const visibili = soloAperti ? lavori.filter((l) => l.stato === 'aperto') : lavori;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      <View style={styles.headerScroll}>
        <PageIntro testo="I lavori che un cliente ci ha chiesto e i prezzi che ci fanno i fornitori. Si chiedono a due o tre, si confrontano qui e si sceglie: il più basso è in evidenza, e di ognuno si vede quanto costa in più." />
      </View>

      {errore ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
        </Text>
      ) : null}

      <NuovoLavoro onFatto={carica} />

      <View style={styles.filtroRiga}>
        <Text style={styles.titoloSez}>
          {soloAperti ? 'Lavori aperti' : 'Tutti i lavori'}
          {visibili.length ? ` (${visibili.length})` : ''}
        </Text>
        <Pressable onPress={() => setSoloAperti((v) => !v)} hitSlop={8}>
          <Text style={styles.filtroTxt}>{soloAperti ? 'Mostra anche i chiusi' : 'Solo aperti'}</Text>
        </Pressable>
      </View>

      {!visibili.length && !errore ? (
        <EmptyState
          loading={loading}
          icona="calculator-outline"
          titolo={soloAperti ? 'Nessun lavoro aperto' : 'Nessun lavoro'}
          aiuto="Quando un cliente chiede qualcosa fuori standard, aprilo qui sopra e aggiungi i preventivi che ti fanno i fornitori."
        />
      ) : null}

      {visibili.map((l) => (
        <SchedaLavoro
          key={l.id}
          lavoro={l}
          aperto={aperto === l.id}
          onToggle={() => setAperto(aperto === l.id ? null : l.id)}
          onCambiato={carica}
        />
      ))}
    </ScrollView>
  );
}

/** Il form del nuovo lavoro: titolo obbligatorio, il resto aiuta e basta. */
function NuovoLavoro({ onFatto }: { onFatto: () => Promise<void> }) {
  const [apri, setApri] = useState(false);
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [linea, setLinea] = useState<string | null>(null);
  const [serveEntro, setServeEntro] = useState('');
  const [cliente, setCliente] = useState<PlaceLite | null>(null);
  const [salvo, setSalvo] = useState(false);
  /**
   * ⚠️ SI SCEGLIE LA TRATTATIVA, NON IL CLIENTE (corretto il 26/08/2026 dopo
   * la segnalazione dell'utente: «ma non posso scegliere la trattativa»).
   *
   * La prima versione chiedeva prima il cliente e poi le SUE trattative: due
   * passi, e un vicolo cieco quando il cliente non era ancora agganciato o non
   * aveva trattative aperte — il campo restava lì a dire «scegli prima il
   * cliente» e il bottone non partiva mai.
   *
   * Ora si cerca direttamente fra TUTTE le trattative aperte (per negozio,
   * oggetto o linea) e il cliente lo porta la trattativa: è lei che sa a chi
   * appartiene. Le chiuse non si propongono — su una vendita finita non c'è
   * più un prezzo da fare.
   */
  const [trattative, setTrattative] = useState<TrattativaConLuogo[]>([]);
  const [caricoDeal, setCaricoDeal] = useState(true);
  const [dealId, setDealId] = useState<string | null>(null);
  const [cercaDeal, setCercaDeal] = useState('');

  useEffect(() => {
    let vivo = true;
    fetchTutteTrattative()
      .then((d) => {
        if (!vivo) return;
        setTrattative(d.filter((x) => x.fase !== 'closedwon' && x.fase !== 'closedlost'));
      })
      .catch(() => vivo && setTrattative([]))
      .finally(() => vivo && setCaricoDeal(false));
    return () => {
      vivo = false;
    };
  }, []);

  const trattativeFiltrate = useMemo(() => {
    const q = cercaDeal.trim().toLowerCase();
    const base = q
      ? trattative.filter((d) =>
          [d.place_nome, d.titolo, d.oggetto, d.linea, ...(d.linee ?? [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : trattative;
    return base.slice(0, 30);
  }, [trattative, cercaDeal]);

  const trattativaScelta = trattative.find((d) => d.id === dealId) ?? null;

  async function salva() {
    if (!titolo.trim() || !dealId) return;
    setSalvo(true);
    try {
      await creaLavoro({
        titolo,
        dealId,
        descrizione,
        placeId: cliente?.id ?? null,
        linea,
        serveEntro: serveEntro.trim() || null,
      });
      setTitolo('');
      setDescrizione('');
      setLinea(null);
      setServeEntro('');
      setCliente(null);
      setDealId(null);
      setApri(false);
      await onFatto();
    } catch (e: any) {
      avvisa('Non è stato creato', e?.message ?? 'Riprova.');
    } finally {
      setSalvo(false);
    }
  }

  if (!apri) {
    return (
      <Pressable style={styles.btnPri} onPress={() => setApri(true)}>
        <Text style={styles.btnPriTxt}>+ Nuovo lavoro da preventivare</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitolo}>Nuovo lavoro</Text>

      <Text style={styles.label}>Cosa ci hanno chiesto *</Text>
      <TextInput
        style={styles.input}
        value={titolo}
        onChangeText={setTitolo}
        placeholder="es. Allestimento vetrine natalizie"
        placeholderTextColor={colors.grigio}
      />

      {/* ⚠️ LA TRATTATIVA È OBBLIGATORIA, e si sceglie PER PRIMA. Un preventivo
          fornitore è quanto ci COSTA un lavoro, e serve a fare il prezzo di una
          vendita: senza la trattativa a cui appartiene è un numero senza
          destinazione, e il margine non si può calcolare. Il cliente lo porta
          lei — chiederlo prima era un passo in più e un vicolo cieco. */}
      <Text style={styles.label}>Per quale trattativa *</Text>
      {trattativaScelta ? (
        <Pressable
          style={styles.dealScelta}
          onPress={() => {
            setDealId(null);
            setCliente(null);
          }}
        >
          <Ionicons name="briefcase-outline" size={16} color={colors.goldStrong} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.dealSceltaNome} numberOfLines={1}>
              {trattativaScelta.place_nome ?? 'Negozio'}
            </Text>
            <Text style={styles.aiuto} numberOfLines={1}>
              {trattativaScelta.titolo || trattativaScelta.oggetto || trattativaScelta.linea || 'Trattativa'}
            </Text>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={colors.oro} />
        </Pressable>
      ) : caricoDeal ? (
        <Text style={styles.aiuto}>Carico le trattative aperte…</Text>
      ) : trattative.length === 0 ? (
        <Text style={styles.aiuto}>
          Non ci sono trattative aperte. Aprine una in Trattative, poi torna qui: il preventivo serve a fare
          il prezzo di quella vendita.
        </Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={cercaDeal}
            onChangeText={setCercaDeal}
            placeholder="Cerca per negozio, oggetto o linea…"
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
          />
          <View style={{ gap: 6, marginTop: 6 }}>
            {trattativeFiltrate.map((d) => (
              <Pressable
                key={d.id}
                style={styles.dealRiga}
                onPress={() => {
                  setDealId(d.id);
                  // Il cliente viene dalla trattativa: è lei che sa di chi è.
                  if (d.place_id) setCliente({ id: d.place_id, nome: d.place_nome ?? '', indirizzo: null, zona: null });
                }}
              >
                <Ionicons name="briefcase-outline" size={15} color={colors.navy} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.dealRigaNome} numberOfLines={1}>{d.place_nome ?? 'Senza negozio'}</Text>
                  <Text style={styles.aiuto} numberOfLines={1}>
                    {d.titolo || d.oggetto || (d.linee?.length ? d.linee.join(', ') : d.linea) || 'Trattativa'}
                  </Text>
                </View>
              </Pressable>
            ))}
            {!trattativeFiltrate.length ? (
              <Text style={styles.aiuto}>Nessuna trattativa aperta per «{cercaDeal.trim()}».</Text>
            ) : null}
          </View>
        </>
      )}

      <Text style={styles.label}>Linea</Text>
      <View style={styles.chips}>
        {LINEE_ATTIVE.map((l) => (
          <Pressable key={l} onPress={() => setLinea(linea === l ? null : l)} style={[styles.chip, linea === l && styles.chipOn]}>
            <Text style={[styles.chipTxt, linea === l && styles.chipTxtOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {/* Il formato non si scrive più nell'etichetta: lo mostra il calendario,
          e in italiano lo scrive gg/mm/aaaa — dire «AAAA-MM-GG» sarebbe una
          istruzione per un campo che non si compila più a mano. */}
      <Text style={styles.label}>Serve entro</Text>
      <CampoData valore={serveEntro} onCambia={(iso) => setServeEntro(iso ?? '')} />

      <Text style={styles.label}>Dettagli</Text>
      <TextInput
        style={[styles.input, styles.area]}
        value={descrizione}
        onChangeText={setDescrizione}
        multiline
        placeholder="Quantità, misure, vincoli… tutto quello che serve al fornitore per farti un prezzo"
        placeholderTextColor={colors.grigio}
      />

      <View style={styles.azioni}>
        <Pressable style={styles.btnSec} onPress={() => setApri(false)} disabled={salvo}>
          <Text style={styles.btnSecTxt}>Annulla</Text>
        </Pressable>
        <Pressable style={[styles.btnPri, (!titolo.trim() || !dealId || salvo) && styles.off]} onPress={salva} disabled={!titolo.trim() || !dealId || salvo}>
          {salvo ? <ActivityIndicator color={colors.bianco} size="small" /> : <Text style={styles.btnPriTxt}>Crea il lavoro</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function SchedaLavoro({
  lavoro,
  aperto,
  onToggle,
  onCambiato,
}: {
  lavoro: LavoroConPreventivi;
  aperto: boolean;
  onToggle: () => void;
  onCambiato: () => Promise<void>;
}) {
  const { minimo, inAttesa } = confronto(lavoro.preventivi);
  const scelto = lavoro.preventivi.find((p) => p.stato === 'scelto') ?? null;

  return (
    <View style={styles.card}>
      {/* Tutto il riepilogo apre il dettaglio, non solo la riga del titolo:
          il cliente, la data e «Nessun preventivo: aprilo e chiedine uno»
          sono la parte che si legge — cliccarci sopra e non ottenere niente
          faceva sembrare la scheda ferma. Il dettaglio resta FUORI da questo
          Pressable: lì dentro ci sono i bottoni, e un clic di troppo
          richiuderebbe la scheda mentre ci si sta lavorando. */}
      <Pressable
        style={({ hovered }: any) => [styles.cardSommario, hovered && styles.cardSommarioHover]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${aperto ? 'Chiudi' : 'Apri'} il dettaglio di ${lavoro.titolo}`}
      >
        <View style={styles.cardTesta}>
          <Text style={styles.cardNome} numberOfLines={2}>{lavoro.titolo}</Text>
          {lavoro.stato !== 'aperto' ? (
            <StatusBadge small label={lavoro.stato === 'chiuso' ? 'Chiuso' : 'Annullato'} colore={colors.grigio} />
          ) : null}
          <Ionicons name={aperto ? 'chevron-up' : 'chevron-down'} size={16} color={colors.testoSoft} />
        </View>

        <Text style={styles.cardMeta} numberOfLines={2}>
          {[lavoro.place_nome, lavoro.linea, lavoro.serve_entro ? `entro il ${lavoro.serve_entro}` : null]
            .filter(Boolean)
            .join(' · ') || 'Nessun cliente collegato'}
        </Text>

        {/* ⚠️ Ogni preventivo appartiene a una trattativa: è quella che dice per
            quale vendita stiamo facendo il prezzo. I lavori nati prima di
            questa regola (26/08/2026) non ce l'hanno, e invece di far finta di
            niente lo si dichiara — un costo senza vendita non fa margine. */}
        {!lavoro.deal_id ? (
          <Text style={styles.avvisoTrattativa}>
            <Ionicons name="warning-outline" size={12} color={colors.errore} /> Nessuna trattativa collegata: si
            ricrea il lavoro dalla trattativa giusta, o non si sa per quale vendita è questo costo.
          </Text>
        ) : null}

        {/* Il riassunto che serve prima di aprire: quanto costa e quanti mancano. */}
        <Text style={styles.riassunto}>
          {lavoro.preventivi.length === 0
            ? 'Nessun preventivo: aprilo e chiedine uno'
            : scelto
              ? `Scelto ${scelto.fornitore} · ${euro(scelto.importo)}`
              : `${lavoro.preventivi.length} preventiv${lavoro.preventivi.length === 1 ? 'o' : 'i'}${
                  minimo != null ? ` · il più basso ${euro(minimo)}` : ''
                }${inAttesa ? ` · ${inAttesa} in attesa` : ''}`}
        </Text>
      </Pressable>

      {aperto ? (
        <View style={styles.dettaglio}>
          {lavoro.descrizione ? <Text style={styles.descrizione}>{lavoro.descrizione}</Text> : null}

          {lavoro.preventivi.map((p) => (
            <RigaPreventivo key={p.id} p={p} minimo={minimo} lavoroId={lavoro.id} onCambiato={onCambiato} />
          ))}

          <NuovoPreventivo lavoroId={lavoro.id} onFatto={onCambiato} />

          <View style={styles.azioni}>
            <Pressable
              style={styles.btnSec}
              onPress={async () => {
                await aggiornaLavoro(lavoro.id, { stato: lavoro.stato === 'aperto' ? 'chiuso' : 'aperto' });
                await onCambiato();
              }}
            >
              <Text style={styles.btnSecTxt}>{lavoro.stato === 'aperto' ? 'Chiudi il lavoro' : 'Riaprilo'}</Text>
            </Pressable>
            <Pressable
              style={styles.btnSec}
              onPress={() =>
                conferma(
                  'Elimino il lavoro?',
                  `«${lavoro.titolo}» e tutti i suoi preventivi spariscono. Non si torna indietro.`,
                  async () => {
                    await eliminaLavoro(lavoro.id);
                    await onCambiato();
                  },
                  { testoConferma: 'Elimina', distruttivo: true },
                )
              }
            >
              <Text style={[styles.btnSecTxt, styles.rosso]}>Elimina</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function RigaPreventivo({
  p,
  minimo,
  lavoroId,
  onCambiato,
}: {
  p: Preventivo;
  minimo: number | null;
  lavoroId: string;
  onCambiato: () => Promise<void>;
}) {
  // Quanto costa IN PIÙ del più basso: è il numero che fa decidere, e chiederlo
  // a mente su tre importi è il modo migliore per sbagliarlo.
  const differenza = p.importo != null && minimo != null && Number(p.importo) > minimo ? Number(p.importo) - minimo : null;
  const ilPiuBasso = p.importo != null && minimo != null && Number(p.importo) === minimo && p.stato !== 'scartato';

  return (
    <View style={[styles.prev, p.stato === 'scelto' && styles.prevScelto, p.stato === 'scartato' && styles.prevScartato]}>
      <View style={styles.prevTesta}>
        <Text style={styles.prevFornitore} numberOfLines={2}>{p.fornitore}</Text>
        <StatusBadge small label={LABEL_STATO_PREVENTIVO[p.stato]} colore={COLORE_STATO[p.stato] ?? colors.grigio} />
      </View>
      <View style={styles.prevRiga}>
        <Text style={styles.prevImporto}>{euro(p.importo)}</Text>
        {ilPiuBasso ? <Text style={styles.prevBasso}>il più basso</Text> : null}
        {differenza != null ? <Text style={styles.prevDiff}>+{euro(differenza)}</Text> : null}
      </View>
      {p.tempi || p.note ? (
        <Text style={styles.prevMeta} numberOfLines={2}>{[p.tempi, p.note].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {/* Da dove viene il numero. Un importo comparso nell'app senza dirlo è un
          importo di cui non ci si fida: alla prima discussione col fornitore si
          torna a cercare la mail a mano, cioè il lavoro che l'integrazione con
          AI Mail doveva togliere. */}
      {p.origine === 'mail' ? (
        <View style={styles.prevFonte}>
          <Ionicons name="mail-outline" size={12} color={colors.testoSoft} />
          <Text style={styles.prevMeta} numberOfLines={1}>
            {p.fornitore_email ? `da ${p.fornitore_email}` : 'arrivato per mail'}
          </Text>
          {p.mail_ref ? (
            <Pressable hitSlop={6} onPress={() => Linking.openURL(urlMessaggioAiMail(p.mail_ref!))}>
              <Text style={styles.prevAzione}>Vedi la mail</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={styles.prevAzioni}>
        {p.stato !== 'scelto' ? (
          <Pressable
            hitSlop={6}
            onPress={async () => {
              if (p.importo == null) {
                avvisa('Manca il prezzo', 'Scrivi prima quanto ti ha chiesto: scegliere un fornitore senza il suo prezzo non vuol dire niente.');
                return;
              }
              await scegliPreventivo(lavoroId, p.id);
              await onCambiato();
            }}
          >
            <Text style={styles.prevAzione}>Scegli questo</Text>
          </Pressable>
        ) : null}
        <Pressable
          hitSlop={6}
          onPress={() =>
            conferma(
              'Elimino il preventivo?',
              `Il preventivo di ${p.fornitore} sparisce.`,
              async () => {
                await eliminaPreventivo(p.id);
                await onCambiato();
              },
              { testoConferma: 'Elimina', distruttivo: true },
            )
          }
        >
          <Text style={[styles.prevAzione, styles.rosso]}>Elimina</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NuovoPreventivo({ lavoroId, onFatto }: { lavoroId: string; onFatto: () => Promise<void> }) {
  const [fornitore, setFornitore] = useState<PlaceLite | null>(null);
  const [nomeLibero, setNomeLibero] = useState('');
  const [importo, setImporto] = useState('');
  const [tempi, setTempi] = useState('');
  const [salvo, setSalvo] = useState(false);

  const nome = fornitore?.nome ?? nomeLibero.trim();

  async function salva() {
    if (!nome) return;
    setSalvo(true);
    try {
      // La virgola è come si scrivono i decimali qui: accettarla evita che
      // «1.250,50» diventi un numero sbagliato o nessun numero.
      const n = Number(importo.replace(/\./g, '').replace(',', '.'));
      await aggiungiPreventivo({
        lavoroId,
        fornitore: nome,
        fornitorePlaceId: fornitore?.id ?? null,
        importo: importo.trim() && !Number.isNaN(n) ? n : null,
        tempi,
      });
      setFornitore(null);
      setNomeLibero('');
      setImporto('');
      setTempi('');
      await onFatto();
    } catch (e: any) {
      avvisa('Non è stato salvato', e?.message ?? 'Riprova.');
    } finally {
      setSalvo(false);
    }
  }

  return (
    <View style={styles.aggiungi}>
      <Text style={styles.aggiungiTitolo}>Aggiungi un preventivo</Text>
      <CercaNegozio scelto={fornitore} onScegli={setFornitore} placeholder="Cerca il fornitore in Scout…" />
      {!fornitore ? (
        <TextInput
          style={styles.input}
          value={nomeLibero}
          onChangeText={setNomeLibero}
          placeholder="…oppure scrivi il nome, se non è in Scout"
          placeholderTextColor={colors.grigio}
        />
      ) : null}
      <View style={styles.riga2}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={importo}
          onChangeText={setImporto}
          placeholder="Prezzo €"
          placeholderTextColor={colors.grigio}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[styles.input, { flex: 1.4 }]}
          value={tempi}
          onChangeText={setTempi}
          placeholder="Tempi — es. 5 giorni"
          placeholderTextColor={colors.grigio}
        />
      </View>
      {/* Il prezzo può mancare: è il caso «gliel'ho chiesto, non ha risposto»,
          e va potuto registrare — se no quel fornitore sparisce dal confronto. */}
      <Text style={styles.aggiungiNota}>
        Il prezzo si può lasciare vuoto: il preventivo resta «in attesa» finché non arriva.
      </Text>
      <Pressable style={[styles.btnPri, (!nome || salvo) && styles.off]} onPress={salva} disabled={!nome || salvo}>
        {salvo ? <ActivityIndicator color={colors.bianco} size="small" /> : <Text style={styles.btnPriTxt}>Aggiungi</Text>}
      </Pressable>
    </View>
  );
}

/** Typeahead sui negozi di Scout (clienti e fornitori stanno nella stessa tabella). */
function CercaNegozio({
  scelto,
  onScegli,
  placeholder,
}: {
  scelto: PlaceLite | null;
  onScegli: (p: PlaceLite | null) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState('');
  const [esiti, setEsiti] = useState<PlaceLite[]>([]);

  async function cerca(t: string) {
    setQ(t);
    if (t.trim().length < 2) {
      setEsiti([]);
      return;
    }
    setEsiti(await cercaPlaces(t, 6).catch(() => []));
  }

  if (scelto) {
    return (
      <View style={styles.sceltoRiga}>
        <Text style={styles.sceltoNome} numberOfLines={1}>{scelto.nome}</Text>
        <Pressable hitSlop={8} onPress={() => { onScegli(null); setQ(''); setEsiti([]); }}>
          <Ionicons name="close-circle" size={18} color={colors.grigio} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <TextInput style={styles.input} value={q} onChangeText={cerca} placeholder={placeholder} placeholderTextColor={colors.grigio} />
      {esiti.map((p) => (
        <Pressable key={p.id} style={styles.esito} onPress={() => { onScegli(p); setQ(''); setEsiti([]); }}>
          <Text style={styles.esitoNome} numberOfLines={1}>{p.nome}</Text>
          {p.indirizzo ? <Text style={styles.esitoMeta} numberOfLines={1}>{p.indirizzo}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md },
  errore: { color: colors.errore, fontWeight: '600', fontSize: 13, backgroundColor: colors.bianco, borderRadius: radius.md, padding: spacing.md },
  titoloSez: { color: colors.testoSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  filtroRiga: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm },
  filtroTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12.5 },
  form: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 6 },
  formTitolo: { color: colors.navy, fontWeight: '800', fontSize: 16 },
  label: { color: colors.navy, fontWeight: '700', fontSize: 13, marginTop: spacing.sm },
  // Spiega perché un campo è vuoto o cosa manca: si legge come una frase, non
  // come un errore.
  aiuto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  dealScelta: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 10, marginTop: 4 },
  dealSceltaNome: { color: colors.testo, fontWeight: '800', fontSize: 14 },
  dealRiga: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, padding: 10 },
  dealRigaNome: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  avvisoTrattativa: { color: colors.errore, fontSize: 12, lineHeight: 17, marginTop: 4 },
  input: {
    backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.testo,
  },
  area: { minHeight: 74, textAlignVertical: 'top' },
  riga2: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testo, fontSize: 12.5, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
  // ⚠️ Il padding è passato dalla card al riepilogo: così l'area premibile
  // arriva ai bordi e il colore dell'hover copre tutta la scheda invece di
  // lasciare una cornice bianca intorno. `overflow: hidden` perché quel colore
  // deve fermarsi agli angoli arrotondati.
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, overflow: 'hidden' },
  cardSommario: { padding: spacing.md, gap: 5 },
  cardSommarioHover: { backgroundColor: colors.fill },
  cardTesta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardNome: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  cardMeta: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 17 },
  riassunto: { color: colors.testo, fontSize: 13, fontWeight: '600' },
  // Il padding se lo porta da sé, ora che la card non ne ha più; il filo in
  // alto arriva da bordo a bordo e divide il riepilogo dal dettaglio.
  dettaglio: { gap: 8, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  descrizione: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  prev: { backgroundColor: colors.sfondo, borderRadius: radius.md, padding: spacing.sm, gap: 4, borderWidth: 1, borderColor: 'transparent' },
  prevScelto: { borderColor: colors.successo, backgroundColor: '#F3FAF5' },
  prevScartato: { opacity: 0.55 },
  prevTesta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prevFornitore: { flex: 1, color: colors.testo, fontWeight: '800', fontSize: 14 },
  prevRiga: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  prevImporto: { color: colors.navy, fontWeight: '800', fontSize: 16 },
  prevBasso: { color: colors.successo, fontWeight: '700', fontSize: 11.5 },
  prevDiff: { color: '#B7791F', fontWeight: '700', fontSize: 11.5 },
  prevMeta: { color: colors.testoSoft, fontSize: 12 },
  prevFonte: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  prevAzioni: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  prevAzione: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  aggiungi: { gap: 8, backgroundColor: colors.sfondo, borderRadius: radius.md, padding: spacing.sm },
  aggiungiTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  aggiungiNota: { color: colors.grigio, fontSize: 11.5, lineHeight: 16 },
  sceltoRiga: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.fill, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sceltoNome: { flex: 1, color: colors.testo, fontWeight: '700', fontSize: 14 },
  esito: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9 },
  esitoNome: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  esitoMeta: { color: colors.testoSoft, fontSize: 12 },
  azioni: { flexDirection: 'row', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  btnPri: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', minWidth: 120 },
  btnPriTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
  btnSec: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  btnSecTxt: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  rosso: { color: colors.errore },
  off: { opacity: 0.45 },
});
