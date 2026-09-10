// FORNITORI — i partner del registro con un rapporto di fornitura in piedi
// (`statoFornitore`: abituale / da provare / da evitare). Lo stato lo scrive
// la riconciliazione del Customer Service quando un fornitore prepara un
// ordine e viene pagato: non è prospezione, è gente che ha GIÀ lavorato per
// noi — e per il commerciale è la lista più calda da trasformare in affiliato.
//
// ⚠️ Si legge LIVE dal registro Anagrafiche (regola d'oro: nessuna copia).
// La copia in Scout nasce solo con «Prendi in carico», collegata per
// anagrafiche_id — lo stesso giro di Segnalazioni CS.
//
// ⭐ Dal 10/09/2026 (richiesta dell'utente) ogni riga dice DA CHI PROVIENE
// (`fonte` del registro) e QUANTI ORDINI gli ha affidato il Customer Service
// negli ultimi 30 e 180 giorni, con il venduto. I numeri li conta il CS
// (`GET /api/v1/fornitori`, via la Edge `customer-service`): qui si agganciano
// per id del registro, in ripiego per nome (`lib/vendite-fornitori.ts`).
// Senza chiave collegata le due colonne restano vuote e la riga di stato
// dice dove incollarla — l'elenco dei fornitori si vede comunque.
import { useCallback, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { etichettaFonte, fetchFornitori, STATI_FORNITORE, type PartnerRegistro } from '@/lib/anagrafiche';
import { fetchAnagraficheIdPresi, importaDalRegistro } from '@/lib/db';
import { fetchVenditeFornitori, type EsitoVenditeFornitori } from '@/lib/customer-service';
import { fornitoriNonNelRegistro, venditeDi, type IndiceVendite } from '@/lib/vendite-fornitori';
import { geocodeIndirizzo } from '@/lib/geocode';
import { avvisa } from '@/lib/dialoghi';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, dataBreve, type ColonnaTabella } from '@/components/Tabella';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { CellaVendite, FornitoriFuoriRegistro, RigaVendite, StatoVendite } from '@/components/VenditeFornitore';
import { SchedaRegistroModal } from '@/components/SchedaRegistroModal';
import { CampoCerca, Chip, EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
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

/** Il filtro «con ordini»: 30 o 180 giorni, oltre allo stato di fornitura. */
type FiltroOrdini = null | '30' | 'lunga';

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
  // Il click sulla riga apre i dati del registro in un foglio (10/09/2026).
  const [registroAperto, setRegistroAperto] = useState<PartnerRegistro | null>(null);
  const [parziale, setParziale] = useState(false);
  const [statoFiltro, setStatoFiltro] = useState<string | null>(null);
  const [filtroOrdini, setFiltroOrdini] = useState<FiltroOrdini>(null);
  const [vendite, setVendite] = useState<EsitoVenditeFornitori | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      // Le tre letture sono indipendenti: il registro (i fornitori), Scout
      // (chi è già in lista) e il Customer Service (gli ordini). Il CS non
      // lancia mai: se non risponde, l'elenco si vede lo stesso.
      const [r, ids, v] = await Promise.all([
        fetchFornitori(),
        fetchAnagraficheIdPresi().catch(() => new Set<string>()),
        fetchVenditeFornitori(180),
      ]);
      setPartner(r.partner);
      setParziale(r.parziale);
      setPresi(ids);
      setVendite(v);
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

  const indice: IndiceVendite | null = vendite?.ok ? vendite.indice : null;
  const giorniLunga = indice?.giorniLunga ?? 180;
  const venditeDiP = useCallback((p: PartnerRegistro) => venditeDi(p, indice), [indice]);
  const fuoriRegistro = useMemo(() => fornitoriNonNelRegistro(indice, partner), [indice, partner]);

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
  const conOrdini30 = useMemo(() => partner.filter((p) => (venditeDiP(p)?.ordini30 ?? 0) > 0).length, [partner, venditeDiP]);
  const conOrdiniLunga = useMemo(() => partner.filter((p) => (venditeDiP(p)?.ordiniLunga ?? 0) > 0).length, [partner, venditeDiP]);

  // Ricerca su ogni elenco (Libro v1.9 §8-bis — mancava, 28/08/2026).
  const [cerca, setCerca] = useState('');
  const dati = useMemo(() => {
    let base = statoFiltro ? partner.filter((p) => p.statoFornitore === statoFiltro) : partner;
    if (filtroOrdini === '30') base = base.filter((p) => (venditeDiP(p)?.ordini30 ?? 0) > 0);
    if (filtroOrdini === 'lunga') base = base.filter((p) => (venditeDiP(p)?.ordiniLunga ?? 0) > 0);
    const q = cerca.trim().toLowerCase();
    if (!q) return base;
    const nrm = (v: unknown) => String(v ?? '').toLowerCase();
    return base.filter((p) => [p.nome, p.citta, p.categoria, etichettaFonte(p.fonte)].some((v) => nrm(v).includes(q)));
  }, [partner, statoFiltro, filtroOrdini, cerca, venditeDiP]);

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

  // ⚠️ La categoria sta SOTTO il nome, non in una colonna: con «Da», «30 gg» e
  // «180 gg» le colonne sarebbero nove, e la lezione degli Ordini è che ogni
  // colonna in più toglie pixel al nome.
  const colonne: ColonnaTabella<PartnerRegistro>[] = [
    {
      chiave: 'nome',
      label: 'Nome',
      flex: 1.5,
      valore: (p) => p.nome,
      cella: (p) => (
        <View>
          <Text style={styles.tabNome} numberOfLines={2}>
            {p.nome}
          </Text>
          {p.categoria ? (
            <Text style={styles.tabSotto} numberOfLines={1}>
              {p.categoria}
            </Text>
          ) : null}
        </View>
      ),
    },
    {
      chiave: 'dove',
      label: 'Dove',
      flex: 0.8,
      valore: (p) => [p.citta, p.provincia].filter(Boolean).join(' · ') || null,
    },
    {
      chiave: 'fornitore',
      label: 'Fornitore',
      width: 104,
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
      // Da chi proviene (`fonte` del registro) e da quando è nostro fornitore
      // (quando è entrato nel registro). ⚠️ Per i riversati in blocco
      // (25/08/2026) è la data del riversamento.
      chiave: 'da',
      label: 'Da · dal',
      width: 150,
      valore: (p) => etichettaFonte(p.fonte),
      cella: (p) => (
        <View>
          <Text style={styles.tabFonte} numberOfLines={1}>
            {etichettaFonte(p.fonte)}
          </Text>
          <Text style={styles.tabSotto} numberOfLines={1}>
            dal {dataBreve(p.creatoIl)}
          </Text>
        </View>
      ),
    },
    {
      chiave: 'ordini30',
      label: '30 gg',
      width: 96,
      destra: true,
      numerica: true,
      valore: (p) => venditeDiP(p)?.ordini30 ?? null,
      cella: (p) => {
        const v = venditeDiP(p);
        return <CellaVendite ordini={v?.ordini30 ?? 0} venduto={v?.venduto30 ?? 0} />;
      },
    },
    {
      chiave: 'ordiniLunga',
      label: `${giorniLunga} gg`,
      width: 96,
      destra: true,
      numerica: true,
      valore: (p) => venditeDiP(p)?.ordiniLunga ?? null,
      cella: (p) => {
        const v = venditeDiP(p);
        return <CellaVendite ordini={v?.ordiniLunga ?? 0} venduto={v?.vendutoLunga ?? 0} />;
      },
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

  const filtriAttivi = Boolean(statoFiltro || filtroOrdini || cerca.trim());

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      <View style={styles.headerScroll}>
        <PageIntro testo="I nostri fornitori, letti live dal registro Anagrafiche: chi ha già preparato ordini per noi ed è stato pagato dal Customer Service, più quelli segnati a mano. Sono i contatti più caldi da affiliare: hanno già lavorato con Deluxy." />
      </View>

      <View style={styles.zonaFiltri}>
        <CampoCerca valore={cerca} onCambia={setCerca} placeholder="Cerca per nome, città, categoria, provenienza…" />
        <RigaChips>
          <Chip label={`Tutti (${partner.length})`} on={!statoFiltro} onPress={() => setStatoFiltro(null)} title="Tutti i fornitori del registro" />
          {statiPresenti.map((s) => (
            <Chip
              key={s}
              label={`${LABEL_FORNITORE[s]} (${partner.filter((p) => p.statoFornitore === s).length})`}
              on={statoFiltro === s}
              onPress={() => setStatoFiltro((c) => (c === s ? null : s))}
              title={`Solo i fornitori «${LABEL_FORNITORE[s]}»`}
            />
          ))}
          {indice ? (
            <>
              <Chip
                label={`Con ordini 30 gg (${conOrdini30})`}
                on={filtroOrdini === '30'}
                onPress={() => setFiltroOrdini((c) => (c === '30' ? null : '30'))}
                title="Solo chi ha ricevuto almeno un ordine dal Customer Service negli ultimi 30 giorni"
              />
              <Chip
                label={`Con ordini ${giorniLunga} gg (${conOrdiniLunga})`}
                on={filtroOrdini === 'lunga'}
                onPress={() => setFiltroOrdini((c) => (c === 'lunga' ? null : 'lunga'))}
                title={`Solo chi ha ricevuto almeno un ordine dal Customer Service negli ultimi ${giorniLunga} giorni`}
              />
            </>
          ) : null}
        </RigaChips>
        <StatoVendite esito={vendite} />
      </View>

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

      <FornitoriFuoriRegistro fuori={fuoriRegistro} giorniLunga={giorniLunga} />

      {!loading && !errore && !partner.length ? (
        <EmptyState
          loading={false}
          icona="cube-outline"
          titolo="Nessun fornitore nel registro"
          aiuto="Qui compaiono i partner con uno stato di fornitura (abituale, da provare, da evitare). Lo scrive il Customer Service quando paga un fornitore."
        />
      ) : null}

      {!loading && !errore && partner.length && !dati.length ? (
        <EmptyState
          loading={false}
          icona="funnel-outline"
          titolo="Nessun fornitore passa i filtri"
          aiuto={filtriAttivi ? 'Prova ad allargare la ricerca o a togliere un filtro.' : undefined}
        />
      ) : null}

      {aTabella && dati.length ? (
        <Tabella
          righe={dati}
          colonne={colonne}
          chiaveRiga={(p) => p.id}
          // Chi lavora di più in cima, quando i numeri ci sono; se no per nome.
          ordineIniziale={indice ? { campo: 'ordiniLunga', verso: 'desc' } : { campo: 'nome', verso: 'asc' }}
          // Il click apre i dati del registro in un foglio, dentro Scout.
          onRiga={(p) => setRegistroAperto(p)}
          labelRiga={(p) => `Vedi i dati di ${p.nome} dal registro`}
          azioni={azioniDi}
          larghezzaAzioni={186}
          totali={(righe) => ({
            nome: `Totale · ${righe.length} ${righe.length === 1 ? 'fornitore' : 'fornitori'}`,
            ordini30: indice ? String(righe.reduce((s, p) => s + (venditeDiP(p)?.ordini30 ?? 0), 0)) : null,
            ordiniLunga: indice ? String(righe.reduce((s, p) => s + (venditeDiP(p)?.ordiniLunga ?? 0), 0)) : null,
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
              onPress={() => setRegistroAperto(p)}
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
                <View style={styles.extra}>
                  <Text style={styles.fonte} numberOfLines={1}>
                    <Ionicons name="cash-outline" size={11} color={colors.grigio} /> Da {etichettaFonte(p.fonte)}
                    {p.creatoIl ? ` · fornitore dal ${dataBreve(p.creatoIl)}` : ''}
                  </Text>
                  <RigaVendite v={venditeDiP(p)} giorniLunga={giorniLunga} />
                </View>
              }
              azioni={azioniDi(p)}
            />
          );
        })
      )}
      {registroAperto ? (
        <SchedaRegistroModal
          partner={registroAperto}
          vendite={venditeDiP(registroAperto)}
          giorniLunga={giorniLunga}
          preso={presi.has(registroAperto.id)}
          inCorso={inCorso === registroAperto.id}
          onClose={() => setRegistroAperto(null)}
          onPrendiInCarico={(p) => {
            setRegistroAperto(null);
            prendiInCarico(p);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  // La zona filtri (Libro §8): ricerca, chip su una riga che scorre, e la riga
  // di stato che dice da dove vengono i numeri. Tetto: due righe più lo stato.
  zonaFiltri: { gap: spacing.sm, marginBottom: spacing.xs },
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
  extra: { gap: 2 },
  fonte: { fontSize: 12, color: colors.grigio, fontWeight: '600' },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabSotto: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  tabFonte: { color: colors.testo, fontSize: 12.5, fontWeight: '600' },
  tabMuto: { color: colors.grigio, fontSize: 12.5 },
});
