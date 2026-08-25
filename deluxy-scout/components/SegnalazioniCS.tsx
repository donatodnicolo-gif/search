// Segnalazioni CS — i potenziali che **un'altra app** ha già trovato.
//
// ⚠️⚠️ Dal 25/08/2026 le fonti sono DUE: l'app fornitori (che li cerca) e il
// Customer Service (che li ha già fatti lavorare e pagati). I secondi erano
// gli unici a non arrivare qui, in una schermata che si chiama «Segnalazioni
// CS» — e sono i piu' caldi: non un negozio trovato su una mappa, ma uno che
// ha gia' preparato un ordine per noi.
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
import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { fetchSegnalatiDaApp, type PartnerRegistro } from '@/lib/anagrafiche';
import { fetchAnagraficheIdPresi, importaDalRegistro } from '@/lib/db';
import { geocodeIndirizzo } from '@/lib/geocode';
import { avvisa } from '@/lib/dialoghi';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { COLORE_VISITA, LABEL_VISITA } from '@/lib/statoVisita';

/** Le app che segnalano, e come si chiamano a schermo.
 *
 * ⚠️⚠️ Il Customer Service è stato aggiunto il 25/08/2026: la schermata si
 * chiama «Segnalazioni CS» e i suoi non ci comparivano. Sono i contatti più
 * caldi che abbiamo — un fioraio che ha già preparato un ordine per noi e che
 * abbiamo già pagato — e finivano nel registro senza che chi va a visitarli lo
 * sapesse. */
const FONTI = ['deluxy-suppliers', 'customer-service'] as const;

const DA_DOVE: Record<string, string> = {
  'deluxy-suppliers': 'Segnalato dall’app fornitori',
  'customer-service': 'Ha già preparato un ordine, ed è stato pagato',
};

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
  // true = il registro non ha potuto filtrare per fonte e l'elenco può essere
  // monco. Va detto: una lista incompleta che sembra completa fa credere che
  // il lavoro sia finito.
  const [parziale, setParziale] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [r, ids] = await Promise.all([
        fetchSegnalatiDaApp([...FONTI]),
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

  const daPrendere = partner.filter((p) => !presi.has(p.id));

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
    { chiave: 'categoria', label: 'Categoria', width: 110, valore: (p) => p.categoria ?? null },
    {
      chiave: 'linee',
      label: 'Linee',
      flex: 0.7,
      valore: (p) => (p.interessi?.length ? p.interessi.join(', ') : null),
    },
    {
      chiave: 'fonte',
      label: 'Da dove',
      flex: 1.1,
      righe: 2,
      valore: (p) => DA_DOVE[p.fonte ?? ''] ?? 'Segnalato da un’altra app',
    },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 110,
      valore: (p) => (presi.has(p.id) ? 1 : 0),
      cella: (p) =>
        presi.has(p.id) ? (
          <StatusBadge small label="Già in lista" colore={COLORE_VISITA.fatta} />
        ) : (
          <StatusBadge small label="Da prendere" colore={colors.oro} />
        ),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
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
          incompleto: il registro sta rispondendo senza il filtro per fonte, quindi si vedono solo i primi
          fioristi e pasticcerie in ordine alfabetico — e i fornitori pagati dal Customer Service non si
          vedono affatto. Si risolve rilanciando il deploy della funzione `anagrafiche`.
        </Text>
      ) : null}

      {!loading && !errore && !partner.length ? (
        <EmptyState
          loading={false}
          icona="cube-outline"
          titolo="Nessuna segnalazione"
          aiuto="Compare qui chi trova l'app fornitori e chi il Customer Service ha già fatto lavorare e pagato. Se sei sicuro che ce ne siano, controlla che la funzione `anagrafiche` sia aggiornata: il filtro per fonte è arrivato dopo."
        />
      ) : null}

      {aTabella && partner.length ? (
        <Tabella
          righe={partner}
          colonne={colonne}
          chiaveRiga={(p) => p.id}
          ordineIniziale={{ campo: 'nome', verso: 'asc' }}
          azioni={azioniDi}
          larghezzaAzioni={186}
        />
      ) : (
        partner.map((p) => {
          const preso = presi.has(p.id);
          const dove = [p.citta, p.provincia].filter(Boolean).join(' · ');
          return (
            <CardElenco
              key={p.id}
              icona={p.categoria === 'PASTICCERIA' ? 'cafe-outline' : 'flower-outline'}
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
                  <StatusBadge small label="Da prendere" colore={colors.oro} />
                )
              }
              extra={
                <Text style={styles.fonte} numberOfLines={1}>
                  <Ionicons
                    name={p.fonte === 'customer-service' ? 'cash-outline' : 'cube-outline'}
                    size={11}
                    color={colors.grigio}
                  />{' '}
                  {DA_DOVE[p.fonte ?? ''] ?? 'Segnalato da un’altra app'}
                  {p.stato ? ` · nel registro è «${p.stato}»` : ''}
                </Text>
              }
              azioni={azioniDi(p)}
            />
          );
        })
      )}

      {daPrendere.length ? (
        <Text style={styles.conteggio}>
          {daPrendere.length} da prendere in carico su {partner.length} segnalati
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  errore: {
    color: colors.errore,
    fontWeight: '600',
    fontSize: 13,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avviso: {
    color: colors.testo,
    fontSize: 12.5,
    lineHeight: 18,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  fonte: { fontSize: 12, color: colors.grigio, fontWeight: '600' },
  tabNome: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  conteggio: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'center', marginTop: spacing.sm },
});
