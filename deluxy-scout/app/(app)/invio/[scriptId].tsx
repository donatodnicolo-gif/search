// Invio di uno script a più contatti. Passi: 1) scegli i destinatari dalla
// Rubrica (solo chi ha un'email), 2) rivedi oggetto e testo (modificabili),
// 3) conferma e invia dalla tua casella. Ogni email è personalizzata per il
// contatto ({nome}/{negozio}) e l'esito è mostrato per destinatario.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { conferma, avvisa } from '@/lib/dialoghi';
import { fetchTuttiContatti, registraContattoAvviato, type ContattoConLuogo } from '@/lib/db';
import { fetchScript, inviaEmailContatti, type ScriptEmail } from '@/lib/script';
import { applicaVariabili, htmlDaTesto, sembraHtml, testoSemplice, variabiliManuali, type DatiContatto } from '@/lib/variabili';
import { RichTextEditor } from '@/components/RichTextEditor';
import { Loader } from '../../_layout';

// Anteprima del corpo: HTML renderizzato sul web, testo piano su nativo.
function AnteprimaCorpo({ html }: { html: string }) {
  if (Platform.OS === 'web') {
    return <div style={{ fontSize: 14, lineHeight: 1.5, color: colors.testo }} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <Text style={styles.anteprimaCorpo}>{testoSemplice(html)}</Text>;
}

const datiContatto = (c: ContattoConLuogo): DatiContatto => ({
  nome: c.nome,
  negozio: c.place_nome,
  ruolo: c.ruolo,
  email: c.email,
  telefono: c.telefono,
  zona: c.place_zona,
});

export default function InvioScript() {
  // `place` c'è quando si arriva dalla scheda di un negozio (Clienti, Prospect,
  // Potenziali): i suoi contatti partono già selezionati. Può contenerne **più
  // di uno**, separati da virgola, quando si arriva dalla scelta multipla.
  const { scriptId, place: placeParam } = useLocalSearchParams<{ scriptId: string; place?: string }>();
  const router = useRouter();
  // useMemo e non una costante: `placeParam` è un valore nuovo a ogni render e
  // farebbe ripartire in continuazione gli effetti che lo guardano.
  const placeIds = useMemo(
    () => new Set((placeParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    [placeParam],
  );

  const [script, setScript] = useState<ScriptEmail | null>(null);
  const [contatti, setContatti] = useState<ContattoConLuogo[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [variabili, setVariabili] = useState<Record<string, string>>({}); // manuali, per-invio (chiave-lower)
  const [fase, setFase] = useState<'scelta' | 'revisione'>('scelta');
  const [inviando, setInviando] = useState(false);

  // Variabili manuali presenti nel testo/oggetto ([data], [evento]…): da compilare.
  const manualiKeys = useMemo(() => variabiliManuali(oggetto, corpo), [oggetto, corpo]);
  const varMancanti = useMemo(
    () => manualiKeys.filter((k) => !(variabili[k.toLowerCase()] ?? '').trim()),
    [manualiKeys, variabili],
  );

  useEffect(() => {
    (async () => {
      try {
        const [scripts, cont] = await Promise.all([fetchScript(), fetchTuttiContatti()]);
        const s = scripts.find((x) => x.id === scriptId) ?? null;
        setScript(s);
        if (s) {
          setOggetto(s.oggetto ?? '');
          setCorpo(s.corpo);
        }
        // Solo contatti con un'email valida: sono gli unici raggiungibili.
        const raggiungibili = cont.filter((c) => c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
        setContatti(raggiungibili);
        // Arrivo dalla scheda di un negozio: i suoi contatti sono già spuntati,
        // così non si ripescano fra tutti. Restano deselezionabili.
        if (placeIds.size) {
          setSel(new Set(raggiungibili.filter((c) => placeIds.has(c.place_id)).map((c) => c.id)));
        }
      } finally {
        setCaricando(false);
      }
    })();
  }, [scriptId, placeIds]);

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? contatti.filter((c) => [c.nome, c.place_nome, c.email].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q)))
      : contatti;
    // Arrivando da un negozio, i suoi contatti vanno in cima: sono già spuntati
    // e in fondo a un elenco alfabetico non si vedrebbero.
    if (!placeIds.size) return base;
    return [...base].sort((a, b) => Number(placeIds.has(b.place_id)) - Number(placeIds.has(a.place_id)));
  }, [contatti, query, placeIds]);

  // Il nome del negozio da cui si è arrivati. Serve a dire in testa alla
  // schermata a CHI si sta scrivendo: senza, ci si trova davanti l'intera
  // rubrica con qualche riga spuntata e nessuna spiegazione del perché.
  const negozio = useMemo(() => {
    if (!placeIds.size) return null;
    const nomi = [...new Set(contatti.filter((c) => placeIds.has(c.place_id)).map((c) => c.place_nome).filter(Boolean))];
    if (!nomi.length) return null;
    return nomi.length === 1 ? (nomi[0] as string) : `${nomi.length} negozi`;
  }, [contatti, placeIds]);

  // Quante righe dell'elenco appartengono al negozio di partenza: sopra questa
  // soglia comincia «il resto della rubrica», e la separazione va mostrata.
  const suoi = useMemo(() => dati.filter((c) => placeIds.has(c.place_id)).length, [dati, placeIds]);

  const selezionati = useMemo(() => contatti.filter((c) => sel.has(c.id)), [contatti, sel]);

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function tuttiVisibili() {
    setSel((prev) => {
      const n = new Set(prev);
      const tutti = dati.every((c) => n.has(c.id));
      dati.forEach((c) => (tutti ? n.delete(c.id) : n.add(c.id)));
      return n;
    });
  }

  function invia() {
    // Azione esterna e irreversibile: riepilogo esplicito prima di partire.
    conferma(
      "Confermi l'invio?",
      `Verrà inviata un'email a ${selezionati.length} contatt${selezionati.length === 1 ? 'o' : 'i'} dalla tua casella.`,
      eseguiInvio,
      { testoConferma: `Invia a ${selezionati.length}` },
    );
  }

  async function eseguiInvio() {
    setInviando(true);
    try {
      const destinatari = selezionati.map((c) => ({
        email: c.email as string,
        nome: c.nome,
        negozio: c.place_nome,
        ruolo: c.ruolo,
        telefono: c.telefono,
        zona: c.place_zona,
      }));
      const r = await inviaEmailContatti(oggetto, corpo, destinatari, variabili);
      if (r.reason === 'smtp_non_configurato') {
        avvisa('Casella non collegata', 'Collega la tua email da Profilo → La mia email, poi riprova.');
        return;
      }
      const falliti = r.falliti?.length ?? 0;
      // Il negozio a cui abbiamo scritto diventa un LEAD. Senza questa riga
      // l'invio non lasciava traccia da nessuna parte: il giorno dopo non si
      // sapeva più a chi era già partita la mail. Solo i destinatari riusciti.
      const nonRiusciti = new Set((r.falliti ?? []).map((f) => f.email));
      const placeIds = selezionati
        .filter((c) => c.email && !nonRiusciti.has(c.email))
        .map((c) => c.place_id)
        .filter(Boolean) as string[];
      // Se il registro rifiuta la riga la mail è comunque partita: non si
      // trasforma un invio riuscito in un errore.
      await registraContattoAvviato({
        placeIds,
        canale: 'email',
        scriptId,
        oggetto,
        destinatari: selezionati.map((c) => c.email as string).filter(Boolean),
      }).catch(() => {});
      avvisa(
        'Invio completato',
        `Inviate ${r.inviate} su ${r.totale}.` + (falliti ? `\nNon riuscite: ${falliti} (email errata o rifiutata).` : ''),
        () => router.back(),
      );
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Invio non riuscito.');
    } finally {
      setInviando(false);
    }
  }

  if (caricando) return <Loader />;
  if (!script) {
    return (
      <View style={styles.centro}>
        <Stack.Screen options={{ title: 'Invio' }} />
        <Text style={styles.vuoto}>Script non trovato.</Text>
      </View>
    );
  }

  // ─── Fase 2: revisione + conferma ───────────────────────────────────────────
  if (fase === 'revisione') {
    const primo = selezionati[0];
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Rivedi e invia' }} />
        <FlatList
          data={[]}
          renderItem={null as any}
          keyExtractor={() => 'x'}
          ListHeaderComponent={
            <View style={styles.revisione}>
              <View style={styles.intro}>
                <Text style={styles.introPasso}>Passo 2 di 2 · Rivedi e conferma</Text>
                <Text style={styles.introTesto}>
                  Controlla oggetto e testo, poi premi «Invia». Da qui parte davvero: dopo non si richiama
                  indietro.
                </Text>
              </View>
              <Text style={styles.sezione}>Destinatari ({selezionati.length})</Text>
              <View style={styles.destChips}>
                {selezionati.slice(0, 12).map((c) => (
                  <View key={c.id} style={styles.destChip}>
                    <Text style={styles.destChipTxt} numberOfLines={1}>{c.nome || c.email}</Text>
                  </View>
                ))}
                {selezionati.length > 12 ? <Text style={styles.altri}>+{selezionati.length - 12}</Text> : null}
              </View>

              <Text style={styles.sezione}>Oggetto</Text>
              <TextInput style={styles.input} value={oggetto} onChangeText={setOggetto} placeholder="Oggetto dell'email" placeholderTextColor={colors.grigio} />

              <Text style={styles.sezione}>Testo</Text>
              <RichTextEditor valueHtml={corpo} onChangeHtml={setCorpo} minHeight={180} />
              <Text style={styles.hint}>[nome], [negozio]… si riempiono dal contatto. Le altre variabili si compilano qui sotto.</Text>

              {/* Variabili manuali ([data], [evento]…): uguali per tutti i destinatari */}
              {manualiKeys.length ? (
                <>
                  <Text style={styles.sezione}>Variabili da compilare</Text>
                  {manualiKeys.map((k) => (
                    <View key={k} style={styles.varRow}>
                      <Text style={styles.varChiave}>[{k}]</Text>
                      <TextInput
                        style={styles.varInput}
                        value={variabili[k.toLowerCase()] ?? ''}
                        onChangeText={(t) => setVariabili((cur) => ({ ...cur, [k.toLowerCase()]: t }))}
                        placeholder={`Valore per [${k}]`}
                        placeholderTextColor={colors.grigio}
                      />
                    </View>
                  ))}
                </>
              ) : null}

              {primo ? (
                <View style={styles.anteprima}>
                  <Text style={styles.anteprimaLabel}>Anteprima per {primo.nome || primo.email}</Text>
                  {oggetto ? <Text style={styles.anteprimaOgg}>{applicaVariabili(oggetto, datiContatto(primo), variabili)}</Text> : null}
                  <AnteprimaCorpo html={applicaVariabili(sembraHtml(corpo) ? corpo : htmlDaTesto(corpo), datiContatto(primo), variabili)} />
                </View>
              ) : null}
            </View>
          }
        />
        <View style={styles.barra}>
          <Pressable style={styles.btnIndietro} onPress={() => setFase('scelta')} disabled={inviando}>
            <Text style={styles.btnIndietroTxt}>Indietro</Text>
          </Pressable>
          <Pressable
            style={[styles.btnInvia, (inviando || varMancanti.length > 0) && styles.off]}
            onPress={invia}
            disabled={inviando || !corpo.trim() || varMancanti.length > 0}
          >
            {inviando ? (
              <ActivityIndicator color={colors.bianco} />
            ) : (
              <Text style={styles.btnInviaTxt}>
                {varMancanti.length ? `Compila [${varMancanti[0]}]` : `Invia a ${selezionati.length}`}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Fase 1: scelta destinatari ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Il titolo diceva solo il nome dello script: chi arrivava qui dopo aver
          scelto «scrivi a questo cliente» non trovava più traccia del cliente. */}
      <Stack.Screen options={{ title: negozio ? `Mail a ${negozio}` : script.titolo }} />

      <View style={styles.intro}>
        <Text style={styles.introPasso}>Passo 1 di 2 · A chi la mandi</Text>
        <Text style={styles.introTesto}>
          {negozio
            ? `Testo scelto: «${script.titolo}». Qui sotto ci sono i contatti di ${negozio}, già spuntati. Puoi toglierne o aggiungerne altri dalla rubrica. Al passo 2 rivedi il testo e confermi — niente parte prima.`
            : `Testo scelto: «${script.titolo}». Spunta i contatti a cui mandarlo: al passo 2 rivedi il testo e confermi. Niente parte prima.`}
        </Text>
      </View>

      <View style={styles.head}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca contatto per nome, negozio, email…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <Pressable style={styles.selTutti} onPress={tuttiVisibili}>
          <Text style={styles.selTuttiTxt}>{dati.every((c) => sel.has(c.id)) && dati.length ? 'Deseleziona tutti' : 'Seleziona tutti'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={dati}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.vuoto}>Nessun contatto con email. Aggiungi le email in Rubrica.</Text>}
        renderItem={({ item, index }) => {
          const on = sel.has(item.id);
          const suo = placeIds.has(item.place_id);
          return (
            <>
              {/* Le due intestazioni dicono dove finisce «il cliente da cui sei
                  partito» e dove comincia il resto della rubrica: senza, la
                  lista sembrava un unico elenco con delle spunte a caso. */}
              {negozio && index === 0 && suo ? (
                <Text style={styles.gruppoLista}>I contatti di {negozio}</Text>
              ) : null}
              {negozio && index === suoi && !suo ? (
                <Text style={styles.gruppoLista}>Altri contatti in rubrica — aggiungili solo se servono</Text>
              ) : null}
              <Pressable style={[styles.riga, suo && styles.rigaSua]} onPress={() => toggle(item.id)}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.ink : colors.grigio} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={3} style={styles.rigaNome}>{item.nome || '(senza nome)'}</Text>
                  <Text style={styles.rigaMeta} numberOfLines={1}>
                    {[item.place_nome, item.email].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            </>
          );
        }}
      />

      <View style={styles.barra}>
        <Text style={styles.conteggio}>
          {sel.size === 0 ? 'Nessun destinatario' : `${sel.size} destinatar${sel.size === 1 ? 'io' : 'i'}`}
        </Text>
        {/* «Continua» non diceva verso cosa, e su una schermata che manda email
            è la differenza fra proseguire e spedire. */}
        <Pressable style={[styles.btnInvia, !sel.size && styles.off]} onPress={() => setFase('revisione')} disabled={!sel.size}>
          <Text style={styles.btnInviaTxt}>Rivedi il testo →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sfondo },
  vuoto: { color: colors.grigio, fontSize: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  search: { flex: 1, backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 14, color: colors.testo },
  selTutti: { paddingHorizontal: 6 },
  selTuttiTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 12.5 },
  list: { padding: spacing.md, paddingBottom: 96, gap: 6 },
  // Intestazione della schermata: dice a che punto sei e cosa succede dopo.
  intro: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 4 },
  introPasso: { color: colors.goldStrong, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  introTesto: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  // Separatore fra «i contatti del negozio» e il resto della rubrica.
  gruppoLista: { color: colors.testoSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 2 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, paddingVertical: 10, paddingHorizontal: 12 },
  // I contatti del negozio di partenza hanno il bordo marcato: si distinguono
  // dal resto della rubrica anche scorrendo in fretta.
  rigaSua: { borderColor: colors.ink },
  rigaNome: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  rigaMeta: { color: colors.testoSoft, fontSize: 12 },
  barra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, backgroundColor: colors.bianco },
  conteggio: { color: colors.testoSoft, fontWeight: '700', fontSize: 14 },
  btnInvia: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 13, minWidth: 130, alignItems: 'center' },
  btnInviaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 15 },
  off: { opacity: 0.4 },
  btnIndietro: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 13 },
  btnIndietroTxt: { color: colors.testo, fontWeight: '600', fontSize: 15 },
  revisione: { padding: spacing.md, gap: 6 },
  sezione: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.sm },
  destChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  destChip: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 180 },
  destChipTxt: { color: colors.testo, fontSize: 12, fontWeight: '600' },
  altri: { color: colors.testoSoft, fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 15, color: colors.testo },
  hint: { color: colors.grigio, fontSize: 12, marginTop: 4 },
  varRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  varChiave: { color: colors.goldStrong, fontWeight: '800', fontSize: 13, minWidth: 90 },
  varInput: { flex: 1, backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 14, color: colors.testo },
  anteprima: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, marginTop: spacing.sm, gap: 4 },
  anteprimaLabel: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  anteprimaOgg: { color: colors.testo, fontSize: 14, fontWeight: '700' },
  anteprimaCorpo: { color: colors.testo, fontSize: 14, lineHeight: 20 },
});
