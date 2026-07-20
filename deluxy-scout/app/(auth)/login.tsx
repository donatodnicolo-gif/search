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
import { colors, radius, shadow, spacing } from '@/lib/theme';

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
        <View style={styles.card}>
          <View style={styles.logoQuad}>
            <Text style={styles.logoD}>D</Text>
          </View>
          <Text style={styles.logo}>DELUXY</Text>
          <Text style={styles.sub}>Scout · prospezione sul territorio</Text>

          {/* Campi raggruppati stile iOS: un contenitore, divisori hairline */}
          <View style={styles.group}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="nome@deluxy.it"
              placeholderTextColor={colors.grigio}
            />
            <View style={styles.divisore} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.grigio}
            />
          </View>

          {errore ? <Text style={styles.errore}>{errore}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={onLogin}
            disabled={loading}
          >
            <Text style={styles.btnTxt}>{loading ? 'Accesso…' : 'Accedi'}</Text>
          </Pressable>

          <Text style={styles.footnote}>Consegne in guanti bianchi, dal 2019.</Text>
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
  safe: { flex: 1, backgroundColor: colors.sfondo },
  container: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.float,
  },
  logoQuad: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoD: {
    color: colors.oro,
    fontSize: 34,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
  },
  logo: { color: colors.testo, fontSize: 26, fontWeight: '700', letterSpacing: 4 },
  sub: { color: colors.testoSoft, marginTop: spacing.xs, fontSize: 14, marginBottom: spacing.lg },
  group: {
    alignSelf: 'stretch',
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  input: { paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, color: colors.testo },
  divisore: { height: 1, backgroundColor: colors.hairline, marginLeft: spacing.md },
  errore: { color: colors.errore, marginTop: spacing.md, fontWeight: '600', alignSelf: 'stretch' },
  btn: {
    alignSelf: 'stretch',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  btnDisabled: { opacity: 0.55 },
  btnTxt: { color: colors.bianco, fontWeight: '600', fontSize: 17 },
  footnote: { color: colors.grigio, fontSize: 12, marginTop: spacing.lg },
});
