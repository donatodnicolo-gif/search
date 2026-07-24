// Sezione "Clienti": i negozi già acquisiti — clienti in Scout (stato "cliente")
// o partner attivi nel registro Anagrafiche. Filtri per zona e interessi.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { fetchClienti, type Cliente } from '@/lib/db';
import { OPZIONI_CITTA, passaFiltroCitta } from '@/lib/citta';

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
  function azzera() {
    setQuery('');
    setZonaFiltro(null);
    setLineaFiltro(null);
    setAccountFiltro(null);
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
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
      </View>

      <FlatList
        data={dati}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
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
          <Pressable style={styles.card} onPress={() => router.push(`/(app)/attivita/${item.id}`)}>
            <View style={styles.iconaBox}>
              <Ionicons name="storefront-outline" size={20} color={colors.goldStrong} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome} numberOfLines={1}>{item.nome}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[item.zona, item.categoria].filter(Boolean).join(' · ') || item.indirizzo || '—'}
              </Text>
              <Text style={styles.account} numberOfLines={1}>
                <Ionicons name="briefcase-outline" size={11} color={colors.grigio} />{' '}
                {item.account ? `Account: ${item.account}` : 'Account non assegnato'}
              </Text>
              {item.linee.length ? (
                <View style={styles.lineeRow}>
                  {item.linee.slice(0, 3).map((l) => (
                    <View key={l} style={styles.lineaTag}>
                      <Text style={styles.lineaTagTxt}>{l}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={styles.badgeCol}>
              {item.cliente_scout ? <StatusBadge small label="Cliente" colore={colors.successo} /> : null}
              {item.partner_registro ? <StatusBadge small label="Partner" colore={colors.blue} /> : null}
              {/* Azioni rapide: le stesse della scheda, a portata di lista. */}
              <View style={styles.azioniRiga}>
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
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function IconaAzione({ nome, attiva, label, onPress }: { nome: any; attiva: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.iconaAzione, !attiva && { opacity: 0.35 }]}
      disabled={!attiva}
      hitSlop={4}
      onPress={(e) => {
        (e as any)?.stopPropagation?.();
        onPress();
      }}
      accessibilityLabel={label}
    >
      <Ionicons name={nome} size={16} color={colors.navy} />
    </Pressable>
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
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md,
  },
  iconaBox: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.testoSoft, fontSize: 13, marginTop: 1 },
  account: { color: colors.grigio, fontSize: 12, marginTop: 2 },
  azioniRiga: { flexDirection: 'row', gap: 6, marginTop: 6 },
  iconaAzione: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.sfondo, alignItems: 'center', justifyContent: 'center' },
  lineeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  lineaTag: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 11 },
  badgeCol: { alignItems: 'flex-end', gap: 4 },
});
