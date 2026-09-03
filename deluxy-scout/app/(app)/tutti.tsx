// TUTTI — l'elenco unico dei contatti (03/09/2026, richiesta dell'utente: «in
// contatti manca la sezione TUTTI con veramente tutti ma proprio tutti i
// contatti e con la tipologia (lead, fornitori, clienti, ecc) che è una
// colonna della tabella»).
//
// IL PROBLEMA. Sotto «Contatti» c'erano nove liste, e ognuna era una FETTA:
// Selezionati, Lead, Prospect, Clienti, A rischio, Dormienti, Potenziali,
// Fornitori, Per interesse. Per rispondere a «questa azienda ce l'abbiamo?»
// bisognava sapere PRIMA in che fetta cercarla — cioè sapere già la risposta.
//
// ⚠️ **«Proprio tutti» vuol dire DUE SORGENTI**, e non sono la stessa cosa:
//   1. i NEGOZI di Scout (`places`): quelli che stiamo lavorando, con il loro
//      livello dedotto (lib/livelli.ts);
//   2. le aziende del REGISTRO Anagrafiche che in Scout non sono mai entrate —
//      tipicamente i FORNITORI, che il Customer Service scrive di là quando li
//      paga. Sono contatti a tutti gli effetti, e nelle liste di Scout non
//      c'erano.
// Si uniscono per `anagrafiche_id`: chi è in tutti e due compare UNA volta, col
// vestito del negozio Scout (che è quello su cui si può lavorare).
//
// ⚠️ La colonna TIPOLOGIA porta più di un'etichetta quando più di una è vera:
// un cliente che ci fornisce è «Cliente» **e** «Fornitore». Sceglierne una
// sola vorrebbe dire nascondere metà del rapporto — ed è la ragione per cui
// questa lista esiste.
//
// ⚠️ Il registro si legge LIVE e a pagine (regola d'oro: nessuna copia). Se la
// paginazione non finisce, si DICE che l'elenco è parziale invece di far
// credere che quelli siano tutti.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Place } from '@/types';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { fetchTuttiPartner, urlSchedaRegistro, type PartnerRegistro } from '@/lib/anagrafiche';
import { importaDalRegistro } from '@/lib/db';
import { geocodeIndirizzo } from '@/lib/geocode';
import { avvisa } from '@/lib/dialoghi';
import { usePlaces } from '@/lib/usePlaces';
import {
  COLORE_A_RISCHIO,
  COLORE_PERSO,
  LABEL_A_RISCHIO,
  LABEL_LIVELLO,
  LABEL_PERSO,
  aRischio,
  coloreLivello,
  ePerso,
  livelloDi,
  type Livello,
} from '@/lib/livelli';
import { CardElenco } from '@/components/CardElenco';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';
import { CampoCerca, ContoRighe, EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';

/** Le etichette della colonna Tipologia che NON sono un livello del funnel. */
const LABEL_FORNITORE = 'Fornitore';
const COLORE_FORNITORE = colors.blue;
const LABEL_REGISTRO = 'Solo nel registro';
const COLORE_REGISTRO = colors.grigio;

/** Una riga dell'elenco unico: o un negozio di Scout, o una scheda del registro. */
type Riga = {
  id: string;
  nome: string;
  citta: string | null;
  categoria: string | null;
  telefono: string | null;
  email: string | null;
  /** Il negozio di Scout, se c'è: è quello su cui si può lavorare. */
  place: Place | null;
  /** La scheda del registro, se la conosciamo. */
  partner: PartnerRegistro | null;
  anagraficheId: string | null;
  /** Il livello del funnel (solo per i negozi di Scout). */
  livello: Livello | null;
  perso: boolean;
  rischio: boolean;
  /** `abituale | da_provare | da_evitare`, dal registro. Vuoto = non ci fornisce. */
  fornitore: string | null;
};

/** Le etichette della colonna Tipologia, in ordine: prima chi è, poi cosa fa. */
function tipologieDi(r: Riga): { label: string; colore: string }[] {
  const out: { label: string; colore: string }[] = [];
  if (r.livello) out.push({ label: LABEL_LIVELLO[r.livello], colore: coloreLivello(r.livello) });
  else out.push({ label: LABEL_REGISTRO, colore: COLORE_REGISTRO });
  if (r.fornitore) out.push({ label: LABEL_FORNITORE, colore: COLORE_FORNITORE });
  if (r.perso) out.push({ label: LABEL_PERSO, colore: COLORE_PERSO });
  if (r.rischio) out.push({ label: LABEL_A_RISCHIO, colore: COLORE_A_RISCHIO });
  return out;
}

/** I filtri rapidi: le stesse parole della colonna, così si trovano. */
type Filtro = Livello | 'fornitore' | 'registro' | 'perso';
const FILTRI: { v: Filtro; label: string }[] = [
  { v: 'selezionato', label: 'Selezionati' },
  { v: 'lead', label: 'Lead' },
  { v: 'prospect', label: 'Prospect' },
  { v: 'cliente', label: 'Clienti' },
  { v: 'dormiente', label: 'Dormienti' },
  { v: 'fornitore', label: 'Fornitori' },
  { v: 'perso', label: 'Persi' },
  { v: 'registro', label: 'Solo nel registro' },
];
function passaFiltro(r: Riga, f: Filtro): boolean {
  if (f === 'fornitore') return Boolean(r.fornitore);
  if (f === 'registro') return !r.place;
  if (f === 'perso') return r.perso;
  return r.livello === f;
}

export default function Tutti() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;

  const { places, conContatto, contattati, inTrattativa, nonFatturano, recapiti, loading, errore, ricarica } =
    usePlaces();

  // Il registro, live. ⚠️ Best-effort: se non risponde restano i negozi di
  // Scout — una lista incompleta che lo dichiara è meglio di nessuna lista.
  const [partner, setPartner] = useState<PartnerRegistro[]>([]);
  const [registroCompleto, setRegistroCompleto] = useState(true);
  const [erroreRegistro, setErroreRegistro] = useState<string | null>(null);
  const [caricoRegistro, setCaricoRegistro] = useState(true);
  const caricaRegistro = useCallback(async () => {
    setCaricoRegistro(true);
    setErroreRegistro(null);
    try {
      const r = await fetchTuttiPartner();
      setPartner(r.partner);
      setRegistroCompleto(r.completo);
    } catch (e: any) {
      setPartner([]);
      setErroreRegistro(e?.message ?? 'Registro Anagrafiche non raggiungibile.');
    } finally {
      setCaricoRegistro(false);
    }
  }, []);
  useEffect(() => {
    caricaRegistro();
  }, [caricaRegistro]);

  const [cerca, setCerca] = useState('');
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  const righe = useMemo<Riga[]>(() => {
    const perAnagrafica = new Map(partner.map((p) => [p.id, p]));
    const usati = new Set<string>();
    const out: Riga[] = places.map((p) => {
      const scheda = p.anagrafiche_id ? perAnagrafica.get(p.anagrafiche_id) ?? null : null;
      if (scheda) usati.add(scheda.id);
      const rec = recapiti.get(p.id);
      return {
        id: `p:${p.id}`,
        nome: p.nome,
        citta: p.zona ?? scheda?.citta ?? null,
        categoria: p.categoria ?? scheda?.categoria ?? null,
        telefono: rec?.telefono ?? scheda?.telefono ?? null,
        email: rec?.email ?? scheda?.email ?? null,
        place: p,
        partner: scheda,
        anagraficheId: p.anagrafiche_id ?? null,
        livello: livelloDi(
          p,
          conContatto.has(p.id),
          contattati.has(p.id),
          inTrattativa.has(p.id),
          nonFatturano.has(p.id),
        ),
        perso: ePerso(p),
        rischio: aRischio(p),
        fornitore: scheda?.statoFornitore ?? null,
      };
    });
    // Le schede del registro che in Scout non ci sono: sono contatti anche
    // quelle, ed è la metà che mancava.
    for (const s of partner) {
      if (usati.has(s.id)) continue;
      out.push({
        id: `r:${s.id}`,
        nome: s.nome,
        citta: s.citta,
        categoria: s.categoria,
        telefono: s.telefono,
        email: s.email,
        place: null,
        partner: s,
        anagraficheId: s.id,
        livello: null,
        perso: false,
        rischio: false,
        fornitore: s.statoFornitore ?? null,
      });
    }
    out.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    return out;
  }, [places, partner, recapiti, conContatto, contattati, inTrattativa, nonFatturano]);

  const dati = useMemo(() => {
    const base = filtro ? righe.filter((r) => passaFiltro(r, filtro)) : righe;
    const q = cerca.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      [r.nome, r.citta, r.categoria, r.email, r.telefono].some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [righe, filtro, cerca]);

  const conteggi = useMemo(() => {
    const m = new Map<Filtro, number>();
    for (const { v } of FILTRI) m.set(v, righe.filter((r) => passaFiltro(r, v)).length);
    return m;
  }, [righe]);

  // Prendere in carico una scheda del registro: stessa strada di Fornitori e
  // Segnalazioni CS (geocodifica l'indirizzo, ripiega sulla città, e in
  // mancanza entra a 0,0 — meglio un negozio senza posizione che perso).
  async function prendiInCarico(r: Riga) {
    const s = r.partner;
    if (!s) return;
    setInCorso(r.id);
    try {
      const indirizzo = [s.indirizzo, s.citta, s.provincia].filter(Boolean).join(', ');
      let lat = 0;
      let lng = 0;
      try {
        const g = await geocodeIndirizzo(indirizzo || s.citta || s.nome);
        lat = g.lat;
        lng = g.lng;
      } catch {
        // Meglio un negozio senza posizione che un negozio perso.
      }
      const place = await importaDalRegistro({
        anagraficheId: s.id,
        nome: s.nome,
        indirizzo: s.indirizzo,
        citta: s.citta,
        categoria: s.categoria,
        lat,
        lng,
        linee: s.interessi ?? [],
      });
      router.push(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      avvisa('Non è stato possibile prenderlo in carico', e?.message ?? 'Riprova fra poco.');
    } finally {
      setInCorso(null);
    }
  }

  const azioniDi = (r: Riga) => (
    <AzioniRiga>
      <IconaAzione
        nome="call-outline"
        attiva={Boolean(r.telefono)}
        label={r.telefono ? 'Chiama' : 'Nessun telefono'}
        onPress={() => r.telefono && Linking.openURL(`tel:${r.telefono}`)}
      />
      <IconaAzione
        nome="mail-outline"
        attiva={Boolean(r.email)}
        label={r.email ? 'Email' : 'Nessuna mail'}
        onPress={() => r.email && Linking.openURL(`mailto:${r.email}`)}
      />
      <IconaAzione
        nome="open-outline"
        attiva={Boolean(urlSchedaRegistro(r.anagraficheId))}
        label={r.anagraficheId ? 'Apri nel registro Anagrafiche' : 'Non è nel registro'}
        onPress={() => {
          const u = urlSchedaRegistro(r.anagraficheId);
          if (u) Linking.openURL(u);
        }}
      />
      {r.place ? (
        <IconaAzione
          nome="albums-outline"
          attiva
          label="Apri la scheda in Scout"
          onPress={() => router.push(`/(app)/attivita/${r.place!.id}`)}
        />
      ) : (
        <IconaAzione
          nome="download-outline"
          attiva={inCorso !== r.id}
          label="Prendi in carico (lo porta in Scout)"
          onPress={() => prendiInCarico(r)}
        />
      )}
    </AzioniRiga>
  );

  const colonne: ColonnaTabella<Riga>[] = [
    {
      chiave: 'nome',
      label: 'Nome',
      flex: 1.3,
      valore: (r) => r.nome,
      cella: (r) => (
        <Text style={styles.tabNome} numberOfLines={2}>
          {r.nome}
        </Text>
      ),
    },
    {
      // ⭐ LA COLONNA CHIESTA: che cos'è questo contatto, in una parola (o due,
      // quando due sono vere).
      chiave: 'tipologia',
      label: 'Tipologia',
      width: 190,
      valore: (r) => tipologieDi(r)[0]?.label ?? '',
      cella: (r) => (
        <View style={styles.badges}>
          {tipologieDi(r).map((t) => (
            <StatusBadge key={t.label} small label={t.label} colore={t.colore} />
          ))}
        </View>
      ),
    },
    { chiave: 'citta', label: 'Città', flex: 0.7, valore: (r) => r.citta ?? null },
    { chiave: 'categoria', label: 'Categoria', width: 110, valore: (r) => r.categoria ?? null },
    {
      chiave: 'dove',
      label: 'Dov’è',
      width: 108,
      valore: (r) => (r.place ? 0 : 1),
      cella: (r) => <Text style={styles.tabMuto}>{r.place ? 'Scout + registro' : 'Solo registro'}</Text>,
    },
  ];

  const caricando = loading || caricoRegistro;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
      refreshControl={
        <RefreshControl
          refreshing={caricando}
          onRefresh={() => {
            ricarica();
            caricaRegistro();
          }}
        />
      }
    >
      <View style={styles.headerScroll}>
        <PageIntro testo="Tutti i contatti in un elenco solo: i negozi che lavoriamo in Scout e le aziende che stanno solo nel registro Anagrafiche (i fornitori, per esempio). La colonna Tipologia dice che cos'è ognuno — e ne porta due quando due sono vere: un cliente che ci fornisce è Cliente e Fornitore." />
        <View style={{ marginBottom: 10 }}>
          <CampoCerca valore={cerca} onCambia={setCerca} placeholder="Cerca per nome, città, categoria, mail…" />
        </View>
        <ContoRighe mostrati={dati.length} totale={righe.length} nome="contatti" />
        <RigaChips style={styles.chips}>
          <Chip label={`Tutti (${righe.length})`} on={!filtro} onPress={() => setFiltro(null)} />
          {FILTRI.filter((f) => (conteggi.get(f.v) ?? 0) > 0).map((f) => (
            <Chip
              key={f.v}
              label={`${f.label} (${conteggi.get(f.v)})`}
              on={filtro === f.v}
              onPress={() => setFiltro((c) => (c === f.v ? null : f.v))}
            />
          ))}
        </RigaChips>
      </View>

      {errore ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> Negozi di Scout: {errore}
        </Text>
      ) : null}
      {/* ⚠️ Il registro che manca si DICE: senza, l'elenco sembrerebbe completo
          e le aziende che stanno solo di là parrebbero non esistere. */}
      {erroreRegistro ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> Registro Anagrafiche: {erroreRegistro}.
          Qui sotto ci sono solo i negozi di Scout.
        </Text>
      ) : null}
      {!erroreRegistro && !registroCompleto ? (
        <Text style={styles.avviso}>
          <Ionicons name="information-circle-outline" size={13} color={colors.testo} /> Il registro ha risposto a
          pagine incomplete: qualche azienda che sta solo di là potrebbe mancare.
        </Text>
      ) : null}

      {!caricando && !dati.length ? (
        <EmptyState
          loading={false}
          icona="people-outline"
          titolo={cerca || filtro ? 'Nessun contatto con questo filtro' : 'Nessun contatto'}
          aiuto={
            cerca || filtro
              ? 'Prova a togliere la ricerca o il filtro.'
              : 'Qui compaiono i negozi di Scout e le aziende del registro Anagrafiche.'
          }
        />
      ) : null}

      {aTabella && dati.length ? (
        <Tabella
          righe={dati}
          colonne={colonne}
          chiaveRiga={(r) => r.id}
          ordineIniziale={{ campo: 'nome', verso: 'asc' }}
          onRiga={(r) => {
            if (r.place) router.push(`/(app)/attivita/${r.place.id}`);
          }}
          labelRiga={(r) => `Apri ${r.nome}`}
          azioni={azioniDi}
          larghezzaAzioni={186}
          totali={(rs) => ({ nome: `Totale · ${rs.length} ${rs.length === 1 ? 'contatto' : 'contatti'}` })}
        />
      ) : (
        dati.map((r) => (
          <CardElenco
            key={r.id}
            icona={r.place ? 'storefront-outline' : 'business-outline'}
            nome={r.nome}
            meta={[r.citta, r.categoria].filter(Boolean).join(' — ') || null}
            badge={
              <>
                {tipologieDi(r).map((t) => (
                  <StatusBadge key={t.label} small label={t.label} colore={t.colore} />
                ))}
              </>
            }
            azioni={azioniDi(r)}
            onPress={r.place ? () => router.push(`/(app)/attivita/${r.place!.id}`) : undefined}
          />
        ))
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: 10 },
  headerScroll: { gap: 4 },
  chips: { marginTop: 6, marginBottom: 4 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.navy, fontWeight: '600', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  tabNome: { color: colors.testo, fontWeight: '600', fontSize: 13.5 },
  tabMuto: { color: colors.testoSoft, fontSize: 12.5 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  errore: { color: colors.errore, fontSize: 12.5, lineHeight: 18 },
  avviso: { color: colors.testo, fontSize: 12.5, lineHeight: 18 },
});
