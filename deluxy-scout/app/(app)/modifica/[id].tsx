import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { CategoryRule, Place, Priorita, Profilo, StatoAffiliazione } from '@/types';
import { LABEL_MOMENTO, MOMENTI_CONTATTO, STATI_AFFILIAZIONE, affiliazioneDaStatoPlace, canonizzaLinee, statoPlaceDaAffiliazione, type MomentoContatto } from '@/types';
import { coloreAffiliazione, colors, labelAffiliazione, radius, spacing } from '@/lib/theme';
import { aggiornaPlace, fetchPlace, fetchProfiles, nomeDaProfilo, sincronizzaPlaceRegistro } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { datiSocietariRegistro, fiscaliMancanti, urlSchedaRegistro, type DatiSocietari } from '@/lib/anagrafiche';
import { caricaRegole } from '@/lib/categoryRules';
import { AddressSearch } from '@/components/AddressSearch';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Loader } from '../../_layout';

const PRIORITA: Priorita[] = ['P1', 'P2', 'P3'];

export default function ModificaAttivita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<Place | null>(null);
  const [regole, setRegole] = useState<Omit<CategoryRule, 'id'>[]>([]);
  const [profili, setProfili] = useState<Profilo[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  const [nome, setNome] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  // Coordinate dal nuovo indirizzo scelto: se ci sono, si sposta anche il punto.
  const [coordScelte, setCoordScelte] = useState<{ lat: number; lng: number } | null>(null);
  const [zona, setZona] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [priorita, setPriorita] = useState<Priorita>('P3');
  // Stato = gli 8 stati di Anagrafiche (StatoAffiliazione). Lo stato di pipeline
  // interno di Scout viene derivato al salvataggio.
  const [statoAff, setStatoAff] = useState<StatoAffiliazione>('prospect');
  // Il momento del contatto: dimensione a sé, facoltativa (migr. 0057).
  const [momento, setMomento] = useState<MomentoContatto | null>(null);
  // Account = venditore che segue il cliente (memorizzato come nome, = campo del registro).
  const [account, setAccount] = useState<string | null>(null);
  const [linee, setLinee] = useState<string[]>([]);

  // ⭐ DATI FISCALI (03/09/2026, richiesta urgente dell'utente: «manca la
  // possibilità di inserire oltre al nome tutti i dati fiscali che poi dovranno
  // poter essere usati per emettere fatture e pro-forme»).
  //
  // ⚠️ NON sono campi di Scout: si leggono dal REGISTRO Anagrafiche e si
  // riscrivono là (Standard §7 — ogni dato ha una casa sola). Qui vivono solo
  // nello stato di questo form, il tempo di una modifica.
  const [registro, setRegistro] = useState<DatiSocietari | null>(null);
  const [registroLetto, setRegistroLetto] = useState(false);
  const [ragioneSociale, setRagioneSociale] = useState('');
  const [pIva, setPIva] = useState('');
  const [codFiscale, setCodFiscale] = useState('');
  const [provincia, setProvincia] = useState('');

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [p, r, prof] = await Promise.all([fetchPlace(id), caricaRegole(), fetchProfiles()]);
      setRegole(r);
      setProfili(prof);
      if (p) {
        setPlace(p);
        setNome(p.nome);
        setIndirizzo(p.indirizzo ?? '');
        setZona(p.zona ?? '');
        setCategoria(p.categoria);
        setPriorita(p.priorita);
        // Stato "vero" da Anagrafiche se presente, altrimenti derivato dallo stato di pipeline.
        setStatoAff(p.stato_affiliazione ?? affiliazioneDaStatoPlace[p.stato] ?? 'prospect');
        setMomento(p.livello_rapporto ?? null);
        setAccount(p.anagrafiche_account ?? null);
        // Riconduci eventuali linee legacy (es. "Regali aziendali") ai nomi del catalogo.
        setLinee(canonizzaLinee(p.linee_ipotizzate ?? (p.linea_ipotizzata ? [p.linea_ipotizzata] : [])));
        // I dati fiscali dalla scheda del registro, se il negozio è agganciato.
        // ⚠️ Senza `anagrafiche_id` non si chiede niente: non c'è una scheda a
        // cui riferirsi, e la si creerà al salvataggio (l'upsert del registro
        // aggancia per riferimento esterno scout+place_id).
        if (p.anagrafiche_id) {
          const d = await datiSocietariRegistro(p.anagrafiche_id);
          setRegistro(d);
          setRegistroLetto(true);
          if (d) {
            setRagioneSociale(d.ragioneSociale ?? '');
            setPIva(d.pIva ?? '');
            setCodFiscale(d.codiceFiscale ?? '');
            setProvincia(d.provincia ?? '');
          }
        }
      }
      setLoading(false);
    })();
  }, [id]);

  const categorie = useMemo(
    () => Array.from(new Set(regole.map((r) => r.categoria))).sort(),
    [regole],
  );

  // Venditori assegnabili come account: i membri del team (per nome). Se il
  // cliente ha già un account che non è tra i profili (es. impostato nel registro),
  // lo aggiungo comunque così resta visibile e selezionato.
  const venditori = useMemo(() => {
    const nomi = profili.map(nomeDaProfilo);
    if (account && !nomi.includes(account)) nomi.push(account);
    return Array.from(new Set(nomi)).sort();
  }, [profili, account]);

  // Che cosa manca ADESSO per fatturare: si guarda quello che c'è nel form,
  // non la fotografia del registro — così la spunta si accende mentre si
  // scrive, ed è la stessa regola che blocca la vinta (`fiscaliMancanti`).
  //
  // ⚠️ Indirizzo e città NON sono campi di questa sezione: sono l'indirizzo e
  // la zona qui sopra, che al salvataggio finiscono nel registro. Chiederli due
  // volte vorrebbe dire tenerne due versioni.
  const mancanti = useMemo(
    () =>
      fiscaliMancanti({
        nome,
        ragioneSociale: ragioneSociale.trim() || null,
        indirizzo: indirizzo.trim() || null,
        citta: zona.trim() || null,
        provincia: provincia.trim() || null,
        pIva: pIva.trim() || null,
        codiceFiscale: codFiscale.trim() || null,
        pagaDaSe: true,
        capogruppo: null,
      }),
    [nome, ragioneSociale, indirizzo, zona, provincia, pIva, codFiscale],
  );
  const linkRegistro = urlSchedaRegistro(place?.anagrafiche_id);

  async function salva() {
    if (!place) return;
    if (!nome.trim()) {
      avvisa('Nome mancante', 'Il nome non può essere vuoto.');
      return;
    }
    setSalvataggio(true);
    try {
      await aggiornaPlace(place.id, {
        nome: nome.trim(),
        indirizzo: indirizzo.trim() || null,
        // Solo se un indirizzo nuovo e' stato scelto: senza, si sovrascriverebbero
        // coordinate buone con quelle vecchie.
        ...(coordScelte ? { lat: coordScelte.lat, lng: coordScelte.lng } : {}),
        zona: zona.trim() || null,
        categoria,
        priorita,
        stato_affiliazione: statoAff,
        livello_rapporto: momento,
        // Deriva lo stato di pipeline dallo stato di Anagrafiche (percorso/filtri coerenti).
        stato: statoPlaceDaAffiliazione[statoAff],
        anagrafiche_account: account,
        linea_ipotizzata: linee[0] ?? null,
        linee_ipotizzate: linee,
      });
      // ⭐ I DATI FISCALI VANNO NEL REGISTRO, e l'esito si dice.
      //
      // ⚠️ Le altre sincronizzazioni di questa pagina sono best-effort e mute
      // (`.catch(() => {})`): lo stato commerciale si può risincronizzare al
      // giro dopo. Questi no. Uno che scrive la P.IVA per poter fatturare deve
      // sapere SUBITO se è arrivata: crederla salva e scoprire alla vinta che
      // manca è esattamente il giro che questa funzione serve a evitare.
      //
      // ⚠️ Se fattura la capogruppo non si manda niente: quei campi stanno
      // sulla SUA scheda, e scriverli sulla sede vorrebbe dire metterli dove
      // nessuno li legge più.
      const fatturaLaCapogruppo = registro?.pagaDaSe === false;
      const fiscali = {
        ragioneSociale: ragioneSociale.trim() || null,
        pIva: pIva.trim() || null,
        codiceFiscale: codFiscale.trim() || null,
        provincia: provincia.trim() || null,
      };
      const fiscaliCambiati =
        !fatturaLaCapogruppo &&
        ((fiscali.ragioneSociale ?? '') !== (registro?.ragioneSociale ?? '') ||
          (fiscali.pIva ?? '') !== (registro?.pIva ?? '') ||
          (fiscali.codiceFiscale ?? '') !== (registro?.codiceFiscale ?? '') ||
          (fiscali.provincia ?? '') !== (registro?.provincia ?? ''));
      if (fiscaliCambiati) {
        const esito = await sincronizzaPlaceRegistro(place.id, { fiscali });
        if (!esito.ok) {
          avvisa(
            'Il resto è salvato, i dati fiscali no',
            `Il registro Anagrafiche non li ha presi: ${esito.reason ?? 'non risponde'}.\n\nRiprova a salvare: senza P.IVA nel registro non si può emettere la fattura.`,
          );
          return;
        }
      } else {
        // Propaga lo stato (e gli interessi) al registro Anagrafiche.
        sincronizzaPlaceRegistro(place.id).catch(() => {});
      }
      // Drawer senza stack lineare: torniamo al dettaglio, non alla Mappa.
      router.replace(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile salvare le modifiche.');
    } finally {
      setSalvataggio(false);
    }
  }

  if (loading) return <Loader />;
  if (!place) return <Text style={styles.err}>Attività non trovata.</Text>;

  return (
    <>
      <Stack.Screen options={{ title: 'Modifica attività' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nome *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Indirizzo</Text>
          {/* Ricerca Google come nel form di inserimento: correggere un
              indirizzo sbagliato a mano vuol dire riscriverlo tutto, e spesso
              rifarlo sbagliato. Scegliendo un suggerimento si aggiorna anche la
              posizione sulla mappa, che a mano non si potrebbe toccare. */}
          <AddressSearch
            placeholder="Cerca il nuovo indirizzo…"
            onSelect={(r) => {
              setIndirizzo(r.formatted_address);
              setCoordScelte({ lat: r.lat, lng: r.lng });
            }}
            onClear={() => setCoordScelte(null)}
          />
          <TextInput
            style={[styles.input, styles.inputSotto]}
            value={indirizzo}
            onChangeText={setIndirizzo}
            placeholder="…oppure scrivilo a mano"
            placeholderTextColor={colors.grigio}
          />
          {coordScelte ? (
            <Text style={styles.posNota}>
              <Ionicons name="location" size={12} color={colors.successo} /> Anche la posizione sulla mappa verrà
              aggiornata.
            </Text>
          ) : null}

          <Text style={styles.label}>Zona</Text>
          <TextInput style={styles.input} value={zona} onChangeText={setZona} placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.chipWrap}>
            {categorie.map((c) => (
              <Chip key={c} label={c} on={categoria === c} onPress={() => setCategoria(c)} />
            ))}
          </View>

          <Text style={styles.label}>Tipologia di interesse (linea)</Text>
          <LineaSelector value={linee} onChange={setLinee} soloCanoniche />

          <Text style={styles.label}>Priorità</Text>
          <View style={styles.chipWrap}>
            {PRIORITA.map((p) => (
              <Pressable key={p} onPress={() => setPriorita(p)} style={[styles.chip, styles.chipPrio, priorita === p && styles.chipPrioOn]}>
                <PriorityBadge priorita={p} small />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Stato</Text>
          <View style={styles.chipWrap}>
            {STATI_AFFILIAZIONE.map((s) => {
              const on = statoAff === s;
              return (
                <Pressable key={s} onPress={() => setStatoAff(s)} style={[styles.chip, styles.chipStato, on && styles.chipOn]}>
                  <View style={[styles.dot, { backgroundColor: on ? colors.bianco : coloreAffiliazione[s] }]} />
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{labelAffiliazione[s]}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* La seconda dimensione: dove siamo DENTRO lo stato. Si toglie
              premendolo di nuovo — «nessun momento» è una risposta valida, e
              anzi è quella giusta appena la conversazione si chiude. */}
          <Text style={styles.label}>Momento del contatto</Text>
          <Text style={styles.hint}>
            Facoltativo. Dice a che punto è la conversazione, non a che punto è il rapporto: un «in attesa» vale su un
            Lead come su un Cliente. Premi di nuovo per toglierlo.
          </Text>
          <View style={styles.chipWrap}>
            {MOMENTI_CONTATTO.map((m) => {
              const on = momento === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMomento(on ? null : m)}
                  style={[styles.chip, styles.chipStato, on && styles.chipOn]}
                >
                  <View style={[styles.dot, { backgroundColor: on ? colors.bianco : colors.blue }]} />
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{LABEL_MOMENTO[m]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Account (venditore)</Text>
          <Text style={styles.hint}>Il venditore che segue questo cliente. Al salvataggio viene aggiornato anche su Anagrafiche.</Text>
          <View style={styles.chipWrap}>
            <Chip label="Nessuno" on={!account} onPress={() => setAccount(null)} />
            {venditori.map((v) => (
              <Chip key={v} label={v} on={account === v} onPress={() => setAccount(v)} />
            ))}
          </View>

          {/* ⭐ DATI FISCALI — 03/09/2026. Servono a FINANCE per intestare
              pro-forma e fatture, e dal 03/09 una trattativa non si può
              chiudere VINTA senza di loro. ⚠️ Non stanno in Scout: la casa è il
              registro Anagrafiche, e da qui si leggono e si riscrivono là. */}
          <Text style={styles.sezione}>Dati fiscali</Text>
          <Text style={styles.hint}>
            Con questi si intestano pro-forma e fatture. Vivono nel registro Anagrafiche — non in Scout — quindi appena
            salvati li vedono anche FINANCE e le altre app.
          </Text>

          {registro?.pagaDaSe === false ? (
            // Fattura la capogruppo: i campi sono i SUOI. Modificarli qui
            // vorrebbe dire scriverli sulla sede, dove nessuno li legge.
            <View style={styles.avvisoBox}>
              <Text style={styles.avvisoTxt}>
                Fattura la capogruppo{registro.capogruppo ? ` ${registro.capogruppo}` : ''}: ragione sociale, P.IVA e
                codice fiscale stanno sulla sua scheda e si modificano nel registro.
              </Text>
            </View>
          ) : (
            <>
              {mancanti.length ? (
                <View style={styles.mancaBox}>
                  <Ionicons name="alert-circle" size={15} color={colors.errore} />
                  <Text style={styles.mancaTxt}>
                    Per fatturare manca: {mancanti.join(', ')}. Senza questi la trattativa non si può chiudere vinta.
                  </Text>
                </View>
              ) : (
                <View style={styles.okBox}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.successo} />
                  <Text style={styles.okTxt}>Completi: si può fatturare.</Text>
                </View>
              )}

              <Text style={styles.label}>Ragione sociale</Text>
              <Text style={styles.hint}>Come si chiama la società sui documenti, se è diversa dall'insegna.</Text>
              <TextInput
                style={styles.input}
                value={ragioneSociale}
                onChangeText={setRagioneSociale}
                placeholder="Es. Rossi Fiori S.r.l."
                placeholderTextColor={colors.grigio}
              />

              <Text style={styles.label}>Partita IVA</Text>
              <TextInput
                style={styles.input}
                value={pIva}
                onChangeText={setPIva}
                placeholder="11 cifre"
                placeholderTextColor={colors.grigio}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Codice fiscale</Text>
              <Text style={styles.hint}>
                Serve quando è diverso dalla P.IVA, o al posto suo per una ditta individuale.
              </Text>
              <TextInput
                style={styles.input}
                value={codFiscale}
                onChangeText={setCodFiscale}
                placeholder="Se diverso dalla P.IVA"
                placeholderTextColor={colors.grigio}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Provincia</Text>
              <TextInput
                style={styles.input}
                value={provincia}
                onChangeText={setProvincia}
                placeholder="Es. MI"
                placeholderTextColor={colors.grigio}
                autoCapitalize="characters"
              />

              {/* ⚠️ L'indirizzo di fatturazione è QUELLO QUI SOPRA: nel registro
                  l'azienda ha un indirizzo solo, e il CAP non è una colonna a
                  sé — va scritto dentro l'indirizzo, o sulla fattura non c'è. */}
              <Text style={styles.hint}>
                L'indirizzo della fattura è quello scritto sopra, insieme alla zona (= città): scrivi il CAP dentro
                l'indirizzo, nel registro non c'è un campo suo.
              </Text>
            </>
          )}

          {!place.anagrafiche_id ? (
            <Text style={styles.hint}>
              Questo negozio non è ancora agganciato a una scheda del registro: salvando, la scheda viene creata (o
              ritrovata, se c'era già) e i dati fiscali finiscono là.
            </Text>
          ) : registroLetto && !registro ? (
            <Text style={styles.hint}>
              Non ho potuto leggere la scheda nel registro (non risponde, o la scheda non c'è più): quello che scrivi
              qui viene comunque mandato al salvataggio.
            </Text>
          ) : linkRegistro ? (
            <Pressable onPress={() => Linking.openURL(linkRegistro)} style={styles.apri}>
              <Ionicons name="open-outline" size={14} color={colors.navy} />
              <Text style={styles.apriTxt}>Apri la scheda nel registro</Text>
            </Pressable>
          ) : null}

          <Pressable style={[styles.salva, salvataggio && styles.salvaOff]} onPress={salva} disabled={salvataggio}>
            <Text style={styles.salvaTxt}>{salvataggio ? 'Salvataggio…' : 'Salva modifiche'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
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
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  err: { padding: spacing.xxl, color: colors.errore },
  label: { color: colors.testoSoft, fontWeight: '500', fontSize: 12.5, marginTop: spacing.xxl, marginBottom: 6 },
  hint: { color: colors.grigio, fontSize: 12, marginTop: -2, marginBottom: 8 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.testo,
  },
  inputSotto: { marginTop: 6 },
  sezione: {
    color: colors.testo,
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: -0.3,
    marginTop: spacing.xxxl,
    marginBottom: 4,
  },
  mancaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF4F4',
    borderWidth: 1,
    borderColor: '#F3D2D2',
    borderRadius: radius.m,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: 8,
  },
  mancaTxt: { color: colors.errore, fontSize: 12.5, flex: 1 },
  okBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F8F3',
    borderWidth: 1,
    borderColor: '#D6E8DB',
    borderRadius: radius.m,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: 8,
  },
  okTxt: { color: colors.successo, fontSize: 12.5, flex: 1 },
  avvisoBox: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: 8,
  },
  avvisoTxt: { color: colors.testoSoft, fontSize: 12.5 },
  apri: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  apriTxt: { color: colors.navy, fontSize: 12.5, fontWeight: '600' },
  posNota: { color: colors.testoSoft, fontSize: 12.5, marginTop: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  // Priorità: NON riempire di navy (il badge interno non si leggerebbe), ma
  // evidenziare la selezione con un anello scuro su sfondo chiaro.
  chipPrio: { paddingHorizontal: 10 },
  chipPrioOn: { borderColor: colors.navy, borderWidth: 2, backgroundColor: colors.fillActive },
  chipStato: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  salva: {
    marginTop: spacing.xxl,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  salvaOff: { opacity: 0.55 },
  salvaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 17 },
});
