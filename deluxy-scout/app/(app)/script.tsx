// Sezione "Script": la libreria dei testi email (prospezione, follow-up…) che il
// team riusa. Da qui si creano/modificano i modelli e si parte per l'invio a più
// contatti. I segnaposto {nome} e {negozio} vengono personalizzati per ciascuno.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Foglio } from '@/components/Foglio';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, shadow, spacing, contenutoCentrato, contenutoLargo } from '@/lib/theme';
import { Tabella, type ColonnaTabella } from '@/components/Tabella';
import { EmptyState, PageIntro, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { conferma, avvisa } from '@/lib/dialoghi';
import { eliminaScript, fetchScript, LABEL_TIPO, salvaScript, type ScriptEmail, type TipoScript } from '@/lib/script';
import { RichTextEditor } from '@/components/RichTextEditor';
import { testoSemplice } from '@/lib/variabili';

const TIPI: TipoScript[] = ['prospezione', 'follow_up', 'avviso', 'altro'];
const COLORE_TIPO: Record<TipoScript, string> = {
  prospezione: colors.blue,
  follow_up: colors.purple,
  avviso: colors.attenzione,
  altro: colors.grigio,
};

export default function Script() {
  const router = useRouter();
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const uid = session?.user?.id;
  const [lista, setLista] = useState<ScriptEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<'nuovo' | ScriptEmail | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setLista(await fetchScript());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((s) => [s.titolo, s.oggetto, s.corpo].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q)));
  }, [lista, query]);

  function elimina(s: ScriptEmail) {
    conferma(
      'Eliminare lo script?',
      `"${s.titolo}" verrà rimosso dalla libreria.`,
      async () => {
        try {
          await eliminaScript(s.id);
          carica();
        } catch (e: any) {
          avvisa('Errore', e?.message ?? 'Non eliminato (forse non è tuo).');
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  // Da 900px in su la libreria è una TABELLA (le schede restano sul telefono).
  const { width } = useWindowDimensions();
  const aTabella = width >= 900;
  const colonne: ColonnaTabella<ScriptEmail>[] = [
    {
      chiave: 'tipo',
      label: 'Tipo',
      width: 110,
      valore: (s) => LABEL_TIPO[s.tipo],
      cella: (s) => <StatusBadge small label={LABEL_TIPO[s.tipo]} colore={COLORE_TIPO[s.tipo]} />,
    },
    {
      chiave: 'titolo',
      label: 'Titolo',
      flex: 1,
      valore: (s) => s.titolo,
      cella: (s) => (
        <Text style={styles.tabTitolo} numberOfLines={2}>
          {s.titolo}
        </Text>
      ),
    },
    { chiave: 'oggetto', label: 'Oggetto', flex: 1, valore: (s) => s.oggetto ?? null },
    { chiave: 'corpo', label: 'Testo', flex: 1.4, righe: 2, valore: (s) => testoSemplice(s.corpo) },
    {
      chiave: 'azioni',
      label: '',
      width: 224,
      fissa: true,
      valore: () => null,
      cella: (s) => {
        const mio = s.owner === uid || admin;
        return (
          <View style={styles.tabAzioni}>
            <Pressable style={styles.btnInvia} onPress={(e: any) => { e?.stopPropagation?.(); router.push(`/(app)/invio/${s.id}`); }}>
              <Ionicons name="paper-plane-outline" size={14} color={colors.bianco} />
              <Text style={styles.btnInviaTxt}>Invia</Text>
            </Pressable>
            {mio ? (
              <>
                <Pressable style={styles.btnSec} onPress={(e: any) => { e?.stopPropagation?.(); setEditor(s); }}>
                  <Text style={styles.btnSecTxt}>Modifica</Text>
                </Pressable>
                <Pressable style={styles.btnSec} onPress={(e: any) => { e?.stopPropagation?.(); elimina(s); }}>
                  <Text style={[styles.btnSecTxt, { color: colors.errore }]}>Elimina</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        );
      },
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <PageIntro testo="I testi pronti delle email (prospezione, follow-up…). Creali qui e inviali a uno o più contatti: {nome} e {negozio} vengono personalizzati per ciascuno." />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca tra i modelli…"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        // In tabella la FlatList riceve UNA riga con l'intera libreria.
        data={aTabella ? (dati.length ? [dati] : []) : dati}
        keyExtractor={(s: any) => (aTabella ? 'tabella' : (s as ScriptEmail).id)}
        contentContainerStyle={[styles.list, aTabella ? contenutoLargo : contenutoCentrato]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
        ListEmptyComponent={
          <EmptyState
            loading={loading}
            icona="document-text-outline"
            titolo="Nessuno script"
            aiuto="Crea il primo testo — es. l'email di prospezione — col bottone in basso. Potrai riusarlo e inviarlo a più contatti."
            azione="Nuovo script"
            onAzione={() => setEditor('nuovo')}
          />
        }
        renderItem={({ item }) => {
          if (aTabella) {
            return (
              <Tabella
                righe={item as ScriptEmail[]}
                colonne={colonne}
                chiaveRiga={(s) => s.id}
                ordineIniziale={{ campo: 'titolo', verso: 'asc' }}
              
            totali={(righe) => ({
              titolo: `Totale · ${righe.length} ${righe.length === 1 ? 'script' : 'script'}`,
            })}
          />
            );
          }
          const s = item as ScriptEmail;
          const mio = s.owner === uid || admin;
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <StatusBadge small label={LABEL_TIPO[s.tipo]} colore={COLORE_TIPO[s.tipo]} />
                <Text style={styles.titolo} numberOfLines={1}>{s.titolo}</Text>
              </View>
              {s.oggetto ? <Text style={styles.oggetto} numberOfLines={1}>Oggetto: {s.oggetto}</Text> : null}
              <Text style={styles.corpo} numberOfLines={3}>{testoSemplice(s.corpo)}</Text>
              <View style={styles.azioni}>
                <Pressable style={styles.btnInvia} onPress={() => router.push(`/(app)/invio/${s.id}`)}>
                  <Ionicons name="paper-plane-outline" size={15} color={colors.bianco} />
                  <Text style={styles.btnInviaTxt}>Invia</Text>
                </Pressable>
                {mio ? (
                  <>
                    <Pressable style={styles.btnSec} onPress={() => setEditor(s)}>
                      <Text style={styles.btnSecTxt}>Modifica</Text>
                    </Pressable>
                    <Pressable style={styles.btnSec} onPress={() => elimina(s)}>
                      <Text style={[styles.btnSecTxt, { color: colors.errore }]}>Elimina</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setEditor('nuovo')}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuovo script</Text>
      </Pressable>

      {editor ? (
        <EditorModal
          script={editor === 'nuovo' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSalvato={() => {
            setEditor(null);
            carica();
          }}
        />
      ) : null}
    </View>
  );
}

function EditorModal({ script, onClose, onSalvato }: { script?: ScriptEmail; onClose: () => void; onSalvato: () => void }) {
  const [titolo, setTitolo] = useState(script?.titolo ?? '');
  const [tipo, setTipo] = useState<TipoScript>(script?.tipo ?? 'prospezione');
  const [oggetto, setOggetto] = useState(script?.oggetto ?? '');
  const [corpo, setCorpo] = useState(script?.corpo ?? '');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    if (!titolo.trim() || !corpo.trim()) {
      setErrore('Titolo e testo sono obbligatori.');
      return;
    }
    setSalvando(true);
    setErrore(null);
    try {
      await salvaScript({ id: script?.id, titolo: titolo.trim(), tipo, oggetto: oggetto.trim() || null, corpo });
      onSalvato();
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  return (
    // bloccaSfondo: un testo scritto a metà non si chiude col clic fuori;
    // largo perché l'editor del corpo merita spazio.
    <Foglio titolo={script ? 'Modifica script' : 'Nuovo script'} onClose={onClose} bloccaSfondo largo>
          <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Titolo *</Text>
            <TextInput style={styles.input} value={titolo} onChangeText={setTitolo} placeholder="Es. Primo contatto boutique" placeholderTextColor={colors.grigio} />

            <Text style={styles.label}>Tipo</Text>
            <View style={styles.chipRow}>
              {TIPI.map((t) => (
                <Pressable key={t} style={[styles.chip, tipo === t && styles.chipOn]} onPress={() => setTipo(t)}>
                  <Text style={[styles.chipTxt, tipo === t && styles.chipTxtOn]}>{LABEL_TIPO[t]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Oggetto</Text>
            <TextInput style={styles.input} value={oggetto} onChangeText={setOggetto} placeholder="Es. Deluxy per [negozio]" placeholderTextColor={colors.grigio} />

            <Text style={styles.label}>Testo *</Text>
            <RichTextEditor
              valueHtml={corpo}
              onChangeHtml={setCorpo}
              placeholder={'Gentile [nome], siamo Deluxy…'}
              minHeight={220}
            />
            <Text style={styles.hint}>
              Usa la barra per grassetto, corsivo, elenchi e link. Variabili tra [ ]: [nome], [negozio]… si riempiono
              dal contatto; altre come [data] le compili prima dell'invio.
            </Text>

            {errore ? <Text style={styles.errore}>{errore}</Text> : null}
            <Pressable style={[styles.salva, salvando && styles.salvaOff]} onPress={salva} disabled={salvando}>
              {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.salvaTxt}>Salva script</Text>}
            </Pressable>
          </ScrollView>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  head: { backgroundColor: colors.sfondo, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, paddingTop: spacing.sm },
  search: {
    backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.m,
    marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 15, color: colors.testo,
  },
  list: { padding: spacing.lg, paddingBottom: 96, gap: spacing.sm },
  card: { backgroundColor: colors.bianco, borderRadius: radius.m, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.lg, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titolo: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.navy },
  tabTitolo: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  tabAzioni: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  oggetto: { color: colors.testoSoft, fontSize: 13, fontWeight: '600' },
  corpo: { color: colors.testoSoft, fontSize: 13, lineHeight: 18 },
  azioni: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  btnInvia: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  btnInviaTxt: { color: colors.bianco, fontWeight: '600', fontSize: 13.5 },
  btnSec: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  btnSecTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.xxl, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.navy, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 18, paddingVertical: 12,
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  label: { fontSize: 12, fontWeight: '700', color: colors.testoSoft, marginTop: 4 },
  input: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.m, paddingHorizontal: spacing.lg, paddingVertical: 11, fontSize: 15, color: colors.testo },
  hint: { color: colors.grigio, fontSize: 12, lineHeight: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  errore: { color: colors.errore, fontSize: 13 },
  salva: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  salvaOff: { opacity: 0.5 },
  salvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
