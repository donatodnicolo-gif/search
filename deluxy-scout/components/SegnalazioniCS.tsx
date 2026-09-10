// Segnalazioni CS — i potenziali che **un'altra app** ha già trovato.
//
// ⚠️⚠️ Dal 25/08/2026 le fonti sono DUE: l'app fornitori (che li cerca) e il
// Customer Service (che li ha già fatti lavorare e pagati). I secondi erano
// gli unici a non arrivare qui, in una schermata che si chiama «Segnalazioni
// CS» — e sono i piu' caldi: non un negozio trovato su una mappa, ma uno che
// ha gia' preparato un ordine per noi.
//
// ⭐ Dal 10/09/2026 (richiesta dell'utente) c'è una TERZA lista: i partner che
// il Customer Service USA come fornitori di ordini (`statoFornitore` nel
// registro: abituale / da provare / da evitare) — gli stessi della schermata
// Fornitori — qualunque sia la `fonte` con cui sono entrati nel registro. E
// ogni riga mostra gli ORDINI che il CS gli ha affidato negli ultimi 30 e 180
// giorni, col venduto (letti dal CS via la Edge `customer-service`).
//
// ⚠️ Il nome della voce di menu è cambiato (era «Segnalati · Fornitori»), la
// rotta no: resta `/segnalati`, così i link già in giro continuano a valere.
//
// L'app fornitori (deluxy-suppliers) cerca fioristi e pasticcerie in tutta
// Italia e li scrive nel registro Anagrafiche come `prospect` con interesse
// Affiliazioni. Erano già lì da giorni, ma in Scout non li vedeva nessuno:
// il registro si leggeva solo per cercare la corrispondenza di un negozio che
// si aveva già. Questa schermata li mostra e permette di prenderli in carico.
//
// ⚠️ Si legge **live** dal registro, non si copia: la regola d'oro è che la
// fonte di verità delle anagrafiche è una sola. La copia in Scout nasce solo
// quando qualcuno preme «Prendi in carico», e resta collegata (anagrafiche_id).
import { useCallback, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { etichettaFonte, fetchFornitori, fetchSegnalatiDaApp, type PartnerRegistro } from '@/lib/anagrafiche';
import { fetchAnagraficheIdPresi, importaDalRegistro } from '@/lib/db';
import { fetchVenditeFornitori, type EsitoVenditeFornitori } from '@/lib/customer-service';
import { venditeDi, type IndiceVendite } from '@/lib/vendite-fornitori';
import { geocodeIndirizzo } from '@/lib/geocode';
import { avvisa } from '@/lib/dialoghi';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, dataBreve, type ColonnaTabella } from '@/components/Tabella';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { CellaVendite, RigaVendite, StatoVendite } from '@/components/VenditeFornitore';
import { SchedaRegistroModal } from '@/components/SchedaRegistroModal';
import { CampoCerca, Chip, EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
import { COLORE_VISITA, LABEL_VISITA } from '@/lib/statoVisita';

/** Le app che segnalano, e come si chiamano a schermo.
 *
 * ⚠️⚠️ Il Customer Service è stato aggiunto il 25/08/2026: la schermata si
 * chiama «Segnalazioni CS» e i suoi non ci comparivano. Sono i contatti più
 * caldi che abbiamo — un fioraio che ha già preparato un ordine per noi e che
 * abbiamo già pagato — e finivano nel registro senza che chi va a visitarli lo
 * sapesse. */
const FONTI = ['deluxy-suppliers', 'customer-service'] as const;

/** Le tre liste di questa schermata, per il filtro. `fornitore` = chi il CS
 *  usa come fornitore di ordini (statoFornitore), da qualunque fonte. */
type Lista = 'deluxy-suppliers' | 'customer-service' | 'fornitore';

const LABEL_LISTA: Record<Lista, string> = {
  'deluxy-suppliers': 'Dall’app fornitori',
  'customer-service': 'Pagati dal CS',
  fornitore: 'Fornitori del CS',
};

const LABEL_FORNITORE: Record<string, string> = {
  abituale: 'abituale',
  da_provare: 'da provare',
  da_evitare: 'da evitare',
};

/** Il perché di ogni riga, detto per esteso. */
function daDove(p: PartnerRegistro): string {
  if (p.statoFornitore) {
    return `Fornitore ${LABEL_FORNITORE[p.statoFornitore] ?? p.statoFornitore} del Customer Service`;
  }
  if (p.fonte === 'customer-service') return 'Ha già preparato un ordine, ed è stato pagato';
  if (p.fonte === 'deluxy-suppliers') return 'Segnalato dall’app fornitori';
  return `Segnalato da ${etichettaFonte(p.fonte)}`;
}

function listeDi(p: PartnerRegistro): Lista[] {
  const l: Lista[] = [];
  if (p.fonte === 'deluxy-suppliers') l.push('deluxy-suppliers');
  if (p.fonte === 'customer-service') l.push('customer-service');
  if (p.statoFornitore) l.push('fornitore');
  return l;
}

export function SegnalazioniCS() {
  const router = useRouter();
  // Da 900px in su l'elenco è una TABELLA (richiesta utente 25/08/2026: le
  // schede restano solo sul telefono) — lo stesso confine delle Trattative.
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [partner, setPartner] = useState<PartnerRegistro[]>([]);
  const [presi, setPresi] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  // Il click sulla riga apre i dati del registro in un foglio (10/09/2026).
  const [registroAperto, setRegistroAperto] = useState<PartnerRegistro | null>(null);
  // true = il registro non ha potuto filtrare per fonte e l'elenco può essere
  // monco. Va detto: una lista incompleta che sembra completa fa credere che
  // il lavoro sia finito.
  const [parziale, setParziale] = useState(false);
  const [vendite, setVendite] = useState<EsitoVenditeFornitori | null>(null);
  const [lista, setLista] = useState<Lista | null>(null);
  const [cerca, setCerca] = useState('');

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [r, f, ids, v] = await Promise.all([
        fetchSegnalatiDaApp([...FONTI]),
        // I fornitori del CS (statoFornitore): una lettura a parte, perché il
        // registro filtra per fonte O per stato, non per tutti e due.
        fetchFornitori().catch(() => ({ partner: [] as PartnerRegistro[], parziale: true })),
        fetchAnagraficheIdPresi().catch(() => new Set<string>()),
        fetchVenditeFornitori(180),
      ]);
      // ⚠️ Deduplica per id: lo stesso partner può essere «pagato dal CS»
      // (fonte) E fornitore abituale (stato). È una riga sola; le liste a cui
      // appartiene si leggono dai suoi campi (`listeDi`).
      const visti = new Map<string, PartnerRegistro>();
      for (const p of [...r.partner, ...f.partner]) {
        const gia = visti.get(p.id);
        visti.set(p.id, gia ? { ...gia, ...p, statoFornitore: gia.statoFornitore ?? p.statoFornitore } : p);
      }
      setPartner([...visti.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it')));
      setParziale(r.parziale || f.parziale);
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

  async function prendiInCarico(p: PartnerRegistro) {
    setInCorso(p.id);
    try {
      // Il registro non tiene le coordinate: senza, il negozio non potrebbe
      // stare sulla mappa (`places.lat` è obbligatoria). Si geocodifica
      // l'indirizzo; se non basta, si ripiega sulla città.
      const indirizzo = [p.indirizzo, p.citta, p.provincia].filter(Boolean).join(', ');
      let lat = 0;
      let lng = 0;
      try {
        const g = await geocodeIndirizzo(indirizzo || p.citta || p.nome);
        lat = g.lat;
        lng = g.lng;
      } catch {
        // Meglio un negozio senza posizione che un negozio perso: entra in
        // lista comunque, e sulla mappa si sistema dopo.
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

  const conteggi = useMemo(() => {
    const c: Record<Lista, number> = { 'deluxy-suppliers': 0, 'customer-service': 0, fornitore: 0 };
    for (const p of partner) for (const l of listeDi(p)) c[l]++;
    return c;
  }, [partner]);

  // Ricerca su ogni elenco (Libro v1.9 §8-bis) + il filtro per lista.
  const dati = useMemo(() => {
    const base = lista ? partner.filter((p) => listeDi(p).includes(lista)) : partner;
    const q = cerca.trim().toLowerCase();
    if (!q) return base;
    const nrm = (v: unknown) => String(v ?? '').toLowerCase();
    return base.filter((p) => [p.nome, p.citta, p.provincia, p.categoria, daDove(p)].some((v) => nrm(v).includes(q)));
  }, [partner, lista, cerca]);

  const daPrendere = dati.filter((p) => !presi.has(p.id));

  // Le stesse quattro azioni in tutti e due i vestiti (scheda e tabella):
  // scritte una volta, o divergono al primo ritocco.
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

  // ⚠️ Categoria e linee stanno SOTTO il nome: con «30 gg» e «180 gg» le
  // colonne sarebbero nove (lezione degli Ordini: ogni colonna in più toglie
  // pixel al nome).
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
          {p.categoria || p.interessi?.length ? (
            <Text style={styles.tabSotto} numberOfLines={1}>
              {[p.categoria, p.interessi?.length ? p.interessi.join(', ') : null].filter(Boolean).join(' · ')}
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
      chiave: 'fonte',
      label: 'Da dove',
      flex: 1.1,
      righe: 2,
      valore: (p) => daDove(p),
    },
    {
      // QUANDO è stato segnalato = quando è entrato nel registro (`creatoIl`).
      // ⚠️ Per i 15 fornitori del Customer Service riversati il 25/08/2026 la
      // data è quella del riversamento, non del pagamento: il registro non
      // sapeva di loro prima.
      chiave: 'segnalato',
      label: 'Segnalato',
      width: 82,
      destra: true,
      numerica: true,
      valore: (p) => p.creatoIl ?? null,
      cella: (p) => <Text style={styles.tabData}>{dataBreve(p.creatoIl)}</Text>,
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
      label: 'Stato',
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
        <PageIntro testo="Chi un'altra app ha già trovato o fatto lavorare: i negozi segnalati dall'app fornitori, quelli pagati dal Customer Service e i fornitori a cui il CS affida gli ordini — con quanti ordini hanno avuto negli ultimi 30 e 180 giorni. Si leggono live dal registro Anagrafiche; «Prendi in carico» li porta in Scout." />
      </View>

      <View style={styles.zonaFiltri}>
        <CampoCerca valore={cerca} onCambia={setCerca} placeholder="Cerca per nome, città, categoria, provenienza…" />
        <RigaChips>
          <Chip label={`Tutti (${partner.length})`} on={!lista} onPress={() => setLista(null)} title="Tutte le segnalazioni" />
          {(Object.keys(LABEL_LISTA) as Lista[]).map((l) => (
            <Chip
              key={l}
              label={`${LABEL_LISTA[l]} (${conteggi[l]})`}
              on={lista === l}
              onPress={() => setLista((c) => (c === l ? null : l))}
              title={
                l === 'fornitore'
                  ? 'I partner che il Customer Service usa come fornitori di ordini (abituali, da provare, da evitare)'
                  : l === 'customer-service'
                    ? 'Chi ha già preparato un ordine per noi ed è stato pagato'
                    : 'Fioristi e pasticcerie trovati dall’app fornitori'
              }
            />
          ))}
        </RigaChips>
        <StatoVendite esito={vendite} />
      </View>

      {errore ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
        </Text>
      ) : null}

      {/* Se il registro non ha potuto filtrare per fonte, l'elenco qui sotto
          è quello che si è riusciti a recuperare per categoria — non
          necessariamente tutto. Dirlo è il minimo. */}
      {parziale ? (
        <Text style={styles.avviso}>
          <Ionicons name="information-circle-outline" size={13} color={colors.testo} /> Elenco possibilmente
          incompleto: il registro sta rispondendo senza il filtro per fonte o per stato fornitore, quindi si vedono
          solo i primi fioristi e pasticcerie in ordine alfabetico — e i fornitori del Customer Service possono
          mancare. Si risolve rilanciando il deploy della funzione `anagrafiche`.
        </Text>
      ) : null}

      {!loading && !errore && !partner.length ? (
        <EmptyState
          loading={false}
          icona="cube-outline"
          titolo="Nessuna segnalazione"
          aiuto="Compare qui chi trova l'app fornitori, chi il Customer Service ha già fatto lavorare e pagato, e i fornitori a cui affida gli ordini. Se sei sicuro che ce ne siano, controlla che la funzione `anagrafiche` sia aggiornata: il filtro per fonte è arrivato dopo."
        />
      ) : null}

      {!loading && !errore && partner.length && !dati.length ? (
        <EmptyState loading={false} icona="funnel-outline" titolo="Nessuna segnalazione passa i filtri" aiuto="Prova ad allargare la ricerca o a togliere un filtro." />
      ) : null}

      {aTabella && dati.length ? (
        <Tabella
          righe={dati}
          colonne={colonne}
          chiaveRiga={(p) => p.id}
          // Le segnalazioni più fresche in cima: è una coda, non una rubrica.
          ordineIniziale={{ campo: 'segnalato', verso: 'desc' }}
          // Il click apre i dati del registro in un foglio, dentro Scout.
          onRiga={(p) => setRegistroAperto(p)}
          labelRiga={(p) => `Vedi i dati di ${p.nome} dal registro`}
          azioni={azioniDi}
          larghezzaAzioni={186}
          totali={(righe) => ({
            nome: `Totale · ${righe.length} ${righe.length === 1 ? 'segnalato' : 'segnalati'}`,
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
              // Rosso: nessuno c'è ancora andato. È lo stesso semaforo delle
              // altre liste (lib/statoVisita.ts).
              coloreIcona={preso ? undefined : COLORE_VISITA.da_fare}
              titoloIcona={preso ? undefined : LABEL_VISITA.da_fare}
              nome={p.nome}
              meta={[dove, p.categoria].filter(Boolean).join(' — ') || null}
              tag={p.interessi ?? []}
              badge={
                preso ? (
                  <StatusBadge small label="Già in lista" colore={COLORE_VISITA.fatta} />
                ) : (
                  <StatusBadge small label="Da prendere" colore={colors.attenzione} />
                )
              }
              extra={
                <View style={styles.extra}>
                  <Text style={styles.fonte} numberOfLines={2}>
                    <Ionicons
                      name={p.statoFornitore || p.fonte === 'customer-service' ? 'cash-outline' : 'cube-outline'}
                      size={11}
                      color={colors.grigio}
                    />{' '}
                    {daDove(p)}
                    {p.creatoIl ? ` · il ${dataBreve(p.creatoIl)}` : ''}
                    {p.stato ? ` · nel registro è «${p.stato}»` : ''}
                  </Text>
                  <RigaVendite v={venditeDiP(p)} giorniLunga={giorniLunga} />
                </View>
              }
              azioni={azioniDi(p)}
            />
          );
        })
      )}

      {daPrendere.length ? (
        <Text style={styles.conteggio}>
          {daPrendere.length} da prendere in carico su {dati.length} {lista ? LABEL_LISTA[lista].toLowerCase() : 'segnalati'}
        </Text>
      ) : null}
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
  fonte: { fontSize: 12, color: colors.grigio, fontWeight: '600', lineHeight: 17 },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabSotto: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  conteggio: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'center', marginTop: spacing.sm },
});
