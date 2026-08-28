// Sezione "Nascosti": attività segnate "non interessanti". Si possono ripristinare.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, shadow, spacing, contenutoLargo } from '@/lib/theme';
import { EmptyState } from '@/components/ui';
import { LineaIcon } from '@/components/LineaIcon';
import { aggiornaNascosto, fetchNascosti } from '@/lib/db';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { CampoCerca } from '@/components/ui';

export default function Nascosti() {
  // Da 900px in su l'elenco è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [dati, setDati] = useState<Place[]>([]);
  // Ricerca su ogni elenco (Libro v1.9 §8-bis — mancava, 28/08/2026).
  const [cerca, setCerca] = useState('');
  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return dati;
    const nrm = (v: unknown) => String(v ?? '').toLowerCase();
    return dati.filter((p) => [p.nome, p.zona, p.indirizzo].some((v) => nrm(v).includes(q)));
  }, [dati, cerca]);
  const [loading, setLoading] = useState(true);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setDati(await fetchNascosti());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  async function ripristina(p: Place) {
    setDati((l) => l.filter((x) => x.id !== p.id));
    try {
      await aggiornaNascosto(p.id, false);
    } catch {
      carica();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.sub}>
          Attività segnate "non interessanti". Ripristinale per rivederle nella scoperta.
        </Text>
        <View style={{ marginTop: 8 }}>
          <CampoCerca valore={cerca} onCambia={setCerca} placeholder="Cerca per nome, zona o indirizzo…" />
        </View>
      </View>
      <FlatList
        // In tabella la FlatList riceve UNA riga con l'intero elenco.
        data={aTabella ? (visibili.length ? [visibili] : []) : visibili}
        keyExtractor={(p: any) => (aTabella ? 'tabella' : (p as Place).id)}
        contentContainerStyle={[styles.list, aTabella && contenutoLargo]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            icona="eye-off-outline"
            titolo="Nessuna attività nascosta"
            aiuto="Le attività che segni come non interessanti finiscono qui: puoi ripristinarle quando vuoi."
            loading={loading}
          />
        }
        renderItem={({ item }) =>
          aTabella ? (
            <Tabella
              righe={item as Place[]}
              colonne={
                [
                  {
                    chiave: 'nome',
                    label: 'Negozio',
                    flex: 1.2,
                    valore: (p) => p.nome,
                    cella: (p) => (
                      <Text style={styles.tabNome} numberOfLines={2}>
                        {p.nome}
                      </Text>
                    ),
                  },
                  { chiave: 'linea', label: 'Linea', flex: 0.6, valore: (p) => p.linea_ipotizzata ?? null },
                  { chiave: 'indirizzo', label: 'Indirizzo', flex: 1, valore: (p) => p.indirizzo ?? null },
                  {
                    chiave: 'priorita',
                    label: 'Priorità',
                    width: 70,
                    valore: (p) => p.priorita,
                    cella: (p) => <PriorityBadge priorita={p.priorita} small />,
                  },
                  {
                    chiave: 'azione',
                    label: '',
                    width: 110,
                    fissa: true,
                    valore: () => null,
                    cella: (p) => (
                      <Pressable
                        style={styles.btn}
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          ripristina(p);
                        }}
                      >
                        <Text style={styles.btnTxt}>Ripristina</Text>
                      </Pressable>
                    ),
                  },
                ] as ColonnaTabella<Place>[]
              }
              chiaveRiga={(p) => p.id}
              ordineIniziale={{ campo: 'nome', verso: 'asc' }}
              totali={(righe) => ({
                nome: `Totale · ${righe.length} ${righe.length === 1 ? 'negozio' : 'negozi'} nascosti`,
              })}
            />
          ) : (
            (() => {
              const p = item as Place;
              return (
                <View style={styles.card}>
                  <View style={styles.icona}>
                    <LineaIcon linea={p.linea_ipotizzata} size={22} color={colors.navy} />
                  </View>
                  <View style={styles.info}>
                    <View style={styles.titoloRow}>
                      <PriorityBadge priorita={p.priorita} small />
                      <Text numberOfLines={3} style={styles.nome}>
                        {p.nome}
                      </Text>
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[p.linea_ipotizzata, p.indirizzo].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                  <Pressable style={styles.btn} onPress={() => ripristina(p)}>
                    <Text style={styles.btnTxt}>Ripristina</Text>
                  </Pressable>
                </View>
              );
            })()
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sub: { color: colors.testoSoft, fontSize: 13 },
  list: { padding: spacing.lg, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...shadow.card,
  },
  icona: { width: 46, height: 46, borderRadius: radius.m, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 3 },
  titoloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flexShrink: 1, color: colors.navy, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  meta: { color: colors.testoSoft, fontSize: 13 },
  btn: {
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  btnTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
});
