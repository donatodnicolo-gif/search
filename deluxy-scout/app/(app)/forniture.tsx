// FORNITURE — l'elenco di cosa sa fare ciascun fornitore, e a quali condizioni.
//
// Richiesta dell'utente (26/08/2026): una sezione «Forniture» accanto ai
// Preventivi, dove caricare i dettagli dei fornitori.
//
// La differenza, che è il motivo per cui sono due schermate: un PREVENTIVO è il
// prezzo di un lavoro chiesto oggi; una FORNITURA è quello che quel fornitore
// fa SEMPRE — listino, tempi, minimi d'ordine, zona coperta. Senza, ogni volta
// che serve un prezzo si riparte da zero anche quando la risposta la sapevamo.
//
// ⚠️ Il prezzo qui è un RIFERIMENTO, non un impegno: vuoto vuol dire «non lo
// sappiamo», mai zero. Il prezzo che vale è quello del preventivo del giorno.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { leggiImportoPositivo } from '@/lib/importi';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { Foglio } from '@/components/Foglio';
import { Tabella, importoBreve, type ColonnaTabella } from '@/components/Tabella';
import { avvisa, conferma } from '@/lib/dialoghi';
import { cercaNelRegistro, fetchFornitori, type PartnerRegistro } from '@/lib/anagrafiche';
import { LINEE_ATTIVE } from '@/types';
import {
  aggiornaFornitura,
  creaFornitura,
  eliminaFornitura,
  fetchForniture,
  type Fornitura,
} from '@/lib/forniture';

/** La regola sta in lib/importi.ts, una volta sola e provata. */
const leggiPrezzo = leggiImportoPositivo;

export default function Forniture() {
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const [righe, setRighe] = useState<Fornitura[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [formAperto, setFormAperto] = useState(false);
  /**
   * ⭐ LA RIGA SI APRE (27/08/2026, richiesta dell'utente: «al click delle
   * righe in forniture apri un form di modifica»).
   *
   * Prima una fornitura si poteva solo spegnere o cancellare: un prezzo
   * cambiato — che è la cosa che cambia più spesso — obbligava a rifarla da
   * capo, e con lei se ne andavano zona, tempi, minimo e note.
   */
  const [modifica, setModifica] = useState<Fornitura | null>(null);
  const [query, setQuery] = useState('');
  const [lineaFiltro, setLineaFiltro] = useState<string | null>(null);
  const [mostraSpente, setMostraSpente] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setRighe(await fetchForniture());
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      setErrore(
        /forniture|PGRST205|does not exist|schema cache/i.test(msg)
          ? 'Le forniture hanno bisogno della migrazione 0074, non ancora applicata al database.'
          : msg || 'Elenco non caricato.',
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

  const lineePresenti = useMemo(
    () => [...new Set(righe.map((r) => r.linea).filter(Boolean) as string[])].sort(),
    [righe],
  );

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    return righe.filter((r) => {
      if (!mostraSpente && !r.attiva) return false;
      if (lineaFiltro && r.linea !== lineaFiltro) return false;
      if (!q) return true;
      return [r.fornitore, r.titolo, r.descrizione, r.zona, r.linea, r.note]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [righe, query, lineaFiltro, mostraSpente]);

  const spente = righe.filter((r) => !r.attiva).length;

  function elimina(f: Fornitura) {
    conferma(
      'Eliminare la fornitura?',
      `«${f.titolo}» di ${f.fornitore}. Se serve solo toglierla dall'elenco, spegnila invece di cancellarla.`,
      async () => {
        try {
          await eliminaFornitura(f.id);
          await carica();
        } catch (e: any) {
          avvisa('Non è stata eliminata', e?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  async function commutaAttiva(f: Fornitura) {
    try {
      await aggiornaFornitura(f.id, { attiva: !f.attiva });
      await carica();
    } catch (e: any) {
      avvisa('Non è stata aggiornata', e?.message ?? 'Riprova.');
    }
  }

  const colonne: ColonnaTabella<Fornitura>[] = [
    { chiave: 'fornitore', label: 'Fornitore', width: 200, valore: (f) => f.fornitore },
    { chiave: 'titolo', label: 'Cosa fornisce', width: 260, valore: (f) => f.titolo },
    { chiave: 'linea', label: 'Linea', width: 130, valore: (f) => f.linea ?? '—' },
    {
      chiave: 'prezzo',
      label: 'Riferimento',
      width: 140,
      numerica: true,
      destra: true,
      valore: (f) => f.prezzo,
      cella: (f) => (
        <Text style={styles.cellaPrezzo}>
          {f.prezzo ? importoBreve(f.prezzo) : '—'}
          {f.prezzo && f.prezzo_note ? <Text style={styles.prezzoNota}> {f.prezzo_note}</Text> : null}
        </Text>
      ),
    },
    { chiave: 'tempi', label: 'Tempi', width: 120, valore: (f) => f.tempi ?? '—' },
    { chiave: 'zona', label: 'Zona', width: 120, valore: (f) => f.zona ?? '—' },
    {
      chiave: 'azioni',
      label: '',
      width: 96,
      valore: () => '',
      cella: (f) => (
        <View style={styles.azioni}>
          {f.allegato_url ? (
            <Pressable
              hitSlop={6}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                Linking.openURL(f.allegato_url!);
              }}
              accessibilityLabel="Apri il listino"
              {...({ title: 'Apri il listino' } as any)}
            >
              <Ionicons name="document-attach-outline" size={16} color={colors.navy} />
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={6}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              commutaAttiva(f);
            }}
            accessibilityLabel={f.attiva ? 'Spegni la fornitura' : 'Riaccendi la fornitura'}
            {...({ title: f.attiva ? 'Non la fa più' : 'La fa di nuovo' } as any)}
          >
            <Ionicons name={f.attiva ? 'pause-circle-outline' : 'play-circle-outline'} size={16} color={colors.grigio} />
          </Pressable>
          <Pressable
            hitSlop={6}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              elimina(f);
            }}
            accessibilityLabel="Elimina la fornitura"
            {...({ title: 'Elimina' } as any)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.errore} />
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
      >
        <View style={styles.headerScroll}>
          <PageIntro testo="Quello che ciascun fornitore fa SEMPRE: cosa fornisce, a che prezzo di riferimento, in quanto tempo, con che minimo e dove arriva. È diverso da un preventivo — quello è il prezzo di un lavoro chiesto oggi; questo è la memoria che altrimenti resta nella testa di chi ha telefonato l'ultima volta." />
        </View>

        {errore ? (
          <Text style={styles.errore}>
            <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
          </Text>
        ) : null}

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca per fornitore, cosa fornisce, zona…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />

        {/* A capo, non in scroll orizzontale (Libro v1.2 §8: le ultime chip
            uscivano dallo schermo senza modo di accorgersene). */}
        {lineePresenti.length ? (
          <View style={[styles.chips, { flexWrap: 'wrap' }]}>
            <Pressable style={[styles.chip, !lineaFiltro && styles.chipOn]} onPress={() => setLineaFiltro(null)}>
              <Text style={[styles.chipTxt, !lineaFiltro && styles.chipTxtOn]}>Tutte</Text>
            </Pressable>
            {lineePresenti.map((l) => (
              <Pressable
                key={l}
                style={[styles.chip, lineaFiltro === l && styles.chipOn]}
                onPress={() => setLineaFiltro((c) => (c === l ? null : l))}
              >
                <Text style={[styles.chipTxt, lineaFiltro === l && styles.chipTxtOn]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {spente ? (
          <Pressable style={styles.filtro} onPress={() => setMostraSpente((v) => !v)}>
            <Ionicons name={mostraSpente ? 'eye-off-outline' : 'eye-outline'} size={15} color={colors.testo} />
            <Text style={styles.filtroTxt}>
              {mostraSpente ? 'Nascondi quelle spente' : `Mostra anche le spente (${spente})`}
            </Text>
          </Pressable>
        ) : null}

        {!dati.length && !errore ? (
          <EmptyState
            loading={loading}
            icona="cube-outline"
            titolo="Nessuna fornitura"
            aiuto="Quando un fornitore ti dice cosa fa e a che condizioni, scrivilo qui: la prossima volta che serve un prezzo non si riparte da zero."
            azione="Nuova fornitura"
            onAzione={() => setFormAperto(true)}
          />
        ) : aTabella ? (
          <Tabella
            righe={dati}
            colonne={colonne}
            chiaveRiga={(f) => f.id}
            ordineIniziale={{ campo: 'fornitore', verso: 'asc' }}
            onRiga={(f) => setModifica(f)}
            labelRiga={(f) => `Modifica ${f.titolo} di ${f.fornitore}`}
          />
        ) : (
          dati.map((f) => (
            // ⚠️ Anche la scheda si apre: sotto la soglia la tabella non si
            // monta, e la modifica sarebbe esistita solo su schermo grande.
            <Pressable
              key={f.id}
              style={[styles.card, !f.attiva && styles.cardSpenta]}
              onPress={() => setModifica(f)}
              accessibilityRole="button"
              accessibilityLabel={`Modifica ${f.titolo} di ${f.fornitore}`}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardFornitore} numberOfLines={1}>{f.fornitore}</Text>
                {!f.attiva ? <StatusBadge small label="Spenta" colore={colors.grigio} /> : null}
              </View>
              <Text style={styles.cardTitolo} numberOfLines={2}>{f.titolo}</Text>
              <Text style={styles.cardMeta} numberOfLines={2}>
                {[
                  f.prezzo ? `${importoBreve(f.prezzo)}${f.prezzo_note ? ` ${f.prezzo_note}` : ''}` : null,
                  f.tempi,
                  f.minimo_ordine,
                  f.zona,
                  f.linea,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Nessun dettaglio'}
              </Text>
              <View style={styles.azioni}>
                {f.allegato_url ? (
                  <Pressable hitSlop={6} onPress={() => Linking.openURL(f.allegato_url!)}>
                    <Ionicons name="document-attach-outline" size={17} color={colors.navy} />
                  </Pressable>
                ) : null}
                <Pressable hitSlop={6} onPress={() => commutaAttiva(f)}>
                  <Ionicons name={f.attiva ? 'pause-circle-outline' : 'play-circle-outline'} size={17} color={colors.grigio} />
                </Pressable>
                <Pressable hitSlop={6} onPress={() => elimina(f)}>
                  <Ionicons name="trash-outline" size={17} color={colors.errore} />
                </Pressable>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova fornitura</Text>
      </Pressable>

      {formAperto ? (
        <NuovaFornituraModal
          onClose={() => setFormAperto(false)}
          onCreata={() => {
            setFormAperto(false);
            carica();
          }}
        />
      ) : null}

      {modifica ? (
        <NuovaFornituraModal
          esistente={modifica}
          onClose={() => setModifica(null)}
          onCreata={() => {
            setModifica(null);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Il foglio della fornitura: lo stesso per crearne una e per correggerla
 * (27/08/2026, richiesta dell'utente: «al click delle righe in forniture apri
 * un form di modifica»).
 *
 * ⚠️ UNO SOLO, non due: due fogli con gli stessi dodici campi divergono al
 * primo campo aggiunto, e il campo nuovo finisce in uno dei due — di solito
 * quello che non si sta guardando.
 */
function NuovaFornituraModal({
  onClose,
  onCreata,
  esistente,
}: {
  onClose: () => void;
  onCreata: () => void;
  /** Se c'è, si sta correggendo questa; se manca, se ne crea una nuova. */
  esistente?: Fornitura | null;
}) {
  // Il fornitore si sceglie dal REGISTRO, come nei preventivi: il nome non è
  // un'identità, e due grafie sono due fornitori per chiunque conti la spesa.
  const [fornitoriRegistro, setFornitoriRegistro] = useState<PartnerRegistro[]>([]);
  const [cerca, setCerca] = useState('');
  const [altri, setAltri] = useState<PartnerRegistro[]>([]);
  const [scelto, setScelto] = useState<PartnerRegistro | null>(null);
  // ⚠️ In modifica il nome parte come «libero»: il fornitore è già scritto
  // sulla riga, e rifargli scegliere la scheda del registro per correggere un
  // prezzo sarebbe un passo in più per una cosa che non sta cambiando.
  const [nomeLibero, setNomeLibero] = useState(esistente?.fornitore ?? '');
  const [titolo, setTitolo] = useState(esistente?.titolo ?? '');
  const [descrizione, setDescrizione] = useState(esistente?.descrizione ?? '');
  const [linea, setLinea] = useState<string | null>(esistente?.linea ?? null);
  const [prezzo, setPrezzo] = useState(esistente?.prezzo != null ? String(esistente.prezzo).replace('.', ',') : '');
  const [prezzoNote, setPrezzoNote] = useState(esistente?.prezzo_note ?? '');
  const [tempi, setTempi] = useState(esistente?.tempi ?? '');
  const [minimo, setMinimo] = useState(esistente?.minimo_ordine ?? '');
  const [zona, setZona] = useState(esistente?.zona ?? '');
  const [allegato, setAllegato] = useState(esistente?.allegato_url ?? '');
  const [note, setNote] = useState(esistente?.note ?? '');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchFornitori()
      .then((r) => vivo && setFornitoriRegistro(r.partner))
      .catch(() => vivo && setFornitoriRegistro([]));
    return () => {
      vivo = false;
    };
  }, []);

  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return fornitoriRegistro.slice(0, 6);
    return fornitoriRegistro
      .filter((p) => [p.nome, p.citta, p.categoria].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 6);
  }, [fornitoriRegistro, cerca]);

  useEffect(() => {
    const q = cerca.trim();
    if (q.length < 2 || trovati.length) {
      setAltri([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      cercaNelRegistro(q, 6)
        .then((r) => vivo && setAltri(r))
        .catch(() => vivo && setAltri([]));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [cerca, trovati.length]);

  const nomeFornitore = scelto?.nome ?? nomeLibero.trim();
  const valido = Boolean(nomeFornitore) && titolo.trim().length > 0;

  async function salva() {
    if (!valido || salvando) return;
    setSalvando(true);
    setErrore(null);
    try {
      // ⚠️ Il prezzo scritto male FERMA il salvataggio: qui `null` vuol dire
      // «non lo sappiamo», e un numero buttato in silenzio farebbe sparire la
      // fornitura dai confronti senza che niente lo dica.
      const p = prezzo.trim() ? leggiPrezzo(prezzo) : null;
      if (prezzo.trim() && p == null) {
        setErrore(`«${prezzo}» non è un importo. Scrivilo come 1.250,50 — o lascialo vuoto.`);
        setSalvando(false);
        return;
      }
      if (esistente) {
        // In modifica non si tocca il FORNITORE: cambiarlo qui vorrebbe dire
        // spostare una fornitura da un'azienda a un'altra senza accorgersene.
        // Si spegne questa e se ne fa una nuova.
        await aggiornaFornitura(esistente.id, {
          titolo: titolo.trim(),
          descrizione: descrizione.trim() || null,
          linea,
          prezzo: p,
          prezzo_note: prezzoNote.trim() || null,
          tempi: tempi.trim() || null,
          minimo_ordine: minimo.trim() || null,
          zona: zona.trim() || null,
          allegato_url: allegato.trim() || null,
          note: note.trim() || null,
        });
      } else {
        await creaFornitura({
          fornitore: nomeFornitore,
          fornitoreAnagraficheId: scelto?.id ?? null,
          titolo,
          descrizione,
          linea,
          prezzo: p,
          prezzoNote,
          tempi,
          minimoOrdine: minimo,
          zona,
          allegatoUrl: allegato,
          note,
        });
      }
      onCreata();
    } catch (e: any) {
      setErrore(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Foglio
      titolo={esistente ? 'Modifica la fornitura' : 'Nuova fornitura'}
      sottotitolo={
        esistente
          ? `${esistente.fornitore} — il prezzo è un riferimento, non un impegno. Il fornitore non si cambia da qui.`
          : 'Cosa fa questo fornitore, sempre: il prezzo qui è un riferimento, non un impegno.'
      }
      onClose={onClose}
      bloccaSfondo
      largo
    >
      <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: 8 }}>
        <Text style={styles.campoLabel}>Fornitore *</Text>
        {scelto ? (
          <Pressable style={styles.sceltoRiga} onPress={() => setScelto(null)}>
            <Ionicons name="business-outline" size={16} color={colors.goldStrong} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sceltoNome} numberOfLines={1}>{scelto.nome}</Text>
              <Text style={styles.nota} numberOfLines={1}>
                {[scelto.citta, scelto.categoria].filter(Boolean).join(' · ') || 'Dal registro Anagrafiche'}
              </Text>
            </View>
            <Ionicons name="swap-horizontal" size={18} color={colors.oro} />
          </Pressable>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={cerca}
              onChangeText={setCerca}
              placeholder="Cerca il fornitore in Anagrafiche…"
              placeholderTextColor={colors.grigio}
              autoCapitalize="none"
            />
            {trovati.map((p) => (
              <Pressable key={p.id} style={styles.risultato} onPress={() => setScelto(p)}>
                <Ionicons name="business-outline" size={15} color={colors.navy} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.risultatoNome} numberOfLines={1}>{p.nome}</Text>
                  <Text style={styles.nota} numberOfLines={1}>
                    {[p.citta, p.categoria].filter(Boolean).join(' · ') || 'Fornitore nel registro'}
                  </Text>
                </View>
              </Pressable>
            ))}
            {altri.length ? (
              <>
                <Text style={styles.nota}>Non è ancora fra i fornitori, ma è nel registro:</Text>
                {altri.map((p) => (
                  <Pressable key={p.id} style={styles.risultato} onPress={() => setScelto(p)}>
                    <Ionicons name="business-outline" size={15} color={colors.grigio} />
                    <Text style={styles.risultatoNome} numberOfLines={1}>{p.nome}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            <TextInput
              style={styles.input}
              value={nomeLibero}
              onChangeText={setNomeLibero}
              placeholder="…oppure scrivi il nome, se non è nel registro"
              placeholderTextColor={colors.grigio}
            />
          </>
        )}

        <Text style={styles.campoLabel}>Cosa fornisce *</Text>
        <TextInput
          style={styles.input}
          value={titolo}
          onChangeText={setTitolo}
          placeholder="es. Bouquet da vetrina, composizioni per eventi"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>Linea</Text>
        <View style={styles.chips}>
          {LINEE_ATTIVE.map((l) => (
            <Pressable key={l} style={[styles.chip, linea === l && styles.chipOn]} onPress={() => setLinea(linea === l ? null : l)}>
              <Text style={[styles.chipTxt, linea === l && styles.chipTxtOn]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.campoLabel}>Prezzo di riferimento (facoltativo)</Text>
        <View style={styles.riga2}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={prezzo}
            onChangeText={setPrezzo}
            placeholder="es. 45 — vuoto se non lo sai"
            placeholderTextColor={colors.grigio}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, { flex: 1.2 }]}
            value={prezzoNote}
            onChangeText={setPrezzoNote}
            placeholder="a cosa si riferisce (a pezzo, al kg…)"
            placeholderTextColor={colors.grigio}
          />
        </View>

        <View style={styles.riga2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.campoLabel}>Tempi</Text>
            <TextInput
              style={styles.input}
              value={tempi}
              onChangeText={setTempi}
              placeholder="es. 48 ore"
              placeholderTextColor={colors.grigio}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.campoLabel}>Minimo d’ordine</Text>
            <TextInput
              style={styles.input}
              value={minimo}
              onChangeText={setMinimo}
              placeholder="es. 20 pezzi"
              placeholderTextColor={colors.grigio}
            />
          </View>
        </View>

        <Text style={styles.campoLabel}>Zona coperta</Text>
        <TextInput
          style={styles.input}
          value={zona}
          onChangeText={setZona}
          placeholder="es. Milano e hinterland"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>Listino o catalogo (link)</Text>
        <TextInput
          style={styles.input}
          value={allegato}
          onChangeText={setAllegato}
          placeholder="https://… — il file resta dove sta, qui va il link"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
        />

        <Text style={styles.campoLabel}>Note</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Condizioni, referente, vincoli… quello che serve ricordare"
          placeholderTextColor={colors.grigio}
        />

        {errore ? <Text style={styles.errore}>{errore}</Text> : null}
        <Pressable style={[styles.salva, (!valido || salvando) && styles.salvaOff]} onPress={salva} disabled={!valido || salvando}>
          {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.salvaTxt}>Salva la fornitura</Text>}
        </Pressable>
      </ScrollView>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  headerScroll: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.sm },
  errore: { color: colors.errore, fontSize: 13, fontWeight: '700' },
  search: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.testo,
    fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco },
  filtro: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filtroTxt: { color: colors.testo, fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: 12,
    gap: 4,
  },
  cardSpenta: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardFornitore: { color: colors.testo, fontWeight: '800', fontSize: 14.5, flex: 1 },
  cardTitolo: { color: colors.testo, fontSize: 13.5 },
  cardMeta: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  cellaPrezzo: { color: colors.testo, fontSize: 13 },
  prezzoNota: { color: colors.testoSoft, fontSize: 11.5 },
  azioni: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fabTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
  campoLabel: { color: colors.navy, fontWeight: '700', fontSize: 13, marginTop: 4 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.testo,
    fontSize: 14,
  },
  area: { minHeight: 74, textAlignVertical: 'top' },
  riga2: { flexDirection: 'row', gap: 8 },
  risultato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    padding: 10,
  },
  risultatoNome: { color: colors.testo, fontWeight: '700', fontSize: 13.5, flex: 1 },
  sceltoRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.m,
    padding: 10,
  },
  sceltoNome: { color: colors.testo, fontWeight: '800', fontSize: 14 },
  nota: { color: colors.testoSoft, fontSize: 12, lineHeight: 17 },
  salva: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  salvaOff: { opacity: 0.5 },
  salvaTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
});
