// Gestione delle LINEE DI INTERESSE (solo admin). Scout è il master: qui si
// creano/modificano/archiviano le linee e le loro SOTTOLINEE. Le altre app le
// leggono dalla Edge Function `linee`.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, useFocusEffect } from 'expo-router';
import { Foglio } from '@/components/Foglio';
import { colors, radius, spacing } from '@/lib/theme';
import { PageIntro, StatusBadge } from '@/components/ui';
import { conferma, avvisa } from '@/lib/dialoghi';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import {
  aggiornaLinea,
  archiviaLinea,
  creaLinea,
  fetchLineeInteresse,
  fetchServiziPiattaforma,
  type LineaInteresse,
  type ServizioPiattaforma,
} from '@/lib/db';

type Editor =
  | { modo: 'nuova-linea' }
  | { modo: 'nuova-sotto'; parentId: string; parentNome: string }
  | { modo: 'modifica'; linea: LineaInteresse };

export default function LineeInteresse() {
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const [linee, setLinee] = useState<LineaInteresse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  /**
   * ⭐ I SERVIZI DELLA PIATTAFORMA CONSEGNE (27/08/2026, richiesta dell'utente:
   * «ora dovresti poter richiamare l'app delivery per dire quali inserire»).
   *
   * Le linee si battevano a mano da questa parte mentre i servizi che si
   * vendono davvero erano già scritti di là: da qui si guarda quell'elenco e si
   * sceglie cosa portare in Scout, invece di riscrivere nomi che esistono già.
   */
  const [catalogo, setCatalogo] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setLinee(await fetchLineeInteresse());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (admin) carica();
    }, [admin, carica]),
  );

  if (!admin) return <Redirect href="/(app)/profilo" />;

  function archivia(l: LineaInteresse, sotto: boolean) {
    conferma(
      sotto ? 'Archiviare la sottolinea?' : 'Archiviare la linea?',
      sotto
        ? `"${l.nome}" verrà rimossa dall'elenco.`
        : `"${l.nome}" e le sue sottolinee verranno rimosse dall'elenco. I negozi già assegnati a questa linea non cambiano.`,
      async () => {
        try {
          await archiviaLinea(l.id);
          carica();
        } catch (e: any) {
          avvisa('Errore', e?.message ?? 'Operazione non riuscita.');
        }
      },
      { testoConferma: 'Archivia', distruttivo: true },
    );
  }

  async function toggleAttiva(l: LineaInteresse) {
    try {
      await aggiornaLinea(l.id, { attiva_bool: !l.attiva_bool });
      carica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Non aggiornata.');
    }
  }

  /**
   * ⭐ IL FLAG DELLA VETRINA (26/08/2026, richiesta dell'utente): quali linee
   * compaiono fra i servizi richiedibili nella casa del partner
   * (deluxy-delivery.vercel.app/home → «Che cosa ti serve?»).
   *
   * ⚠️ È una domanda DIVERSA da «attiva»: una linea può essere viva
   * commercialmente e non andare in vetrina — «Magazzino» è un servizio
   * interno. Spegnere `attiva` per toglierla da una pagina vorrebbe dire
   * spegnerla anche sui negozi, nei filtri e nelle trattative.
   */
  async function toggleVetrina(l: LineaInteresse) {
    try {
      await aggiornaLinea(l.id, { in_vetrina: !l.in_vetrina });
      carica();
    } catch (e: any) {
      avvisa('Errore', e?.message ?? 'Non aggiornata.');
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Linee di interesse' }} />
      <PageIntro testo="Scout è il master delle linee di interesse: qui le crei, modifichi o archivi, con le relative sottolinee. Le altre app Deluxy le leggono da qui. Due flag, due domande diverse: «Attiva» dice se la linea è viva commercialmente, «In vetrina» se i partner possono chiederne un preventivo dalla loro casa (deluxy-delivery /home)." />
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}>
        {!loading && linee.length === 0 ? (
          <Text style={styles.vuoto}>Nessuna linea. Creane una col bottone in basso.</Text>
        ) : null}
        {linee.map((l) => (
          <View key={l.id} style={styles.card}>
            <View style={styles.rigaLinea}>
              <View style={styles.iconaBox}>
                <Ionicons name={(l.icona as any) || 'pricetag-outline'} size={18} color={colors.goldStrong} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>{l.nome}</Text>
                {l.pitch ? <Text style={styles.pitch} numberOfLines={1}>{l.pitch}</Text> : null}
              </View>
              <Pressable onPress={() => toggleAttiva(l)} hitSlop={6}>
                <StatusBadge small label={l.attiva_bool ? 'Attiva' : 'Standby'} colore={l.attiva_bool ? colors.successo : colors.grigio} />
              </Pressable>
              {/* Il secondo flag: la vetrina del partner. Si tocca per
                  accendere e spegnere, come «Attiva». */}
              <Pressable
                onPress={() => toggleVetrina(l)}
                hitSlop={6}
                accessibilityLabel={l.in_vetrina ? 'Togli dalla vetrina del partner' : 'Metti in vetrina dal partner'}
                {...({ title: 'Compare fra i servizi richiedibili nella casa del partner' } as any)}
              >
                <StatusBadge
                  small
                  label={l.in_vetrina ? 'In vetrina' : 'Fuori vetrina'}
                  colore={l.in_vetrina ? colors.goldStrong : colors.grigio}
                />
              </Pressable>
              <Pressable style={styles.azioneBtn} hitSlop={6} onPress={() => setEditor({ modo: 'modifica', linea: l })} accessibilityLabel="Modifica linea">
                <Ionicons name="create-outline" size={18} color={colors.testoSoft} />
              </Pressable>
              <Pressable style={styles.azioneBtn} hitSlop={6} onPress={() => archivia(l, false)} accessibilityLabel="Archivia linea">
                <Ionicons name="archive-outline" size={18} color={colors.grigio} />
              </Pressable>
            </View>

            {/* Sottolinee */}
            {l.sottolinee?.length ? (
              <View style={styles.sottoWrap}>
                {l.sottolinee.map((s) => (
                  <View key={s.id} style={styles.rigaSotto}>
                    <Ionicons name="return-down-forward-outline" size={14} color={colors.grigio} />
                    <Text style={styles.sottoNome} numberOfLines={1}>{s.nome}</Text>
                    {!s.attiva_bool ? <Text style={styles.sottoStandby}>standby</Text> : null}
                    <Pressable hitSlop={6} onPress={() => setEditor({ modo: 'modifica', linea: s })} accessibilityLabel="Modifica sottolinea">
                      <Ionicons name="create-outline" size={16} color={colors.testoSoft} />
                    </Pressable>
                    <Pressable hitSlop={6} onPress={() => archivia(s, true)} accessibilityLabel="Archivia sottolinea">
                      <Ionicons name="close-circle-outline" size={16} color={colors.grigio} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable style={styles.aggiungiSotto} onPress={() => setEditor({ modo: 'nuova-sotto', parentId: l.id, parentNome: l.nome })}>
              <Ionicons name="add" size={16} color={colors.goldStrong} />
              <Text style={styles.aggiungiSottoTxt}>Aggiungi sottolinea</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.barraSotto}>
        {/* ⚠️ Sta accanto a «Nuova linea», non dentro un menù: è l'altro modo
            di rispondere alla stessa domanda — quali linee servono — e un
            comando fuori dalla prima schermata non si trova. */}
        <Pressable style={styles.fabGhost} onPress={() => setCatalogo(true)}>
          <Ionicons name="cube-outline" size={18} color={colors.navy} />
          <Text style={styles.fabGhostTxt}>Servizi dell&apos;app consegne</Text>
        </Pressable>
        <Pressable style={styles.fab} onPress={() => setEditor({ modo: 'nuova-linea' })}>
          <Ionicons name="add" size={22} color={colors.bianco} />
          <Text style={styles.fabTxt}>Nuova linea</Text>
        </Pressable>
      </View>

      {editor ? <EditorModal editor={editor} onClose={() => setEditor(null)} onSalvato={() => { setEditor(null); carica(); }} /> : null}

      {catalogo ? (
        <CatalogoConsegne linee={linee} onClose={() => setCatalogo(false)} onInserite={() => { setCatalogo(false); carica(); }} />
      ) : null}
    </View>
  );
}

/**
 * Il nome di una linea in una grafia sola, per confrontarla con quella di un
 * servizio della piattaforma.
 *
 * ⚠️ Serve perché il nome è un INDIZIO, non un'identità: «Eventi & Catering» e
 * «eventi e catering» sono la stessa cosa scritta da due persone diverse, e
 * senza questo passaggio la schermata proporrebbe di creare una linea che c'è
 * già. L'identità vera è `servizio_codice`, e si guarda prima di questo.
 */
function grafiaUnica(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * IL CATALOGO DELLA PIATTAFORMA: cosa si vende di là, e cosa manca di qua.
 *
 * ⚠️ Le linee non si «sincronizzano»: si SCEGLIE cosa creare, una per una. Una
 * copia automatica farebbe di Scout uno specchio della piattaforma, e le linee
 * di interesse servono anche a cose che consegne non fa (Affiliazioni,
 * Re-seller). Chi possiede il dato decide cosa entra in casa sua.
 */
function CatalogoConsegne({
  linee,
  onClose,
  onInserite,
}: {
  linee: LineaInteresse[];
  onClose: () => void;
  onInserite: () => void;
}) {
  const [stato, setStato] = useState<'carico' | 'ok' | 'non_configurato' | 'errore'>('carico');
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const [servizi, setServizi] = useState<ServizioPiattaforma[]>([]);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [inserendo, setInserendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchServiziPiattaforma().then((esito) => {
      if (!vivo) return;
      if (esito.ok) {
        setServizi(esito.servizi);
        setStato('ok');
      } else if (esito.motivo === 'non_configurato') {
        setStato('non_configurato');
      } else {
        setDettaglio(esito.dettaglio);
        setStato('errore');
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  /** Tutte le linee, comprese le sottolinee: una sottolinea è già una risposta. */
  const tutte = useMemo(() => linee.flatMap((l) => [l, ...(l.sottolinee ?? [])]), [linee]);
  const perCodice = useMemo(
    () => new Set(tutte.map((l) => l.servizio_codice).filter(Boolean) as string[]),
    [tutte],
  );
  const perNome = useMemo(() => new Map(tutte.map((l) => [grafiaUnica(l.nome), l.nome])), [tutte]);

  /**
   * Come sta messo ogni servizio rispetto alle linee di Scout. Tre risposte
   * diverse, e la differenza conta: «collegato» è una certezza (il codice),
   * «somiglia» è un sospetto da guardare (il nome), «manca» è l'unico che si
   * può creare senza pensarci.
   */
  const righe = useMemo(
    () =>
      servizi.map((sv) => {
        if (perCodice.has(sv.codice)) return { sv, come: 'collegato' as const, linea: null as string | null };
        const simile = perNome.get(grafiaUnica(sv.nome));
        if (simile) return { sv, come: 'somiglia' as const, linea: simile };
        return { sv, come: 'manca' as const, linea: null };
      }),
    [servizi, perCodice, perNome],
  );
  const mancanti = righe.filter((r) => r.come === 'manca');

  function spuntaTutti() {
    setScelti(scelti.size === mancanti.length ? new Set() : new Set(mancanti.map((r) => r.sv.codice)));
  }

  async function inserisci() {
    if (inserendo || !scelti.size) return;
    setInserendo(true);
    const falliti: string[] = [];
    try {
      for (const r of mancanti) {
        if (!scelti.has(r.sv.codice)) continue;
        try {
          await creaLinea({
            nome: r.sv.nome,
            attiva_bool: r.sv.attivo,
            // ⚠️ La vetrina segue l'AMBITO del servizio: quello che un valet
            // esegue non è qualcosa che un partner possa chiedersi da solo. È
            // scritto anche a schermo, perché è una decisione presa qui.
            in_vetrina: r.sv.ambito !== 'valet',
            servizio_codice: r.sv.codice,
          });
        } catch (e: any) {
          falliti.push(`${r.sv.nome} (${e?.message ?? 'non riuscita'})`);
        }
      }
      // ⚠️ Si dice QUALI non sono entrate, non «qualcosa è andato storto»: con
      // dieci righe in fila, «errore» manda a ricontrollarle tutte a mano.
      if (falliti.length) {
        avvisa('Alcune linee non sono nate', falliti.join('\n'));
      }
      onInserite();
    } finally {
      setInserendo(false);
    }
  }

  return (
    <Foglio
      titolo="Servizi dell'app consegne"
      sottotitolo="Quello che si vende sulla piattaforma. Si sceglie cosa portare in Scout: le linee restano nostre."
      onClose={onClose}
      largo
    >
      <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: 8 }}>
        {stato === 'carico' ? <ActivityIndicator color={colors.navy} /> : null}

        {stato === 'non_configurato' ? (
          <Text style={styles.avviso}>
            L&apos;app consegne non è collegata: manca la sua chiave. Si incolla in Impostazioni → App collegate,
            riga «Consegne (piattaforma)». La chiave si crea sulla piattaforma con
            {' '}api/scripts/crea-chiave-app.mjs.
          </Text>
        ) : null}

        {stato === 'errore' ? (
          <Text style={styles.avviso}>La piattaforma non ha risposto. {dettaglio}</Text>
        ) : null}

        {stato === 'ok' && !servizi.length ? (
          <Text style={styles.avviso}>La piattaforma ha risposto, ma il suo catalogo dei servizi è vuoto.</Text>
        ) : null}

        {stato === 'ok' && servizi.length ? (
          <>
            <Text style={styles.catNota}>
              {mancanti.length
                ? `${mancanti.length} servizi non hanno una linea in Scout. Le linee create partono in vetrina, tranne quelle di ambito valet.`
                : 'Ogni servizio della piattaforma ha già la sua linea qui.'}
            </Text>

            {mancanti.length ? (
              <Pressable onPress={spuntaTutti} style={styles.catTutti}>
                <Ionicons
                  name={scelti.size === mancanti.length ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={colors.navy}
                />
                <Text style={styles.catTuttiTxt}>Scegli tutti quelli che mancano</Text>
              </Pressable>
            ) : null}

            {righe.map(({ sv, come, linea }) => {
              const scelto = scelti.has(sv.codice);
              return (
                <Pressable
                  key={sv.id}
                  style={[styles.catRiga, come !== 'manca' && styles.catRigaSpenta]}
                  disabled={come !== 'manca'}
                  onPress={() => {
                    const nuovo = new Set(scelti);
                    if (scelto) nuovo.delete(sv.codice);
                    else nuovo.add(sv.codice);
                    setScelti(nuovo);
                  }}
                >
                  {come === 'manca' ? (
                    <Ionicons name={scelto ? 'checkbox' : 'square-outline'} size={18} color={colors.navy} />
                  ) : (
                    <Ionicons name="link-outline" size={18} color={colors.grigio} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.catNome} numberOfLines={1}>
                      {sv.nome}
                    </Text>
                    <Text style={styles.catMeta} numberOfLines={2}>
                      {sv.codice} · {sv.ambito} · {sv.modello}
                      {sv.attivo ? '' : ' · spento sulla piattaforma'}
                      {come === 'collegato' ? ' — già collegato a una linea' : ''}
                      {come === 'somiglia' ? ` — c'è già «${linea}» con lo stesso nome` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              style={[styles.btnSalva, (!scelti.size || inserendo) && styles.btnOff]}
              disabled={!scelti.size || inserendo}
              onPress={inserisci}
            >
              {inserendo ? (
                <ActivityIndicator color={colors.bianco} size="small" />
              ) : (
                <Text style={styles.btnSalvaTxt}>
                  {scelti.size ? `Crea ${scelti.size} linee` : 'Scegli cosa creare'}
                </Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </Foglio>
  );
}

function EditorModal({ editor, onClose, onSalvato }: { editor: Editor; onClose: () => void; onSalvato: () => void }) {
  const esistente = editor.modo === 'modifica' ? editor.linea : null;
  const [nome, setNome] = useState(esistente?.nome ?? '');
  const [icona, setIcona] = useState(esistente?.icona ?? '');
  const [pitch, setPitch] = useState(esistente?.pitch ?? '');
  const [attiva, setAttiva] = useState(esistente?.attiva_bool ?? true);
  const [inVetrina, setInVetrina] = useState(esistente?.in_vetrina ?? true);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const titolo = useMemo(() => {
    if (editor.modo === 'nuova-linea') return 'Nuova linea';
    if (editor.modo === 'nuova-sotto') return `Sottolinea di "${editor.parentNome}"`;
    return editor.linea.parent_id ? 'Modifica sottolinea' : 'Modifica linea';
  }, [editor]);

  async function salva() {
    if (!nome.trim()) {
      setErrore('Il nome è obbligatorio.');
      return;
    }
    setSalvando(true);
    setErrore(null);
    try {
      if (editor.modo === 'modifica') {
        await aggiornaLinea(editor.linea.id, { nome: nome.trim(), icona: icona.trim() || null, pitch: pitch.trim() || null, attiva_bool: attiva, in_vetrina: inVetrina });
      } else {
        await creaLinea({
          nome: nome.trim(),
          parent_id: editor.modo === 'nuova-sotto' ? editor.parentId : null,
          icona: icona.trim() || null,
          pitch: pitch.trim() || null,
          attiva_bool: attiva,
          in_vetrina: inVetrina,
        });
      }
      onSalvato();
    } catch (e: any) {
      setErrore(/duplicate|unique/i.test(e?.message ?? '') ? 'Esiste già una linea con questo nome.' : e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  return (
    // bloccaSfondo: un form scritto a metà non si chiude con un clic fuori.
    <Foglio titolo={titolo} onClose={onClose} bloccaSfondo>
          <Text style={styles.label}>Nome *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Es. Consegne" placeholderTextColor={colors.grigio} />
          <Text style={styles.label}>Icona (nome Ionicons, facoltativo)</Text>
          <TextInput style={styles.input} value={icona} onChangeText={setIcona} placeholder="Es. cube-outline" placeholderTextColor={colors.grigio} autoCapitalize="none" />
          <Text style={styles.label}>Descrizione / pitch</Text>
          <TextInput style={styles.input} value={pitch} onChangeText={setPitch} placeholder="A cosa serve questa linea" placeholderTextColor={colors.grigio} />
          <View style={styles.attivaRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attivaTitolo}>Attiva</Text>
              <Text style={styles.attivaNota}>Se spenta è in standby: solo cross-sell, non proposta primaria.</Text>
            </View>
            <Switch value={attiva} onValueChange={setAttiva} trackColor={{ true: colors.ink }} />
          </View>
          {/* Il servizio richiedibile dal partner: è così che si crea un
              servizio nuovo per la vetrina — si crea la linea e la si mette
              in vetrina. Il pitch qui sopra è il testo che il partner legge. */}
          <View style={styles.attivaRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attivaTitolo}>In vetrina dal partner</Text>
              <Text style={styles.attivaNota}>
                Compare fra i servizi richiedibili nella casa del partner (deluxy-delivery /home): da lì può
                chiederne un preventivo. Spegnila per i servizi interni.
              </Text>
            </View>
            <Switch value={inVetrina} onValueChange={setInVetrina} trackColor={{ true: colors.goldStrong }} />
          </View>
          {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          <Pressable style={[styles.salva, salvando && styles.salvaOff]} onPress={salva} disabled={salvando}>
            {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.salvaTxt}>Salva</Text>}
          </Pressable>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  barraSotto: { position: 'absolute', right: spacing.xxl, bottom: spacing.xxl, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fabGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  fabGhostTxt: { color: colors.navy, fontWeight: '700', fontSize: 13.5 },
  avviso: { color: colors.testoSoft, fontSize: 13, lineHeight: 19 },
  catNota: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  catTutti: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  catTuttiTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  catRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  catRigaSpenta: { opacity: 0.55 },
  catNome: { color: colors.testo, fontSize: 14, fontWeight: '700' },
  catMeta: { color: colors.grigio, fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  btnSalva: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  btnSalvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  btnOff: { opacity: 0.45 },
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.lg, paddingBottom: 96, gap: spacing.sm },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xxxl, fontStyle: 'italic' },
  card: { backgroundColor: colors.bianco, borderRadius: radius.m, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.lg, gap: 8 },
  rigaLinea: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconaBox: { width: 34, height: 34, borderRadius: radius.s, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  nome: { color: colors.testo, fontWeight: '800', fontSize: 15 },
  pitch: { color: colors.testoSoft, fontSize: 12 },
  azioneBtn: { padding: 2 },
  sottoWrap: { gap: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: colors.grigioChiaro, marginLeft: 8 },
  rigaSotto: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  sottoNome: { flex: 1, color: colors.testo, fontSize: 13.5, fontWeight: '600' },
  sottoStandby: { color: colors.grigio, fontSize: 11, fontStyle: 'italic' },
  aggiungiSotto: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  aggiungiSottoTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
  // ⚠️ NON è più assoluto: da quando sta dentro `barraSotto` — che è lei ad
  // essere ancorata in basso a destra — un secondo `position:'absolute'` qui
  // lo avrebbe riposizionato DENTRO la barra, cioè sopra l'altro bottone.
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.navy, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 18, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  label: { fontSize: 12, fontWeight: '700', color: colors.testoSoft, marginTop: 4 },
  input: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.m, paddingHorizontal: spacing.lg, paddingVertical: 11, fontSize: 15, color: colors.testo },
  attivaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  attivaTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  attivaNota: { color: colors.grigio, fontSize: 12, lineHeight: 16 },
  errore: { color: colors.errore, fontSize: 13 },
  salva: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  salvaOff: { opacity: 0.5 },
  salvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
