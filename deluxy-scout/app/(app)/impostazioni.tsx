// Profilo → Impostazioni: le regolazioni di prodotto che prima vivevano nei
// secret di Supabase e si cambiavano solo da riga di comando.
// Le scrive un amministratore (RLS, migr. 0043); qui NON si toccano segreti.
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { CHIAVE_CASELLA_RICHIESTE, leggiImpostazione, salvaImpostazione } from '@/lib/db';
import { importaRichiesteDaMail } from '@/lib/mail';
import { avvisa } from '@/lib/dialoghi';

export default function Impostazioni() {
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const [casella, setCasella] = useState('');
  const [originale, setOriginale] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [provando, setProvando] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  const carica = useCallback(async () => {
    const v = (await leggiImpostazione(CHIAVE_CASELLA_RICHIESTE)) ?? '';
    setCasella(v);
    setOriginale(v);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const cambiata = casella.trim() !== originale.trim();

  async function salva() {
    if (!cambiata || salvando) return;
    setSalvando(true);
    setEsito(null);
    try {
      await salvaImpostazione(CHIAVE_CASELLA_RICHIESTE, casella);
      setOriginale(casella.trim());
      avvisa('Salvato', 'Da adesso le Richieste Web arrivano da questa casella.');
    } catch (e: any) {
      avvisa(
        'Non salvato',
        e?.message?.includes('row-level security')
          ? 'Serve un account amministratore per cambiare le impostazioni.'
          : (e?.message ?? 'Riprova più tardi.'),
      );
    } finally {
      setSalvando(false);
    }
  }

  /** Prova vera: legge la casella e importa. Dice cosa è successo, non "ok". */
  async function prova() {
    if (provando) return;
    setProvando(true);
    setEsito(null);
    try {
      const { lette, importate } = await importaRichiesteDaMail();
      setEsito({
        ok: true,
        testo: importate
          ? `Collegata: ${lette} mail lette, ${importate} nuove richieste importate.`
          : `Collegata: ${lette} mail lette, nessuna nuova da importare.`,
      });
    } catch (e: any) {
      setEsito({ ok: false, testo: e?.message ?? 'Prova non riuscita.' });
    } finally {
      setProvando(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>RICHIESTE WEB</Text>
        <Text style={styles.aiuto}>
          La casella di posta da cui arrivano le richieste dei clienti. Ogni mail non ancora
          importata diventa una richiesta da qualificare; le mail già viste non si ripetono.
        </Text>
        <Text style={styles.campoLabel}>Casella</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={casella}
          onChangeText={setCasella}
          editable={admin}
          placeholder="commerciale@deluxy.it"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {!admin ? (
          <Text style={styles.nota}>Solo un amministratore può cambiarla.</Text>
        ) : (
          <Text style={styles.nota}>
            Dev&apos;essere una casella già configurata in AI Mail (utente attivo con quell&apos;indirizzo
            e IMAP collegato): è AI Mail che legge la posta, Scout la riceve da lì.
          </Text>
        )}

        <View style={styles.azioni}>
          {admin ? (
            <Pressable style={[styles.btn, (!cambiata || salvando) && styles.btnOff]} disabled={!cambiata || salvando} onPress={salva}>
              <Text style={styles.btnTxt}>{salvando ? 'Salvo…' : 'Salva'}</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.btnGhost, provando && styles.btnOff]} disabled={provando} onPress={prova}>
            <Ionicons name="sync-outline" size={15} color={colors.navy} />
            <Text style={styles.btnGhostTxt}>{provando ? 'Provo…' : 'Prova il collegamento'}</Text>
          </Pressable>
        </View>

        {esito ? (
          <View style={[styles.esito, esito.ok ? styles.esitoOk : styles.esitoKo]}>
            <Ionicons
              name={esito.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={16}
              color={esito.ok ? '#2F7D46' : colors.errore}
            />
            <Text style={[styles.esitoTxt, { color: esito.ok ? '#2F7D46' : colors.errore }]}>{esito.testo}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.piede}>
        Le chiavi API e le password non stanno qui: restano custodite sul server e si cambiano solo
        da riga di comando.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: 8,
  },
  cardLabel: { color: colors.testoSoft, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  aiuto: { color: colors.testoSoft, fontSize: 13 },
  campoLabel: { color: colors.testoSoft, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.testo,
    fontSize: 14,
  },
  inputOff: { backgroundColor: colors.sfondo, color: colors.testoSoft },
  nota: { color: colors.grigio, fontSize: 12 },
  azioni: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  btn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  btnOff: { opacity: 0.5 },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13 },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  btnGhostTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  esito: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: radius.md, padding: 10, marginTop: 4 },
  esitoOk: { backgroundColor: '#EAF6EE' },
  esitoKo: { backgroundColor: '#FBEAE8' },
  esitoTxt: { flex: 1, fontSize: 13, fontWeight: '600' },
  piede: { color: colors.grigio, fontSize: 12, paddingHorizontal: 4 },
});
