// Qualifica di una richiesta web: si sceglie il NEGOZIO e lì nasce la
// trattativa (canale web). La finestra dice CHI ha scritto e COSA chiede coi
// dati estratti (lib/lead-parse), non con l'estratto grezzo della notifica; e
// quando la ricerca non trova nessun negozio lo dice, spiegando anche il caso
// tipico: la richiesta di un privato non ha un negozio — si gestisce dal
// Customer Service e qui si scarta.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { Foglio } from '@/components/Foglio';
import { cercaPlaces, creaPlaceDaRichiesta, qualificaLead, type PlaceLite } from '@/lib/db';
import { estraiAnagrafica, type DatiEstratti, type EsitoRegistro } from '@/lib/anagrafiche';
import { analizzaMessaggioLead } from '@/lib/lead-parse';
import type { Lead } from '@/types';

export function QualificaLeadModal({
  lead,
  onClose,
  onFatto,
}: {
  lead: Lead;
  onClose: () => void;
  // L'esito del registro Anagrafiche viaggia fino alla schermata: chi qualifica
  // deve sapere se l'azienda è appena NATA di là, se c'era già, o se il
  // registro non l'ha presa.
  onFatto: (registro: EsitoRegistro) => void;
}) {
  const info = analizzaMessaggioLead(lead.nome, lead.messaggio);
  // Chi ci ha scritto è una persona vera, con nome e recapito: se non lo si
  // salva ora, va ridigitato dopo nella scheda del negozio.
  const conContatto = Boolean(lead.contatto);
  // Il mittente robot («Business Deluxy (Shopify)») non è un negozio: cercarlo
  // non troverebbe MAI niente. Si parte con la ricerca vuota, che elenca i
  // primi negozi, e chi qualifica scrive il nome giusto.
  const [ricerca, setRicerca] = useState(info.daModuloSito ? '' : lead.nome);
  const [risultati, setRisultati] = useState<PlaceLite[]>([]);
  const [cercato, setCercato] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * ⭐ L'AI LEGGE LA RICHIESTA E COMPILA I CAMPI (26/08/2026, richiesta
   * dell'utente: «usa l'ai per capire esattamente come compilare tutti i
   * campi»).
   *
   * Nasce da un caso vero: creando il negozio dalla qualifica, nel registro
   * Anagrafiche finiva una scheda muta — nome della persona, niente città,
   * niente indirizzo, niente categoria — mentre tutto era scritto dentro il
   * messaggio.
   *
   * ⚠️ I campi si MOSTRANO e si possono correggere prima di scrivere: un
   * modello che riempie una scheda senza che nessuno guardi è il modo più
   * veloce di sporcare il registro. E `fonte` dice se li ha letti l'AI o le
   * regole fisse, perché cambia quanto ci si può fidare.
   */
  const [dati, setDati] = useState<DatiEstratti | null>(null);
  const [fonteDati, setFonteDati] = useState<'ai' | 'regole' | null>(null);
  const [avvisoDati, setAvvisoDati] = useState<string | null>(null);
  const [leggendo, setLeggendo] = useState(false);

  useEffect(() => {
    const testo = (lead.messaggio ?? '').trim();
    if (!testo) return;
    let vivo = true;
    setLeggendo(true);
    estraiAnagrafica(testo, lead.contatto ?? null, null)
      .then((r) => {
        if (!vivo) return;
        setDati(r.dati);
        setFonteDati(r.fonte);
        setAvvisoDati(r.avviso ?? null);
        // Se il messaggio dice il nome dell'azienda, si cerca QUELLO: è la
        // cosa che ha più probabilità di essere già nel CRM.
        if (r.dati.ragioneSociale && info.daModuloSito) setRicerca(r.dati.ragioneSociale);
      })
      .catch((e) => vivo && setAvvisoDati(String(e?.message ?? e)))
      .finally(() => vivo && setLeggendo(false));
    return () => {
      vivo = false;
    };
    // Una volta sola, all'apertura: il testo della richiesta non cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        setRisultati(await cercaPlaces(ricerca));
      } catch {
        setRisultati([]);
      } finally {
        setCercato(true);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [ricerca]);

  async function scegli(p: PlaceLite) {
    if (salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      const { registro } = await qualificaLead(lead, p.id, conContatto);
      onFatto(registro);
    } catch (e: any) {
      setErrore(e?.message ?? 'Qualifica non riuscita');
      setSalvando(false);
    }
  }

  /**
   * Il negozio che non c'è: si crea da qui, e la trattativa nasce su di lui.
   *
   * ⚠️ Segnalato dall'utente il 26/08/2026: «qualifica non crea, vedo ancora
   * solo la possibilità di ricerca». Era il caso più frequente — una richiesta
   * dal modulo del sito porta il nome di una persona che nel CRM non esiste:
   * cercarla non la trova, e senza questo bottone la richiesta restava ferma.
   */
  async function creaEQualifica() {
    if (salvando) return;
    const nome = daCreare;
    if (!nome) return;
    setSalvando(true);
    setErrore(null);
    try {
      // Il negozio nasce già con quello che la richiesta diceva: da qui i campi
      // arrivano al registro Anagrafiche, che senza restava con una scheda muta.
      const posto = await creaPlaceDaRichiesta(nome, {
        zona: dati?.citta ?? null,
        indirizzo: dati?.indirizzo ?? null,
        categoria: dati?.categoria ?? null,
      });
      const { registro } = await qualificaLead(lead, posto.id, conContatto);
      onFatto(registro);
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile creare il negozio');
      setSalvando(false);
    }
  }

  const chi = info.persona || lead.nome;
  // Che nome avrebbe il negozio nuovo: quello che si sta cercando, se si sta
  // cercando qualcosa; altrimenti la persona che ci ha scritto — che è ciò che
  // di lei sappiamo. ⚠️ Mai il mittente robot del modulo Shopify: creare
  // «Business Deluxy (Shopify)» come negozio sarebbe una scheda finta.
  // ⚠️ L'AZIENDA SCRITTA NEL CAMPO VINCE (corretto il 27/08/2026). Il campo
  // «Azienda» è modificabile apposta — è lì perché chi qualifica corregga
  // quello che l'AI ha letto — ma il suo valore non arrivava da nessuna parte:
  // il negozio nasceva col contenuto della casella di RICERCA, che per una
  // richiesta non arrivata dal modulo del sito parte col nome della PERSONA.
  // Si correggeva «Fiori Rossi Srl» e si creava un negozio intestato a chi
  // aveva scritto la mail — e quel nome sbagliato veniva poi propagato ad
  // Anagrafiche, dove resta.
  const daCreare =
    (dati?.ragioneSociale?.trim() || ricerca.trim() || (info.daModuloSito ? info.persona || '' : lead.nome)).trim();

  return (
    <Foglio
      titolo="A quale negozio appartiene?"
      sottotitolo="La trattativa nasce sul negozio che scegli, sul canale web. Il negozio entra anche nel registro Anagrafiche, se non c'è già."
      onClose={onClose}
    >
      {/* Il riepilogo di COSA si sta qualificando: persona, recapiti, richiesta. */}
      <View style={styles.riepilogo}>
        <Text style={styles.riepilogoChi} numberOfLines={1}>
          {chi}
          {info.email ? <Text style={styles.riepilogoContatto}>  ·  {info.email}</Text> : null}
          {!info.email && lead.contatto ? <Text style={styles.riepilogoContatto}>  ·  {lead.contatto}</Text> : null}
        </Text>
        {info.testo ? (
          <Text style={styles.riepilogoTesto} numberOfLines={3}>{info.testo}</Text>
        ) : null}
      </View>

      {/* QUELLO CHE LA RICHIESTA DICE, letto e messo in chiaro: si corregge
          qui, prima che finisca nel registro. */}
      {leggendo ? (
        <Text style={styles.stato}>Leggo la richiesta per compilare la scheda…</Text>
      ) : dati ? (
        <View style={styles.scheda}>
          <Text style={styles.schedaTitolo}>
            {fonteDati === 'ai' ? 'Letto dalla richiesta' : 'Letto dalla richiesta (regole fisse)'}
          </Text>
          {(
            [
              ['Azienda', dati.ragioneSociale, (v: string) => setDati({ ...dati, ragioneSociale: v })],
              ['Città', dati.citta, (v: string) => setDati({ ...dati, citta: v })],
              ['Indirizzo', dati.indirizzo, (v: string) => setDati({ ...dati, indirizzo: v })],
              ['Categoria', dati.categoria, (v: string) => setDati({ ...dati, categoria: v.toUpperCase() })],
            ] as [string, string | null, (v: string) => void][]
          ).map(([label, valore, cambia]) => (
            <View key={label} style={styles.schedaRiga}>
              <Text style={styles.schedaLabel}>{label}</Text>
              <TextInput
                style={styles.schedaInput}
                value={valore ?? ''}
                onChangeText={cambia}
                placeholder="non indicato"
                placeholderTextColor={colors.grigio}
              />
            </View>
          ))}
          {dati.referente?.nome || dati.referente?.email ? (
            <Text style={styles.schedaNota} numberOfLines={1}>
              Referente: {[dati.referente.nome, dati.referente.email, dati.referente.telefono].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {/* ⚠️ Quello che NON c'era scritto si dichiara: un campo vuoto è
              un'informazione, un campo riempito a caso è un danno. */}
          {dati.mancanti?.length ? (
            <Text style={styles.schedaNota}>Non c’era scritto: {dati.mancanti.join(', ')}.</Text>
          ) : null}
          {avvisoDati ? <Text style={styles.schedaNota}>{avvisoDati}</Text> : null}
        </View>
      ) : avvisoDati ? (
        <Text style={styles.schedaNota}>{avvisoDati}</Text>
      ) : null}

      <TextInput
        style={styles.input}
        value={ricerca}
        onChangeText={setRicerca}
        placeholder="Cerca il negozio per nome o indirizzo…"
        placeholderTextColor={colors.grigio}
        autoFocus
      />
      {/* View e non ScrollView: il tetto e lo scroll li dà il corpo del Foglio
          (che ha già keyboardShouldPersistTaps) — due ScrollView annidate sullo
          stesso asse sono vietate (Libro v1.7 §9). */}
      <View style={{ gap: 8 }}>
        {risultati.map((p) => (
          <Pressable key={p.id} style={styles.risultato} onPress={() => scegli(p)} disabled={salvando}>
            <Ionicons name="storefront-outline" size={16} color={colors.testoSoft} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={styles.risNome}>{p.nome}</Text>
              {p.indirizzo ? <Text style={styles.risInd} numberOfLines={1}>{p.indirizzo}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.grigio} />
          </Pressable>
        ))}
        {cercato && risultati.length === 0 ? (
          <View style={styles.vuoto}>
            <Text style={styles.vuotoTitolo}>
              {ricerca.trim() ? `Nessun negozio per «${ricerca.trim()}»` : 'Nessun negozio in elenco'}
            </Text>
            <Text style={styles.vuotoTesto}>
              Se è un cliente nuovo, crealo qui sotto. Se invece è la richiesta di un privato (un
              ordine, un catering personale), non ha un negozio: si gestisce dal Customer Service, e
              qui si scarta.
            </Text>
          </View>
        ) : null}
      </View>

      {/* IL NEGOZIO CHE NON C'È. Sta sempre a schermo, non solo quando la
          ricerca è vuota: chi qualifica spesso vede degli omonimi che non sono
          il suo, e deve poter dire «nessuno di questi, è nuovo». */}
      {daCreare ? (
        <Pressable style={[styles.crea, salvando && { opacity: 0.5 }]} onPress={creaEQualifica} disabled={salvando}>
          <Ionicons name="add-circle-outline" size={16} color={colors.bianco} />
          <Text style={styles.creaTxt} numberOfLines={1}>
            Crea «{daCreare}» e apri la trattativa
          </Text>
        </Pressable>
      ) : null}
      {salvando ? <Text style={styles.stato}>Apro la trattativa…</Text> : null}
      {errore ? <Text style={styles.errore}>{errore}</Text> : null}
    </Foglio>
  );
}

const styles = StyleSheet.create({
  riepilogo: {
    backgroundColor: colors.fill,
    borderRadius: radius.m,
    padding: 12,
    gap: 4,
  },
  riepilogoChi: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  riepilogoContatto: { color: colors.testoSoft, fontWeight: '400', fontSize: 12.5 },
  riepilogoTesto: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.m,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.testo,
    fontSize: 14,
  },
  risultato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: 10,
  },
  risNome: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  risInd: { color: colors.testoSoft, fontSize: 12 },
  vuoto: { padding: 12, gap: 4 },
  vuotoTitolo: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  vuotoTesto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  crea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.testo,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  creaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
  stato: { color: colors.testoSoft, fontSize: 13 },
  scheda: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.l, padding: 10, gap: 6 },
  schedaTitolo: { color: colors.testoSoft, fontWeight: '700', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  schedaRiga: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  schedaLabel: { color: colors.testoSoft, fontSize: 12.5, width: 78 },
  schedaInput: { flex: 1, borderBottomWidth: 1, borderBottomColor: colors.hairline, color: colors.testo, fontSize: 13.5, paddingVertical: 3 },
  schedaNota: { color: colors.testoSoft, fontSize: 12, lineHeight: 17 },
  errore: { color: colors.errore, fontSize: 13, fontWeight: '700' },
});
