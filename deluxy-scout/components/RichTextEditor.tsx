// Fallback NATIVO dell'editor rich text (iOS/Android): un campo di testo sul
// sorgente HTML. La toolbar completa (grassetto/corsivo/link/variabili) vive
// nella variante web (RichTextEditor.web.tsx), che Metro usa sul web. Scout è
// usato soprattutto da browser; su nativo si può comunque scrivere/incollare.
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

interface Props {
  valueHtml: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({ valueHtml, onChangeHtml, placeholder, minHeight = 200 }: Props) {
  return (
    <View>
      <TextInput
        style={[styles.input, { minHeight }]}
        value={valueHtml}
        onChangeText={onChangeHtml}
        placeholder={placeholder}
        placeholderTextColor={colors.grigio}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.nota}>
        Formattazione (grassetto, corsivo, elenchi, link) e inserimento variabili disponibili dalla versione web.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.testo,
  },
  nota: { color: colors.grigio, fontSize: 11, marginTop: 4 },
});
