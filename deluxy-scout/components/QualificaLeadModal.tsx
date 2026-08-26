// Qualifica di una richiesta web: si sceglie il NEGOZIO e lì nasce la
// trattativa (canale web). La finestra dice CHI ha scritto e COSA chiede coi
// dati estratti (lib/lead-parse), non con l'estratto grezzo della notifica; e
// quando la ricerca non trova nessun negozio lo dice, spiegando anche il caso
// tipico: la richiesta di un privato non ha un negozio — si gestisce dal
// Customer Service e qui si scarta.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { Foglio } from '@/components/Foglio';
import { cercaPlaces, qualificaLead, type PlaceLite } from '@/lib/db';
import type { EsitoRegistro } from '@/lib/anagrafiche';
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

  const chi = info.persona || lead.nome;

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

      <TextInput
        style={styles.input}
        value={ricerca}
        onChangeText={setRicerca}
        placeholder="Cerca il negozio per nome o indirizzo…"
        placeholderTextColor={colors.grigio}
        autoFocus
      />
      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
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
              Le trattative si agganciano a un negozio del territorio. Se questa è la richiesta di un
              privato (un ordine, un catering personale), non ha un negozio: si gestisce dal Customer
              Service, e qui si scarta.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {salvando ? <Text style={styles.stato}>Apro la trattativa…</Text> : null}
      {errore ? <Text style={styles.errore}>{errore}</Text> : null}
    </Foglio>
  );
}

const styles = StyleSheet.create({
  riepilogo: {
    backgroundColor: colors.fill,
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: 10,
  },
  risNome: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  risInd: { color: colors.testoSoft, fontSize: 12 },
  vuoto: { padding: 12, gap: 4 },
  vuotoTitolo: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  vuotoTesto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  stato: { color: colors.testoSoft, fontSize: 13 },
  errore: { color: colors.errore, fontSize: 13, fontWeight: '700' },
});
