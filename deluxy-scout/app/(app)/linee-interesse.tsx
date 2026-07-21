// Gestione delle LINEE DI INTERESSE (solo admin). Scout è il master: qui si
// creano/modificano/archiviano le linee e le loro SOTTOLINEE. Le altre app le
// leggono dalla Edge Function `linee`.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, useFocusEffect } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { PageIntro, StatusBadge } from '@/components/ui';
import { conferma, avvisa } from '@/lib/dialoghi';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { aggiornaLinea, archiviaLinea, creaLinea, fetchLineeInteresse, type LineaInteresse } from '@/lib/db';

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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Linee di interesse' }} />
      <PageIntro testo="Scout è il master delle linee di interesse: qui le crei, modifichi o archivi, con le relative sottolinee. Le altre app Deluxy le leggono da qui." />
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

      <Pressable style={styles.fab} onPress={() => setEditor({ modo: 'nuova-linea' })}>
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Nuova linea</Text>
      </Pressable>

      {editor ? <EditorModal editor={editor} onClose={() => setEditor(null)} onSalvato={() => { setEditor(null); carica(); }} /> : null}
    </View>
  );
}

function EditorModal({ editor, onClose, onSalvato }: { editor: Editor; onClose: () => void; onSalvato: () => void }) {
  const esistente = editor.modo === 'modifica' ? editor.linea : null;
  const [nome, setNome] = useState(esistente?.nome ?? '');
  const [icona, setIcona] = useState(esistente?.icona ?? '');
  const [pitch, setPitch] = useState(esistente?.pitch ?? '');
  const [attiva, setAttiva] = useState(esistente?.attiva_bool ?? true);
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
        await aggiornaLinea(editor.linea.id, { nome: nome.trim(), icona: icona.trim() || null, pitch: pitch.trim() || null, attiva_bool: attiva });
      } else {
        await creaLinea({
          nome: nome.trim(),
          parent_id: editor.modo === 'nuova-sotto' ? editor.parentId : null,
          icona: icona.trim() || null,
          pitch: pitch.trim() || null,
          attiva_bool: attiva,
        });
      }
      onSalvato();
    } catch (e: any) {
      setErrore(/duplicate|unique/i.test(e?.message ?? '') ? 'Esiste già una linea con questo nome.' : e?.message ?? 'Errore nel salvataggio');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitolo}>{titolo}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>
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
          {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          <Pressable style={[styles.salva, salvando && styles.salvaOff]} onPress={salva} disabled={salvando}>
            {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.salvaTxt}>Salva</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, paddingBottom: 96, gap: spacing.sm },
  vuoto: { textAlign: 'center', color: colors.grigio, marginTop: spacing.xl, fontStyle: 'italic' },
  card: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 8 },
  rigaLinea: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconaBox: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  nome: { color: colors.testo, fontWeight: '800', fontSize: 15 },
  pitch: { color: colors.testoSoft, fontSize: 12 },
  azioneBtn: { padding: 2 },
  sottoWrap: { gap: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: colors.grigioChiaro, marginLeft: 8 },
  rigaSotto: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  sottoNome: { flex: 1, color: colors.testo, fontSize: 13.5, fontWeight: '600' },
  sottoStandby: { color: colors.grigio, fontSize: 11, fontStyle: 'italic' },
  aggiungiSotto: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  aggiungiSottoTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute', right: spacing.md, bottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.navy, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 18, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  fabTxt: { color: colors.bianco, fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.sfondo, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, maxWidth: 560, width: '100%', alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitolo: { fontSize: 18, fontWeight: '900', color: colors.testo },
  label: { fontSize: 12, fontWeight: '700', color: colors.testoSoft, marginTop: 4 },
  input: { backgroundColor: colors.bianco, borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 15, color: colors.testo },
  attivaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  attivaTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  attivaNota: { color: colors.grigio, fontSize: 12, lineHeight: 16 },
  errore: { color: colors.errore, fontSize: 13 },
  salva: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  salvaOff: { opacity: 0.5 },
  salvaTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
