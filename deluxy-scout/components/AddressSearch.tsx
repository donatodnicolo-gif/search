// Campo indirizzo con suggerimenti Google (autocomplete) a tendina.
// Riusato nella Mappa (nativa e web). Al tap su un suggerimento risolve le
// coordinate (place_id → lat/lng) e le restituisce via onSelect.
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { autocompleteIndirizzo, dettagliLuogo, type GeocodeResult, type Predizione } from '@/lib/geocode';

export function AddressSearch({
  onSelect,
  onClear,
  placeholder = 'Dove vai? Indirizzo o zona…',
}: {
  onSelect: (r: GeocodeResult) => void;
  onClear?: () => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const [predizioni, setPredizioni] = useState<Predizione[]>([]);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [scelto, setScelto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(t: string) {
    setInput(t);
    setErrore(null);
    setScelto(false);
    if (timer.current) clearTimeout(timer.current);
    if (t.trim().length < 3) {
      setPredizioni([]);
      return;
    }
    // Debounce: interroga Google solo dopo ~350ms di pausa.
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setPredizioni(await autocompleteIndirizzo(t.trim()));
      } catch (e) {
        setErrore((e as Error).message);
        setPredizioni([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  async function scegli(p: Predizione) {
    setLoading(true);
    setErrore(null);
    try {
      const r = await dettagliLuogo(p.place_id);
      setInput(r.formatted_address || p.description);
      setPredizioni([]);
      setScelto(true);
      onSelect(r);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function azzera() {
    setInput('');
    setPredizioni([]);
    setErrore(null);
    setScelto(false);
    onClear?.();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {loading ? <ActivityIndicator color={colors.navy} style={styles.side} /> : null}
        {input && !loading ? (
          <Pressable onPress={azzera} style={styles.side} hitSlop={8}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {errore ? <Text style={styles.errore}>{errore}</Text> : null}
      {predizioni.length > 0 && !scelto ? (
        <View style={styles.dropdown}>
          {predizioni.map((p) => (
            <Pressable key={p.place_id} style={styles.pred} onPress={() => scegli(p)}>
              <Text style={styles.predTxt} numberOfLines={2}>
                <Ionicons name="location-outline" size={14} color={colors.grigio} /> {p.description}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex alto così la tendina copre la mappa/lista sottostante.
  wrap: { position: 'relative', zIndex: 20, margin: spacing.md, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bianco,
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radius.md,
    paddingRight: spacing.sm,
  },
  input: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 15, color: colors.testo },
  side: { paddingHorizontal: spacing.xs },
  clear: { color: colors.grigio, fontWeight: '900', fontSize: 16 },
  errore: { color: colors.errore, fontSize: 13, marginTop: spacing.xs, fontWeight: '600' },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pred: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro },
  predTxt: { color: colors.navy, fontSize: 14 },
});
