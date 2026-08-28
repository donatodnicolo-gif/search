// Sezione "Clienti": i negozi già acquisiti — clienti in Scout (stato "cliente")
// o partner attivi nel registro Anagrafiche. Filtri per zona e interessi.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, shadow, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { fetchClienti, type Cliente } from '@/lib/db';
import { OPZIONI_CITTA, passaFiltroCitta } from '@/lib/citta';
import { PannelloFiltri } from '@/components/PannelloFiltri';
import { commutaSet, GruppoFiltro } from '@/components/GruppoFiltro';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';

export default function Clienti() {
  const router = useRouter();
  // Da 900px in su l'elenco è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
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

  // Le stesse azioni rapide nei due vestiti (scheda e tabella): scritte una
  // volta. Durante la scelta multipla spariscono in tutti e due.
  const azioniDi = (item: Cliente) => (
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
      <IconaAzione nome="mail-outline" attiva label="Scrivi una mail" onPress={() => setMailPlace({ id: item.id, nome: item.nome })} />
      <IconaAzione nome="walk-outline" attiva label="Visita" onPress={() => router.push(`/(app)/visita/${item.id}`)} />
      <IconaAzione
        nome="briefcase-outline"
        attiva
        label="Nuova trattativa"
        onPress={() =>
          router.push(`/(app)/trattative?nuovoPer=${item.id}&nuovoNome=${encodeURIComponent(item.nome)}`)
        }
      />
    </AzioniRiga>
  );

  // Le colonne della vista tabella. In scelta multipla la prima è la casella.
  const colonne: ColonnaTabella<Cliente>[] = [
    ...(inScelta
      ? [
          {
            chiave: 'scelta',
            label: '',
            width: 36,
            fissa: true,
            valore: () => null,
            cella: (c: Cliente) => (
              <Ionicons
                name={scelti?.has(c.id) ? 'checkbox' : 'square-outline'}
                size={20}
                color={scelti?.has(c.id) ? colors.ink : colors.grigio}
              />
            ),
          } as ColonnaTabella<Cliente>,
        ]
      : []),
    {
      chiave: 'nome',
      label: 'Nome',
      flex: 1.3,
      valore: (c) => c.nome,
      cella: (c) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {c.nome}
        </Text>
      ),
    },
    {
      chiave: 'zona',
      label: 'Zona',
      flex: 0.9,
      valore: (c) => [c.zona, c.categoria].filter(Boolean).join(' · ') || c.indirizzo || null,
    },
    { chiave: 'account', label: 'Account', flex: 0.7, valore: (c) => c.account ?? null },
    { chiave: 'linee', label: 'Linee', flex: 0.9, righe: 2, valore: (c) => (c.linee.length ? c.linee.join(', ') : null) },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 110,
      valore: (c) => (c.cliente_scout ? 2 : 0) + (c.partner_registro ? 1 : 0),
      cella: (c) => (
        <View style={styles.tabBadges}>
          {c.cliente_scout ? <StatusBadge small label="Cliente" colore={colors.successo} /> : null}
          {c.partner_registro ? <StatusBadge small label="Partner" colore={colors.blue} /> : null}
        </View>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <FlatList
        // In tabella la FlatList riceve UNA riga che contiene l'intero elenco:
        // testata, refresh e stato vuoto restano suoi, la griglia la fa Tabella.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(c: any) => (aTabella ? 'tabella' : (c as Cliente).id)}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato, inScelta && styles.listConBarra]}
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
                <GruppoFiltro
                  titolo="Città"
                  valori={(OPZIONI_CITTA as unknown as string[]).filter((v) => v !== 'Tutte')}
                  attivi={zonaFiltro}
                  onTap={(v) => commutaSet(setZonaFiltro, v)}
                  onTutti={() => setZonaFiltro(new Set())}
                  etichettaTutti="Tutte"
                />
                {accountPresenti.length ? (
                  <GruppoFiltro
                    titolo="Account"
                    valori={accountPresenti}
                    attivi={accountFiltro}
                    onTap={(v) => commutaSet(setAccountFiltro, v)}
                    onTutti={() => setAccountFiltro(new Set())}
                  />
                ) : null}
                {lineePresenti.length ? (
                  <GruppoFiltro
                    titolo="Interessi"
                    valori={lineePresenti}
                    attivi={lineaFiltro}
                    onTap={(v) => commutaSet(setLineaFiltro, v)}
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
        renderItem={({ item }) =>
          aTabella ? (
            <Tabella
              righe={item as Cliente[]}
              colonne={colonne}
              chiaveRiga={(c) => c.id}
              ordineIniziale={{ campo: 'nome', verso: 'asc' }}
              // In modalità scelta il tap spunta invece di aprire: aprire la
              // scheda a metà selezione la farebbe perdere.
              onRiga={(c) => (inScelta ? spunta(c.id) : router.push(`/(app)/attivita/${c.id}`))}
              labelRiga={(c) => (inScelta ? `Scegli ${c.nome}` : `Apri la scheda di ${c.nome}`)}
              azioni={inScelta ? undefined : azioniDi}
              larghezzaAzioni={230}
            
            totali={(righe) => ({
              nome: `Totale · ${righe.length} ${righe.length === 1 ? 'cliente' : 'clienti'}`,
            })}
          />
          ) : (
            // Stessa scheda dei Prospect: la forma sta in components/CardElenco.tsx.
            <CardElenco
              selezionabile={inScelta}
              selezionato={scelti?.has(item.id)}
              nome={(item as Cliente).nome}
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
                /* Durante la scelta multipla le azioni spariscono: un tap su
                   «chiama» mentre si spunta è solo un modo per uscire per
                   sbaglio dalla schermata. */
                inScelta ? null : azioniDi(item as Cliente)
              }
            />
          )
        }
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


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, paddingTop: spacing.sm },
  sub: { color: colors.testoSoft, fontSize: 12, flexShrink: 1 },
  subRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  linkAzione: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkAzioneTxt: { color: colors.testo, fontSize: 12.5, fontWeight: '700' },
  // La barra galleggia sopra la lista: `position: absolute` e non in fondo al
  // contenitore, se no scorrerebbe via proprio mentre si sceglie.
  barra: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
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
    backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.m,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 15, color: colors.testo,
  },
  filtri: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
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
  list: { padding: spacing.lg, gap: spacing.sm },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabBadges: { gap: 4, alignItems: 'flex-start' },
  // Spazio in fondo quando c'è la barra galleggiante: senza, coprirebbe
  // l'ultimo cliente — che è proprio quello che si sta cercando di spuntare.
  listConBarra: { paddingBottom: 88 },
  // Annulla il padding del contenitore della lista: i figli della testata hanno
  // gia' i propri margini e la riga dei filtri deve restare da bordo a bordo.
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.sm },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.bianco, borderRadius: radius.m, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.lg,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // minWidth: 0 serve perche' un figlio flex non scenda sotto il suo contenuto
  // e schiacci il nome del negozio.
  cardTesto: { flex: 1, minWidth: 0 },
  iconaBox: { width: 40, height: 40, borderRadius: radius.s, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
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
