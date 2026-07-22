// Andamento → Storico: le visite fatte, per GIORNO, con l'account (venditore), il
// negozio e la via. Filtri per account e città.
import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import type { EsitoVisita } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { EmptyState, PageIntro } from '@/components/ui';
import { fetchStorico, type VisitaStorico } from '@/lib/db';
import { OPZIONI_CITTA, passaFiltroCitta } from '@/lib/citta';

const LABEL_ESITO: Record<EsitoVisita, string> = {
  interessato: 'Interessato',
  da_richiamare: 'Da richiamare',
  non_target: 'Non target',
  chiuso: 'Cliente',
};
const COLORE_ESITO: Record<EsitoVisita, string> = {
  interessato: colors.blue,
  da_richiamare: colors.attenzione,
  non_target: colors.errore,
  chiuso: colors.successo,
};

// "Via" = prima parte dell'indirizzo (prima della virgola con città/CAP).
const viaDi = (indirizzo: string | null) => (indirizzo ?? '').split(',')[0].trim();

function giornoLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}
const oraDi = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const PERIODI: { label: string; giorni: number }[] = [
  { label: '7 giorni', giorni: 7 },
  { label: '30 giorni', giorni: 30 },
  { label: '90 giorni', giorni: 90 },
  { label: 'Tutto', giorni: 0 },
];

export default function Storico() {
  const [visite, setVisite] = useState<VisitaStorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountFiltro, setAccountFiltro] = useState<string | null>(null);
  const [cittaFiltro, setCittaFiltro] = useState<string | null>(null);
  const [periodoGiorni, setPeriodoGiorni] = useState(30); // default: ultimi 30 giorni

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setVisite(await fetchStorico());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const accountPresenti = useMemo(
    () => [...new Set(visite.map((v) => v.owner_nome).filter(Boolean) as string[])].sort(),
    [visite],
  );

  // Applica i filtri e raggruppa per GIORNO (già ordinate desc dal server).
  const sezioni = useMemo(() => {
    const soglia = periodoGiorni ? Date.now() - periodoGiorni * 24 * 60 * 60 * 1000 : 0;
    const filtrate = visite.filter((v) => {
      if (soglia && new Date(v.data).getTime() < soglia) return false;
      if (accountFiltro && v.owner_nome !== accountFiltro) return false;
      if (!passaFiltroCitta(v.place_zona, cittaFiltro)) return false;
      return true;
    });
    const perGiorno = new Map<string, VisitaStorico[]>();
    for (const v of filtrate) {
      const g = v.data.slice(0, 10);
      (perGiorno.get(g) ?? perGiorno.set(g, []).get(g)!).push(v);
    }
    return [...perGiorno.entries()].map(([g, righe]) => ({
      giorno: g,
      titolo: giornoLabel(righe[0].data),
      data: righe,
    }));
  }, [visite, accountFiltro, cittaFiltro, periodoGiorni]);

  const totale = useMemo(
    () => sezioni.reduce((n, s) => n + s.data.length, 0),
    [sezioni],
  );

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <PageIntro testo="Lo storico delle visite: per giorno, con il venditore, il negozio e la via. Usa i filtri per account o città." />
        <Text style={styles.sub}>{totale} visite{accountFiltro || cittaFiltro ? ' (filtrate)' : ''}</Text>
        <View style={styles.filtri}>
          <Gruppo
            titolo="Periodo"
            valori={PERIODI.map((p) => p.label)}
            attivo={PERIODI.find((p) => p.giorni === periodoGiorni)?.label ?? 'Tutto'}
            onTap={(label) => setPeriodoGiorni(PERIODI.find((p) => p.label === label)?.giorni ?? 0)}
          />
          <Gruppo titolo="Account" valori={accountPresenti} attivo={accountFiltro} onTap={(v) => setAccountFiltro((c) => (c === v ? null : v))} />
          <Gruppo
            titolo="Città"
            valori={OPZIONI_CITTA as unknown as string[]}
            attivo={cittaFiltro ?? 'Tutte'}
            onTap={(v) => setCittaFiltro(v === 'Tutte' ? null : (c) => (c === v ? null : v))}
          />
        </View>
      </View>

      <SectionList
        sections={sezioni}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.giornoHead}>
            <Text style={styles.giornoTitolo}>{section.titolo}</Text>
            <Text style={styles.giornoConta}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.riga}>
            <View style={styles.icona}>
              <Ionicons name="location-outline" size={16} color={colors.goldStrong} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.negozio} numberOfLines={1}>{item.place_nome}</Text>
              <Text style={styles.via} numberOfLines={1}>
                {viaDi(item.place_indirizzo) || '—'}{item.place_zona ? ` · ${item.place_zona}` : ''}
              </Text>
              <View style={styles.metaRow}>
                {item.owner_nome ? (
                  <View style={styles.accountTag}>
                    <Ionicons name="person-outline" size={11} color={colors.testoSoft} />
                    <Text style={styles.accountTxt}>{item.owner_nome}</Text>
                  </View>
                ) : null}
                {item.esito ? (
                  <View style={styles.esitoTag}>
                    <View style={[styles.dot, { backgroundColor: COLORE_ESITO[item.esito] }]} />
                    <Text style={[styles.esitoTxt, { color: COLORE_ESITO[item.esito] }]}>{LABEL_ESITO[item.esito]}</Text>
                  </View>
                ) : null}
                <Text style={styles.ora}>{oraDi(item.data)}</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="time-outline"
            titolo="Nessuna visita nello storico"
            aiuto="Le visite registrate dai venditori compaiono qui, raggruppate per giorno."
          />
        }
      />
    </View>
  );
}

function Gruppo({ titolo, valori, attivo, onTap }: { titolo: string; valori: string[]; attivo: string | null; onTap: (v: string) => void }) {
  if (!valori.length) return null;
  return (
    <View style={styles.gruppo}>
      <Text style={styles.gruppoTitolo}>{titolo}</Text>
      <View style={styles.chips}>
        {valori.map((v) => {
          const on = attivo === v;
          return (
            <Text key={v} onPress={() => onTap(v)} style={[styles.chip, on && styles.chipOn]} numberOfLines={1}>
              {v}
            </Text>
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
  filtri: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  gruppo: { gap: 4 },
  gruppoTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.bianco, borderColor: colors.grigioChiaro, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, color: colors.navy, fontSize: 13, fontWeight: '600', overflow: 'hidden', maxWidth: 180 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy, color: colors.bianco },
  list: { padding: spacing.md, gap: spacing.sm },
  giornoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: 4 },
  giornoTitolo: { color: colors.testo, fontWeight: '800', fontSize: 14, letterSpacing: -0.2, textTransform: 'capitalize' },
  giornoConta: { color: colors.grigio, fontSize: 12, fontWeight: '700' },
  riga: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, marginBottom: spacing.sm },
  icona: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  negozio: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  via: { color: colors.testoSoft, fontSize: 13, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  accountTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sfondo, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  accountTxt: { color: colors.testoSoft, fontSize: 12, fontWeight: '700' },
  esitoTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  esitoTxt: { fontWeight: '800', fontSize: 12 },
  ora: { color: colors.grigio, fontSize: 12, marginLeft: 'auto' },
});
