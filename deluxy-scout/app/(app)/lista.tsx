import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import { aggiornaNascosto } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { applicaFiltri, usePlaces } from '@/lib/usePlaces';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { Filters, FILTRI_VUOTI, type FiltriMappa } from '@/components/Filters';
import { PriorityBadge } from '@/components/PriorityBadge';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { coloreLivello, LABEL_LIVELLO, LIVELLI, livelloDi, type Livello } from '@/lib/livelli';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';
import { VisitaModal } from '@/components/VisitaModal';

// Le "viste" del menu: ogni voce di Contatti apre /lista già filtrata.
// "inattivi" = dormienti + persi, la scheda dei rapporti da riattivare.
type Vista = 'prospect' | 'lead' | 'cliente' | 'inattivi';
const LIVELLI_VISTA: Record<Vista, Livello[]> = {
  prospect: ['prospect'],
  lead: ['lead'],
  cliente: ['cliente'],
  inattivi: ['dormiente', 'perso'],
};
const TITOLO_VISTA: Record<Vista, string> = {
  prospect: 'Selezionati — scelti con la ⭐, ancora da contattare: l’azione è la visita.',
  lead: 'Prospect — sentiti o visitati: l’azione è tenere caldo il rapporto (mail con script).',
  cliente: 'Clienti — hanno chiuso una trattativa.',
  inattivi: 'Dormienti e persi — rapporti da riattivare o da capire perché non sono partiti.',
};

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

export default function Lista() {
  const router = useRouter();
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const { places, loading, opzioni, ricarica } = usePlaces();
  const [filtri, setFiltri] = useState<FiltriMappa>(FILTRI_VUOTI);
  const { vista } = useLocalSearchParams<{ vista?: string }>();
  const vistaCorr = (['prospect', 'lead', 'cliente', 'inattivi'] as Vista[]).includes(vista as Vista)
    ? (vista as Vista)
    : null;
  const livelliVista = vistaCorr ? LIVELLI_VISTA[vistaCorr] : null;
  const [query, setQuery] = useState('');
  // Dentro la vista si può ancora affinare per singolo livello (es. dormiente vs perso).
  const [livello, setLivello] = useState<Livello | null>(null);
  // Cambiando voce di menu (vista) si azzera il sotto-filtro.
  useEffect(() => setLivello(null), [vista]);
  // "Invia mail" su un Prospect: scegli lo script (o creane uno) → schermata invio.
  const [mailPlace, setMailPlace] = useState<Place | null>(null);
  // La visita: stessa finestra della Mappa (VisitaModal), non una pagina a parte.
  const [visitaPlace, setVisitaPlace] = useState<Place | null>(null);

  async function nascondi(place: Place) {
    try {
      await aggiornaNascosto(place.id, true);
      ricarica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile rimuovere il target.');
    }
  }

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = applicaFiltri(places, filtri)
      .filter((p) => !p.nascosto) // i target "non interessanti" non compaiono qui
      // Target = SOLO i negozi messi in lista da una persona (decisione utente
      // 23/07/2026). I record senza `creato_da` — scoperta Google e import da
      // terminale — restano nel database e sulla Mappa, ma qui non entrano:
      // erano migliaia e rendevano la lista inutilizzabile.
      .filter((p) => Boolean(p.creato_da))
      .filter((p) => (livelliVista ? livelliVista.includes(livelloDi(p)) : true))
      .filter((p) => (livello ? livelloDi(p) === livello : true))
      .filter((p) => {
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        (p.indirizzo ?? '').toLowerCase().includes(q) ||
        (p.categoria ?? '').toLowerCase().includes(q) ||
        (p.zona ?? '').toLowerCase().includes(q) ||
        (p.linea_ipotizzata ?? '').toLowerCase().includes(q)
      );
    });
    return [...f].sort((a, b) => RANK[a.priorita] - RANK[b.priorita] || a.nome.localeCompare(b.nome));
  }, [places, filtri, query, livello, livelliVista]);

  // Quanti ce ne sono per livello (i numeri sui chip: dicono dove sta il lavoro).
  const perLivello = useMemo(() => {
    const c: Record<string, number> = { prospect: 0, lead: 0, cliente: 0, dormiente: 0, perso: 0 };
    for (const p of places) {
      if (p.nascosto || !p.creato_da) continue;
      c[livelloDi(p)] += 1;
    }
    return c;
  }, [places]);

  // I chip: dentro una vista mostro solo i suoi livelli, e solo se più d'uno.
  const chipLivelli = livelliVista ?? LIVELLI;
  const mostraChip = chipLivelli.length > 1;

  return (
    <View style={styles.container}>
      <PageIntro
        testo={
          vistaCorr
            ? TITOLO_VISTA[vistaCorr]
            : 'I negozi che qualcuno ha scelto di lavorare. SELEZIONATO: con la ⭐, da contattare. PROSPECT: contatto avviato. CLIENTE: ha chiuso una trattativa.'
        }
      />
      {mostraChip ? (
      <View style={styles.livelli}>
        <ChipLivello label="Tutti" on={!livello} onPress={() => setLivello(null)} />
        {chipLivelli.map((l) => (
          <ChipLivello
            key={l}
            label={`${LABEL_LIVELLO[l]}${perLivello[l] ? ` (${perLivello[l]})` : ''}`}
            on={livello === l}
            colore={coloreLivello(l)}
            onPress={() => setLivello((c) => (c === l ? null : l))}
          />
        ))}
      </View>
      ) : null}
      <View style={styles.filterBar}>
        <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} admin={admin} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per nome, indirizzo, zona, linea…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={dati}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={ricarica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="flag-outline"
            titolo="Nessun negozio in lista"
            aiuto="Qui entrano solo i negozi che scegli tu: mettili in lista dalla Mappa con la ⭐ (diventano PROSPECT), oppure creane uno col bottone +. Se pensavi di trovarne, prova ad azzerare filtri e ricerca."
            azione="Vai alla Mappa"
            onAzione={() => router.push('/(app)/mappa')}
          />
        }
        renderItem={({ item }) => (
          <Riga
            place={item}
            vista={vistaCorr}
            onPress={() => router.push(`/(app)/attivita/${item.id}`)}
            onNascondi={() => nascondi(item)}
            onVisita={() => setVisitaPlace(item)}
            onMail={() => setMailPlace(item)}
          />
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/(app)/nuovo-target')} accessibilityLabel="Nuovo target">
        <Ionicons name="add" size={30} color={colors.bianco} />
      </Pressable>
      {mailPlace ? <ScegliScriptModal place={mailPlace} onClose={() => setMailPlace(null)} /> : null}
      <VisitaModal place={visitaPlace} onClose={() => setVisitaPlace(null)} onDone={() => { setVisitaPlace(null); ricarica(); }} />
    </View>
  );
}

function ChipLivello({ label, on, colore, onPress }: { label: string; on: boolean; colore?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chipLiv, on && styles.chipLivOn, on && colore ? { backgroundColor: colore, borderColor: colore } : null]}
    >
      <Text style={[styles.chipLivTxt, on && styles.chipLivTxtOn]}>{label}</Text>
    </Pressable>
  );
}

/** "il 12 lug 26": quando il target è entrato nella lista. */
function dataInserimento(iso: string | null | undefined): string {
  if (!iso) return 'in data non registrata';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'in data non registrata';
  return `il ${d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })}`;
}

/** Da quale account (utente) arriva il target. I record senza `creato_da` non
 *  sono stati inseriti da una persona loggata: o li ha scoperti Google (Edge
 *  Function, service role) o vengono dagli import iniziali da terminale. */
function origineInserimento(place: Place): string {
  if (place.creato_da_nome) return `da ${place.creato_da_nome}`;
  if (place.source === 'google') return 'dalla scoperta Google';
  return 'da import iniziale';
}

function Riga({
  place,
  vista,
  onPress,
  onNascondi,
  onVisita,
  onMail,
}: {
  place: Place;
  vista: Vista | null;
  onPress: () => void;
  onNascondi: () => void;
  onVisita: () => void;
  onMail: () => void;
}) {
  // L'azione giusta per il livello: un Selezionato si VISITA, un Prospect si
  // tiene caldo con una MAIL (script a scelta o nuovo).
  const azione =
    vista === 'prospect'
      ? { label: 'Visita', icona: 'walk-outline' as const, onPress: onVisita }
      : vista === 'lead'
        ? { label: 'Mail', icona: 'mail-outline' as const, onPress: onMail }
        : null;
  return (
    <Pressable style={styles.riga} onPress={onPress}>
      <View style={styles.rigaHead}>
        <PriorityBadge priorita={place.priorita} small />
        <Text style={styles.nome} numberOfLines={1}>
          {place.nome}
        </Text>
        <StatusBadge small label={LABEL_LIVELLO[livelloDi(place)]} colore={coloreLivello(livelloDi(place))} />
        {azione ? (
          <Pressable
            style={styles.rigaAzione}
            hitSlop={6}
            onPress={(e) => {
              (e as any)?.stopPropagation?.();
              azione.onPress();
            }}
            accessibilityLabel={azione.label}
          >
            <Ionicons name={azione.icona} size={14} color={colors.bianco} />
            <Text style={styles.rigaAzioneTxt}>{azione.label}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.nascondi}
          hitSlop={8}
          onPress={(e) => {
            (e as any)?.stopPropagation?.();
            onNascondi();
          }}
          accessibilityLabel="Rimuovi target (nascondi)"
        >
          <Ionicons name="eye-off-outline" size={18} color={colors.grigio} />
        </Pressable>
      </View>
      {place.linea_ipotizzata ? (
        <View style={styles.lineaTag}>
          <Text style={styles.lineaTagTxt}>{place.linea_ipotizzata}</Text>
        </View>
      ) : null}
      {place.indirizzo ? <Text style={styles.indirizzo} numberOfLines={1}>{place.indirizzo}</Text> : null}
      <View style={styles.metaPersone}>
        {place.anagrafiche_account ? (
          <View style={styles.accountTag}>
            <Ionicons name="briefcase-outline" size={11} color={colors.goldStrong} />
            <Text style={styles.accountTagTxt} numberOfLines={1}>Account: {place.anagrafiche_account}</Text>
          </View>
        ) : null}
        <Text style={styles.inserito} numberOfLines={1}>
          <Ionicons name="person-outline" size={11} color={colors.grigio} /> Inserito{' '}
          {dataInserimento(place.created_at)} · {origineInserimento(place)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  livelli: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  rigaAzione: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  rigaAzioneTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12 },
  chipLiv: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipLivOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipLivTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipLivTxtOn: { color: colors.bianco },
  container: { flex: 1, backgroundColor: colors.sfondo },
  filterBar: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  search: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  list: { padding: spacing.md, gap: spacing.sm },
  riga: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 6,
  },
  rigaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.navy },
  stato: { fontSize: 12, color: colors.testoSoft, fontWeight: '600' },
  nascondi: { padding: 2 },
  // "Tipologia di interesse" = linea Deluxy, come tag oro.
  lineaTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  indirizzo: { fontSize: 13, color: colors.grigio },
  metaPersone: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  accountTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  accountTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12 },
  inserito: { fontSize: 12, color: colors.grigio, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontSize: 30, fontWeight: '400', marginTop: -2 },
});
