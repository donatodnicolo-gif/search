// SEQUENZE — i solleciti che si ricordano da soli.
//
// Due parti in una schermata:
//   · IN CODA OGGI — cosa è pronto a partire, con il ritardo se c'è. Prima di
//     mandare, l'app controlla se il cliente ha già risposto: se sì la sequenza
//     si ferma e l'invio non parte. È il controllo che tiene in piedi tutto —
//     un sollecito dopo la risposta è una figuraccia, non un sollecito.
//   · LE SEQUENZE — i percorsi: quale testo, dopo quanti giorni.
//
// ⚠️ Niente parte da solo. La coda si calcola da sé, l'invio si conferma: una
// mail sbagliata a venti clienti non si richiama indietro, e un automatismo che
// sbaglia lo fa su tutta la lista prima che qualcuno se ne accorga.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { avvisa, conferma } from '@/lib/dialoghi';
import { EmptyState, PageIntro } from '@/components/ui';
import { fetchScript, inviaEmailContatti, type ScriptEmail } from '@/lib/script';
import { fetchRecapitiPlace, fetchTuttiContatti, registraContattoAvviato, type ContattoConLuogo } from '@/lib/db';
import {
  aggiungiPasso,
  creaSequenza,
  eliminaSequenza,
  fermaIscrizione,
  fetchCoda,
  fetchPassi,
  fetchSequenze,
  haRisposto,
  impostaAttiva,
  rimuoviPasso,
  segnaInviato,
  segnaRisposto,
  type InCoda,
  type PassoSequenza,
  type Sequenza,
} from '@/lib/sequenze';

export default function Sequenze() {
  const router = useRouter();
  const [coda, setCoda] = useState<InCoda[]>([]);
  const [sequenze, setSequenze] = useState<Sequenza[]>([]);
  const [passi, setPassi] = useState<Record<string, PassoSequenza[]>>({});
  const [script, setScript] = useState<ScriptEmail[]>([]);
  const [contatti, setContatti] = useState<ContattoConLuogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [nuovoNome, setNuovoNome] = useState('');
  const [aperta, setAperta] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [c, s, sc, co] = await Promise.all([
        fetchCoda().catch(() => []),
        fetchSequenze(),
        fetchScript().catch(() => []),
        fetchTuttiContatti().catch(() => []),
      ]);
      setCoda(c);
      setSequenze(s);
      setScript(sc);
      setContatti(co);
      const mappa: Record<string, PassoSequenza[]> = {};
      for (const seq of s) mappa[seq.id] = await fetchPassi(seq.id).catch(() => []);
      setPassi(mappa);
    } catch (e: any) {
      // Il caso più probabile è la migrazione 0050 non applicata: dirlo a
      // parole, non lasciare l'errore tecnico di PostgREST.
      const msg = String(e?.message ?? '');
      setErrore(
        /sequenz|PGRST205|does not exist/i.test(msg)
          ? 'Le sequenze hanno bisogno della migrazione 0050, non ancora applicata al database.'
          : msg || 'Non è stato possibile caricare le sequenze.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const titoloScript = (id: string | null) => script.find((s) => s.id === id)?.titolo ?? 'Testo non trovato';

  /**
   * Manda un passo della coda. Prima controlla se il cliente ha risposto: se
   * sì, non manda niente e chiude la sequenza.
   */
  async function mandaPasso(c: InCoda) {
    const suoi = contatti.filter((x) => x.place_id === c.iscrizione.place_id && x.email);
    if (!suoi.length) {
      avvisa(
        'Nessun indirizzo',
        `${c.placeNome} non ha contatti con un'email: la sequenza non può proseguire. Aggiungi l'indirizzo in Rubrica, oppure ferma la sequenza.`,
      );
      return;
    }
    const testo = script.find((s) => s.id === c.passo.script_id);
    if (!testo) {
      avvisa('Testo mancante', 'Lo script di questo passo è stato cancellato: apri la sequenza e sostituiscilo.');
      return;
    }

    setInCorso(c.iscrizione.id);
    try {
      // ── Il controllo che conta ──────────────────────────────────────────
      const esito = await haRisposto(suoi.map((x) => x.email as string), c.iscrizione.ultimo_invio_il);
      if (esito.risposto) {
        await segnaRisposto(c.iscrizione.id, esito.quando);
        avvisa(
          'Ha risposto: sequenza fermata',
          `${c.placeNome} ha scritto dopo l'ultimo invio. Il sollecito non è partito — ora tocca a te rispondere.`,
        );
        await carica();
        return;
      }

      const avviso = esito.verificabile
        ? ''
        : '\n\n⚠️ Non è stato possibile controllare se ha già risposto (posta non collegata): verifica prima di mandare.';
      conferma(
        'Mando il sollecito?',
        `«${testo.titolo}» a ${suoi.length} contatt${suoi.length === 1 ? 'o' : 'i'} di ${c.placeNome}.${avviso}`,
        async () => {
          setInCorso(c.iscrizione.id);
          try {
            const r = await inviaEmailContatti(
              testo.oggetto ?? '',
              testo.corpo,
              suoi.map((x) => ({
                email: x.email as string,
                nome: x.nome,
                negozio: x.place_nome,
                ruolo: x.ruolo,
                telefono: x.telefono,
                zona: x.place_zona,
              })),
            );
            if (r.reason === 'smtp_non_configurato') {
              avvisa('Casella non collegata', 'Collega la tua email da Profilo → La mia email, poi riprova.');
              return;
            }
            await segnaInviato(c, {
              destinatari: suoi.map((x) => x.email as string),
              inviate: r.inviate ?? 0,
              errore: r.error,
            });
            // Il negozio diventa un Lead come per gli invii a mano.
            await registraContattoAvviato({
              placeIds: [c.iscrizione.place_id],
              canale: 'email',
              scriptId: testo.id,
              oggetto: testo.oggetto ?? null,
            }).catch(() => {});
            avvisa('Mandato', `Inviate ${r.inviate} su ${r.totale}.`);
            await carica();
          } catch (e: any) {
            avvisa('Errore', e?.message ?? 'Invio non riuscito.');
          } finally {
            setInCorso(null);
          }
        },
        { testoConferma: `Manda a ${suoi.length}` },
      );
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Non è stato possibile procedere.');
    } finally {
      setInCorso(null);
    }
  }

  async function ferma(c: InCoda) {
    conferma(
      'Fermo la sequenza?',
      `${c.placeNome} non riceverà più i solleciti di «${c.sequenza.nome}». Puoi riprenderla dalla sua scheda.`,
      async () => {
        await fermaIscrizione(c.iscrizione.id, 'Fermata a mano');
        await carica();
      },
      { testoConferma: 'Ferma' },
    );
  }

  async function nuova() {
    if (!nuovoNome.trim()) return;
    try {
      await creaSequenza(nuovoNome.trim());
      setNuovoNome('');
      await carica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Non è stato possibile creare la sequenza.');
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      <View style={styles.headerScroll}>
        <PageIntro testo="Un percorso di solleciti scritto una volta sola: questo testo, poi dopo tot giorni quest'altro. L'app tiene il conto delle scadenze. Se il cliente risponde la sequenza si ferma da sé — e prima di ogni invio l'app controlla che non abbia già risposto." />
      </View>

      {errore ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
        </Text>
      ) : null}

      {/* ─── In coda oggi ───────────────────────────────────────────────── */}
      <Text style={styles.titoloSez}>In coda oggi{coda.length ? ` (${coda.length})` : ''}</Text>
      {!coda.length && !errore ? (
        <Text style={styles.vuotoRiga}>
          Niente da mandare oggi. Quando la data di un passo arriva, il negozio compare qui.
        </Text>
      ) : null}
      {coda.map((c) => (
        <View key={c.iscrizione.id} style={[styles.card, c.ritardo > 0 && styles.cardTardi]}>
          <View style={styles.cardTesta}>
            <Text style={styles.cardNome} numberOfLines={2}>{c.placeNome}</Text>
            {c.ritardo > 0 ? <Text style={styles.tardi}>in ritardo di {c.ritardo} g</Text> : <Text style={styles.oggi}>oggi</Text>}
          </View>
          <Text style={styles.cardMeta} numberOfLines={2}>
            {c.sequenza.nome} · passo {c.passo.ordine} · «{titoloScript(c.passo.script_id)}»
          </Text>
          <View style={styles.azioni}>
            <Pressable style={styles.btnSec} onPress={() => ferma(c)} disabled={inCorso === c.iscrizione.id}>
              <Text style={styles.btnSecTxt}>Ferma</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPri, inCorso === c.iscrizione.id && styles.off]}
              onPress={() => mandaPasso(c)}
              disabled={inCorso === c.iscrizione.id}
            >
              {inCorso === c.iscrizione.id ? (
                <ActivityIndicator color={colors.bianco} size="small" />
              ) : (
                <Text style={styles.btnPriTxt}>Controlla e manda</Text>
              )}
            </Pressable>
          </View>
        </View>
      ))}

      {/* ─── Le sequenze ────────────────────────────────────────────────── */}
      <Text style={styles.titoloSez}>Le sequenze</Text>
      <View style={styles.nuovaRiga}>
        <TextInput
          style={styles.input}
          value={nuovoNome}
          onChangeText={setNuovoNome}
          placeholder="Nome della sequenza (es. Primo contatto boutique)"
          placeholderTextColor={colors.grigio}
        />
        <Pressable style={[styles.btnPri, !nuovoNome.trim() && styles.off]} onPress={nuova} disabled={!nuovoNome.trim()}>
          <Text style={styles.btnPriTxt}>Crea</Text>
        </Pressable>
      </View>

      {!sequenze.length && !errore ? (
        <EmptyState
          loading={loading}
          icona="git-branch-outline"
          titolo="Nessuna sequenza"
          aiuto="Creane una qui sopra, poi aggiungi i passi: quale testo mandare e dopo quanti giorni. Da Clienti o dalle liste potrai iscriverci i negozi."
        />
      ) : null}

      {sequenze.map((s) => {
        const suoi = passi[s.id] ?? [];
        const apertaOra = aperta === s.id;
        return (
          <View key={s.id} style={styles.card}>
            <Pressable style={styles.cardTesta} onPress={() => setAperta(apertaOra ? null : s.id)}>
              <Text style={styles.cardNome} numberOfLines={2}>{s.nome}</Text>
              {!s.attiva ? <Text style={styles.spenta}>spenta</Text> : null}
              <Ionicons name={apertaOra ? 'chevron-up' : 'chevron-down'} size={16} color={colors.testoSoft} />
            </Pressable>
            <Text style={styles.cardMeta}>
              {suoi.length === 0
                ? 'Nessun passo: aprila e aggiungi il primo testo'
                : `${suoi.length} pass${suoi.length === 1 ? 'o' : 'i'} · ${riassunto(suoi, titoloScript)}`}
            </Text>

            {apertaOra ? (
              <View style={styles.dettaglio}>
                {suoi.map((p) => (
                  <View key={p.id} style={styles.passo}>
                    <Text style={styles.passoOrdine}>{p.ordine}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.passoTitolo} numberOfLines={2}>{titoloScript(p.script_id)}</Text>
                      <Text style={styles.passoQuando}>
                        {p.giorni_attesa === 0 ? 'subito' : `dopo ${p.giorni_attesa} giorni dal precedente`}
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={async () => {
                        await rimuoviPasso(p.id);
                        await carica();
                      }}
                      accessibilityLabel="Togli il passo"
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.testoSoft} />
                    </Pressable>
                  </View>
                ))}

                <AggiungiPasso
                  script={script}
                  primo={suoi.length === 0}
                  onAggiungi={async (scriptId, giorni) => {
                    await aggiungiPasso(s.id, scriptId, giorni);
                    await carica();
                  }}
                />

                <View style={styles.azioni}>
                  <Pressable style={styles.btnSec} onPress={async () => { await impostaAttiva(s.id, !s.attiva); await carica(); }}>
                    <Text style={styles.btnSecTxt}>{s.attiva ? 'Spegni' : 'Riaccendi'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.btnSec}
                    onPress={() =>
                      conferma(
                        'Elimino la sequenza?',
                        `«${s.nome}» e tutte le iscrizioni dei negozi spariscono. Gli invii già fatti restano nello storico dei contatti.`,
                        async () => { await eliminaSequenza(s.id); await carica(); },
                        { testoConferma: 'Elimina', distruttivo: true },
                      )
                    }
                  >
                    <Text style={[styles.btnSecTxt, styles.rosso]}>Elimina</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.nota}>
        Gli invii non partono da soli: la coda si calcola, tu confermi. Prima di ogni invio l’app controlla se il
        cliente ha risposto — se ha risposto, la sequenza si ferma e la mail non parte.
      </Text>
    </ScrollView>
  );
}

/** «Presentazione → 5g → Sollecito» : il percorso in una riga. */
function riassunto(passi: PassoSequenza[], titolo: (id: string | null) => string): string {
  return passi
    .map((p, i) => (i === 0 ? titolo(p.script_id) : `${p.giorni_attesa}g → ${titolo(p.script_id)}`))
    .join(' · ');
}

function AggiungiPasso({
  script,
  primo,
  onAggiungi,
}: {
  script: ScriptEmail[];
  primo: boolean;
  onAggiungi: (scriptId: string, giorni: number) => Promise<void>;
}) {
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [giorni, setGiorni] = useState('5');
  const [salvo, setSalvo] = useState(false);

  if (!script.length) {
    return <Text style={styles.vuotoRiga}>Nessun testo in libreria: creane uno in Script, poi torna qui.</Text>;
  }

  return (
    <View style={styles.aggiungi}>
      <Text style={styles.aggiungiTitolo}>Aggiungi un passo</Text>
      <View style={styles.chips}>
        {script.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setScriptId(s.id)}
            style={[styles.chip, scriptId === s.id && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, scriptId === s.id && styles.chipTxtOn]} numberOfLines={1}>
              {s.titolo}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.giorniRiga}>
        {/* Il primo passo parte subito: chiedere «dopo quanti giorni» prima
            ancora di aver detto la prima parola non avrebbe senso. */}
        {primo ? (
          <Text style={styles.giorniNota}>È il primo passo: parte subito, appena iscrivi un negozio.</Text>
        ) : (
          <>
            <Text style={styles.giorniEt}>Dopo</Text>
            <TextInput
              style={styles.giorniInput}
              value={giorni}
              onChangeText={(t) => setGiorni(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={styles.giorniEt}>giorni dal passo precedente</Text>
          </>
        )}
      </View>
      <Pressable
        style={[styles.btnPri, (!scriptId || salvo) && styles.off]}
        disabled={!scriptId || salvo}
        onPress={async () => {
          if (!scriptId) return;
          setSalvo(true);
          try {
            await onAggiungi(scriptId, primo ? 0 : Number(giorni || '0'));
            setScriptId(null);
          } finally {
            setSalvo(false);
          }
        }}
      >
        <Text style={styles.btnPriTxt}>Aggiungi</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.md, marginTop: -spacing.md },
  errore: { color: colors.errore, fontWeight: '600', fontSize: 13, backgroundColor: colors.bianco, borderRadius: radius.md, padding: spacing.md },
  titoloSez: { color: colors.testoSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.md },
  vuotoRiga: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 6 },
  // In ritardo: si vede prima di leggere. Una sequenza dimenticata da dieci
  // giorni va guardata prima di una di oggi.
  cardTardi: { borderColor: colors.attenzione, backgroundColor: '#FFFDF5' },
  cardTesta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardNome: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 15 },
  cardMeta: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 17 },
  tardi: { color: '#B7791F', fontWeight: '800', fontSize: 11.5 },
  oggi: { color: colors.testoSoft, fontWeight: '700', fontSize: 11.5 },
  spenta: { color: colors.grigio, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
  azioni: { flexDirection: 'row', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  btnPri: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minWidth: 110 },
  btnPriTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
  btnSec: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  btnSecTxt: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  rosso: { color: colors.errore },
  off: { opacity: 0.45 },
  nuovaRiga: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.testo },
  dettaglio: { gap: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: spacing.sm },
  passo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passoOrdine: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, color: colors.bianco, textAlign: 'center', lineHeight: 22, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
  passoTitolo: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  passoQuando: { color: colors.testoSoft, fontSize: 12 },
  aggiungi: { gap: 8, backgroundColor: colors.sfondo, borderRadius: radius.md, padding: spacing.sm },
  aggiungiTitolo: { color: colors.testoSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 220 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testo, fontSize: 12.5, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
  giorniRiga: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  giorniEt: { color: colors.testoSoft, fontSize: 13 },
  giorniNota: { color: colors.testoSoft, fontSize: 12.5, flex: 1 },
  giorniInput: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, width: 56, textAlign: 'center', fontSize: 14, color: colors.testo },
  nota: { color: colors.testoSoft, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
});
