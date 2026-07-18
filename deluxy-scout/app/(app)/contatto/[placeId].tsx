import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { inserisciContatto } from '@/lib/db';

export default function NuovoContatto() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [ruolo, setRuolo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [isDecisore, setIsDecisore] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);

  async function salva() {
    if (!placeId) return;
    if (!nome.trim()) {
      Alert.alert('Nome mancante', 'Inserisci il nome del contatto.');
      return;
    }
    setSalvataggio(true);
    try {
      await inserisciContatto({
        place_id: placeId,
        nome: nome.trim(),
        ruolo: ruolo.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        is_decisore: isDecisore,
      });
      // Il layout è un Drawer (niente stack lineare): router.back() tornerebbe
      // alla Mappa. Torniamo esplicitamente al dettaglio del negozio.
      router.replace(`/(app)/attivita/${placeId}`);
    } catch (e: any) {
      Alert.alert('Errore', e?.message ?? 'Impossibile salvare il contatto.');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Nuovo contatto' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nome *</Text>
          <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Nome e cognome" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Ruolo</Text>
          <TextInput style={styles.input} value={ruolo} onChangeText={setRuolo} placeholder="Es. Titolare, Store Manager" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Telefono</Text>
          <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="+39…" placeholderTextColor={colors.grigio} />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="nome@azienda.it" placeholderTextColor={colors.grigio} />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              È il decisore <Ionicons name="star" size={14} color={colors.oro} />
            </Text>
            <Switch
              value={isDecisore}
              onValueChange={setIsDecisore}
              trackColor={{ true: colors.oro, false: colors.grigioChiaro }}
              thumbColor={colors.bianco}
            />
          </View>

          <Pressable style={[styles.salva, salvataggio && styles.salvaOff]} onPress={salva} disabled={salvataggio}>
            <Text style={styles.salvaTxt}>{salvataggio ? 'Salvataggio…' : 'Salva contatto'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  label: { color: colors.navy, fontWeight: '800', fontSize: 14, marginTop: spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.testo,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  switchLabel: { color: colors.navy, fontWeight: '700', fontSize: 16 },
  salva: {
    marginTop: spacing.lg,
    backgroundColor: colors.oro,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: 'center',
  },
  salvaOff: { opacity: 0.6 },
  salvaTxt: { color: colors.navy, fontWeight: '900', fontSize: 18 },
});
