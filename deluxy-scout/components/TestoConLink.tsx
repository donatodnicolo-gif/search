// TESTO CON I LINK CLICCABILI (10/09/2026, segnalazione dell'utente sulla
// scheda del registro: «non si riesce a cliccare sui link»).
//
// Le note del registro portano indirizzi web — il sito, la scheda Google
// Maps — scritti come testo: si leggevano ma non si aprivano. Qui ogni
// `http(s)://…` diventa un pezzo di testo premibile che apre il browser;
// il resto resta testo normale e selezionabile. La regola che riconosce i
// link sta in `lib/link-nel-testo.ts`, coi test.
import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '@/lib/theme';
import { spezzaLink } from '@/lib/link-nel-testo';

export function TestoConLink({ testo, style }: { testo: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={style} selectable>
      {spezzaLink(testo).map((p, i) =>
        'testo' in p ? (
          p.testo
        ) : (
          <Text key={i}>
            <Text
              style={styles.link}
              accessibilityRole="link"
              onPress={() => Linking.openURL(p.url)}
              {...({ title: p.url } as any)}
            >
              {p.url}
            </Text>
            {p.coda}
          </Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.testo, textDecorationLine: 'underline', fontWeight: '600' },
});
