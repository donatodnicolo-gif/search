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
import { leggiImporto, scriviImporto } from '@/lib/importi';
import { avvisa, conferma } from '@/lib/dialoghi';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { CampoData } from '@/components/CampoData';
import { SceltaFornitore, type FornitoreScelto } from '@/components/SceltaFornitore';
import { urlMessaggioAiMail } from '@/lib/aimail';
import {
  cercaPlaces,
  fetchOrdini,
  fetchRichiesteCliente,
  fetchTutteTrattative,
  type OrdineConLuogo,
  type PlaceLite,
  type TrattativaConLuogo,
} from '@/lib/db';
import type { RichiestaCliente } from '@/types';
import { cercaNelRegistro, fetchFornitori, type PartnerRegistro } from '@/lib/anagrafiche';
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

/**
 * LE TRE VENDITE a cui un preventivo fornitore può appartenere (26/08/2026,
 * richiesta dell'utente: «metti sia trattativa che richieste clienti che
 * ordini»).
 *
 * Il preventivo è un COSTO, e un costo appartiene sempre a qualcosa che
 * vendiamo — ma quel qualcosa non è per forza una trattativa:
 *   · TRATTATIVA — la vendita da conquistare, il costo serve a fare il prezzo;
 *   · RICHIESTA CLIENTE — un cliente che c'è già chiede una fornitura: è il
 *     caso più frequente, e prima non aveva dove stare (regola del binario:
 *     non apre una trattativa, quindi non poteva avere preventivi);
 *   · ORDINE — la vendita è chiusa e adesso il lavoro va comprato.
 *
 * Le tre strade portano allo stesso margine, perché l'ordine nato da una
 * trattativa o da una richiesta si riprende il costo di quella (`costiPerOrdine`).
 */
type TipoVendita = 'trattativa' | 'richiesta' | 'ordine';
interface VenditaSceglibile {
  tipo: TipoVendita;
  id: string;
  /** Chi compra: si mostra in grande, è la prima cosa che si cerca. */
  cliente: string;
  /** Di che lavoro si tratta, sotto al nome. */
  dettaglio: string;
  placeId: string | null;
  /** ⚠️ La linea NON si chiede più: viene da qui (27/08/2026, «le linee sono
   *  già informazioni relative alla trattativa»). Chiederla di nuovo apriva la
   *  porta a un lavoro con una linea diversa da quella della vendita a cui
   *  appartiene — due verità sullo stesso affare. */
  linea: string | null;
}
const ETICHETTA_VENDITA: Record<TipoVendita, { label: string; icona: any; colore: string }> = {
  trattativa: { label: 'Trattativa', icona: 'briefcase-outline', colore: colors.navy },
  richiesta: { label: 'Richiesta', icona: 'chatbubble-ellipses-outline', colore: colors.goldStrong },
  ordine: { label: 'Ordine', icona: 'receipt-outline', colore: '#2F7D46' },
};

/** Il form del nuovo lavoro: titolo obbligatorio, il resto aiuta e basta. */
function NuovoLavoro({ onFatto }: { onFatto: () => Promise<void> }) {
  const [apri, setApri] = useState(false);
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  /**
   * ⭐ CHI FA IL LAVORO (27/08/2026, richiesta dell'utente: «fai cercare
   * tramite anagrafiche anche il fornitore che lo fa»).
   *
   * Sceglierlo qui vuol dire che il lavoro nasce già con il suo primo
   * preventivo — in attesa del prezzo. Prima bisognava creare il lavoro, poi
   * aprirlo, poi aggiungere il fornitore: tre passi per la cosa che si sa per
   * prima, cioè a chi l'hai chiesto.
   */
  const [fornitore, setFornitore] = useState<FornitoreScelto | null>(null);
  /**
   * ⭐ L'IMPORTO, QUI (27/08/2026, segnalazione dell'utente: «manca l'importo
   * del preventivo»).
   *
   * ⚠️ Resta FACOLTATIVO, e il vuoto non è zero: se il fornitore ha già dato il
   * prezzo si scrive subito, se lo si sta ancora aspettando si lascia vuoto e
   * il preventivo nasce «in attesa». Sono due stati diversi, e il secondo è la
   * ragione per cui questa schermata esiste — si chiede a due o tre e si
   * aspetta.
   */
  const [importo, setImporto] = useState('');
  /**
   * ⭐ IL PREZZO A UNITÀ (27/08/2026, richiesta dell'utente: «metti opzioni se
   * il prezzo è a quantità o al giorno o all'ora … e al flag fai inserire un
   * numero»).
   *
   * ⚠️ FACOLTATIVO, come chiesto: senza unità il numero scritto sopra è il
   * totale e basta. Con l'unità, quel numero diventa il prezzo di UNA — e il
   * totale lo fa l'app, mostrandolo prima di salvare.
   */
  const [unita, setUnita] = useState<'pezzi' | 'giorni' | 'ore' | null>(null);
  const [quanti, setQuanti] = useState('');

  /**
   * Il conto, calcolato UNA VOLTA e usato sia per mostrarlo sia per salvarlo.
   *
   * ⚠️ Scritto due volte — una per la riga «45 × 30 = 1.350» e una per
   * l'insert — diventerebbe due conti che al primo ritocco divergono, e chi
   * guarda lo schermo vedrebbe un totale diverso da quello salvato.
   */
  const contoUnitario = (() => {
    const u = importo.trim() ? leggiImporto(importo) : null;
    const q = quanti.trim() ? Number(quanti.replace(',', '.')) : null;
    if (!unita || u == null || q == null || !Number.isFinite(q) || q <= 0) return null;
    return { unitario: u, quanti: q, totale: Math.round(u * q * 100) / 100 };
  })();
  const [serveEntro, setServeEntro] = useState('');
  const [cliente, setCliente] = useState<PlaceLite | null>(null);
  const [salvo, setSalvo] = useState(false);
  /**
   * ⚠️ SI SCEGLIE LA VENDITA, NON IL CLIENTE (corretto il 26/08/2026 dopo
   * la segnalazione dell'utente: «ma non posso scegliere la trattativa»).
   *
   * La prima versione chiedeva prima il cliente e poi le SUE trattative: due
   * passi, e un vicolo cieco quando il cliente non era ancora agganciato o non
   * aveva trattative aperte — il campo restava lì a dire «scegli prima il
   * cliente» e il bottone non partiva mai.
   *
   * Ora si cerca direttamente fra tutte le vendite aperte — trattative,
   * richieste clienti e ordini (richiesta dell'utente: «metti sia trattativa
   * che richieste clienti che ordini») — e il cliente lo porta la vendita: è
   * lei che sa a chi appartiene. Le finite non si propongono: su una vendita
   * chiusa non c'è più un prezzo da fare.
   */
  const [vendite, setVendite] = useState<VenditaSceglibile[]>([]);
  const [caricoDeal, setCaricoDeal] = useState(true);
  const [venditaId, setVenditaId] = useState<string | null>(null);
  const [cercaDeal, setCercaDeal] = useState('');
  /** Su quale delle tre fonti si sta cercando (null = tutte). */
  const [soloTipo, setSoloTipo] = useState<TipoVendita | null>(null);

  useEffect(() => {
    let vivo = true;
    // ⚠️ Ogni fonte ha il suo `catch`: se una tabella non risponde si sceglie
    // fra le altre due, invece di restare senza nessuna vendita da collegare.
    Promise.all([
      fetchTutteTrattative().catch(() => [] as TrattativaConLuogo[]),
      fetchRichiesteCliente().catch(() => [] as RichiestaCliente[]),
      fetchOrdini().catch(() => [] as OrdineConLuogo[]),
    ])
      .then(([deals, richieste, ordini]) => {
        if (!vivo) return;
        const out: VenditaSceglibile[] = [];
        // Le trattative CHIUSE non si propongono: su una vendita finita non
        // c'è più un prezzo da fare (se è vinta, c'è il suo ordine qui sotto).
        for (const d of deals) {
          if (d.fase === 'closedwon' || d.fase === 'closedlost') continue;
          out.push({
            tipo: 'trattativa',
            id: d.id,
            cliente: d.place_nome ?? 'Senza negozio',
            dettaglio: d.titolo || d.oggetto || (d.linee?.length ? d.linee.join(', ') : d.linea) || 'Trattativa',
            placeId: d.place_id ?? null,
            linea: (d.linee?.length ? d.linee[0] : d.linea) ?? null,
          });
        }
        for (const r of richieste) {
          // Fuori le finite (persa, annullata, fatturata) e quelle già
          // diventate ordine: quelle si scelgono dal loro ORDINE, qui sotto,
          // o lo stesso lavoro comparirebbe due volte con due nomi diversi.
          if (r.stato === 'persa' || r.stato === 'annullata' || r.stato === 'fatturata' || r.stato === 'in_ordine')
            continue;
          out.push({
            tipo: 'richiesta',
            id: r.id,
            cliente: r.cliente,
            dettaglio: r.descrizione || 'Richiesta cliente',
            placeId: r.place_id ?? null,
            linea: r.linea ?? null,
          });
        }
        for (const o of ordini) {
          if (o.stato === 'annullato') continue;
          out.push({
            tipo: 'ordine',
            id: o.id,
            cliente: o.place_nome ?? o.cliente,
            dettaglio: o.descrizione || o.linea || 'Ordine',
            placeId: o.place_id ?? null,
            linea: o.linea ?? null,
          });
        }
        setVendite(out);
      })
      .finally(() => vivo && setCaricoDeal(false));
    return () => {
      vivo = false;
    };
  }, []);

  const venditeFiltrate = useMemo(() => {
    const q = cercaDeal.trim().toLowerCase();
    const base = vendite.filter(
      (v) =>
        (!soloTipo || v.tipo === soloTipo) &&
        (!q || `${v.cliente} ${v.dettaglio}`.toLowerCase().includes(q)),
    );
    return base.slice(0, 30);
  }, [vendite, cercaDeal, soloTipo]);

  const venditaScelta = vendite.find((v) => v.id === venditaId) ?? null;

  async function salva() {
    if (!titolo.trim() || !venditaScelta) return;
    // ⚠️ Il prezzo scritto male FERMA tutto, e si controlla PRIMA di creare il
    // lavoro: mandarlo a null lo butterebbe in silenzio, e qui null ha già un
    // significato preciso — «gliel'ho chiesto e non ha ancora risposto».
    // Nascerebbe un lavoro con un preventivo che dice il contrario del vero.
    const prezzo = importo.trim() ? leggiImporto(importo) : null;
    if (importo.trim() && prezzo == null) {
      avvisa(
        'Prezzo non capito',
        `«${importo}» non è un importo. Scrivilo come 1.250,50 — oppure lascia il campo vuoto se il fornitore non ha ancora risposto.`,
      );
      return;
    }
    setSalvo(true);
    try {
      const nato = await creaLavoro({
        titolo,
        // Il lavoro si aggancia alla vendita giusta, qualunque delle tre sia.
        dealId: venditaScelta.tipo === 'trattativa' ? venditaScelta.id : undefined,
        richiestaId: venditaScelta.tipo === 'richiesta' ? venditaScelta.id : undefined,
        ordineId: venditaScelta.tipo === 'ordine' ? venditaScelta.id : undefined,
        descrizione,
        placeId: cliente?.id ?? null,
        // ⚠️ EREDITATA dalla vendita, non chiesta: è la stessa informazione, e
        // due campi per lo stesso dato divergono al primo che li compila.
        linea: venditaScelta.linea ?? null,
        serveEntro: serveEntro.trim() || null,
      });
      // Il fornitore, se è stato scelto: un preventivo senza importo, cioè
      // «gliel'ho chiesto e aspetto». Il prezzo si scrive quando risponde.
      if (fornitore) {
        await aggiungiPreventivo({
          lavoroId: nato.id,
          fornitore: fornitore.nome,
          fornitoreAnagraficheId: fornitore.anagraficheId,
          fornitoreEmail: fornitore.email,
          // ⚠️ `importo` è SEMPRE il totale: quando il prezzo è a unità, il
          // totale è il prodotto — il margine, il confronto e i totali leggono
          // quel campo, e mettendoci il prezzo unitario un preventivo da
          // «45 € × 30» varrebbe 45 in ogni conto dell'app. Gli ingredienti
          // restano accanto, per poterlo rifare e spiegare.
          importo: contoUnitario ? contoUnitario.totale : prezzo,
          prezzoUnitario: contoUnitario ? contoUnitario.unitario : null,
          quantita: contoUnitario ? contoUnitario.quanti : null,
          unita: contoUnitario ? unita : null,
        });
      }
      setTitolo('');
      setDescrizione('');
      setFornitore(null);
      setImporto('');
      setUnita(null);
      setQuanti('');
      setServeEntro('');
      setCliente(null);
      setVenditaId(null);
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

      {/* ⚠️ LA DOMANDA È COSA OFFRE IL FORNITORE, non cosa ha chiesto il
          cliente (27/08/2026, correzione dell'utente). Non è una sfumatura:
          quello che il cliente chiede sta già sulla vendita qui sotto, e
          riscriverlo qui creava due descrizioni della stessa cosa. Qui si
          descrive la FORNITURA — è lei che va confrontata fra più fornitori. */}
      <Text style={styles.label}>Cosa ci offre il fornitore *</Text>
      <TextInput
        style={styles.input}
        value={titolo}
        onChangeText={setTitolo}
        placeholder="es. allestimento floreale vetrine — 4 vetrine, montaggio incluso"
        placeholderTextColor={colors.grigio}
      />

      {/* ⚠️ LA VENDITA È OBBLIGATORIA, e si sceglie PER PRIMA. Un preventivo
          fornitore è quanto ci COSTA un lavoro, e serve a fare il prezzo di una
          vendita: senza la vendita a cui appartiene è un numero senza
          destinazione, e il margine non si può calcolare. Il cliente lo porta
          lei — chiederlo prima era un passo in più e un vicolo cieco. */}
      <Text style={styles.label}>Per quale vendita *</Text>
      {venditaScelta ? (
        <Pressable
          style={styles.dealScelta}
          onPress={() => {
            setVenditaId(null);
            setCliente(null);
          }}
        >
          <Ionicons name={ETICHETTA_VENDITA[venditaScelta.tipo].icona} size={16} color={colors.goldStrong} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.dealSceltaNome} numberOfLines={1}>
              {venditaScelta.cliente}
            </Text>
            <Text style={styles.aiuto} numberOfLines={1}>
              {ETICHETTA_VENDITA[venditaScelta.tipo].label} · {venditaScelta.dettaglio}
            </Text>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={colors.oro} />
        </Pressable>
      ) : caricoDeal ? (
        <Text style={styles.aiuto}>Carico trattative, richieste clienti e ordini…</Text>
      ) : vendite.length === 0 ? (
        <Text style={styles.aiuto}>
          Non c'è nessuna vendita aperta. Apri una trattativa, registra una richiesta cliente o chiudi un
          ordine, poi torna qui: il preventivo serve a fare il prezzo di quella vendita.
        </Text>
      ) : (
        <>
          {/* I tre filtri: l'elenco è uno, ma chi cerca sa già di che
              tipo è la sua vendita e non deve scorrere le altre due. */}
          <View style={styles.chips}>
            <Pressable style={[styles.chip, !soloTipo && styles.chipOn]} onPress={() => setSoloTipo(null)}>
              <Text style={[styles.chipTxt, !soloTipo && styles.chipTxtOn]}>Tutte</Text>
            </Pressable>
            {(Object.keys(ETICHETTA_VENDITA) as TipoVendita[]).map((t) => {
              const quante = vendite.filter((v) => v.tipo === t).length;
              return (
                <Pressable
                  key={t}
                  style={[styles.chip, soloTipo === t && styles.chipOn]}
                  onPress={() => setSoloTipo(soloTipo === t ? null : t)}
                >
                  <Text style={[styles.chipTxt, soloTipo === t && styles.chipTxtOn]}>
                    {ETICHETTA_VENDITA[t].label} · {quante}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={cercaDeal}
            onChangeText={setCercaDeal}
            placeholder="Cerca per cliente, oggetto o linea…"
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
          />
          <View style={{ gap: 6, marginTop: 6 }}>
            {venditeFiltrate.map((v) => (
              <Pressable
                key={`${v.tipo}:${v.id}`}
                style={styles.dealRiga}
                onPress={() => {
                  setVenditaId(v.id);
                  // Il cliente viene dalla vendita: è lei che sa di chi è.
                  if (v.placeId) setCliente({ id: v.placeId, nome: v.cliente, indirizzo: null, zona: null });
                }}
              >
                <Ionicons name={ETICHETTA_VENDITA[v.tipo].icona} size={15} color={ETICHETTA_VENDITA[v.tipo].colore} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.dealRigaNome} numberOfLines={1}>{v.cliente}</Text>
                  <Text style={styles.aiuto} numberOfLines={1}>
                    {ETICHETTA_VENDITA[v.tipo].label} · {v.dettaglio}
                  </Text>
                </View>
              </Pressable>
            ))}
            {!venditeFiltrate.length ? (
              <Text style={styles.aiuto}>
                Nessuna vendita {soloTipo ? `di tipo «${ETICHETTA_VENDITA[soloTipo].label}» ` : ''}
                {cercaDeal.trim() ? `per «${cercaDeal.trim()}»` : 'da collegare'}.
              </Text>
            ) : null}
          </View>
        </>
      )}

      <Text style={styles.label}>Chi lo fa (facoltativo)</Text>
      <SceltaFornitore valore={fornitore} onScegli={setFornitore} />

      {/* ⚠️ L'importo compare solo QUANDO il fornitore c'è: un prezzo senza il
          nome di chi l'ha fatto non si può né confrontare né richiamare, ed è
          la stessa regola che vale nel resto della schermata. */}
      {fornitore ? (
        <>
          <Text style={styles.label}>Quanto ci ha chiesto (facoltativo)</Text>
          <TextInput
            style={styles.input}
            value={importo}
            onChangeText={setImporto}
            placeholder="es. 1.250,50 — vuoto se non ha ancora risposto"
            placeholderTextColor={colors.grigio}
            inputMode="decimal"
          />
          <Text style={styles.aiuto}>
            Lasciandolo vuoto il preventivo nasce «in attesa»: vuoto e zero non sono la stessa cosa, e un
            preventivo senza prezzo resta fuori dal confronto invece di vincerlo.
          </Text>

          {/* ⭐ QUEL PREZZO È UN TOTALE O È A UNITÀ? (27/08/2026, richiesta
              dell'utente). Facoltativo: senza scelta il numero qui sopra è il
              totale e basta — ed è il caso più frequente, quindi nessun chip
              parte acceso. Scegliendone uno, quel numero diventa il prezzo di
              UNA, e il totale lo fa l'app. */}
          <Text style={styles.label}>Il prezzo è… (facoltativo)</Text>
          <View style={styles.chips}>
            {([
              { v: 'pezzi', l: 'a pezzo' },
              { v: 'giorni', l: 'al giorno' },
              { v: 'ore', l: "all'ora" },
            ] as const).map((o) => (
              <Pressable
                key={o.v}
                onPress={() => setUnita(unita === o.v ? null : o.v)}
                style={[styles.chip, unita === o.v && styles.chipOn]}
              >
                <Text style={[styles.chipTxt, unita === o.v && styles.chipTxtOn]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>

          {unita ? (
            <>
              <Text style={styles.label}>
                {unita === 'pezzi' ? 'Quanti pezzi' : unita === 'giorni' ? 'Quanti giorni' : 'Quante ore'}
              </Text>
              <TextInput
                style={styles.input}
                value={quanti}
                onChangeText={setQuanti}
                placeholder={unita === 'pezzi' ? 'es. 30' : unita === 'giorni' ? 'es. 3' : 'es. 8'}
                placeholderTextColor={colors.grigio}
                inputMode="decimal"
              />
              {/* ⚠️ Il totale si VEDE prima di salvare: è il numero che poi
                  entra nel margine, e un conto fatto dall'app e mai mostrato è
                  un conto che nessuno controlla. */}
              {contoUnitario ? (
                <Text style={styles.aiuto}>
                  {scriviImporto(contoUnitario.unitario)} × {contoUnitario.quanti} ={' '}
                  <Text style={{ fontWeight: '800' }}>€ {scriviImporto(contoUnitario.totale)}</Text> — è questo
                  che finisce nel confronto e nel margine.
                </Text>
              ) : (
                <Text style={styles.aiuto}>
                  Scrivi il prezzo di una unità qui sopra e quante ne sono qui: il totale lo calcola l&apos;app.
                </Text>
              )}
            </>
          ) : null}
        </>
      ) : (
        <Text style={styles.aiuto}>
          Cercalo in Anagrafiche. Puoi anche lasciarlo vuoto e aggiungere più fornitori dopo, per confrontarli.
        </Text>
      )}

      {/* La LINEA non si chiede: è quella della vendita scelta qui sopra. Si
          mostra soltanto, perché sapere su che linea si sta lavorando serve —
          sceglierla una seconda volta no. */}
      {venditaScelta?.linea ? (
        <Text style={styles.aiuto}>Linea: {venditaScelta.linea} (dalla vendita)</Text>
      ) : null}

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
        <Pressable style={[styles.btnPri, (!titolo.trim() || !venditaId || salvo) && styles.off]} onPress={salva} disabled={!titolo.trim() || !venditaId || salvo}>
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

        {/* ⚠️ Ogni preventivo appartiene a una vendita — trattativa, richiesta
            cliente o ordine: è quella che dice per cosa stiamo facendo il
            prezzo. I lavori nati prima di questa regola (26/08/2026) non ce
            l'hanno, e invece di far finta di niente lo si dichiara — un costo
            senza vendita non fa margine. */}
        {!lavoro.deal_id && !lavoro.richiesta_id && !lavoro.ordine_id ? (
          <Text style={styles.avvisoTrattativa}>
            <Ionicons name="warning-outline" size={12} color={colors.errore} /> Nessuna vendita collegata: si
            ricrea il lavoro dalla trattativa, dalla richiesta cliente o dall'ordine giusto, o non si sa per
            quale vendita è questo costo.
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
  /**
   * ⭐ IL FORNITORE DAL REGISTRO (26/08/2026, richiesta dell'utente: «metti
   * anche richiesta di chi è il fornitore con possibilità di ricerca in
   * anagrafiche tra i fornitori»).
   *
   * Prima si cercava solo fra i negozi di Scout, o si scriveva un nome libero.
   * Ma il nome non è un'identità: «Rossi Fiori» scritto in due modi sono due
   * fornitori diversi per chiunque provi a contare quanto spendiamo da lui.
   * Qui si sceglie dal registro Anagrafiche — che è la casa delle aziende — e
   * si tiene il suo id.
   *
   * ⚠️ Si parte dai FORNITORI (chi ha già lavorato per noi: `statoFornitore`
   * nel registro, lo scrive il Customer Service quando li paga). Se lì non
   * c'è, si cerca in tutto il registro e lo si dichiara — un fornitore nuovo
   * esiste prima di essere marcato tale.
   */
  const [fornitoriRegistro, setFornitoriRegistro] = useState<PartnerRegistro[]>([]);
  const [caricoFornitori, setCaricoFornitori] = useState(true);
  const [cercaForn, setCercaForn] = useState('');
  const [altriDalRegistro, setAltriDalRegistro] = useState<PartnerRegistro[]>([]);
  const [daRegistro, setDaRegistro] = useState<PartnerRegistro | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchFornitori()
      .then((r) => vivo && setFornitoriRegistro(r.partner))
      .catch(() => vivo && setFornitoriRegistro([]))
      .finally(() => vivo && setCaricoFornitori(false));
    return () => {
      vivo = false;
    };
  }, []);

  const fornitoriTrovati = useMemo(() => {
    const q = cercaForn.trim().toLowerCase();
    if (!q) return fornitoriRegistro.slice(0, 8);
    return fornitoriRegistro
      .filter((p) => [p.nome, p.citta, p.categoria].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [fornitoriRegistro, cercaForn]);

  // Se fra i fornitori non c'è, si guarda in TUTTO il registro (con un fiato
  // di attesa, per non chiamare a ogni lettera).
  useEffect(() => {
    const q = cercaForn.trim();
    if (q.length < 2 || fornitoriTrovati.length) {
      setAltriDalRegistro([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      cercaNelRegistro(q, 8)
        .then((r) => vivo && setAltriDalRegistro(r))
        .catch(() => vivo && setAltriDalRegistro([]));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [cercaForn, fornitoriTrovati.length]);

  const nome = daRegistro?.nome ?? fornitore?.nome ?? nomeLibero.trim();

  async function salva() {
    if (!nome) return;
    setSalvo(true);
    try {
      // ⚠️ IL PREZZO NON SI PERDE IN SILENZIO (27/08/2026). Prima, se il campo
      // conteneva qualcosa di non numerico — «€ 1.250», «1250 euro», un prezzo
      // incollato da WhatsApp — il conto dava NaN e il preventivo si salvava
      // con importo `null`. Ma qui `null` ha già un significato preciso:
      // «gliel'ho chiesto e non ha ancora risposto». Il preventivo spariva dal
      // confronto col più basso e il margine dell'ordine restava «—», senza
      // che niente dicesse che il prezzo era stato buttato.
      const n = leggiImporto(importo);
      if (importo.trim() && n == null) {
        avvisa('Prezzo non capito', `«${importo}» non è un importo. Scrivilo come 1.250,50 — oppure lascia il campo vuoto se il fornitore non ha ancora risposto.`);
        return;
      }
      await aggiungiPreventivo({
        lavoroId,
        fornitore: nome,
        fornitorePlaceId: fornitore?.id ?? null,
        fornitoreAnagraficheId: daRegistro?.id ?? null,
        fornitoreEmail: daRegistro?.email ?? null,
        importo: n,
        tempi,
      });
      setFornitore(null);
      setDaRegistro(null);
      setCercaForn('');
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

      {/* CHI È IL FORNITORE — prima di tutto: un prezzo senza il nome di chi
          l'ha fatto non si può confrontare né richiamare. */}
      <Text style={styles.label}>Chi fa il prezzo *</Text>
      {daRegistro ? (
        <Pressable style={styles.dealScelta} onPress={() => setDaRegistro(null)}>
          <Ionicons name="business-outline" size={16} color={colors.goldStrong} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.dealSceltaNome} numberOfLines={1}>{daRegistro.nome}</Text>
            <Text style={styles.aiuto} numberOfLines={1}>
              {[daRegistro.citta, daRegistro.email, daRegistro.statoFornitore ? `fornitore ${daRegistro.statoFornitore.replace('_', ' ')}` : null]
                .filter(Boolean)
                .join(' · ') || 'Dal registro Anagrafiche'}
            </Text>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={colors.oro} />
        </Pressable>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={cercaForn}
            onChangeText={setCercaForn}
            placeholder={caricoFornitori ? 'Carico i fornitori dal registro…' : 'Cerca il fornitore in Anagrafiche…'}
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
          />
          <View style={{ gap: 6, marginTop: 6 }}>
            {fornitoriTrovati.map((p) => (
              <Pressable key={p.id} style={styles.dealRiga} onPress={() => setDaRegistro(p)}>
                <Ionicons name="business-outline" size={15} color={colors.navy} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.dealRigaNome} numberOfLines={1}>{p.nome}</Text>
                  <Text style={styles.aiuto} numberOfLines={1}>
                    {[p.citta, p.categoria].filter(Boolean).join(' · ') || 'Fornitore nel registro'}
                  </Text>
                </View>
              </Pressable>
            ))}
            {/* Fuori dai fornitori: si dice, perché è un'informazione — quello
                che si sta scegliendo non ha (ancora) lavorato per noi. */}
            {altriDalRegistro.length ? (
              <>
                <Text style={styles.aiuto}>Non è ancora fra i fornitori, ma è nel registro:</Text>
                {altriDalRegistro.map((p) => (
                  <Pressable key={p.id} style={styles.dealRiga} onPress={() => setDaRegistro(p)}>
                    <Ionicons name="business-outline" size={15} color={colors.grigio} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.dealRigaNome} numberOfLines={1}>{p.nome}</Text>
                      <Text style={styles.aiuto} numberOfLines={1}>
                        {[p.citta, p.categoria].filter(Boolean).join(' · ') || 'Nel registro Anagrafiche'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            ) : null}
            {cercaForn.trim().length >= 2 && !fornitoriTrovati.length && !altriDalRegistro.length ? (
              <Text style={styles.aiuto}>
                Nessuno nel registro per «{cercaForn.trim()}». Cercalo fra i negozi di Scout, o scrivi il nome
                qui sotto.
              </Text>
            ) : null}
          </View>
          <CercaNegozio scelto={fornitore} onScegli={setFornitore} placeholder="…oppure cercalo fra i negozi di Scout" />
          {!fornitore ? (
            <TextInput
              style={styles.input}
              value={nomeLibero}
              onChangeText={setNomeLibero}
              placeholder="…oppure scrivi il nome, se non è da nessuna parte"
              placeholderTextColor={colors.grigio}
            />
          ) : null}
        </>
      )}
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
  // ⚠️ Il bersaglio è il PADDING, non hitSlop: react-native-web scarta
  // hitSlop, quindi «Scegli questo» ed «Elimina» erano alti quanto la riga di
  // testo (~15px). Il padding vale su web e su telefono.
  prevAzione: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, color: colors.testo, fontWeight: '700', fontSize: 12.5 },
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
