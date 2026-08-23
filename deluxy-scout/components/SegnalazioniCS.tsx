// Segnalazioni CS — i potenziali che **un'altra app** ha già trovato.
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
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { fetchSegnalatiDaApp, type PartnerRegistro } from '@/lib/anagrafiche';
import { fetchAnagraficheIdPresi, importaDalRegistro } from '@/lib/db';
import { geocodeIndirizzo } from '@/lib/geocode';
import { avvisa } from '@/lib/dialoghi';
import { CardElenco } from '@/components/CardElenco';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { COLORE_VISITA, LABEL_VISITA } from '@/lib/statoVisita';

/** L'app che li segnala. Oggi una sola; il giorno che diventano due, questa
 *  schermata cambia solo qui. */
const FONTE = 'deluxy-suppliers';

export function SegnalazioniCS() {
  const router = useRouter();
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
        fetchSegnalatiDaApp(FONTE),
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, contenutoCentrato]}
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
          fioristi e pasticcerie in ordine alfabetico. Si risolve rilanciando il deploy della funzione
          `anagrafiche`.
        </Text>
      ) : null}

      {!loading && !errore && !partner.length ? (
        <EmptyState
          loading={false}
          icona="cube-outline"
          titolo="Nessuna segnalazione"
          aiuto="Quando l'app fornitori trova un fiorista o una pasticceria nuova, compare qui. Se sei sicuro che ce ne siano, controlla che la funzione `anagrafiche` sia aggiornata: il filtro per fonte è arrivato dopo."
        />
      ) : null}

      {partner.map((p) => {
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
                <Ionicons name="cube-outline" size={11} color={colors.grigio} /> Segnalato dall’app fornitori
                {p.stato ? ` · nel registro è «${p.stato}»` : ''}
              </Text>
            }
            azioni={
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
            }
          />
        );
      })}

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
  conteggio: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'center', marginTop: spacing.sm },
});
