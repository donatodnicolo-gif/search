// Sezione "Clienti": i negozi già acquisiti — clienti in Scout (stato "cliente")
// o partner attivi nel registro Anagrafiche. Filtri per zona e interessi.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, shadow, spacing, contenutoCentrato } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { fetchClienti, type Cliente } from '@/lib/db';
import { OPZIONI_CITTA, passaFiltroCitta } from '@/lib/citta';
import { PannelloFiltri } from '@/components/PannelloFiltri';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { CardElenco } from '@/components/CardElenco';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';

export default function Clienti() {
  const router = useRouter();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Filtri a **scelta multipla**: un Set vuoto = nessun filtro (si vede tutto).
  // Con più valori vale l'OR — «Milano O Roma», non «Milano E Roma», che non
  // avrebbe senso su un campo che ha un valore solo e darebbe sempre zero righe.
  const [zonaFiltro, setZonaFiltro] = useState<Set<string>>(new Set());
  const [lineaFiltro, setLineaFiltro] = useState<Set<string>>(new Set());
  const [accountFiltro, setAccountFiltro] = useState<Set<string>>(new Set());
  // Scrittura di una mail con uno script: si sceglie il testo, poi si conferma.
  const [mailPlace, setMailPlace] = useState<{ id: string; nome: string } | null>(null);
  // Scelta multipla: scrivere lo stesso testo a venti clienti uno per uno è il
  // genere di lavoro che semplicemente non si fa. `null` = modo spento; un Set
  // (anche vuoto) = si sta scegliendo.
  const [scelti, setScelti] = useState<Set<string> | null>(null);
  const [mailMultipla, setMailMultipla] = useState<{ id: string; nome: string }[] | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setClienti(await fetchClienti());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const { lineePresenti, accountPresenti } = useMemo(() => {
    const linee = new Set<string>();
    const account = new Set<string>();
    for (const c of clienti) {
      for (const l of c.linee) linee.add(l);
      if (c.account) account.add(c.account);
    }
    return { lineePresenti: [...linee].sort(), accountPresenti: [...account].sort() };
  }, [clienti]);

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clienti.filter((c) => {
      // Set vuoto = filtro spento. Con più valori basta che ne combaci uno.
      if (zonaFiltro.size && ![...zonaFiltro].some((z) => passaFiltroCitta(c.zona, z))) return false;
      if (lineaFiltro.size && !c.linee.some((l) => lineaFiltro.has(l))) return false;
      if (accountFiltro.size && !accountFiltro.has(c.account ?? '')) return false;
      if (!q) return true;
      return [c.nome, c.indirizzo, c.zona, c.categoria, ...c.linee].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [clienti, query, zonaFiltro, lineaFiltro, accountFiltro]);

  const filtriAttivi = Boolean(query.trim() || zonaFiltro.size || lineaFiltro.size || accountFiltro.size);
  // Quanti VALORI sono selezionati in tutto (non quanti gruppi): con la scelta
  // multipla «2» sul bottone dei filtri deve voler dire due voci spuntate,
  // altrimenti non si capisce quanto si è ristretto.
  const nFiltri = zonaFiltro.size + lineaFiltro.size + accountFiltro.size;
  function azzera() {
    setQuery('');
    setZonaFiltro(new Set());
    setLineaFiltro(new Set());
    setAccountFiltro(new Set());
  }

  /** Aggiunge o toglie un valore da un filtro. */
  function commuta(set: (f: (p: Set<string>) => Set<string>) => void, valore: string) {
    set((prev) => {
      const n = new Set(prev);
      if (n.has(valore)) n.delete(valore);
      else n.add(valore);
      return n;
    });
  }

  const inScelta = scelti !== null;
  const nScelti = scelti?.size ?? 0;
  // Chi è spuntato, nell'ordine in cui appare: serve alla mail e al conteggio.
  const clientiScelti = useMemo(
    () => (scelti ? dati.filter((c) => scelti.has(c.id)) : []),
    [dati, scelti],
  );

  function spunta(id: string) {
    setScelti((prev) => {
      const n = new Set(prev ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // «Tutti» sono i clienti FILTRATI, non tutti quelli che esistono: se hai
  // ristretto a una città e premi tutti, ti aspetti quella città — non 300 mail
  // a mezza Italia.
  function tuttiOnessuno() {
    setScelti((prev) => {
      const attuali = prev ?? new Set<string>();
      const tuttiDentro = dati.length > 0 && dati.every((c) => attuali.has(c.id));
      return tuttiDentro ? new Set() : new Set(dati.map((c) => c.id));
    });
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={dati}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[styles.list, contenutoCentrato, inScelta && styles.listConBarra]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        // Testata dentro lo scorrimento: da fissa occupava mezzo schermo e ai
        // clienti restava una finestrella. Elemento e non funzione, se no la
        // ricerca perde il fuoco a ogni lettera.
        ListHeaderComponent={
          <View style={[styles.head, styles.headerScroll, contenutoCentrato]}>
            <PageIntro
              testo={
                inScelta
                  ? 'Tocca i clienti da includere. «Tutti» prende quelli che vedi adesso, cioè il risultato dei filtri — non l’intero elenco.'
                  : 'I negozi già acquisiti: clienti Deluxy e partner attivi nel registro. Tocca un cliente per aprirne la scheda.'
              }
            />
            <View style={styles.subRiga}>
              <Text style={styles.sub}>
                {clienti.length} clienti{filtriAttivi ? ` · ${dati.length} filtrati` : ''}
              </Text>
              {inScelta ? (
                <Pressable onPress={tuttiOnessuno} style={styles.linkAzione} hitSlop={6}>
                  <Text style={styles.linkAzioneTxt}>
                    {dati.length > 0 && dati.every((c) => scelti?.has(c.id)) ? 'Deseleziona tutti' : 'Tutti'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => setScelti(new Set())} style={styles.linkAzione} hitSlop={6}>
                  <Ionicons name="checkbox-outline" size={15} color={colors.testo} />
                  <Text style={styles.linkAzioneTxt}>Scegli più clienti</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Cerca per nome, zona, categoria, linea…"
              placeholderTextColor={colors.grigio}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {/* I filtri stanno dietro un bottone: aperti occupavano piu' di una
                schermata prima del primo cliente. */}
            <PannelloFiltri attivi={nFiltri} onAzzera={azzera}>
              <View style={styles.filtri}>
                {/* Ogni gruppo è a scelta multipla: si spuntano più voci e
                    valgono in OR. La voce «Tutte/Tutti» non è un valore fra gli
                    altri — è il modo di svuotare quel gruppo. */}
                <Gruppo
                  titolo="Città"
                  valori={(OPZIONI_CITTA as unknown as string[]).filter((v) => v !== 'Tutte')}
                  attivi={zonaFiltro}
                  onTap={(v) => commuta(setZonaFiltro, v)}
                  onTutti={() => setZonaFiltro(new Set())}
                  etichettaTutti="Tutte"
                />
                {accountPresenti.length ? (
                  <Gruppo
                    titolo="Account"
                    valori={accountPresenti}
                    attivi={accountFiltro}
                    onTap={(v) => commuta(setAccountFiltro, v)}
                    onTutti={() => setAccountFiltro(new Set())}
                  />
                ) : null}
                {lineePresenti.length ? (
                  <Gruppo
                    titolo="Interessi"
                    valori={lineePresenti}
                    attivi={lineaFiltro}
                    onTap={(v) => commuta(setLineaFiltro, v)}
                    onTutti={() => setLineaFiltro(new Set())}
                  />
                ) : null}
              </View>
            </PannelloFiltri>
          </View>
        }
        ListEmptyComponent={
          filtriAttivi ? (
            <EmptyState icona="filter-outline" titolo="Nessun cliente con questi filtri" aiuto="Prova ad azzerare zona, interessi o la ricerca." azione="Azzera filtri" onAzione={azzera} />
          ) : (
            <EmptyState
              loading={loading}
              icona="ribbon-outline"
              titolo="Ancora nessun cliente"
              aiuto="Quando chiudi una trattativa e porti un negozio a 'Cliente', compare qui (insieme ai partner attivi del registro)."
            />
          )
        }
        renderItem={({ item }) => (
          // Stessa scheda dei Prospect: la forma sta in components/CardElenco.tsx.
          <CardElenco
            selezionabile={inScelta}
            selezionato={scelti?.has(item.id)}
            nome={item.nome}
            meta={[item.zona, item.categoria].filter(Boolean).join(' · ') || item.indirizzo || '—'}
            account={item.account ?? null}
            tag={item.linee}
            // In modalità scelta il tap spunta invece di aprire: aprire la
            // scheda a metà selezione la farebbe perdere.
            onPress={() => (inScelta ? spunta(item.id) : router.push(`/(app)/attivita/${item.id}`))}
            badge={
              <>
                {item.cliente_scout ? <StatusBadge small label="Cliente" colore={colors.successo} /> : null}
                {item.partner_registro ? <StatusBadge small label="Partner" colore={colors.blue} /> : null}
              </>
            }
            azioni={
              /* Azioni rapide: le stesse della scheda, a portata di lista.
                 Durante la scelta multipla spariscono: un tap su «chiama»
                 mentre si stanno spuntando venti clienti è solo un modo per
                 uscire dalla schermata per sbaglio. */
              inScelta ? null : (
              <AzioniRiga>
                <IconaAzione
                  nome="call-outline"
                  attiva={Boolean(item.telefono)}
                  label="Chiama"
                  onPress={() => item.telefono && Linking.openURL(`tel:${item.telefono}`)}
                />
                <IconaAzione
                  nome="logo-whatsapp"
                  attiva={Boolean(item.telefono)}
                  label="WhatsApp"
                  onPress={() => item.telefono && Linking.openURL(`https://wa.me/${item.telefono.replace(/[^0-9]/g, '')}`)}
                />
                {/* La mail parte dall'app con uno script della libreria: si
                    sceglie il testo, si rivedono i destinatari e si conferma.
                    Prima apriva il client di posta esterno con un mailto. */}
                <IconaAzione
                  nome="mail-outline"
                  attiva
                  label="Scrivi una mail"
                  onPress={() => setMailPlace({ id: item.id, nome: item.nome })}
                />
                <IconaAzione
                  nome="walk-outline"
                  attiva
                  label="Visita"
                  onPress={() => router.push(`/(app)/visita/${item.id}`)}
                />
                {/* Apre le Trattative col form già pronto su questo cliente:
                    su un cliente acquisito la trattativa nuova è l'azione che
                    serve più spesso. */}
                <IconaAzione
                  nome="briefcase-outline"
                  attiva
                  label="Nuova trattativa"
                  onPress={() =>
                    router.push(
                      `/(app)/trattative?nuovoPer=${item.id}&nuovoNome=${encodeURIComponent(item.nome)}`,
                    )
                  }
                />
              </AzioniRiga>
              )
            }
          />
        )}
      />

      {/* Barra della scelta multipla: sta in fondo, sopra la lista, e resta
          visibile mentre si scorre — il conto di quanti sono spuntati serve
          proprio mentre si spunta. */}
      {inScelta ? (
        <View style={styles.barra}>
          <Pressable onPress={() => setScelti(null)} style={styles.barraAnnulla} hitSlop={6}>
            <Text style={styles.barraAnnullaTxt}>Annulla</Text>
          </Pressable>
          <Text style={styles.barraConto} numberOfLines={1}>
            {nScelti === 0 ? 'Nessuno scelto' : `${nScelti} scelt${nScelti === 1 ? 'o' : 'i'}`}
          </Text>
          <Pressable
            style={[styles.barraBtn, !nScelti && styles.barraBtnOff]}
            disabled={!nScelti}
            onPress={() => setMailMultipla(clientiScelti.map((c) => ({ id: c.id, nome: c.nome })))}
          >
            <Ionicons name="mail-outline" size={16} color={colors.bianco} />
            <Text style={styles.barraBtnTxt}>Scrivi a {nScelti || ''}</Text>
          </Pressable>
        </View>
      ) : null}

      {mailPlace ? <ScegliScriptModal place={mailPlace} onClose={() => setMailPlace(null)} /> : null}
      {mailMultipla ? (
        <ScegliScriptModal
          places={mailMultipla}
          onClose={() => {
            setMailMultipla(null);
            // La scelta si chiude con l'invio: lasciarla aperta farebbe credere,
            // tornando indietro, che la mail sia ancora da mandare.
            setScelti(null);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Un gruppo di filtri a **scelta multipla**: ogni pillola si accende e si
 * spegne da sé, e quelle accese valgono in OR.
 *
 * La prima pillola («Tutte»/«Tutti») azzera il gruppo ed è accesa quando non
 * c'è nessuna selezione: senza, per tornare a vedere tutto bisognerebbe
 * ricordarsi quali voci si erano spuntate e rispegnerle una per una.
 */
function Gruppo({
  titolo,
  valori,
  attivi,
  onTap,
  onTutti,
  etichettaTutti = 'Tutti',
}: {
  titolo: string;
  valori: string[];
  attivi: Set<string>;
  onTap: (v: string) => void;
  onTutti: () => void;
  etichettaTutti?: string;
}) {
  return (
    <View style={styles.gruppo}>
      <View style={styles.gruppoTesta}>
        <Text style={styles.gruppoTitolo}>{titolo}</Text>
        {/* Quanti ne hai spuntati in questo gruppo: con dieci pillole a capo
            su più righe, il conto a colpo d'occhio serve. */}
        {attivi.size > 0 ? <Text style={styles.gruppoConto}>{attivi.size}</Text> : null}
      </View>
      <View style={styles.chips}>
        <Pressable onPress={onTutti} style={[styles.chip, attivi.size === 0 && styles.chipOn]}>
          <Text style={[styles.chipTxt, attivi.size === 0 && styles.chipTxtOn]} numberOfLines={1}>
            {etichettaTutti}
          </Text>
        </Pressable>
        {valori.map((v) => {
          const on = attivi.has(v);
          return (
            <Pressable key={v} onPress={() => onTap(v)} style={[styles.chip, on && styles.chipOn]}>
              {/* La spunta dice che la pillola è un interruttore e non una
                  scelta esclusiva: senza, due pillole accese sembrano un bug. */}
              {on ? <Ionicons name="checkmark" size={13} color={colors.bianco} /> : null}
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, paddingTop: spacing.sm },
  sub: { color: colors.testoSoft, fontSize: 12, flexShrink: 1 },
  subRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  linkAzione: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkAzioneTxt: { color: colors.testo, fontSize: 12.5, fontWeight: '700' },
  // La barra galleggia sopra la lista: `position: absolute` e non in fondo al
  // contenitore, se no scorrerebbe via proprio mentre si sceglie.
  barra: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...shadow.float,
  },
  barraAnnulla: { paddingHorizontal: 6, paddingVertical: 6 },
  barraAnnullaTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  barraConto: { flex: 1, textAlign: 'center', color: colors.testo, fontWeight: '700', fontSize: 13 },
  barraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  barraBtnOff: { opacity: 0.4 },
  barraBtnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
  search: {
    backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md,
    marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.testo,
  },
  filtri: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  gruppo: { marginBottom: 2 },
  gruppoTesta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700' },
  gruppoConto: {
    color: colors.bianco,
    backgroundColor: colors.navy,
    fontSize: 10,
    fontWeight: '800',
    minWidth: 16,
    textAlign: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // flexDirection per far stare la spunta accanto al testo nelle pillole accese.
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bianco, borderColor: colors.grigioChiaro, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm },
  // Spazio in fondo quando c'è la barra galleggiante: senza, coprirebbe
  // l'ultimo cliente — che è proprio quello che si sta cercando di spuntare.
  listConBarra: { paddingBottom: 88 },
  // Annulla il padding del contenitore della lista: i figli della testata hanno
  // gia' i propri margini e la riga dei filtri deve restare da bordo a bordo.
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // minWidth: 0 serve perche' un figlio flex non scenda sotto il suo contenuto
  // e schiacci il nome del negozio.
  cardTesto: { flex: 1, minWidth: 0 },
  iconaBox: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.testoSoft, fontSize: 13, marginTop: 1 },
  account: { color: colors.grigio, fontSize: 12, marginTop: 2 },
  azioniRiga: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  iconaAzione: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.sfondo, alignItems: 'center', justifyContent: 'center' },
  lineeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  lineaTag: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 11 },
  badgeCol: { alignItems: 'flex-end', gap: 4 },
});
