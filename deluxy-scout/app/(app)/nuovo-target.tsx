import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
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
import type { CategoryRule } from '@/types';
import { colors, radius, spacing } from '@/lib/theme';
import { caricaRegole, regolaPerCategoria } from '@/lib/categoryRules';
import { inserisciPlace, registraContattoAvviato, registroContattiDisponibile, type CanaleContatto } from '@/lib/db';
import { avvisa } from '@/lib/dialoghi';
import { posizioneCorrente, type Coord } from '@/lib/location';
import { AddressSearch } from '@/components/AddressSearch';
import { BoxIpotesi } from '@/components/BoxIpotesi';
import { LineaSelector } from '@/components/LineaSelector';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Loader } from '../_layout';

/** I canali proponibili qui: chiamate e visite hanno una loro schermata e un
 *  loro registro (`chiamate`, `visits`), non passano da qui. */
const CANALI: { id: CanaleContatto; label: string; icona: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'email', label: 'Email', icona: 'mail-outline' },
  { id: 'whatsapp', label: 'WhatsApp', icona: 'logo-whatsapp' },
  // Il contatto può arrivare anche dal verso opposto: ci ha scritto lui dal
  // sito o dai social. Resta un contatto avviato a tutti gli effetti.
  { id: 'web', label: 'Dal web', icona: 'globe-outline' },
  { id: 'altro', label: 'Di persona o altro', icona: 'ellipsis-horizontal' },
];

/**
 * La citta' dall'indirizzo formattato di Google — «Via della Spiga, 1, 20121
 * Milano MI, Italia» → «Milano». Si toglie il CAP e la sigla provincia, che
 * nella zona non servono; se non si riconosce niente si torna stringa vuota e
 * il campo resta da riempire a mano, invece di metterci «Italia».
 */
function cittaDaIndirizzo(formattato: string): string {
  const parti = formattato.split(',').map((p) => p.trim()).filter(Boolean);
  // L'ultima e' il paese: si scarta. La penultima e' di solito «20121 Milano MI».
  const candidata = parti.length >= 2 ? parti[parti.length - 2] : '';
  const citta = candidata
    .replace(/^\d{4,5}\s*/, '') // CAP iniziale
    .replace(/\s+[A-Z]{2}$/, '') // sigla provincia finale
    .trim();
  // Se quello che resta è ancora una via, l'indirizzo non aveva il paese in
  // fondo (Google ce l'ha sempre, altri no): meglio lasciare vuoto che
  // scrivere «Corso Venezia 5» nel campo della zona.
  return /^(via|viale|corso|piazza|largo|vicolo|strada|str\.|p\.zza)\b/i.test(citta) ? '' : citta;
}

export default function NuovoTarget() {
  const router = useRouter();
  // `come=lead` quando si arriva col + dalla sezione Lead: il negozio nasce
  // già contattato. Senza, nascerebbe Selezionato e sparirebbe subito dalla
  // lista da cui lo si è appena creato.
  const { come } = useLocalSearchParams<{ come?: string }>();
  const nasceLead = come === 'lead';
  const [canale, setCanale] = useState<CanaleContatto>('altro');
  const [regole, setRegole] = useState<Omit<CategoryRule, 'id'>[]>([]);
  const [pos, setPos] = useState<Coord | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  const [nome, setNome] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [zona, setZona] = useState('');
  // Le coordinate scelte da Google. Prima il negozio si poteva creare SOLO
  // stando fisicamente davanti (serviva il GPS): dalla scrivania il form si
  // bloccava su «Attendi il check-in GPS», e un negozio visto su internet non
  // si poteva inserire. Ora l'indirizzo scelto porta con sé la posizione.
  const [coordScelte, setCoordScelte] = useState<Coord | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [lineeOverride, setLineeOverride] = useState<string[] | null>(null);

  // Il registro dei contatti c'è? Si controlla all'APERTURA, non al
  // salvataggio: scoprire che il negozio non diventerà un Lead dopo aver
  // compilato tutto il form è il modo peggiore di dirlo.
  const [registroOk, setRegistroOk] = useState(true);

  useEffect(() => {
    (async () => {
      setRegole(await caricaRegole());
      setLoading(false);
      posizioneCorrente().then(setPos);
      if (nasceLead) setRegistroOk(await registroContattiDisponibile());
    })();
  }, [nasceLead]);

  // Categorie uniche disponibili (dal set di regole).
  const categorie = useMemo(
    () => Array.from(new Set(regole.map((r) => r.categoria))).sort(),
    [regole],
  );

  // Ipotesi pre-calcolata dalla categoria scelta.
  const ipotesi = useMemo(
    () => (categoria ? regolaPerCategoria(categoria, regole) : null),
    [categoria, regole],
  );

  // Tipologia di interesse effettiva: la scelta manuale ha la precedenza sull'ipotesi.
  const lineeScelte = lineeOverride ?? (ipotesi?.linea_ipotizzata ? [ipotesi.linea_ipotizzata] : []);

  async function salva() {
    if (!nome.trim()) {
      avvisa('Nome mancante', 'Inserisci il nome dell’attività.');
      return;
    }
    // La posizione può arrivare da due strade: l'indirizzo scelto su Google
    // (si inserisce da scrivania) o il GPS (si è davanti al negozio). Prima
    // c'era solo la seconda, e senza segnale non si salvava.
    const posizione = coordScelte ?? pos;
    if (!posizione) {
      avvisa(
        'Manca la posizione',
        'Cerca l’indirizzo qui sopra e scegli un suggerimento: la posizione arriva da lì. Oppure attendi il segnale GPS se sei davanti al negozio.',
      );
      return;
    }
    setSalvataggio(true);
    try {
      const regola = ipotesi ?? regolaPerCategoria('altro', regole);
      const place = await inserisciPlace({
        nome: nome.trim(),
        indirizzo: indirizzo.trim() || null,
        lat: posizione.lat,
        lng: posizione.lng,
        categoria: categoria,
        settore: null,
        zona: zona.trim() || null,
        priorita: regola?.priorita ?? 'P3',
        linea_ipotizzata: lineeScelte[0] ?? regola?.linea_ipotizzata ?? null,
        linee_ipotizzate: lineeScelte.length ? lineeScelte : regola?.linea_ipotizzata ? [regola.linea_ipotizzata] : null,
        aggancio_apertura: regola?.aggancio_apertura ?? null,
      });
      if (nasceLead) {
        // Qui l'errore NON si ingoia: il negozio è stato creato comunque, ma
        // senza questa riga resta un Selezionato e chi l'ha appena inserito
        // come lead non lo ritroverebbe più dove lo cerca.
        try {
          await registraContattoAvviato({ placeIds: [place.id], canale });
        } catch (e: any) {
          // L'errore grezzo di PostgREST («Could not find the table … in the
          // schema cache») dice la verità ma non aiuta: quello che serve sapere
          // è che manca una migrazione e quale comando la applica.
          const msg = String(e?.message ?? '');
          const migrazione = /contatti_avviati|schema cache|does not exist/i.test(msg);
          avvisa(
            'Creato, ma non segnato come contattato',
            `${nome.trim()} è stato salvato: lo trovi fra i Selezionati, non fra i Lead.\n\n` +
              (migrazione
                ? 'Il registro dei contatti non esiste ancora nel database: manca la migrazione 0046. Si applica lanciando `node scripts/allinea-supabase.mjs` nella cartella deluxy-scout. Fatto quello, basta rifare l’azione di contatto su questo negozio perché diventi un Lead.'
                : msg || 'Registro dei contatti non disponibile.'),
          );
        }
      }
      router.replace(`/(app)/attivita/${place.id}`);
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Impossibile salvare il target.');
    } finally {
      setSalvataggio(false);
    }
  }

  if (loading) return <Loader />;

  return (
    <>
      <Stack.Screen options={{ title: nasceLead ? 'Nuovo lead' : 'Nuovo target' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Dice quale posizione verrà salvata. Prima diceva solo se il GPS
              aveva agganciato, e restava «Acquisizione posizione…» per sempre
              da scrivania — sembrava un blocco, ed era anche vero. */}
          <Text style={styles.checkin}>
            <Ionicons
              name={coordScelte ? 'location' : 'location-outline'}
              size={14}
              color={coordScelte ? colors.successo : colors.testoSoft}
            />{' '}
            {coordScelte
              ? 'Posizione dall’indirizzo scelto'
              : pos
                ? 'Posizione dal GPS (sei qui)'
                : 'Nessuna posizione: cerca l’indirizzo qui sotto'}
          </Text>

          <Text style={styles.label}>Nome attività *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Es. Boutique Aurea" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Indirizzo</Text>
          {/* Ricerca Google, la stessa della Mappa: scegliendo un suggerimento
              arrivano l'indirizzo per esteso E le coordinate. Senza, il negozio
              si poteva creare solo stando fisicamente lì col GPS acceso. */}
          <AddressSearch
            placeholder="Cerca l’indirizzo del negozio…"
            onSelect={(r) => {
              setIndirizzo(r.formatted_address);
              setCoordScelte({ lat: r.lat, lng: r.lng });
              // La zona si ricava dall'indirizzo (Milano/Roma/Firenze/Altre) ma
              // resta modificabile: chi conosce il territorio scrive «Brera»,
              // che vale più di «Milano».
              if (!zona.trim()) setZona(cittaDaIndirizzo(r.formatted_address));
            }}
            onClear={() => setCoordScelte(null)}
          />
          {indirizzo ? (
            <Text style={styles.sceltoTxt} numberOfLines={2}>
              <Ionicons name="location" size={12} color={colors.successo} /> {indirizzo}
              {coordScelte ? ' · posizione trovata' : ''}
            </Text>
          ) : null}
          {/* Resta modificabile a mano: gli indirizzi che Google non conosce
              esistono, e un form che li rifiuta è un form che non si usa. */}
          <TextInput
            style={[styles.input, styles.inputSotto]}
            value={indirizzo}
            onChangeText={setIndirizzo}
            placeholder="…oppure scrivilo a mano"
            placeholderTextColor={colors.grigio}
          />

          <Text style={styles.label}>Zona</Text>
          <TextInput style={styles.input} value={zona} onChangeText={setZona} placeholder="Es. Quadrilatero, Brera…" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.chipWrap}>
            {categorie.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategoria(c)}
                style={[styles.chip, categoria === c && styles.chipOn]}
              >
                <Text style={[styles.chipTxt, categoria === c && styles.chipTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {ipotesi ? (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.prioRow}>
                <Text style={styles.label}>Priorità automatica</Text>
                <PriorityBadge priorita={ipotesi.priorita} small />
              </View>
              <BoxIpotesi linea={ipotesi.linea_ipotizzata} aggancio={ipotesi.aggancio_apertura} />
            </View>
          ) : null}

          <Text style={styles.label}>Tipologia di interesse (linea)</Text>
          <LineaSelector value={lineeScelte} onChange={setLineeOverride} />

          {nasceLead ? (
            <>
              <Text style={styles.label}>Come l’abbiamo contattato?</Text>
              <View style={styles.chipWrap}>
                {CANALI.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setCanale(c.id)}
                    style={[styles.chip, styles.chipCanale, canale === c.id && styles.chipOn]}
                  >
                    <Ionicons name={c.icona} size={14} color={canale === c.id ? colors.bianco : colors.navy} />
                    <Text style={[styles.chipTxt, canale === c.id && styles.chipTxtOn]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.aiuto}>
                Nasce come <Text style={styles.aiutoForte}>Lead</Text>: il contatto è già partito, ma non c’è ancora
                una persona in rubrica. Aggiungendola dalla sua scheda diventa un Prospect.
              </Text>
              {/* Detto PRIMA di compilare: il negozio si salva comunque, ma
                  finirà fra i Selezionati e non fra i Lead. */}
              {!registroOk ? (
                <Text style={styles.avvisoBlocco}>
                  <Ionicons name="warning-outline" size={13} color="#B7791F" /> Il registro dei contatti non esiste
                  ancora nel database (manca la migrazione 0046): il negozio verrà salvato, ma finirà fra i
                  Selezionati e non fra i Lead. Si sistema lanciando{' '}
                  <Text style={styles.mono}>node scripts/allinea-supabase.mjs</Text>.
                </Text>
              ) : null}
            </>
          ) : null}

          <Pressable style={[styles.salva, salvataggio && styles.salvaOff]} onPress={salva} disabled={salvataggio}>
            <Text style={styles.salvaTxt}>
              {salvataggio ? 'Salvataggio…' : nasceLead ? 'Crea lead' : 'Crea target'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  checkin: { color: colors.testoSoft, fontWeight: '600', marginBottom: spacing.sm },
  label: { color: colors.testoSoft, fontWeight: '700', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.xxl, marginBottom: 6 },
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  chipCanale: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inputSotto: { marginTop: 6 },
  sceltoTxt: { color: colors.testoSoft, fontSize: 12.5, marginTop: 6, lineHeight: 17 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  aiuto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18, marginTop: spacing.sm },
  aiutoForte: { fontWeight: '800', color: colors.testo },
  avvisoBlocco: {
    color: '#7A5B12',
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#E8D9A8',
    borderRadius: radius.m,
    padding: spacing.sm,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  mono: { fontWeight: '800' },
  chipTxt: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  prioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
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
