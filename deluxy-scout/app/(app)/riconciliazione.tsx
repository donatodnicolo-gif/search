// RICONCILIAZIONE — le cose che il computer non può decidere da solo.
//
// Due schede, stessa natura: un dato che c'è ma non basta, e una persona che
// deve guardarlo. Stanno insieme perché si presidiano insieme — ci si passa
// mezz'ora e se ne esce puliti — ma restano separate perché le azioni sono
// diverse: là si scrive un indirizzo, qui si decide se due schede sono lo
// stesso negozio.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { avvisa, conferma } from '@/lib/dialoghi';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { AddressSearch } from '@/components/AddressSearch';
import {
  AIUTO_VERDETTO,
  COLORE_VERDETTO,
  fetchCoppieDuplicate,
  fetchSenzaPosizione,
  ignoraCoppia,
  salvaPosizione,
  unisciCoppia,
  avvisoRegistro,
  type CoppiaDuplicata,
  type SenzaPosizione,
} from '@/lib/riconciliazione';

type Scheda = 'posizione' | 'doppioni';

export default function Riconciliazione() {
  const [scheda, setScheda] = useState<Scheda>('posizione');
  const [senza, setSenza] = useState<SenzaPosizione[]>([]);
  const [coppie, setCoppie] = useState<CoppiaDuplicata[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    // Le due liste sono indipendenti: se una non c'è, l'altra si vede lo stesso.
    const [a, b] = await Promise.all([
      fetchSenzaPosizione().catch((e) => {
        setErrore(String(e?.message ?? e));
        return [] as SenzaPosizione[];
      }),
      // ⚠️ L'errore NON si ingoia. Il 21/08/2026 la funzione ha superato il
      // tetto di 8 secondi di PostgREST e questa schermata mostrava
      // «Doppioni 0»: un guasto travestito da buona notizia. Se la ricerca non
      // riesce si deve leggere perché.
      fetchCoppieDuplicate().catch((e) => {
        const m = String(e?.message ?? e);
        setErrore(
          /timeout|57014/i.test(m)
            ? 'La ricerca dei doppioni ha impiegato troppo e il server l’ha interrotta: l’elenco qui sotto è vuoto per questo, non perché non ci siano doppioni.'
            : m,
        );
        return [] as CoppiaDuplicata[];
      }),
    ]);
    setSenza(a);
    setCoppie(b);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // La ricerca vale per tutte e due le schede: si arriva qui sapendo QUALE
  // negozio si vuole sistemare, non per scorrere duecento righe.
  const q = query.trim().toLowerCase();
  const senzaFiltrati = useMemo(
    () =>
      q
        ? senza.filter((r) =>
            [r.nome, r.indirizzo, r.zona, r.categoria].some((v) => (v ?? '').toLowerCase().includes(q)),
          )
        : senza,
    [senza, q],
  );
  const coppieFiltrate = useMemo(
    () =>
      q
        ? coppie.filter((c) =>
            [c.tiene, c.togli, c.citta, c.indirizzo_tiene, c.indirizzo_togli].some((v) =>
              (v ?? '').toLowerCase().includes(q),
            ),
          )
        : coppie,
    [coppie, q],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      <View style={styles.headerScroll}>
        <PageIntro testo="Quello che va sistemato a mano: negozi arrivati dal registro senza un indirizzo da mettere sulla mappa, e schede che forse sono lo stesso negozio. Nessuna delle due si può decidere in automatico senza fare danni." />
      </View>

      <View style={styles.tab}>
        <Bottone
          on={scheda === 'posizione'}
          label={`Senza posizione${senza.length ? ` (${senza.length})` : ''}`}
          onPress={() => setScheda('posizione')}
        />
        <Bottone
          on={scheda === 'doppioni'}
          label={`Doppioni${coppie.length ? ` (${coppie.length})` : ''}`}
          onPress={() => setScheda('doppioni')}
        />
      </View>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Cerca per nome, indirizzo, città…"
        placeholderTextColor={colors.grigio}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      {/* Con un filtro attivo un elenco corto sembra un elenco che ha perso i
          dati: si dice sempre quante righe si stanno guardando su quante. */}
      {q ? (
        <Text style={styles.conto}>
          {scheda === 'posizione'
            ? `${senzaFiltrati.length} di ${senza.length} senza posizione`
            : `${coppieFiltrate.length} di ${coppie.length} coppie`}
        </Text>
      ) : null}

      {errore ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
        </Text>
      ) : null}

      {scheda === 'posizione' ? (
        <SenzaPosizioneLista righe={senzaFiltrati} loading={loading} onFatto={carica} />
      ) : (
        <DoppioniLista righe={coppieFiltrate} loading={loading} onFatto={carica} />
      )}
    </ScrollView>
  );
}

function Bottone({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabBtn, on && styles.tabBtnOn]}>
      <Text style={[styles.tabTxt, on && styles.tabTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function SenzaPosizioneLista({
  righe,
  loading,
  onFatto,
}: {
  righe: SenzaPosizione[];
  loading: boolean;
  onFatto: () => Promise<void>;
}) {
  const [aperto, setAperto] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  if (!righe.length) {
    return (
      <EmptyState
        loading={loading}
        icona="location-outline"
        titolo="Nessun negozio senza posizione"
        aiuto="Quando dal registro arriva un'anagrafica senza indirizzo, compare qui: entra comunque in Scout, ma sulla mappa non ci può stare finché non le si dà un punto."
      />
    );
  }

  return (
    <>
      <Text style={styles.spiega}>
        Sono entrati lo stesso — meglio dentro e da sistemare che fuori e invisibili — ma senza un punto non stanno
        sulla mappa e non entrano nei giri. Cerca l&apos;indirizzo: appena lo salvi, la riga sparisce da qui.
      </Text>
      {righe.map((p) => (
        <View key={p.id} style={styles.card}>
          <Pressable style={styles.cardTesta} onPress={() => setAperto(aperto === p.id ? null : p.id)}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.nome} numberOfLines={2}>{p.nome}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[p.zona, p.categoria].filter(Boolean).join(' · ') || 'Nessuna città nel registro'}
              </Text>
              {/* Se un indirizzo c'è ma non è bastato, dirlo evita di ricopiarlo
                  uguale: è già stato provato e non l'ha trovato nessuno. */}
              {p.indirizzo ? <Text style={styles.metaDebole} numberOfLines={2}>Nel registro: {p.indirizzo}</Text> : null}
            </View>
            <Ionicons name={aperto === p.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.testoSoft} />
          </Pressable>

          {aperto === p.id ? (
            <View style={styles.form}>
              <AddressSearch
                placeholder="Cerca l'indirizzo…"
                onSelect={async (r) => {
                  setSalvo(true);
                  try {
                    await salvaPosizione(p.id, { lat: r.lat, lng: r.lng, indirizzo: r.formatted_address });
                    await onFatto();
                  } catch (e) {
                    avvisa('Non è stato salvato', (e as Error)?.message ?? 'Riprova.');
                  } finally {
                    setSalvo(false);
                  }
                }}
              />
              {salvo ? <ActivityIndicator size="small" color={colors.testoSoft} /> : null}
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

function DoppioniLista({
  righe,
  loading,
  onFatto,
}: {
  righe: CoppiaDuplicata[];
  loading: boolean;
  onFatto: () => Promise<void>;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);

  if (!righe.length) {
    return (
      <EmptyState
        loading={loading}
        icona="git-merge-outline"
        titolo="Nessun doppione da guardare"
        aiuto="Se la migrazione 0058 non è ancora applicata, questa lista resta vuota anche quando i doppioni ci sono."
      />
    );
  }

  return (
    <>
      <Text style={styles.spiega}>
        Il verdetto lo decide la <Text style={styles.forte}>distanza</Text>, non il nome: «Gucci» esiste a Milano, Roma
        e Firenze e sono negozi diversi. Unendo, la scheda del registro resta e si prende contatti, visite e trattative
        dell&apos;altra.
      </Text>
      {righe.map((c) => {
        const chiave = `${c.tiene_id}-${c.togli_id}`;
        return (
          <View key={chiave} style={styles.card}>
            <View style={styles.cardTesta}>
              <StatusBadge small label={c.verdetto} colore={COLORE_VERDETTO[c.verdetto]} />
              <Text style={styles.distanza}>{c.metri != null ? `${c.metri} m` : 'distanza ignota'}</Text>
            </View>
            <Text style={styles.aiutoVerdetto}>{AIUTO_VERDETTO[c.verdetto]}</Text>

            <Pressable onPress={() => router.push(`/(app)/attivita/${c.tiene_id}`)}>
              <Text style={styles.riga} numberOfLines={2}>
                <Text style={styles.forte}>Resta</Text> · {c.tiene}
              </Text>
              {c.indirizzo_tiene ? <Text style={styles.metaDebole} numberOfLines={1}>{c.indirizzo_tiene}</Text> : null}
            </Pressable>
            <Pressable onPress={() => router.push(`/(app)/attivita/${c.togli_id}`)}>
              <Text style={styles.riga} numberOfLines={2}>
                <Text style={styles.forte}>Sparisce</Text> · {c.togli}
              </Text>
              {c.indirizzo_togli ? <Text style={styles.metaDebole} numberOfLines={1}>{c.indirizzo_togli}</Text> : null}
            </Pressable>

            <View style={styles.azioni}>
              <Pressable
                style={[styles.btnPri, inCorso === chiave && styles.off]}
                disabled={inCorso === chiave}
                onPress={() =>
                  conferma(
                    'Sono lo stesso negozio?',
                    `«${c.togli}» sparisce e tutto quello che ha — contatti, visite, trattative — passa a «${c.tiene}». Non si torna indietro.\n\nSe il doppione è anche nel registro Anagrafiche, vengono unite pure lì (la scheda scartata viene archiviata, non cancellata).`,
                    async () => {
                      setInCorso(chiave);
                      try {
                        const esito = await unisciCoppia(c.tiene_id, c.togli_id);
                        await onFatto();
                        const nota = avvisoRegistro(esito);
                        if (nota) avvisa(nota.titolo, nota.testo);
                      } catch (e) {
                        avvisa('Non è stato unito', (e as Error)?.message ?? 'Riprova.');
                      } finally {
                        setInCorso(null);
                      }
                    },
                    { testoConferma: 'Unisci', distruttivo: true },
                  )
                }
              >
                <Text style={styles.btnPriTxt}>Uniscili</Text>
              </Pressable>
              <Pressable
                style={styles.btnSec}
                disabled={inCorso === chiave}
                onPress={async () => {
                  setInCorso(chiave);
                  try {
                    await ignoraCoppia(c.tiene_id, c.togli_id);
                    await onFatto();
                  } finally {
                    setInCorso(null);
                  }
                }}
              >
                <Text style={styles.btnSecTxt}>Sono diversi</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  tab: { flexDirection: 'row', gap: spacing.sm, marginBottom: 2 },
  tabBtn: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabBtnOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabTxt: { color: colors.testo, fontWeight: '700', fontSize: 13 },
  tabTxtOn: { color: colors.bianco },
  spiega: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  forte: { color: colors.testo, fontWeight: '700' },
  search: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    color: colors.testo,
    fontSize: 14,
  },
  conto: { color: colors.testoSoft, fontSize: 12, marginTop: -4 },
  errore: { color: colors.errore, fontWeight: '600', fontSize: 13, backgroundColor: colors.bianco, borderRadius: radius.m, padding: spacing.lg },
  card: { backgroundColor: colors.bianco, borderRadius: radius.l, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.lg, gap: 4 },
  cardTesta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { color: colors.navy, fontWeight: '700', fontSize: 15 },
  meta: { color: colors.testoSoft, fontSize: 12.5 },
  metaDebole: { color: colors.grigio, fontSize: 12, lineHeight: 16 },
  distanza: { color: colors.testoSoft, fontWeight: '700', fontSize: 12.5, marginLeft: 'auto' },
  aiutoVerdetto: { color: colors.testoSoft, fontSize: 12, lineHeight: 16, marginBottom: 2 },
  riga: { color: colors.testo, fontSize: 14, marginTop: 4 },
  form: { gap: 8, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: spacing.sm },
  azioni: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  btnPri: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 10 },
  btnPriTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
  btnSec: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  btnSecTxt: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  off: { opacity: 0.5 },
});
