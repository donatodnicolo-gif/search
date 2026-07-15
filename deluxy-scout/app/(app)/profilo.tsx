import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { colors, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { contaInCoda, flushCoda } from '@/lib/syncQueue';
import { aggiornaNomeProfilo, fetchProfilo } from '@/lib/db';
import { sincronizzaHubspot } from '@/lib/hubspot';
import { esportaAttivitaCsv, esportaVisiteCsv } from '@/lib/export';

export default function Profilo() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [inCoda, setInCoda] = useState(0);
  const [sync, setSync] = useState(false);
  const [syncHS, setSyncHS] = useState(false);
  const [esporto, setEsporto] = useState<null | 'attivita' | 'visite'>(null);
  const [nome, setNome] = useState('');
  const [salvoNome, setSalvoNome] = useState(false);

  async function sincronizzaContatti() {
    setSyncHS(true);
    try {
      const r = await sincronizzaHubspot();
      Alert.alert('HubSpot', `Sincronizzati ${r.aziende} aziende e ${r.contatti} contatti.`);
    } catch (e: any) {
      Alert.alert('Errore', e?.message ?? 'Riprova più tardi.');
    } finally {
      setSyncHS(false);
    }
  }

  const aggiorna = useCallback(async () => {
    setInCoda(await contaInCoda());
    const uid = session?.user?.id;
    if (uid) {
      const p = await fetchProfilo(uid);
      if (p) setNome(p.nome ?? '');
    }
  }, [session?.user?.id]);

  async function salvaNome() {
    const uid = session?.user?.id;
    if (!uid) return;
    setSalvoNome(true);
    try {
      await aggiornaNomeProfilo(uid, nome);
      Alert.alert('Profilo', 'Nome aggiornato.');
    } catch {
      Alert.alert('Profilo', 'Impossibile salvare il nome (riprova più tardi).');
    } finally {
      setSalvoNome(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      aggiorna();
    }, [aggiorna]),
  );

  async function sincronizza() {
    setSync(true);
    try {
      const r = await flushCoda();
      Alert.alert('Sincronizzazione', `Inviate ${r.synced} visite. In coda: ${r.rimasti}.`);
    } catch (e: any) {
      Alert.alert('Errore sync', e?.message ?? 'Riprova quando sei online.');
    } finally {
      setSync(false);
      aggiorna();
    }
  }

  async function esporta(tipo: 'attivita' | 'visite') {
    setEsporto(tipo);
    try {
      const n = tipo === 'attivita' ? await esportaAttivitaCsv() : await esportaVisiteCsv();
      Alert.alert('Export pronto', `${n} righe esportate in CSV.`);
    } catch (e: any) {
      Alert.alert('Errore export', e?.message ?? 'Impossibile esportare.');
    } finally {
      setEsporto(null);
    }
  }

  const email = session?.user?.email ?? '—';
  const versione = Constants.expoConfig?.version ?? '1.0.0';
  const hubspotOk = Boolean(env.hubspotSyncUrl());

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ACCOUNT</Text>
        <Text style={styles.email}>{email}</Text>
        <Text style={styles.meta}>Venditore Deluxy Scout</Text>
        <Text style={[styles.cardLabel, { marginTop: spacing.md }]}>IL TUO NOME</Text>
        <View style={styles.nomeRow}>
          <TextInput
            style={styles.nomeInput}
            value={nome}
            onChangeText={setNome}
            placeholder="Nome e cognome"
            placeholderTextColor={colors.grigio}
          />
          <Pressable style={[styles.nomeBtn, salvoNome && styles.btnOff]} onPress={salvaNome} disabled={salvoNome}>
            {salvoNome ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.btnTxt}>Salva</Text>}
          </Pressable>
        </View>
        <Text style={styles.meta}>Comparirà nella dashboard di Team dell'amministratore.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>SINCRONIZZAZIONE</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Visite in coda offline</Text>
          <Text style={[styles.rowValue, inCoda > 0 && { color: colors.attenzione }]}>{inCoda}</Text>
        </View>
        <Pressable style={[styles.btn, sync && styles.btnOff]} onPress={sincronizza} disabled={sync || inCoda === 0}>
          <Text style={styles.btnTxt}>{sync ? 'Sincronizzo…' : 'Sincronizza ora'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>INTEGRAZIONI</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>HubSpot</Text>
          <Text style={[styles.pill, hubspotOk ? styles.pillOk : styles.pillOff]}>
            {hubspotOk ? 'Collegato' : 'Non configurato'}
          </Text>
        </View>
        <Pressable style={[styles.btn, syncHS && styles.btnOff]} onPress={sincronizzaContatti} disabled={syncHS}>
          <Text style={styles.btnTxt}>{syncHS ? 'Sincronizzo…' : 'Sincronizza contatti da HubSpot'}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.card} onPress={() => router.push('/(app)/nascosti')}>
        <Text style={styles.cardLabel}>ATTIVITÀ</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>
            <Ionicons name="eye-off-outline" size={15} color={colors.navy} /> Nascosti (non interessanti)
          </Text>
          <Text style={styles.freccia}>›</Text>
        </View>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>ESPORTA (CSV)</Text>
        <Pressable style={[styles.btn, esporto && styles.btnOff]} onPress={() => esporta('attivita')} disabled={!!esporto}>
          <Text style={styles.btnTxt}>{esporto === 'attivita' ? 'Esporto…' : 'Esporta attività'}</Text>
        </Pressable>
        <Pressable style={[styles.btn, esporto && styles.btnOff, { marginTop: spacing.sm }]} onPress={() => esporta('visite')} disabled={!!esporto}>
          <Text style={styles.btnTxt}>{esporto === 'visite' ? 'Esporto…' : 'Esporta visite'}</Text>
        </Pressable>
      </View>

      <Text style={styles.versione}>Deluxy Scout v{versione}</Text>

      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutTxt}>Esci</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  cardLabel: { color: colors.oro, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm },
  email: { fontSize: 18, fontWeight: '800', color: colors.navy },
  meta: { color: colors.testoSoft, fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { color: colors.navy, fontSize: 15, fontWeight: '600' },
  rowValue: { color: colors.navy, fontSize: 18, fontWeight: '900' },
  freccia: { color: colors.oro, fontSize: 20, fontWeight: '800' },
  pill: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  pillOk: { backgroundColor: colors.successo, color: colors.bianco },
  pillOff: { backgroundColor: colors.grigioChiaro, color: colors.testoSoft },
  nomeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  nomeInput: {
    flex: 1,
    backgroundColor: colors.sfondo,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.testo,
  },
  nomeBtn: { backgroundColor: colors.ink, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12 },
  btn: { backgroundColor: colors.navy, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: spacing.sm },
  btnOff: { opacity: 0.5 },
  btnTxt: { color: colors.bianco, fontWeight: '800' },
  versione: { textAlign: 'center', color: colors.grigio, fontSize: 12 },
  logout: { alignItems: 'center', paddingVertical: spacing.md },
  logoutTxt: { color: colors.errore, fontWeight: '800' },
});
