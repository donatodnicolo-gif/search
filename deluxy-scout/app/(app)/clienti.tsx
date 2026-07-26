// Sezione "Clienti": i negozi già acquisiti — clienti in Scout (stato "cliente")
// o partner attivi nel registro Anagrafiche. Filtri per zona e interessi.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { fetchClienti, type Cliente } from '@/lib/db';
import { OPZIONI_CITTA, passaFiltroCitta } from '@/lib/citta';
import { PannelloFiltri } from '@/components/PannelloFiltri';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { CardElenco } from '@/components/CardElenco';

export default function Clienti() {
  const router = useRouter();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [zonaFiltro, setZonaFiltro] = useState<string | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);
  const [accountFiltro, setAccountFiltro] = useState<string | null>(null);

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
      if (!passaFiltroCitta(c.zona, zonaFiltro)) return false;
      if (lineaFiltro && !c.linee.includes(lineaFiltro)) return false;
      if (accountFiltro && (c.account ?? '') !== accountFiltro) return false;
      if (!q) return true;
      return [c.nome, c.indirizzo, c.zona, c.categoria, ...c.linee].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [clienti, query, zonaFiltro, lineaFiltro, accountFiltro]);

  const filtriAttivi = Boolean(query.trim() || zonaFiltro || lineaFiltro || accountFiltro);
  // Quanti filtri sono applicati (la ricerca resta sempre visibile, non conta).
  const nFiltri = [zonaFiltro, lineaFiltro, accountFiltro].filter(Boolean).length;
  function azzera() {
    setQuery('');
    setZonaFiltro(null);
    setLineaFiltro(null);
    setAccountFiltro(null);
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={dati}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[styles.list, contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        // Testata dentro lo scorrimento: da fissa occupava mezzo schermo e ai
        // clienti restava una finestrella. Elemento e non funzione, se no la
        // ricerca perde il fuoco a ogni lettera.
        ListHeaderComponent={
          <View style={[styles.head, styles.headerScroll, contenutoCentrato]}>
            <PageIntro testo="I negozi già acquisiti: clienti Deluxy e partner attivi nel registro. Tocca un cliente per aprirne la scheda." />
            <Text style={styles.sub}>{clienti.length} clienti{filtriAttivi ? ` · ${dati.length} filtrati` : ''}</Text>
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
                <Gruppo
                  titolo="Città"
                  valori={OPZIONI_CITTA as unknown as string[]}
                  attivo={zonaFiltro ?? 'Tutte'}
                  onTap={(v) => setZonaFiltro(v === 'Tutte' ? null : (c) => (c === v ? null : v))}
                />
                {accountPresenti.length ? (
                  <Gruppo titolo="Account" valori={accountPresenti} attivo={accountFiltro} onTap={(v) => setAccountFiltro((c) => (c === v ? null : v))} />
                ) : null}
                {lineePresenti.length ? (
                  <Gruppo
                    titolo="Interessi"
                    valori={['Tutti', ...lineePresenti]}
                    attivo={lineaFiltro ?? 'Tutti'}
                    onTap={(v) => setLineaFiltro(v === 'Tutti' ? null : (c) => (c === v ? null : v))}
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
            nome={item.nome}
            meta={[item.zona, item.categoria].filter(Boolean).join(' · ') || item.indirizzo || '—'}
            account={item.account ?? null}
            tag={item.linee}
            onPress={() => router.push(`/(app)/attivita/${item.id}`)}
            badge={
              <>
                {item.cliente_scout ? <StatusBadge small label="Cliente" colore={colors.successo} /> : null}
                {item.partner_registro ? <StatusBadge small label="Partner" colore={colors.blue} /> : null}
              </>
            }
            azioni={
              /* Azioni rapide: le stesse della scheda, a portata di lista. */
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
                <IconaAzione
                  nome="mail-outline"
                  attiva={Boolean(item.email)}
                  label="Email"
                  onPress={() => item.email && Linking.openURL(`mailto:${item.email}`)}
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
            }
          />
        )}
      />
    </View>
  );
}

function Gruppo({ titolo, valori, attivo, onTap }: { titolo: string; valori: string[]; attivo: string | null; onTap: (v: string) => void }) {
  return (
    <View style={styles.gruppo}>
      <Text style={styles.gruppoTitolo}>{titolo}</Text>
      <View style={styles.chips}>
        {valori.map((v) => {
          const on = attivo === v;
          return (
            <Pressable key={v} onPress={() => onTap(v)} style={[styles.chip, on && styles.chipOn]}>
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
  sub: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  search: {
    backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md,
    marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.testo,
  },
  filtri: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  gruppo: { marginBottom: 2 },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.bianco, borderColor: colors.grigioChiaro, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm },
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
