// Configurazione della propria casella email (Register.it) da cui Deluxy Scout
// invia notifiche e promemoria per conto del venditore. La password si inserisce
// qui, viene cifrata server-side e non è più leggibile.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { StatusBadge } from '@/components/ui';
import { rimuoviSmtp, salvaSmtp, statoSmtp, verificaSmtp } from '@/lib/smtp';

// Preset comodo: la maggior parte delle caselle Register.it usa questo host.
const HOST_DEFAULT = 'authsmtp.register.it';

export default function EmailConfig() {
  const router = useRouter();
  const [configurato, setConfigurato] = useState(false);
  const [verificatoIl, setVerificatoIl] = useState<string | null>(null);
  const [utenteSalvato, setUtenteSalvato] = useState<string | null>(null);

  const [host, setHost] = useState(HOST_DEFAULT);
  const [porta, setPorta] = useState('465');
  const [utente, setUtente] = useState('');
  const [password, setPassword] = useState('');
  const [mittente, setMittente] = useState('');

  const [caricando, setCaricando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [verificando, setVerificando] = useState(false);

  const carica = useCallback(async () => {
    setCaricando(true);
    try {
      const s = await statoSmtp();
      setConfigurato(s.configurato);
      setVerificatoIl(s.verificato_il);
      setUtenteSalvato(s.utente);
      if (s.utente) setUtente((u) => u || s.utente!);
    } catch {
      /* la card mostra comunque il form vuoto */
    } finally {
      setCaricando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  async function salva() {
    if (!host.trim() || !utente.trim() || !password) {
      Alert.alert('Dati mancanti', 'Compila host, email e password.');
      return;
    }
    setSalvando(true);
    try {
      await salvaSmtp({
        host: host.trim(),
        porta: Number(porta) || 465,
        utente: utente.trim(),
        password,
        mittente: mittente.trim() || undefined,
      });
      setPassword('');
      Alert.alert('Salvato', 'Casella collegata. Ora invia un test per confermare che funzioni.');
      carica();
    } catch (e: any) {
      Alert.alert('Errore', e?.message ?? 'Impossibile salvare.');
    } finally {
      setSalvando(false);
    }
  }

  async function verifica() {
    setVerificando(true);
    try {
      const r = await verificaSmtp();
      if (r.ok) {
        Alert.alert('Funziona', `Email di prova inviata a ${r.inviata_a}. Controlla la casella.`);
        carica();
      } else if (r.reason === 'non_configurato') {
        Alert.alert('Prima salva', 'Salva le credenziali, poi invia il test.');
      } else {
        Alert.alert('Invio non riuscito', r.dettaglio ?? 'Controlla email, password e host.');
      }
    } catch (e: any) {
      Alert.alert('Errore', e?.message ?? 'Verifica non riuscita.');
    } finally {
      setVerificando(false);
    }
  }

  function rimuovi() {
    Alert.alert('Scollega casella', 'Le notifiche e i promemoria via email smetteranno di partire. Confermi?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Scollega',
        style: 'destructive',
        onPress: async () => {
          try {
            await rimuoviSmtp();
            setPassword('');
            carica();
          } catch (e: any) {
            Alert.alert('Errore', e?.message ?? 'Riprova più tardi.');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Collega la tua casella email (Register.it): da qui Deluxy Scout invierà per tuo conto le notifiche dei task
        assegnati e il riepilogo giornaliero. La password viene salvata cifrata e non è più visibile.
      </Text>

      <View style={styles.card}>
        <View style={styles.statoRow}>
          <Text style={styles.cardLabel}>STATO</Text>
          {caricando ? (
            <ActivityIndicator size="small" color={colors.testoSoft} />
          ) : configurato ? (
            <StatusBadge
              small
              label={verificatoIl ? 'Collegata e verificata' : 'Da verificare'}
              colore={verificatoIl ? colors.successo : colors.attenzione}
            />
          ) : (
            <StatusBadge small label="Non collegata" colore={colors.grigio} />
          )}
        </View>
        {configurato && utenteSalvato ? <Text style={styles.meta}>Casella: {utenteSalvato}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>CREDENZIALI</Text>

        <Text style={styles.campoLabel}>Server SMTP (host)</Text>
        <TextInput style={styles.input} value={host} onChangeText={setHost} autoCapitalize="none" placeholder={HOST_DEFAULT} placeholderTextColor={colors.grigio} />

        <Text style={styles.campoLabel}>Porta</Text>
        <TextInput style={styles.input} value={porta} onChangeText={setPorta} keyboardType="number-pad" placeholder="465" placeholderTextColor={colors.grigio} />
        <Text style={styles.hint}>465 (consigliata, SSL) oppure 587.</Text>

        <Text style={styles.campoLabel}>Email (utente)</Text>
        <TextInput style={styles.input} value={utente} onChangeText={setUtente} autoCapitalize="none" keyboardType="email-address" placeholder="nome@deluxy.it" placeholderTextColor={colors.grigio} />

        <Text style={styles.campoLabel}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={configurato ? '•••••••• (invariata)' : 'Password della casella'}
          placeholderTextColor={colors.grigio}
        />
        <Text style={styles.hint}>Su Register.it l'invio SMTP autenticato dev'essere abilitato per la casella.</Text>

        <Text style={styles.campoLabel}>Nome mittente (facoltativo)</Text>
        <TextInput style={styles.input} value={mittente} onChangeText={setMittente} placeholder='es. "Mario Rossi — Deluxy"' placeholderTextColor={colors.grigio} />

        <Pressable style={[styles.btn, salvando && styles.btnOff]} onPress={salva} disabled={salvando}>
          {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.btnTxt}>Salva credenziali</Text>}
        </Pressable>
      </View>

      {configurato ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>VERIFICA</Text>
          <Text style={styles.meta}>Invia un'email di prova alla tua stessa casella per confermare che tutto funzioni.</Text>
          <Pressable style={[styles.btn, verificando && styles.btnOff]} onPress={verifica} disabled={verificando}>
            {verificando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.btnTxt}>Invia email di prova</Text>}
          </Pressable>
          <Pressable style={styles.rimuovi} onPress={rimuovi}>
            <Text style={styles.rimuoviTxt}>Scollega casella</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  intro: { color: colors.testoSoft, fontSize: 13.5, lineHeight: 19 },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  statoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { color: colors.testoSoft, fontSize: 11, fontWeight: '600', letterSpacing: 0.7, marginBottom: spacing.sm },
  meta: { color: colors.testoSoft, fontSize: 13, marginTop: 2 },
  campoLabel: { fontSize: 12, fontWeight: '700', color: colors.testoSoft, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.sfondo,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.testo,
  },
  hint: { color: colors.grigio, fontSize: 12, marginTop: 4 },
  btn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center', marginTop: spacing.md },
  btnOff: { opacity: 0.55 },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 15 },
  rimuovi: { alignItems: 'center', paddingVertical: spacing.md, marginTop: 4 },
  rimuoviTxt: { color: colors.errore, fontWeight: '700', fontSize: 14 },
});
