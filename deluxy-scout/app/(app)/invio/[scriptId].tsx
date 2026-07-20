// Invio di uno script a più contatti. Passi: 1) scegli i destinatari dalla
// Rubrica (solo chi ha un'email), 2) rivedi oggetto e testo (modificabili),
// 3) conferma e invia dalla tua casella. Ogni email è personalizzata per il
// contatto ({nome}/{negozio}) e l'esito è mostrato per destinatario.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchTuttiContatti, type ContattoConLuogo } from '@/lib/db';
import { anteprima, fetchScript, inviaEmailContatti, type ScriptEmail } from '@/lib/script';
import { Loader } from '../../_layout';

export default function InvioScript() {
  const { scriptId } = useLocalSearchParams<{ scriptId: string }>();
  const router = useRouter();

  const [script, setScript] = useState<ScriptEmail | null>(null);
  const [contatti, setContatti] = useState<ContattoConLuogo[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [fase, setFase] = useState<'scelta' | 'revisione'>('scelta');
  const [inviando, setInviando] = useState(false);

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
        setContatti(cont.filter((c) => c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)));
      } finally {
        setCaricando(false);
      }
    })();
  }, [scriptId]);

  const dati = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contatti;
    return contatti.filter((c) => [c.nome, c.place_nome, c.email].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q)));
  }, [contatti, query]);

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

  async function invia() {
    // Azione esterna e irreversibile: riepilogo esplicito prima di partire.
    Alert.alert(
      'Confermi l\'invio?',
      `Verrà inviata un'email a ${selezionati.length} contatt${selezionati.length === 1 ? 'o' : 'i'} dalla tua casella.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: `Invia a ${selezionati.length}`, style: 'default', onPress: eseguiInvio },
      ],
    );
  }

  async function eseguiInvio() {
    setInviando(true);
    try {
      const destinatari = selezionati.map((c) => ({ email: c.email as string, nome: c.nome, negozio: c.place_nome }));
      const r = await inviaEmailContatti(oggetto, corpo, destinatari);
      if (r.reason === 'smtp_non_configurato') {
        Alert.alert('Casella non collegata', 'Collega la tua email da Profilo → La mia email, poi riprova.');
        return;
      }
      const falliti = r.falliti?.length ?? 0;
      Alert.alert(
        'Invio completato',
        `Inviate ${r.inviate} su ${r.totale}.` + (falliti ? `\nNon riuscite: ${falliti} (email errata o rifiutata).` : ''),
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Errore', e?.message ?? 'Invio non riuscito.');
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
              <TextInput style={[styles.input, styles.textarea]} value={corpo} onChangeText={setCorpo} multiline textAlignVertical="top" />
              <Text style={styles.hint}>{'{nome}'} e {'{negozio}'} vengono sostituiti per ogni contatto.</Text>

              {primo ? (
                <View style={styles.anteprima}>
                  <Text style={styles.anteprimaLabel}>Anteprima per {primo.nome || primo.email}</Text>
                  {oggetto ? <Text style={styles.anteprimaOgg}>{anteprima(oggetto, primo.nome, primo.place_nome)}</Text> : null}
                  <Text style={styles.anteprimaCorpo}>{anteprima(corpo, primo.nome, primo.place_nome)}</Text>
                </View>
              ) : null}
            </View>
          }
        />
        <View style={styles.barra}>
          <Pressable style={styles.btnIndietro} onPress={() => setFase('scelta')} disabled={inviando}>
            <Text style={styles.btnIndietroTxt}>Indietro</Text>
          </Pressable>
          <Pressable style={[styles.btnInvia, inviando && styles.off]} onPress={invia} disabled={inviando || !corpo.trim()}>
            {inviando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.btnInviaTxt}>Invia a {selezionati.length}</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Fase 1: scelta destinatari ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: script.titolo }} />
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
        renderItem={({ item }) => {
          const on = sel.has(item.id);
          return (
            <Pressable style={styles.riga} onPress={() => toggle(item.id)}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.ink : colors.grigio} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rigaNome} numberOfLines={1}>{item.nome || '(senza nome)'}</Text>
                <Text style={styles.rigaMeta} numberOfLines={1}>
                  {[item.place_nome, item.email].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <View style={styles.barra}>
        <Text style={styles.conteggio}>{sel.size} selezionati</Text>
        <Pressable style={[styles.btnInvia, !sel.size && styles.off]} onPress={() => setFase('revisione')} disabled={!sel.size}>
          <Text style={styles.btnInviaTxt}>Continua</Text>
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
  riga: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, paddingVertical: 10, paddingHorizontal: 12 },
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
  textarea: { minHeight: 180 },
  hint: { color: colors.grigio, fontSize: 12 },
  anteprima: { backgroundColor: colors.bianco, borderRadius: radius.md, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, marginTop: spacing.sm, gap: 4 },
  anteprimaLabel: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  anteprimaOgg: { color: colors.testo, fontSize: 14, fontWeight: '700' },
  anteprimaCorpo: { color: colors.testo, fontSize: 14, lineHeight: 20 },
});
