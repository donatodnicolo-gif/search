// Rubrica: tutti i contatti registrati nell'app, condivisi con HubSpot.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, coloreStato, labelStato, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import type { StatoPlace } from '@/types';
import { ContoRighe, EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { PercorsoCliente } from '@/components/PercorsoCliente';
import { archiviaContatto, fetchTuttiContatti, type ContattoConLuogo } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { OPZIONI_CITTA, passaFiltroCitta } from '@/lib/citta';
import { PannelloFiltri } from '@/components/PannelloFiltri';
import { commutaSet, GruppoFiltro } from '@/components/GruppoFiltro';

export default function Rubrica() {
  const router = useRouter();
  // Da 900px in su l'elenco è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [contatti, setContatti] = useState<ContattoConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Filtri a scelta multipla: Set vuoto = spento, più valori = OR.
  const [statoFiltro, setStatoFiltro] = useState<Set<string>>(new Set());
  const [lineaFiltro, setLineaFiltro] = useState<Set<string>>(new Set());
  const [zonaFiltro, setZonaFiltro] = useState<Set<string>>(new Set());
  const [mostraArchiviati, setMostraArchiviati] = useState(false); // di default gli archiviati sono nascosti
  // Toggle rapidi (multipli, combinabili): utili per preparare una campagna.
  const [toggles, setToggles] = useState<Set<'decisori' | 'email' | 'telefono' | 'registro'>>(new Set());

  const attivo = (t: 'decisori' | 'email' | 'telefono' | 'registro') => toggles.has(t);
  const togglaFiltro = (t: 'decisori' | 'email' | 'telefono' | 'registro') =>
    setToggles((cur) => {
      const n = new Set(cur);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  const filtriAttivi = Boolean(
    statoFiltro.size || lineaFiltro.size || zonaFiltro.size || toggles.size || query.trim(),
  );
  // Conteggio per il bottone del pannello (la ricerca resta fuori: è sempre
  // visibile). Conta i VALORI spuntati, non i gruppi: dice quanto si è ristretto.
  const nFiltriAttivi = statoFiltro.size + lineaFiltro.size + zonaFiltro.size + toggles.size;
  function azzeraFiltri() {
    setStatoFiltro(new Set());
    setLineaFiltro(new Set());
    setZonaFiltro(new Set());
    setToggles(new Set());
    setQuery('');
  }

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

  // Opzioni dei filtri: solo gli stati e gli interessi presenti fra i contatti.
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

  const nArchiviati = useMemo(() => contatti.filter((c) => c.archiviato).length, [contatti]);

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const emailValida = (e: string | null) => Boolean(e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    return contatti.filter((c) => {
      // Gli archiviati sono nascosti finché non si attiva "Archiviati".
      if (mostraArchiviati ? !c.archiviato : c.archiviato) return false;
      // Set vuoto = filtro spento. Con più valori basta che ne combaci uno.
      if (statoFiltro.size && !statoFiltro.has(c.place_stato ?? '')) return false;
      if (lineaFiltro.size && !lineaFiltro.has(c.place_linea ?? '')) return false;
      if (zonaFiltro.size && ![...zonaFiltro].some((z) => passaFiltroCitta(c.place_zona, z))) return false;
      if (toggles.has('decisori') && !c.is_decisore) return false;
      if (toggles.has('email') && !emailValida(c.email)) return false;
      if (toggles.has('telefono') && !c.telefono) return false;
      if (toggles.has('registro') && !c.place_nel_registro) return false;
      if (!q) return true;
      return [c.nome, c.ruolo, c.place_nome, c.telefono, c.email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [contatti, query, statoFiltro, lineaFiltro, zonaFiltro, toggles, mostraArchiviati]);

  async function archivia(c: ContattoConLuogo) {
    const nuovo = !c.archiviato;
    // Ottimistico: aggiorna subito la lista, poi persiste + notifica Anagrafiche.
    setContatti((cur) => cur.map((x) => (x.id === c.id ? { ...x, archiviato: nuovo } : x)));
    try {
      await archiviaContatto(c, nuovo);
    } catch (e: any) {
      setContatti((cur) => cur.map((x) => (x.id === c.id ? { ...x, archiviato: c.archiviato } : x)));
      avvisa('Errore', e?.message ?? 'Operazione non riuscita.');
    }
  }

  const colonne: ColonnaTabella<ContattoConLuogo>[] = [
    {
      chiave: 'nome',
      label: 'Contatto',
      flex: 1,
      valore: (c) => c.nome,
      cella: (c) => (
        <Text style={[styles.tabNome, c.archiviato && styles.tabArchiviato]} numberOfLines={2}>
          {c.nome} {c.is_decisore ? <Ionicons name="star" size={12} color={colors.oro} /> : null}
        </Text>
      ),
    },
    { chiave: 'ruolo', label: 'Ruolo', flex: 0.7, valore: (c) => c.ruolo ?? null },
    {
      chiave: 'negozio',
      label: 'Negozio',
      flex: 1,
      valore: (c) => c.place_nome ?? null,
      cella: (c) =>
        c.place_nome ? (
          <Pressable
            onPress={(e: any) => {
              e?.stopPropagation?.();
              router.push(`/(app)/attivita/${c.place_id}`);
            }}
          >
            <Text style={styles.tabNegozio} numberOfLines={2}>
              {c.place_nome}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.tabMuto}>—</Text>
        ),
    },
    { chiave: 'linea', label: 'Linea', flex: 0.6, valore: (c) => c.place_linea ?? null },
    {
      chiave: 'telefono',
      label: 'Telefono',
      width: 120,
      valore: (c) => c.telefono ?? null,
      cella: (c) =>
        c.telefono ? (
          <Pressable
            onPress={(e: any) => {
              e?.stopPropagation?.();
              Linking.openURL(`tel:${c.telefono}`);
            }}
          >
            <Text style={styles.tabContatto} numberOfLines={1}>
              {c.telefono}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.tabMuto}>—</Text>
        ),
    },
    {
      chiave: 'email',
      label: 'Email',
      flex: 0.9,
      valore: (c) => c.email ?? null,
      cella: (c) =>
        c.email ? (
          <Pressable
            onPress={(e: any) => {
              e?.stopPropagation?.();
              Linking.openURL(`mailto:${c.email}`);
            }}
          >
            <Text style={styles.tabContatto} numberOfLines={1}>
              {c.email}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.tabMuto}>—</Text>
        ),
    },
    {
      chiave: 'registro',
      label: 'Registro',
      width: 96,
      valore: (c) => (c.place_nel_registro ? 1 : 0),
      cella: (c) => (
        <StatusBadge
          small
          label={c.place_nel_registro ? 'Sincronizzato' : 'Non nel registro'}
          colore={c.place_nel_registro ? colors.successo : colors.grigio}
        />
      ),
    },
    {
      chiave: 'archivia',
      label: '',
      width: 40,
      fissa: true,
      valore: () => null,
      cella: (c) => (
        <Pressable
          hitSlop={8}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            archivia(c);
          }}
          accessibilityLabel={c.archiviato ? 'Ripristina contatto' : 'Archivia contatto'}
          {...({ title: c.archiviato ? 'Ripristina' : 'Archivia' } as any)}
        >
          <Ionicons name={c.archiviato ? 'arrow-undo-outline' : 'archive-outline'} size={16} color={colors.grigio} />
        </Pressable>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <FlatList
        // In tabella la FlatList riceve UNA riga con l'intero elenco.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(c: any) => (aTabella ? 'tabella' : (c as ContattoConLuogo).id)}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        // Intro, ricerca e filtri scorrono con la lista: da fissi lasciavano
        // ai contatti pochi pixel. Elemento e non funzione, se no la ricerca
        // perde il fuoco a ogni lettera.
        ListHeaderComponent={
          <View style={styles.headerScroll}>
        <View style={[styles.head, contenutoCentrato]}>
          <PageIntro testo="Tutti i contatti raccolti sul campo. Filtra per stato del negozio o per interessi, e cerca per nome, ruolo, negozio o telefono. Il badge conferma la sincronizzazione col registro Anagrafiche." />
          {/* Quante righe si stanno guardando: con un filtro attivo, un elenco
              corto senza questo numero sembra un elenco che ha perso i dati. */}
          <ContoRighe mostrati={dati.length} totale={contatti.length} nome="contatti" />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Cerca per nome, ruolo, negozio, telefono…"
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {/* Filtri esclusivi (uno per gruppo): stato / interessi / città.
              Vanno a capo: in orizzontale i gruppi finivano tagliati fuori
              schermo ("Interessi" si leggeva "In…") senza modo di accorgersene. */}
          {/* Dietro un bottone: gruppi + toggle aperti riempivano lo schermo
              prima del primo contatto. */}
          <PannelloFiltri attivi={nFiltriAttivi} onAzzera={azzeraFiltri}>
            <View style={styles.filtri}>
              <GruppoFiltro
                titolo="Stato"
                valori={statiPresenti}
                attivi={statoFiltro}
                onTap={(v) => commutaSet(setStatoFiltro, v)}
                onTutti={() => setStatoFiltro(new Set())}
                label={(v) => labelStato[v as StatoPlace]}
                colore={(v) => coloreStato[v as StatoPlace]}
              />
              <GruppoFiltro
                titolo="Interessi"
                valori={lineePresenti}
                attivi={lineaFiltro}
                onTap={(v) => commutaSet(setLineaFiltro, v)}
                onTutti={() => setLineaFiltro(new Set())}
              />
              <GruppoFiltro
                titolo="Città"
                // "Tutte" la mette il componente: qui è il modo di svuotare,
                // non un valore della lista.
                valori={(OPZIONI_CITTA as unknown as string[]).filter((v) => v !== 'Tutte')}
                attivi={zonaFiltro}
                onTap={(v) => commutaSet(setZonaFiltro, v)}
                onTutti={() => setZonaFiltro(new Set())}
                etichettaTutti="Tutte"
              />
            </View>

            {/* Toggle rapidi (combinabili): utili per preparare una campagna. */}
            <View style={styles.toggleRow}>
              <ToggleChip icona="star" label="Decisori" on={attivo('decisori')} onTap={() => togglaFiltro('decisori')} />
              <ToggleChip icona="mail-outline" label="Con email" on={attivo('email')} onTap={() => togglaFiltro('email')} />
              <ToggleChip icona="call-outline" label="Con telefono" on={attivo('telefono')} onTap={() => togglaFiltro('telefono')} />
              <ToggleChip icona="library-outline" label="Nel registro" on={attivo('registro')} onTap={() => togglaFiltro('registro')} />
              {nArchiviati ? (
                <ToggleChip
                  icona="archive-outline"
                  label={`Archiviati (${nArchiviati})`}
                  on={mostraArchiviati}
                  onTap={() => setMostraArchiviati((v) => !v)}
                />
              ) : null}
              {filtriAttivi ? (
                <Pressable style={styles.azzera} onPress={azzeraFiltri} hitSlop={6}>
                  <Ionicons name="close-circle" size={14} color={colors.testoSoft} />
                  <Text style={styles.azzeraTxt}>Azzera</Text>
                </Pressable>
              ) : null}
            </View>
          </PannelloFiltri>

          {filtriAttivi ? <Text style={styles.conteggio}>{dati.length} contatt{dati.length === 1 ? 'o' : 'i'}</Text> : null}
        </View>
          </View>
        }
        ListEmptyComponent={
          filtriAttivi ? (
            <EmptyState
              icona="filter-outline"
              titolo="Nessun contatto con questi filtri"
              aiuto="Prova ad allentare stato, interessi, zona o i filtri rapidi."
              azione="Azzera filtri"
              onAzione={azzeraFiltri}
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
        renderItem={({ item }) =>
          aTabella ? (
            <Tabella
              righe={item as ContattoConLuogo[]}
              colonne={colonne}
              chiaveRiga={(c) => c.id}
              ordineIniziale={{ campo: 'nome', verso: 'asc' }}
            
            totali={(righe) => ({
              nome: `Totale · ${righe.length} ${righe.length === 1 ? 'contatto' : 'contatti'}`,
            })}
          />
          ) : (
            <Contatto
              contatto={item as ContattoConLuogo}
              onOpenPlace={() => router.push(`/(app)/attivita/${item.place_id}`)}
              onArchivia={() => archivia(item)}
            />
          )
        }
      />
    </View>
  );
}


// Chip toggle rapido (attivo/spento, combinabile con gli altri).
function ToggleChip({
  icona,
  label,
  on,
  onTap,
}: {
  icona: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  on: boolean;
  onTap: () => void;
}) {
  return (
    <Pressable style={[styles.toggle, on && styles.toggleOn]} onPress={onTap}>
      <Ionicons name={icona} size={13} color={on ? colors.bianco : colors.testoSoft} />
      <Text style={[styles.toggleTxt, on && styles.toggleTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function Contatto({
  contatto: c,
  onOpenPlace,
  onArchivia,
}: {
  contatto: ContattoConLuogo;
  onOpenPlace: () => void;
  onArchivia: () => void;
}) {
  return (
    <View style={[styles.card, c.archiviato && styles.cardArchiviato]}>
      <View style={styles.cardHead}>
        <Text numberOfLines={3} style={styles.nome}>
          {c.nome} {c.is_decisore ? <Ionicons name="star" size={13} color={colors.oro} /> : null}
        </Text>
        {/* Conferma che il contatto è sincronizzato col registro Anagrafiche. */}
        <StatusBadge
          small
          label={c.place_nel_registro ? 'Sincronizzato con Anagrafiche' : 'Non nel registro'}
          colore={c.place_nel_registro ? colors.successo : colors.grigio}
        />
        <Pressable
          style={styles.archiviaBtn}
          hitSlop={8}
          onPress={onArchivia}
          accessibilityLabel={c.archiviato ? 'Ripristina contatto' : 'Archivia contatto'}
        >
          <Ionicons name={c.archiviato ? 'arrow-undo-outline' : 'archive-outline'} size={16} color={colors.grigio} />
        </Pressable>
      </View>
      {c.archiviato ? <Text style={styles.archiviatoTag}>Archiviato · comunicato ad Anagrafiche</Text> : null}
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
      {/* Storyline: a che punto è questo negozio nel percorso verso cliente. */}
      <View style={styles.percorso}>
        <PercorsoCliente stato={c.place_stato} inTrattativa={c.place_in_trattativa} />
      </View>
      <View style={styles.azioni}>
        {c.telefono ? (
          <Pressable style={styles.azione} onPress={() => Linking.openURL(`tel:${c.telefono}`)}>
            <Text style={styles.azioneTxt}>
              <Ionicons name="call-outline" size={13} color={colors.testoSoft} /> {c.telefono}
            </Text>
          </Pressable>
        ) : null}
        {c.email ? (
          <Pressable style={styles.azione} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
            <Text style={styles.azioneTxt}>
              <Ionicons name="mail-outline" size={13} color={colors.testoSoft} /> {c.email}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabArchiviato: { color: colors.grigio, textDecorationLine: 'line-through' },
  tabNegozio: { color: colors.testo, fontSize: 13, textDecorationLine: 'underline' },
  tabContatto: { color: colors.testo, fontSize: 12.5 },
  tabMuto: { color: colors.grigio, fontSize: 12.5 },
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
    borderRadius: radius.m,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  // Barra filtri (stato + interessi)
  // Gruppi impilati e chip che vanno a capo, come in Clienti: in riga i gruppi
  // sforavano lo schermo e meta' degli interessi non si vedeva.
  filtri: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  gruppo: { marginBottom: 2 },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  // Toggle rapidi
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 6 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleOn: { backgroundColor: colors.ink },
  toggleTxt: { color: colors.testoSoft, fontSize: 13, fontWeight: '600' },
  toggleTxtOn: { color: colors.bianco },
  azzera: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  azzeraTxt: { color: colors.testoSoft, fontSize: 13, fontWeight: '600' },
  conteggio: { color: colors.testoSoft, fontSize: 12, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm },
  // Annulla il padding del contenitore attorno alla testata.
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 4,
  },
  cardArchiviato: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.navy },
  archiviaBtn: { padding: 2 },
  archiviatoTag: { color: colors.grigio, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  meta: { color: colors.testoSoft, fontSize: 13 },
  negozio: { color: colors.navy, fontSize: 14, fontWeight: '600', marginTop: 2 },
  lineaTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  lineaTagTxt: { color: colors.testoSoft, fontWeight: '600', fontSize: 12 },
  percorso: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.grigioChiaro },
  azioni: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  azione: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  azioneTxt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
});
