import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing } from '@/lib/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    setErrore(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setErrore(traduciErrore(error));
    // Al successo, il guard reindirizza automaticamente.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.brand}>
          <Text style={styles.logo}>DELUXY</Text>
          <Text style={styles.sub}>Scout — prospezione sul territorio</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="nome@deluxy.it"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.grigio}
          />

          {errore ? <Text style={styles.errore}>{errore}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={onLogin}
            disabled={loading}
          >
            <Text style={styles.btnTxt}>{loading ? 'Accesso…' : 'Accedi'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function traduciErrore(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email o password non corretti.';
  if (/email not confirmed/i.test(msg)) return 'Email non ancora confermata.';
  return msg;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  container: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { color: colors.oro, fontSize: 40, fontWeight: '900', letterSpacing: 6 },
  sub: { color: '#C7CCD8', marginTop: spacing.sm, fontSize: 14 },
  form: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: { color: colors.testoSoft, fontWeight: '700', fontSize: 13, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.testo,
  },
  errore: { color: colors.errore, marginTop: spacing.sm, fontWeight: '600' },
  btn: {
    backgroundColor: colors.oro,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: colors.navy, fontWeight: '900', fontSize: 17 },
});
