import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import type { Place } from '@/types';
import { canonizzaLinee, LABEL_MOMENTO } from '@/types';
import { colors, radius, shadow, spacing, contenutoCentrato, contenutoExtraLargo } from '@/lib/theme';
import { aggiornaNascosto } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { applicaFiltri, usePlaces } from '@/lib/usePlaces';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { Filters, filtriVuoti, type FiltriMappa } from '@/components/Filters';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ContoRighe, EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
import { aRischio, coloreLivello, COLORE_A_RISCHIO, COLORE_PERSO, ePerso, inLavorazione, LABEL_A_RISCHIO, LABEL_LIVELLO, LABEL_PERSO, LIVELLI, livelloDi, type Livello } from '@/lib/livelli';
import { ScegliScriptModal } from '@/components/ScegliScriptModal';
import { VisitaModal } from '@/components/VisitaModal';
import { IconaAzione } from '@/components/AzioniRiga';
import { AzioniContatto } from '@/components/AzioniContatto';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { PianificaVisitaModal } from '@/components/PianificaVisitaModal';
import { IscriviSequenzaModal } from '@/components/IscriviSequenzaModal';
import { COLORE_VISITA, LABEL_VISITA, giorniDaOggi, giornoBreve, statoVisita, type StatoVisita } from '@/lib/statoVisita';
import type { RecapitoPlace } from '@/lib/db';
import { fetchVenditeFornitori, type EsitoVenditeFornitori } from '@/lib/customer-service';
import { venditeDi, type VenditeFornitore } from '@/lib/vendite-fornitori';
import { CellaVendite, RigaVendite, StatoVendite } from '@/components/VenditeFornitore';
import { dataBreve } from '@/components/Tabella';
import { etichettaFonte, fetchFornitori, fetchSegnalatiDaApp, urlSchedaRegistro, type PartnerRegistro } from '@/lib/anagrafiche';
import { assegnaAMe, fetchAnagraficheIdPresi, importaDalRegistro } from '@/lib/db';
import { geocodeIndirizzo } from '@/lib/geocode';
import { AzioniRiga } from '@/components/AzioniRiga';
import { Chip } from '@/components/ui';

/**
 * ⭐ SELEZIONATI E SEGNALAZIONI CS IN UNA TABELLA SOLA (10/09/2026, decisione
 * dell'utente: «unisci con segnalazioni cs in unica tabella, segnalazioni cs
 * rimane un filtro»). Una riga è o un negozio di Scout (`place`, scelto con la
 * ⭐) o un partner del registro segnalato da un'altra app (`registro`: l'app
 * fornitori, il Customer Service che l'ha pagato, o i fornitori a cui il CS
 * affida gli ordini) che nessuno ha ancora preso in carico — cioè un
 * selezionato che non abbiamo ancora scelto noi. Chi è già stato preso in
 * carico è un `place` con `anagrafiche_id`, e compare UNA volta.
 * La stessa lista vive ancora dentro Affiliazioni e su /segnalati.
 */
type RigaSel = { place: Place; registro?: undefined } | { place?: undefined; registro: PartnerRegistro };
type FiltroSel = 'tutti' | 'miei' | 'segnalati';
const LABEL_FILTRO_SEL: Record<FiltroSel, string> = { tutti: 'Tutti', miei: 'I miei selezionati', segnalati: 'Segnalazioni CS' };
const FONTI_SEGNALAZIONI = ['deluxy-suppliers', 'customer-service'] as const;

/** Il perché di una riga del registro, detto in breve. */
function daDoveRegistro(p: PartnerRegistro): string {
  if (p.statoFornitore) return `Fornitore del Customer Service (${p.statoFornitore.replace('_', ' ')})`;
  if (p.fonte === 'customer-service') return 'Pagato dal Customer Service';
  if (p.fonte === 'deluxy-suppliers') return 'Segnalato dall’app fornitori';
  return `Segnalato da ${etichettaFonte(p.fonte)}`;
}
const nomeDi = (r: RigaSel) => (r.place ? r.place.nome : r.registro.nome);
const dalDi = (r: RigaSel) => (r.place ? r.place.created_at ?? null : r.registro.creatoIl ?? null);
const chiaveDi = (r: RigaSel) => (r.place ? r.place.id : `reg:${r.registro.id}`);

// Le "viste" del menu: ogni voce di Contatti apre /lista già filtrata.
// "inattivi" = dormienti + persi, la scheda dei rapporti da riattivare.
//
// ⚠️ Dal 27/07/2026 i nomi delle viste coincidono con i livelli (lib/livelli.ts):
// `vista=prospect` mostra i Prospect veri, non più i Selezionati. Chi avesse un
// vecchio link salvato finisce su una lista diversa da prima — il titolo in
// cima dice sempre quale.
type Vista = 'selezionato' | 'lead' | 'prospect' | 'cliente' | 'a-rischio' | 'inattivi';
const LIVELLI_VISTA: Record<Vista, Livello[]> = {
  selezionato: ['selezionato'],
  lead: ['lead'],
  prospect: ['prospect'],
  cliente: ['cliente'],
  // «A rischio» è un taglio dentro i Clienti, non un livello a sé: compra
  // ancora, ed è il motivo per cui vale la pena occuparsene adesso. Il filtro
  // vero lo fa `aRischio()` più sotto.
  'a-rischio': ['cliente'],
  // ⚠️ Solo i dormienti (decisione utente 29/07/2026): «in Dormienti e persi ci
  // vanno solo quelli che Anagrafiche indica come dismessi». I persi restano
  // nella lista del loro livello, con il badge — vedi `ePerso` in lib/livelli.
  inattivi: ['dormiente'],
};
// Il titolo in cima alla schermata: la rotta è una sola (/lista) ma le viste
// sono cinque, e un titolo fisso contraddiceva la voce di menu da cui si era
// arrivati.
const NOME_VISTA: Record<Vista, string> = {
  selezionato: 'Selezionati',
  lead: 'Lead',
  prospect: 'Prospect',
  cliente: 'Clienti',
  'a-rischio': 'A rischio',
  inattivi: 'Dormienti',
};

const TITOLO_VISTA: Record<Vista, string> = {
  selezionato: 'Selezionati — scelti con la ⭐ da Mappa o Affiliazioni: non gli è ancora stato detto niente. L’azione è il primo contatto.',
  lead: 'Lead — c’è un contatto: una persona in rubrica, un messaggio partito, o è arrivato lui. Non ha ancora mostrato interesse: sono quelli da incalzare.',
  prospect: 'Prospect — ha risposto e c’è una trattativa aperta: qui si sta giocando qualcosa, e l’azione è portarla a casa.',
  cliente: 'Clienti — hanno chiuso una trattativa.',
  'a-rischio':
    'A rischio — compra ancora, ma i segnali peggiorano. È la finestra in cui si può ancora fare qualcosa: dopo diventa un dormiente, e riattivarlo costa molto di più. Lo stato lo mette il registro Anagrafiche.',
  inattivi:
    'Dormienti — clienti che hanno smesso di comprare (nel registro Anagrafiche sono i «dismessi»): ci conoscono e hanno già comprato, ed è la lista più redditizia da riattivare. I rapporti chiusi senza esito NON stanno qui: restano nella loro lista col badge «Perso».',
};

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

export default function Lista() {
  const router = useRouter();
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const { places, conContatto, contattati, inTrattativa, nonFatturano, conBozza, visitati, recapiti, loading, opzioni, ricarica } =
    usePlaces();
  // Il livello dipende da tre insiemi caricati una volta sola: scriverlo qui
  // evita di ripeterli a ogni chiamata e di dimenticarne uno in una delle
  // quattro (è già successo con `contattati`).
  const livelloPlace = (p: Place) =>
    livelloDi(p, conContatto.has(p.id), contattati.has(p.id), inTrattativa.has(p.id), nonFatturano.has(p.id));
  const [filtri, setFiltri] = useState<FiltriMappa>(filtriVuoti);
  const { vista, tab: tabParam } = useLocalSearchParams<{ vista?: string; tab?: string }>();
  const vistaCorr = (['selezionato', 'lead', 'prospect', 'cliente', 'a-rischio', 'inattivi'] as Vista[]).includes(vista as Vista)
    ? (vista as Vista)
    : null;
  const livelliVista = vistaCorr ? LIVELLI_VISTA[vistaCorr] : null;

  // Il filtro dei Selezionati: tutti, solo i miei, solo le Segnalazioni CS.
  // `?tab=segnalati` (i link già in giro) apre già filtrato sulle segnalazioni.
  const [filtroSel, setFiltroSel] = useState<FiltroSel>(tabParam === 'segnalati' ? 'segnalati' : 'tutti');
  useEffect(() => setFiltroSel(tabParam === 'segnalati' ? 'segnalati' : 'tutti'), [vista, tabParam]);
  const inSelezionati = vistaCorr === 'selezionato';

  // Le Segnalazioni CS: partner del registro (live, nessuna copia) segnalati
  // dall'app fornitori, pagati dal CS, o usati dal CS come fornitori. Si
  // leggono SOLO nei Selezionati. `presi` = chi è già un negozio di Scout.
  const [segnalati, setSegnalati] = useState<PartnerRegistro[]>([]);
  const [presi, setPresi] = useState<Set<string>>(new Set());
  const [segnalatiParziale, setSegnalatiParziale] = useState(false);
  const [segnalatiErrore, setSegnalatiErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const caricaSegnalati = useCallback(async () => {
    try {
      const [r, f, ids] = await Promise.all([
        fetchSegnalatiDaApp([...FONTI_SEGNALAZIONI]),
        fetchFornitori().catch(() => ({ partner: [] as PartnerRegistro[], parziale: true })),
        fetchAnagraficheIdPresi().catch(() => new Set<string>()),
      ]);
      // Deduplica per id: lo stesso partner può essere «pagato dal CS» E
      // fornitore abituale. È una riga sola.
      const visti = new Map<string, PartnerRegistro>();
      for (const p of [...r.partner, ...f.partner]) {
        const gia = visti.get(p.id);
        visti.set(p.id, gia ? { ...gia, ...p, statoFornitore: gia.statoFornitore ?? p.statoFornitore } : p);
      }
      setSegnalati([...visti.values()]);
      setPresi(ids);
      setSegnalatiParziale(r.parziale || f.parziale);
      setSegnalatiErrore(null);
    } catch (e: any) {
      setSegnalatiErrore(e?.message ?? 'Registro non raggiungibile.');
    }
  }, []);
  useEffect(() => {
    if (inSelezionati) caricaSegnalati();
  }, [inSelezionati, caricaSegnalati]);

  // «Prendi in carico»: lo stesso giro di Segnalazioni CS — senza coordinate
  // un negozio non può stare sulla mappa, quindi si geocodifica l'indirizzo
  // (ripiego: la città; ripiego del ripiego: 0,0 e si sistema dopo).
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
      ricarica();
      router.push(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      avvisa('Non è stato possibile prenderlo in carico', e?.message ?? 'Riprova fra poco.');
    } finally {
      setInCorso(null);
    }
  }

  // ⭐ Gli IMPORTI del Customer Service (10/09/2026, richiesta dell'utente:
  // «in selezionati la tabella va fatta anche con importi»): quanti ordini il
  // CS ha affidato a quel negozio negli ultimi 30 e 180 giorni, e per quanto.
  // Si leggono SOLO nei Selezionati (le altre viste non li hanno chiesti) e
  // si agganciano per id del registro o per nome (lib/vendite-fornitori.ts).
  const [vendite, setVendite] = useState<EsitoVenditeFornitori | null>(null);
  useEffect(() => {
    if (!inSelezionati) return;
    let vivo = true;
    fetchVenditeFornitori(180).then((v) => vivo && setVendite(v));
    return () => {
      vivo = false;
    };
  }, [inSelezionati]);
  const indiceVenditeCS = vendite?.ok ? vendite.indice : null;
  const giorniLunga = indiceVenditeCS?.giorniLunga ?? 180;
  const venditeDiPlace = (p: Place): VenditeFornitore | null =>
    venditeDi({ id: p.anagrafiche_id ?? '', nome: p.nome }, indiceVenditeCS);
  const venditeDiRiga = (r: RigaSel): VenditeFornitore | null =>
    r.place ? venditeDiPlace(r.place) : venditeDi({ id: r.registro.id, nome: r.registro.nome }, indiceVenditeCS);

  // Il titolo in cima segue la voce di menu da cui si arriva: la rotta è una
  // sola, ma "Prospect e Lead" fisso smentiva la voce appena premuta.
  const navigazione = useNavigation();
  useEffect(() => {
    navigazione.setOptions({ title: vistaCorr ? NOME_VISTA[vistaCorr] : 'Contatti' });
  }, [navigazione, vistaCorr]);

  const [query, setQuery] = useState('');
  // Dentro la vista si può ancora affinare per singolo livello (es. dormiente vs perso).
  const [livello, setLivello] = useState<Livello | null>(null);
  // Cambiando voce di menu (vista) si azzera il sotto-filtro.
  useEffect(() => setLivello(null), [vista]);
  // "Invia mail" su un Prospect: scegli lo script (o creane uno) → schermata invio.
  const [mailPlace, setMailPlace] = useState<Place | null>(null);
  // La visita: stessa finestra della Mappa (VisitaModal), non una pagina a parte.
  const [visitaPlace, setVisitaPlace] = useState<Place | null>(null);
  // «Quando ci vado?»: la data che ci si dà per andare a trovare il negozio.
  const [pianificaPlace, setPianificaPlace] = useState<Place | null>(null);
  // «Metti in sequenza»: i solleciti a scadenza (lib/sequenze.ts).
  const [sequenzaPlace, setSequenzaPlace] = useState<Place | null>(null);

  async function nascondi(place: Place) {
    try {
      await aggiornaNascosto(place.id, true);
      ricarica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile rimuovere il target.');
    }
  }

  // «Assegna a me» (10/09/2026): il negozio diventa mio — chi lo lavora e
  // account del cliente — senza aprire la scheda. Se seguiva un altro
  // venditore lo si dice: un passaggio di mano non deve essere silenzioso.
  const [assegnando, setAssegnando] = useState<string | null>(null);
  const mio = (place: Place) => Boolean(place.creato_da && place.creato_da === session?.user?.id);
  async function assegna(place: Place) {
    if (assegnando) return;
    setAssegnando(place.id);
    try {
      const { nome, precedente } = await assegnaAMe(place);
      ricarica();
      if (precedente) avvisa('Assegnato a te', `«${place.nome}» seguiva ${precedente}: ora l'account è ${nome}.`);
    } catch (e: any) {
      avvisa('Non assegnato', e?.message ?? 'Riprova fra poco.');
    } finally {
      setAssegnando(null);
    }
  }

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = applicaFiltri(places, filtri)
      // Chi si lavora: scelto da una persona (creato_da / ⭐) oppure con un
      // rapporto già in piedi. La regola sta in `inLavorazione` (lib/livelli.ts)
      // insieme al motivo per cui è così — e sta lì e non qui perché la usano
      // anche Per interesse e i conteggi dei chip: tre copie divergenti erano
      // già bastate a far sparire dei negozi da una vista sola.
      .filter((p) => inLavorazione(p, conContatto.has(p.id), contattati.has(p.id)))
      .filter((p) => (livelliVista ? livelliVista.includes(livelloPlace(p)) : true))
      // «A rischio» è un taglio dentro i Clienti: il livello non basta a
      // distinguerlo, lo dice lo stato commerciale.
      .filter((p) => (vistaCorr === 'a-rischio' ? aRischio(p) : true))
      .filter((p) => (livello ? livelloPlace(p) === livello : true))
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
    const ordinati = [...f].sort((a, b) => RANK[a.priorita] - RANK[b.priorita] || a.nome.localeCompare(b.nome));
    if (!inSelezionati) return ordinati.map((place): RigaSel => ({ place }));

    // ── Selezionati: negozi di Scout + Segnalazioni CS in una lista sola ──
    // Un partner già preso in carico è un negozio di Scout con il suo
    // `anagrafiche_id`: si mostra quello, non due righe.
    const giaInScout = new Set([...presi, ...places.map((p) => p.anagrafiche_id).filter(Boolean)]);
    const nrm = (v: unknown) => String(v ?? '').toLowerCase();
    const dalRegistro: RigaSel[] = segnalati
      .filter((p) => !giaInScout.has(p.id))
      .filter((p) => !q || [p.nome, p.indirizzo, p.citta, p.provincia, p.categoria, ...(p.interessi ?? []), daDoveRegistro(p)].some((v) => nrm(v).includes(q)))
      .map((registro) => ({ registro }));
    const righe: RigaSel[] =
      filtroSel === 'miei' ? ordinati.map((place) => ({ place })) : filtroSel === 'segnalati' ? dalRegistro : [...ordinati.map((place): RigaSel => ({ place })), ...dalRegistro];
    // Dal più recente (richiesta dell'utente: «ordina per dal decrescenti di
    // default»); chi non ha la data va in fondo, e a pari data per nome.
    return righe.sort((a, b) => (dalDi(b) ?? '').localeCompare(dalDi(a) ?? '') || nomeDi(a).localeCompare(nomeDi(b), 'it'));
  }, [places, conContatto, contattati, filtri, query, livello, livelliVista, vistaCorr, inSelezionati, segnalati, presi, filtroSel]);

  // Quante Segnalazioni CS ancora da prendere in carico (per il chip).
  const segnalatiDaPrendere = useMemo(() => {
    const giaInScout = new Set([...presi, ...places.map((p) => p.anagrafiche_id).filter(Boolean)]);
    return segnalati.filter((p) => !giaInScout.has(p.id)).length;
  }, [segnalati, presi, places]);

  /**
   * Quante righe ha questa vista **prima** di ricerca e filtri: è il numero
   * con cui confrontare quelle mostrate. Senza, una lista ristretta a tre
   * righe sembra una lista che ha perso i dati.
   */
  const totaleVista = useMemo(
    () =>
      places
        .filter((p) => inLavorazione(p, conContatto.has(p.id), contattati.has(p.id)))
        .filter((p) => (livelliVista ? livelliVista.includes(livelloPlace(p)) : true))
        .filter((p) => (vistaCorr === 'a-rischio' ? aRischio(p) : true)).length + (inSelezionati ? segnalatiDaPrendere : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, conContatto, contattati, livelliVista, vistaCorr, inSelezionati, segnalatiDaPrendere],
  );

  // Quanti ce ne sono per livello (i numeri sui chip: dicono dove sta il lavoro).
  const perLivello = useMemo(() => {
    // Partire dai livelli veri: con le chiavi scritte a mano, aggiungerne uno
    // (è successo con "lead") lasciava un conteggio `undefined` e il chip senza
    // numero.
    const c: Record<string, number> = Object.fromEntries(LIVELLI.map((l) => [l, 0]));
    for (const p of places) {
      // Stesso criterio della lista: se cambia solo lì, i numeri sui chip non
      // corrispondono più alle righe che si vedono.
      if (!inLavorazione(p, conContatto.has(p.id), contattati.has(p.id))) continue;
      c[livelloPlace(p)] += 1;
    }
    return c;
  }, [places, conContatto, contattati]);

  // I chip: dentro una vista mostro solo i suoi livelli, e solo se più d'uno.
  const chipLivelli = livelliVista ?? LIVELLI;
  const mostraChip = chipLivelli.length > 1;

  // Da 900px in su l'elenco è una TABELLA (le schede restano sul telefono).
  const { width: schermo } = useWindowDimensions();
  const aTabella = schermo >= 900;

  // Le stesse azioni della scheda, per la riga di tabella: scritte una volta.
  const azioniDi = (place: Place) => {
    const quandoPrevista = giornoBreve(place.visita_pianificata);
    return (
      <AzioniContatto
        place={place}
        recapito={recapiti.get(place.id)}
        onVisita={() => setVisitaPlace(place)}
        onMail={() => setMailPlace(place)}
        onSequenza={() => setSequenzaPlace(place)}
        onTrattativa={(p) =>
          router.push(`/(app)/trattative?nuovoPer=${p.id}&nuovoNome=${encodeURIComponent(p.nome)}`)
        }
      >
        <IconaAzione
          nome="calendar-outline"
          attiva
          evidenza={Boolean(place.visita_pianificata)}
          label={quandoPrevista ? `Visita prevista ${quandoPrevista} — cambia` : 'Pianifica la visita'}
          onPress={() => setPianificaPlace(place)}
        />
        <IconaAzione
          nome="person-add-outline"
          attiva={!mio(place) && assegnando !== place.id}
          evidenza={mio(place)}
          label={mio(place) ? 'È tuo: lo lavori tu' : `Assegna a me${place.creato_da_nome ? ` (ora: ${place.creato_da_nome})` : ''}`}
          onPress={() => assegna(place)}
        />
        <IconaAzione nome="eye-off-outline" attiva label="Rimuovi target (nascondi)" onPress={() => nascondi(place)} />
      </AzioniContatto>
    );
  };

  // Le azioni di una riga del registro (Segnalazioni CS): chiama, WhatsApp,
  // email, prendi in carico — le stesse di /segnalati.
  const azioniDiRegistro = (p: PartnerRegistro) => {
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
  const azioniDiRiga = (r: RigaSel) => (r.place ? azioniDi(r.place) : azioniDiRegistro(r.registro));

  const colonne: ColonnaTabella<RigaSel>[] = [
    {
      chiave: 'nome',
      label: 'Negozio',
      flex: 1.2,
      valore: (r) => nomeDi(r),
      cella: (r) => {
        if (r.registro) {
          // Una riga del registro: nessun semaforo (nessuna visita possibile
          // finché non è in Scout), sotto il nome da dove viene.
          const sotto = [daDoveRegistro(r.registro), [r.registro.categoria, ...(r.registro.interessi ?? [])].filter(Boolean).join(', ')]
            .filter(Boolean)
            .join(' · ');
          return (
            <View>
              <Text style={styles.tabNome} numberOfLines={2}>
                {r.registro.nome}
              </Text>
              <Text style={styles.tabSotto} numberOfLines={1}>
                {sotto}
              </Text>
            </View>
          );
        }
        const p = r.place;
        const v = statoVisita(p, conBozza.has(p.id), visitati.has(p.id));
        const linee = canonizzaLinee(p.linee_ipotizzate ?? (p.linea_ipotizzata ? [p.linea_ipotizzata] : [])).join(', ');
        return (
          <View>
            <View style={styles.tabNomeRiga}>
              {/* Il semaforo della visita, che nelle schede è il riquadro
                  dell'icona: qui è un pallino prima del nome. */}
              <View
                style={[styles.tabSemaforo, { backgroundColor: COLORE_VISITA[v] }]}
                {...({ title: LABEL_VISITA[v] } as any)}
              />
              <Text style={styles.tabNome} numberOfLines={2}>
                {p.nome}
              </Text>
            </View>
            {/* ⚠️ Le LINEE stanno SOTTO il nome, non in colonna (10/09/2026):
                con Dal, 30 gg, 180 gg e nove icone la tabella sforava a destra
                e l'ultima azione restava tagliata. Lezione degli Ordini: ogni
                colonna in più toglie pixel al nome. */}
            {linee ? (
              <Text style={styles.tabSotto} numberOfLines={1}>
                {linee}
              </Text>
            ) : null}
          </View>
        );
      },
    },
    {
      chiave: 'indirizzo',
      label: 'Indirizzo',
      flex: 1,
      righe: 2,
      valore: (r) =>
        r.place ? r.place.indirizzo ?? null : [r.registro.indirizzo, [r.registro.citta, r.registro.provincia].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
    },
    {
      chiave: 'stato',
      label: 'Stato',
      width: 132,
      // Le segnalazioni stanno dopo i P3: sono ancora da scegliere.
      valore: (r) => (r.place ? RANK[r.place.priorita] ?? 9 : 10),
      cella: (r) => {
        if (r.registro) {
          return (
            <View style={styles.tabBadges}>
              <StatusBadge small label="Segnalazione CS" colore={colors.attenzione} />
              {presi.has(r.registro.id) ? (
                <StatusBadge small label="Già in lista" colore={COLORE_VISITA.fatta} />
              ) : (
                <StatusBadge small label="Da prendere" colore={colors.grigio} />
              )}
            </View>
          );
        }
        const p = r.place;
        const liv = livelloPlace(p);
        return (
          <View style={styles.tabBadges}>
            <StatusBadge small label={LABEL_LIVELLO[liv]} colore={coloreLivello(liv)} />
            {ePerso(p) ? <StatusBadge small label={LABEL_PERSO} colore={COLORE_PERSO} /> : null}
            {aRischio(p) ? <StatusBadge small label={LABEL_A_RISCHIO} colore={COLORE_A_RISCHIO} /> : null}
            {p.livello_rapporto ? (
              <StatusBadge small label={LABEL_MOMENTO[p.livello_rapporto]} colore={colors.blue} />
            ) : null}
            <PriorityBadge priorita={p.priorita} small />
          </View>
        );
      },
    },
    {
      chiave: 'prevista',
      label: 'Visita',
      width: 74,
      destra: true,
      numerica: true,
      valore: (r) => r.place?.visita_pianificata ?? null,
      cella: (r) => {
        const q = giornoBreve(r.place?.visita_pianificata);
        const fra = giorniDaOggi(r.place?.visita_pianificata);
        if (!q) return <Text style={styles.tabData}>—</Text>;
        return (
          <Text style={[styles.tabData, fra !== null && fra < 0 && styles.pianificataTardi]} numberOfLines={2}>
            {q}
            {fra === 0 ? ' · oggi' : fra !== null && fra < 0 ? ` · −${-fra} g` : ''}
          </Text>
        );
      },
    },
    // Solo nei Selezionati (10/09/2026): DA QUANDO è in lista, e gli importi
    // del Customer Service a 30 e 180 giorni. ⚠️ «Dal» è `created_at` del
    // negozio, la stessa data che la scheda chiama «Inserito il»: per un
    // negozio scoperto da Google e stellato dopo è la data della scoperta, non
    // della stella — la stella non ha una data sua. Si dichiara, non si finge.
    ...(inSelezionati
      ? ([
          {
            chiave: 'dal',
            label: 'Dal',
            width: 74,
            destra: true,
            numerica: true,
            valore: (r) => dalDi(r),
            cella: (r) => <Text style={styles.tabData}>{dataBreve(dalDi(r))}</Text>,
          },
          {
            chiave: 'ordini30',
            label: '30 gg',
            width: 86,
            destra: true,
            numerica: true,
            valore: (r) => venditeDiRiga(r)?.ordini30 ?? null,
            cella: (r) => {
              const v = venditeDiRiga(r);
              return <CellaVendite ordini={v?.ordini30 ?? 0} venduto={v?.venduto30 ?? 0} />;
            },
          },
          {
            chiave: 'ordiniLunga',
            label: `${giorniLunga} gg`,
            width: 86,
            destra: true,
            numerica: true,
            valore: (r) => venditeDiRiga(r)?.ordiniLunga ?? null,
            cella: (r) => {
              const v = venditeDiRiga(r);
              return <CellaVendite ordini={v?.ordiniLunga ?? 0} venduto={v?.vendutoLunga ?? 0} />;
            },
          },
        ] satisfies ColonnaTabella<RigaSel>[])
      : []),
  ];

  // I chip dei Selezionati: tutti / i miei / le Segnalazioni CS. Un filtro,
  // non una scheda: la tabella è una sola (decisione dell'utente, 10/09).
  const nMiei = inSelezionati ? totaleVista - segnalatiDaPrendere : 0;
  const chipSelezionati = inSelezionati ? (
    <RigaChips style={styles.livelli}>
      {(['tutti', 'miei', 'segnalati'] as FiltroSel[]).map((f) => (
        <Chip
          key={f}
          label={`${LABEL_FILTRO_SEL[f]} (${f === 'tutti' ? totaleVista : f === 'miei' ? nMiei : segnalatiDaPrendere})`}
          on={filtroSel === f}
          onPress={() => setFiltroSel(f)}
          title={
            f === 'segnalati'
              ? 'I negozi che un’altra app ha già trovato o fatto lavorare (app fornitori, Customer Service), ancora da prendere in carico'
              : f === 'miei'
                ? 'I negozi scelti con la ⭐ da Mappa o Affiliazioni'
                : 'Tutti insieme'
          }
        />
      ))}
    </RigaChips>
  ) : null;

  return (
    <View style={styles.container}>
      <FlatList
        // In tabella la FlatList riceve UNA riga che contiene l'intero elenco:
        // testata, refresh e stato vuoto restano suoi, la griglia la fa Tabella.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(r: any) => (aTabella ? 'tabella' : chiaveDi(r as RigaSel))}
        contentContainerStyle={[styles.list, aTabella ? contenutoExtraLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={ricarica} />}
        // Intro, chip e filtri scorrono INSIEME alla lista: da fissi occupavano
        // mezzo schermo e ai negozi restava una finestrella alta pochi pixel.
        // Va passato come elemento (non come funzione), altrimenti a ogni
        // lettera digitata l'header si rimonta e la ricerca perde il fuoco.
        ListHeaderComponent={
          <View style={styles.headerScroll}>
            <PageIntro
              testo={
                vistaCorr
                  ? TITOLO_VISTA[vistaCorr]
                  : 'I negozi che qualcuno ha scelto di lavorare. SELEZIONATO: scelto con la ⭐, ancora senza un contatto. PROSPECT: ha una persona in rubrica. CLIENTE: ha chiuso una trattativa.'
              }
            />
            <ContoRighe mostrati={dati.length} totale={totaleVista} nome="negozi" />
            {inSelezionati ? (
              <View style={styles.statoVendite}>
                <StatoVendite esito={vendite} />
                {segnalatiErrore ? (
                  <Text style={styles.avvisoRegistro}>
                    <Ionicons name="warning-outline" size={12} color={colors.errore} /> Segnalazioni CS non lette: {segnalatiErrore}
                  </Text>
                ) : segnalatiParziale ? (
                  <Text style={styles.avvisoRegistro}>
                    <Ionicons name="information-circle-outline" size={12} color={colors.testoSoft} /> Segnalazioni CS possibilmente
                    incomplete: il registro risponde senza il filtro per fonte o per stato fornitore (rideployare la funzione `anagrafiche`).
                  </Text>
                ) : null}
              </View>
            ) : null}
            {chipSelezionati}
            {mostraChip ? (
              <RigaChips style={styles.livelli}>
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
              </RigaChips>
            ) : null}
            {/* Prima la ricerca, poi il bottone dei filtri: stesso ordine di
                Clienti, Affiliazioni, Trattative e Rubrica. */}
            <View style={styles.filterBar}>
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Cerca per nome, indirizzo, zona, linea…"
                placeholderTextColor={colors.grigio}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
              <Filters filtri={filtri} opzioni={opzioni} onChange={setFiltri} admin={admin} />
            </View>
          </View>
        }
        ListEmptyComponent={
          // Nei Lead il consiglio "mettili in lista con la ⭐" sarebbe sbagliato:
          // la stella crea un Selezionato, non un Lead. Qui l'azione è un'altra.
          vistaCorr === 'lead' ? (
            <EmptyState
              loading={loading}
              icona="send-outline"
              titolo="Nessun lead"
              aiuto="Un negozio diventa Lead quando gli scrivi, lo chiami o ci passi: fallo dalle azioni di un Selezionato. Se il contatto è già avvenuto fuori dall'app, inseriscilo qui col bottone +."
              azione="Vai ai Selezionati"
              onAzione={() => router.push('/(app)/lista?vista=selezionato')}
            />
          ) : (
            <EmptyState
              loading={loading}
              icona="flag-outline"
              titolo="Nessun negozio in lista"
              aiuto="Qui entrano solo i negozi che scegli tu: mettili in lista dalla Mappa con la ⭐ (diventano SELEZIONATI), oppure creane uno col bottone +. Se pensavi di trovarne, prova ad azzerare filtri e ricerca."
              azione="Vai alla Mappa"
              onAzione={() => router.push('/(app)/mappa')}
            />
          )
        }
        renderItem={({ item }) =>
          aTabella ? (
            <Tabella
              righe={item as RigaSel[]}
              colonne={colonne}
              chiaveRiga={chiaveDi}
              // Selezionati: dal più recente (richiesta dell'utente). Altrove
              // per stato/priorità, come prima.
              ordineIniziale={inSelezionati ? { campo: 'dal', verso: 'desc' } : { campo: 'stato', verso: 'asc' }}
              onRiga={(r) => {
                if (r.place) router.push(`/(app)/attivita/${r.place.id}`);
                else {
                  // Un partner del registro non ha una scheda in Scout finché
                  // non lo si prende in carico: si apre la sua scheda là.
                  const u = urlSchedaRegistro(r.registro.id);
                  if (u) Linking.openURL(u);
                }
              }}
              labelRiga={(r) => (r.place ? `Apri la scheda di ${r.place.nome}` : `Apri ${r.registro.nome} nel registro Anagrafiche`)}
              azioni={azioniDiRiga}
              larghezzaAzioni={422}
              totali={(righe) => ({
                nome: `Totale · ${righe.length} ${righe.length === 1 ? 'negozio' : 'negozi'}`,
                ordini30: indiceVenditeCS ? String(righe.reduce((s, r) => s + (venditeDiRiga(r)?.ordini30 ?? 0), 0)) : null,
                ordiniLunga: indiceVenditeCS ? String(righe.reduce((s, r) => s + (venditeDiRiga(r)?.ordiniLunga ?? 0), 0)) : null,
              })}
            />
          ) : (item as RigaSel).registro ? (
            (() => {
              const p = (item as RigaSel).registro!;
              const preso = presi.has(p.id);
              const dove = [p.citta, p.provincia].filter(Boolean).join(' · ');
              return (
                <CardElenco
                  icona={p.categoria === 'PASTICCERIA' ? 'cafe-outline' : 'flower-outline'}
                  coloreIcona={preso ? undefined : COLORE_VISITA.da_fare}
                  titoloIcona={preso ? undefined : LABEL_VISITA.da_fare}
                  nome={p.nome}
                  meta={[dove, p.categoria].filter(Boolean).join(' — ') || null}
                  tag={p.interessi ?? []}
                  badge={
                    <>
                      <StatusBadge small label="Segnalazione CS" colore={colors.attenzione} />
                      {preso ? (
                        <StatusBadge small label="Già in lista" colore={COLORE_VISITA.fatta} />
                      ) : (
                        <StatusBadge small label="Da prendere" colore={colors.grigio} />
                      )}
                    </>
                  }
                  extra={
                    <>
                      <Text style={styles.inserito} numberOfLines={2}>
                        <Ionicons name="megaphone-outline" size={11} color={colors.grigio} /> {daDoveRegistro(p)}
                        {p.creatoIl ? ` · dal ${dataBreve(p.creatoIl)}` : ''}
                      </Text>
                      <RigaVendite v={venditeDiRiga(item as RigaSel)} giorniLunga={giorniLunga} />
                    </>
                  }
                  azioni={azioniDiRegistro(p)}
                />
              );
            })()
          ) : (
            <Riga
              place={(item as RigaSel).place!}
              vendite={inSelezionati ? venditeDiPlace((item as RigaSel).place!) : null}
              giorniLunga={giorniLunga}
              livello={livelloPlace((item as RigaSel).place!)}
              visita={statoVisita((item as RigaSel).place!, conBozza.has((item as RigaSel).place!.id), visitati.has((item as RigaSel).place!.id))}
              recapito={recapiti.get((item as RigaSel).place!.id)}
              onPress={() => router.push(`/(app)/attivita/${(item as RigaSel).place!.id}`)}
              onNascondi={() => nascondi((item as RigaSel).place!)}
              mio={mio((item as RigaSel).place!)}
              onAssegna={() => assegna((item as RigaSel).place!)}
              onVisita={() => setVisitaPlace((item as RigaSel).place!)}
              onPianifica={() => setPianificaPlace((item as RigaSel).place!)}
              onMail={() => setMailPlace((item as RigaSel).place!)}
              onSequenza={() => setSequenzaPlace((item as RigaSel).place!)}
              onTrattativa={(p) =>
                router.push(`/(app)/trattative?nuovoPer=${p.id}&nuovoNome=${encodeURIComponent(p.nome)}`)
              }
            />
          )
        }
      />
      {/* Dalla vista Lead il + crea un lead, non un selezionato: altrimenti il
          negozio appena inserito nascerebbe "mai contattato" e sparirebbe
          dall'elenco da cui lo si è appena creato. */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push(vistaCorr === 'lead' ? '/(app)/nuovo-target?come=lead' : '/(app)/nuovo-target')}
        accessibilityLabel={vistaCorr === 'lead' ? 'Nuovo lead' : 'Nuovo target'}
      >
        <Ionicons name="add" size={30} color={colors.bianco} />
      </Pressable>
      {mailPlace ? <ScegliScriptModal place={mailPlace} onClose={() => setMailPlace(null)} /> : null}
      <VisitaModal place={visitaPlace} onClose={() => setVisitaPlace(null)} onDone={() => { setVisitaPlace(null); ricarica(); }} />
      {sequenzaPlace ? (
        <IscriviSequenzaModal place={sequenzaPlace} onClose={() => setSequenzaPlace(null)} />
      ) : null}
      <PianificaVisitaModal
        place={pianificaPlace}
        onClose={() => setPianificaPlace(null)}
        onDone={() => { setPianificaPlace(null); ricarica(); }}
      />
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
  vendite,
  giorniLunga,
  livello,
  visita,
  recapito,
  onPress,
  onNascondi,
  mio,
  onAssegna,
  onVisita,
  onPianifica,
  onMail,
  onSequenza,
  onTrattativa,
}: {
  place: Place;
  /** Gli ordini del Customer Service (solo nei Selezionati); null = niente o non collegato. */
  vendite: VenditeFornitore | null;
  giorniLunga: number;
  /** Già calcolato dalla lista: la riga non deve rifare il conto (e sbagliarlo). */
  livello: Livello;
  /** Il semaforo: rosso da fare, giallo da finire, verde fatta. */
  visita: StatoVisita;
  recapito: RecapitoPlace | undefined;
  onPress: () => void;
  onNascondi: () => void;
  /** «Assegna a me»; `mio` = lo lavoro già io (icona piena, spenta). */
  mio: boolean;
  onAssegna: () => void;
  onVisita: () => void;
  onPianifica: () => void;
  onMail: () => void;
  onSequenza: () => void;
  onTrattativa: (place: Place) => void;
}) {
  const quando = giornoBreve(place.visita_pianificata);
  const fra = giorniDaOggi(place.visita_pianificata);
  return (
    // Stessa scheda dei Clienti (components/CardElenco.tsx): icona a sinistra,
    // testo al centro, badge a destra, azioni in fondo.
    <CardElenco
      // Il riquadro dell'icona è il semaforo della visita: si legge prima del
      // testo, ed è la cosa che dice se quel negozio è lavoro da fare.
      coloreIcona={COLORE_VISITA[visita]}
      titoloIcona={LABEL_VISITA[visita]}
      nome={place.nome}
      meta={place.indirizzo}
      account={place.anagrafiche_account ?? null}
      // TUTTI gli interessi, non solo il primo: la riga mostrava la sola
      // `linea_ipotizzata` mentre la scheda ne elencava tre, e sembrava che il
      // negozio ne avesse uno solo (segnalato dall'utente il 29/07/2026).
      tag={canonizzaLinee(place.linee_ipotizzate ?? (place.linea_ipotizzata ? [place.linea_ipotizzata] : []))}
      onPress={onPress}
      badge={
        <>
          <StatusBadge small label={LABEL_LIVELLO[livello]} colore={coloreLivello(livello)} />
          {/* Perso non toglie il negozio dalla sua lista: lo marca. Un lead
              chiuso resta fra i Lead, e si vede che è chiuso. */}
          {ePerso(place) ? <StatusBadge small label={LABEL_PERSO} colore={COLORE_PERSO} /> : null}
          {/* Ancora cliente, ma i segnali peggiorano: è il momento in cui si
              può fare qualcosa, e prima non lo diceva niente. */}
          {aRischio(place) ? <StatusBadge small label={LABEL_A_RISCHIO} colore={COLORE_A_RISCHIO} /> : null}
          {/* Il momento del contatto: dice dove siamo DENTRO il livello — «in
              attesa» su un Lead è un'informazione che cambia cosa fare oggi. */}
          {place.livello_rapporto ? (
            <StatusBadge small label={LABEL_MOMENTO[place.livello_rapporto]} colore={colors.blue} />
          ) : null}
          <PriorityBadge priorita={place.priorita} small />
        </>
      }
      extra={
        <>
          {/* La data che ci si è dati, se c'è: in ritardo va detto, altrimenti
              un giro saltato resta in agenda senza che nessuno se ne accorga. */}
          {quando ? (
            <Text style={[styles.pianificata, fra !== null && fra < 0 && styles.pianificataTardi]} numberOfLines={1}>
              <Ionicons name="calendar-outline" size={11} /> Visita prevista {quando}
              {fra === 0 ? ' · oggi' : fra !== null && fra < 0 ? ` · in ritardo di ${-fra} g` : ''}
            </Text>
          ) : null}
          <Text style={styles.inserito} numberOfLines={1}>
            <Ionicons name="person-outline" size={11} color={colors.grigio} /> Inserito{' '}
            {dataInserimento(place.created_at)} · {origineInserimento(place)}
          </Text>
          <RigaVendite v={vendite} giorniLunga={giorniLunga} />
        </>
      }
      azioni={
        // Le stesse azioni dei Potenziali (components/AzioniContatto.tsx): un
        // Selezionato serve a poco se dalla riga non si può nemmeno chiamarlo o
        // scrivergli. La mail parte dall'app con gli script, non con `mailto:`.
        <AzioniContatto
          place={place}
          recapito={recapito}
          onVisita={onVisita}
          onMail={onMail}
          onSequenza={onSequenza}
          onTrattativa={onTrattativa}
        >
          <IconaAzione
            nome="calendar-outline"
            attiva
            // Acceso quando una data c'è già: si vede dalla fila dei bottoni
            // quali negozi sono in agenda, senza leggere riga per riga.
            evidenza={Boolean(place.visita_pianificata)}
            label={quando ? `Visita prevista ${quando} — cambia` : 'Pianifica la visita'}
            onPress={onPianifica}
          />
          <IconaAzione
            nome="person-add-outline"
            attiva={!mio}
            evidenza={mio}
            label={mio ? 'È tuo: lo lavori tu' : `Assegna a me${place.creato_da_nome ? ` (ora: ${place.creato_da_nome})` : ''}`}
            onPress={onAssegna}
          />
          <IconaAzione nome="eye-off-outline" attiva label="Rimuovi target (nascondi)" onPress={onNascondi} />
        </AzioniContatto>
      }
    />
  );
}

const styles = StyleSheet.create({
  livelli: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  rigaBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  rigaAzione: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
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
    borderRadius: radius.m,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.testo,
  },
  list: { padding: spacing.lg, gap: spacing.sm },
  // L'header sta dentro il contenitore della lista, che ha gia' il suo padding:
  // qui lo si annulla perche' intro, chip e filtri hanno gia' i propri margini
  // (e la barra dei filtri deve restare larga da bordo a bordo).
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  statoVendite: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 4 },
  avvisoRegistro: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  tabSotto: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  riga: {
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    gap: 6,
  },
  rigaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.navy },
  stato: { fontSize: 12, color: colors.testoSoft, fontWeight: '600' },
  nascondi: { padding: 2 },
  // "Tipologia di interesse" = linea Deluxy, come tag oro.
  lineaTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  lineaTagTxt: { color: colors.testoSoft, fontWeight: '600', fontSize: 12 },
  indirizzo: { fontSize: 13, color: colors.grigio },
  metaPersone: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  accountTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  accountTagTxt: { color: colors.testoSoft, fontWeight: '600', fontSize: 12 },
  inserito: { fontSize: 12, color: colors.grigio, fontWeight: '600' },
  pianificata: { fontSize: 12.5, color: colors.testo, fontWeight: '700' },
  pianificataTardi: { color: colors.errore },
  tabNomeRiga: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabSemaforo: { width: 8, height: 8, borderRadius: 4 },
  tabNome: { flex: 1, minWidth: 0, color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tabData: { color: colors.testoSoft, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
  fab: {
    position: 'absolute',
    right: spacing.xxl,
    bottom: spacing.xxl,
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
