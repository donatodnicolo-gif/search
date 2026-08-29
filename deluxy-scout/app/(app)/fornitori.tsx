// FORNITORI — i partner del registro con un rapporto di fornitura in piedi
// (`statoFornitore`: abituale / da provare / da evitare). Lo stato lo scrive
// la riconciliazione del Customer Service quando un fornitore prepara un
// ordine e viene pagato: non è prospezione, è gente che ha GIÀ lavorato per
// noi — e per il commerciale è la lista più calda da trasformare in affiliato.
//
// ⚠️ Si legge LIVE dal registro Anagrafiche (regola d'oro: nessuna copia).
// La copia in Scout nasce solo con «Prendi in carico», collegata per
// anagrafiche_id — lo stesso giro di Segnalazioni CS.
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { fetchFornitori, STATI_FORNITORE, type PartnerRegistro } from '@/lib/anagrafiche';
import { fetchAnagraficheIdPresi, importaDalRegistro } from '@/lib/db';
import { geocodeIndirizzo } from '@/lib/geocode';
import { avvisa } from '@/lib/dialoghi';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, dataBreve, type ColonnaTabella } from '@/components/Tabella';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { CampoCerca, EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
import { COLORE_VISITA } from '@/lib/statoVisita';

const LABEL_FORNITORE: Record<string, string> = {
  abituale: 'Abituale',
  da_provare: 'Da provare',
  da_evitare: 'Da evitare',
};
const COLORE_FORNITORE: Record<string, string> = {
  abituale: colors.successo,
  da_provare: colors.attenzione,
  da_evitare: colors.errore,
};

export default function Fornitori() {
  const router = useRouter();
  // Da 900px in su l'elenco è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [partner, setPartner] = useState<PartnerRegistro[]>([]);
  const [presi, setPresi] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [parziale, setParziale] = useState(false);
  const [statoFiltro, setStatoFiltro] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [r, ids] = await Promise.all([
        fetchFornitori(),
        fetchAnagraficheIdPresi().catch(() => new Set<string>()),
      ]);
      setPartner(r.partner);
      setParziale(r.parziale);
      setPresi(ids);
    } catch (e: any) {
      setErrore(e?.message ?? 'Registro non raggiungibile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  // Come in Segnalazioni CS: senza coordinate un negozio non può stare sulla
  // mappa, quindi si geocodifica l'indirizzo (ripiego: la città; ripiego del
  // ripiego: entra a 0,0 e si sistema dopo — meglio che perderlo).
  async function prendiInCarico(p: PartnerRegistro) {
    setInCorso(p.id);
    try {
      const indirizzo = [p.indirizzo, p.citta, p.provincia].filter(Boolean).join(', ');
      let lat = 0;
      let lng = 0;
      try {
        const g = await geocodeIndirizzo(indirizzo || p.citta || p.nome);
        lat = g.lat;
        lng = g.lng;
      } catch {
        // Meglio un negozio senza posizione che un negozio perso.
      }
      const place = await importaDalRegistro({
        anagraficheId: p.id,
        nome: p.nome,
        indirizzo: p.indirizzo,
        citta: p.citta,
        categoria: p.categoria,
        lat,
        lng,
        linee: p.interessi ?? [],
      });
      setPresi((s) => new Set(s).add(p.id));
      router.push(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      avvisa('Non è stato possibile prenderlo in carico', e?.message ?? 'Riprova fra poco.');
    } finally {
      setInCorso(null);
    }
  }

  // I chip mostrano solo gli stati che esistono davvero fra i fornitori.
  const statiPresenti = useMemo(
    () => STATI_FORNITORE.filter((s) => partner.some((p) => p.statoFornitore === s)),
    [partner],
  );
  // Ricerca su ogni elenco (Libro v1.9 §8-bis — mancava, 28/08/2026).
  const [cerca, setCerca] = useState('');
  const dati = useMemo(() => {
    const base = statoFiltro ? partner.filter((p) => p.statoFornitore === statoFiltro) : partner;
    const q = cerca.trim().toLowerCase();
    if (!q) return base;
    const nrm = (v: unknown) => String(v ?? '').toLowerCase();
    return base.filter((p) => [p.nome, p.citta, p.categoria].some((v) => nrm(v).includes(q)));
  }, [partner, statoFiltro, cerca]);

  // Le stesse azioni nei due vestiti (scheda e tabella), scritte una volta.
  const azioniDi = (p: PartnerRegistro) => {
    const preso = presi.has(p.id);
    return (
      <AzioniRiga>
        <IconaAzione
          nome="call-outline"
          attiva={Boolean(p.telefono)}
          label={p.telefono ? 'Chiama' : 'Nessun telefono nel registro'}
          onPress={() => p.telefono && Linking.openURL(`tel:${p.telefono}`)}
        />
        <IconaAzione
          nome="logo-whatsapp"
          attiva={Boolean(p.telefono)}
          label={p.telefono ? 'WhatsApp' : 'Nessun telefono nel registro'}
          onPress={() => p.telefono && Linking.openURL(`https://wa.me/${p.telefono!.replace(/[^0-9]/g, '')}`)}
        />
        <IconaAzione
          nome="mail-outline"
          attiva={Boolean(p.email)}
          label={p.email ? 'Email' : 'Nessuna mail nel registro'}
          onPress={() => p.email && Linking.openURL(`mailto:${p.email}`)}
        />
        <IconaAzione
          nome={preso ? 'checkmark-done-outline' : 'download-outline'}
          attiva={!preso && inCorso !== p.id}
          evidenza={preso}
          label={preso ? 'Già fra i tuoi Selezionati' : 'Prendi in carico'}
          onPress={() => prendiInCarico(p)}
        />
      </AzioniRiga>
    );
  };

  const colonne: ColonnaTabella<PartnerRegistro>[] = [
    {
      chiave: 'nome',
      label: 'Nome',
      flex: 1.4,
      valore: (p) => p.nome,
      cella: (p) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {p.nome}
        </Text>
      ),
    },
    {
      chiave: 'dove',
      label: 'Dove',
      flex: 0.8,
      valore: (p) => [p.citta, p.provincia].filter(Boolean).join(' · ') || null,
    },
    { chiave: 'categoria', label: 'Categoria', width: 100, valore: (p) => p.categoria ?? null },
    {
      chiave: 'fornitore',
      label: 'Fornitore',
      width: 100,
      valore: (p) => p.statoFornitore ?? null,
      cella: (p) =>
        p.statoFornitore ? (
          <StatusBadge
            small
            label={LABEL_FORNITORE[p.statoFornitore] ?? p.statoFornitore}
            colore={COLORE_FORNITORE[p.statoFornitore] ?? colors.grigio}
          />
        ) : (
          <Text style={styles.tabMuto}>—</Text>
        ),
    },
    {
      // Da quando è nostro fornitore = quando è entrato nel registro. ⚠️ Per i
      // riversati in blocco (25/08/2026) è la data del riversamento.
      chiave: 'dal',
      label: 'Dal',
      width: 78,
      destra: true,
      numerica: true,
      valore: (p) => p.creatoIl ?? null,
      cella: (p) => <Text style={styles.tabData}>{dataBreve(p.creatoIl)}</Text>,
    },
    {
      chiave: 'stato',
      label: 'In Scout',
      width: 104,
      valore: (p) => (presi.has(p.id) ? 1 : 0),
      cella: (p) =>
        presi.has(p.id) ? (
          <StatusBadge small label="Già in lista" colore={COLORE_VISITA.fatta} />
        ) : (
          <StatusBadge small label="Da prendere" colore={colors.attenzione} />
        ),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      <View style={styles.headerScroll}>
        <PageIntro testo="I nostri fornitori, letti live dal registro Anagrafiche: chi ha già preparato ordini per noi ed è stato pagato dal Customer Service, più quelli segnati a mano. Sono i contatti più caldi da affiliare: hanno già lavorato con Deluxy." />
        <View style={{ marginBottom: 10 }}>
          <CampoCerca valore={cerca} onCambia={setCerca} placeholder="Cerca per nome, città, categoria…" />
        </View>
      </View>

      {statiPresenti.length > 1 ? (
        <RigaChips style={styles.chips}>
          <Chip label={`Tutti (${partner.length})`} on={!statoFiltro} onPress={() => setStatoFiltro(null)} />
          {statiPresenti.map((s) => (
            <Chip
              key={s}
              label={`${LABEL_FORNITORE[s]} (${partner.filter((p) => p.statoFornitore === s).length})`}
              on={statoFiltro === s}
              onPress={() => setStatoFiltro((c) => (c === s ? null : s))}
            />
          ))}
        </RigaChips>
      ) : null}

      {errore ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
        </Text>
      ) : null}

      {parziale ? (
        <Text style={styles.avviso}>
          <Ionicons name="information-circle-outline" size={13} color={colors.testo} /> Elenco possibilmente
          incompleto: il registro sta rispondendo senza il filtro per stato fornitore. Si risolve
          rilanciando il deploy della funzione `anagrafiche`.
        </Text>
      ) : null}

      {!loading && !errore && !partner.length ? (
        <EmptyState
          loading={false}
          icona="cube-outline"
          titolo="Nessun fornitore nel registro"
          aiuto="Qui compaiono i partner con uno stato di fornitura (abituale, da provare, da evitare). Lo scrive il Customer Service quando paga un fornitore."
        />
      ) : null}

      {aTabella && dati.length ? (
        <Tabella
          righe={dati}
          colonne={colonne}
          chiaveRiga={(p) => p.id}
          ordineIniziale={{ campo: 'nome', verso: 'asc' }}
          azioni={azioniDi}
          larghezzaAzioni={186}
        
            totali={(righe) => ({
              nome: `Totale · ${righe.length} ${righe.length === 1 ? 'fornitore' : 'fornitori'}`,
            })}
          />
      ) : (
        dati.map((p) => {
          const preso = presi.has(p.id);
          const dove = [p.citta, p.provincia].filter(Boolean).join(' · ');
          return (
            <CardElenco
              key={p.id}
              icona={p.categoria === 'PASTICCERIA' ? 'cafe-outline' : 'flower-outline'}
              nome={p.nome}
              meta={[dove, p.categoria].filter(Boolean).join(' — ') || null}
              tag={p.interessi ?? []}
              badge={
                <>
                  {p.statoFornitore ? (
                    <StatusBadge
                      small
                      label={LABEL_FORNITORE[p.statoFornitore] ?? p.statoFornitore}
                      colore={COLORE_FORNITORE[p.statoFornitore] ?? colors.grigio}
                    />
                  ) : null}
                  {preso ? (
                    <StatusBadge small label="Già in lista" colore={COLORE_VISITA.fatta} />
                  ) : (
                    <StatusBadge small label="Da prendere" colore={colors.attenzione} />
                  )}
                </>
              }
              extra={
                p.creatoIl ? (
                  <Text style={styles.fonte} numberOfLines={1}>
                    <Ionicons name="cash-outline" size={11} color={colors.grigio} /> Fornitore dal{' '}
                    {dataBreve(p.creatoIl)}
                  </Text>
                ) : null
              }
              azioni={azioniDi(p)}
            />
          );
        })
      )}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.grigioChiaro, backgroundColor: colors.bianco, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  errore: {
    color: colors.errore,
    fontWeight: '600',
    fontSize: 13,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    padding: spacing.lg,
  },
  avviso: {
    color: colors.testo,
    fontSize: 12.5,
    lineHeight: 18,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
  },
  fonte: { fontSize: 12, color: colors.grigio, fontWeight: '600' },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tabMuto: { color: colors.grigio, fontSize: 12.5 },
});
