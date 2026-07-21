// Rubrica: tutti i contatti registrati nell'app, condivisi con HubSpot.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, coloreStato, labelStato, radius, spacing } from '@/lib/theme';
import type { StatoPlace } from '@/types';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { fetchTuttiContatti, type ContattoConLuogo } from '@/lib/db';

export default function Rubrica() {
  const router = useRouter();
  const [contatti, setContatti] = useState<ContattoConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statoFiltro, setStatoFiltro] = useState<StatoPlace | null>(null);
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setContatti(await fetchTuttiContatti());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // Opzioni dei filtri: solo gli stati e gli interessi (linee) presenti fra i contatti.
  const { statiPresenti, lineePresenti } = useMemo(() => {
    const stati = new Set<StatoPlace>();
    const linee = new Set<string>();
    for (const c of contatti) {
      if (c.place_stato) stati.add(c.place_stato);
      if (c.place_linea) linee.add(c.place_linea);
    }
    const ORDINE: StatoPlace[] = ['da_visitare', 'visitato', 'cliente', 'perso'];
    return {
      statiPresenti: ORDINE.filter((s) => stati.has(s)),
      lineePresenti: [...linee].sort(),
    };
  }, [contatti]);

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contatti.filter((c) => {
      if (statoFiltro && c.place_stato !== statoFiltro) return false;
      if (lineaFiltro && c.place_linea !== lineaFiltro) return false;
      if (!q) return true;
      return [c.nome, c.ruolo, c.place_nome, c.telefono, c.email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [contatti, query, statoFiltro, lineaFiltro]);

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <PageIntro testo="Tutti i contatti raccolti sul campo. Filtra per stato del negozio o per interessi, e cerca per nome, ruolo, negozio o telefono. Il badge conferma la sincronizzazione col registro Anagrafiche." />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per nome, ruolo, negozio, telefono…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {statiPresenti.length || lineePresenti.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtri}>
            {statiPresenti.length ? (
              <GruppoFiltro
                titolo="Stato"
                valori={statiPresenti}
                attivo={statoFiltro}
                onTap={(v) => setStatoFiltro((cur) => (cur === v ? null : (v as StatoPlace)))}
                label={(v) => labelStato[v as StatoPlace]}
                colore={(v) => coloreStato[v as StatoPlace]}
              />
            ) : null}
            {lineePresenti.length ? (
              <GruppoFiltro
                titolo="Interessi"
                valori={lineePresenti}
                attivo={lineaFiltro}
                onTap={(v) => setLineaFiltro((cur) => (cur === v ? null : v))}
              />
            ) : null}
          </ScrollView>
        ) : null}
      </View>
      <FlatList
        data={dati}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          statoFiltro || lineaFiltro || query.trim() ? (
            <EmptyState
              icona="filter-outline"
              titolo="Nessun contatto con questi filtri"
              aiuto="Prova ad azzerare stato, interessi o la ricerca."
              azione="Azzera filtri"
              onAzione={() => {
                setStatoFiltro(null);
                setLineaFiltro(null);
                setQuery('');
              }}
            />
          ) : (
            <EmptyState
              icona="people-outline"
              titolo="Nessun contatto"
              aiuto="I contatti che registri durante le visite compaiono qui e vengono sincronizzati con HubSpot."
              loading={loading}
            />
          )
        }
        renderItem={({ item }) => (
          <Contatto contatto={item} onOpenPlace={() => router.push(`/(app)/attivita/${item.place_id}`)} />
        )}
      />
    </View>
  );
}

// Gruppo di chip filtro (uno solo attivo per gruppo; ritap = azzera). I chip
// stato usano un dot col colore semantico DS.
function GruppoFiltro({
  titolo,
  valori,
  attivo,
  onTap,
  label,
  colore,
}: {
  titolo: string;
  valori: string[];
  attivo: string | null;
  onTap: (v: string) => void;
  label?: (v: string) => string;
  colore?: (v: string) => string;
}) {
  return (
    <View style={styles.gruppo}>
      <Text style={styles.gruppoTitolo}>{titolo}</Text>
      <View style={styles.chips}>
        {valori.map((v) => {
          const on = attivo === v;
          return (
            <Pressable key={v} onPress={() => onTap(v)} style={[styles.chip, on && styles.chipOn]}>
              {colore ? <View style={[styles.chipDot, { backgroundColor: colore(v) }]} /> : null}
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>
                {label ? label(v) : v}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Contatto({ contatto: c, onOpenPlace }: { contatto: ContattoConLuogo; onOpenPlace: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.nome} numberOfLines={1}>
          {c.nome} {c.is_decisore ? <Ionicons name="star" size={13} color={colors.oro} /> : null}
        </Text>
        {/* Conferma che il contatto è sincronizzato col registro Anagrafiche. */}
        <StatusBadge
          small
          label={c.place_nel_registro ? 'Sincronizzato con Anagrafiche' : 'Non nel registro'}
          colore={c.place_nel_registro ? colors.successo : colors.grigio}
        />
      </View>
      {c.ruolo ? <Text style={styles.meta}>{c.ruolo}</Text> : null}
      {c.place_nome ? (
        <Pressable onPress={onOpenPlace}>
          <Text style={styles.negozio}>
            <Ionicons name="storefront-outline" size={14} color={colors.navy} /> {c.place_nome}
          </Text>
        </Pressable>
      ) : null}
      {c.place_linea ? (
        <View style={styles.lineaTag}>
          <Text style={styles.lineaTagTxt}>{c.place_linea}</Text>
        </View>
      ) : null}
      <View style={styles.azioni}>
        {c.telefono ? (
          <Pressable style={styles.azione} onPress={() => Linking.openURL(`tel:${c.telefono}`)}>
            <Text style={styles.azioneTxt}>
              <Ionicons name="call-outline" size={13} color={colors.oro} /> {c.telefono}
            </Text>
          </Pressable>
        ) : null}
        {c.email ? (
          <Pressable style={styles.azione} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
            <Text style={styles.azioneTxt}>
              <Ionicons name="mail-outline" size={13} color={colors.oro} /> {c.email}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: {
    backgroundColor: colors.sfondo,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    paddingTop: spacing.sm,
  },
  search: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  // Barra filtri (stato + interessi)
  filtri: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.md },
  gruppo: { marginRight: spacing.sm },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bianco,
    borderColor: colors.grigioChiaro,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 4,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.navy },
  meta: { color: colors.testoSoft, fontSize: 13 },
  negozio: { color: colors.navy, fontSize: 14, fontWeight: '600', marginTop: 2 },
  lineaTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  azioni: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  azione: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  azioneTxt: { color: colors.oro, fontWeight: '700', fontSize: 13 },
});
