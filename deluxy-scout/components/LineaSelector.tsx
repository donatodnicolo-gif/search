// Selettore MULTIPLO della "tipologia di interesse" = linee Deluxy del negozio.
// Un negozio può interessare più linee. Le linee ATTIVE arrivano dal master
// (tabella `lines`, gestita dall'admin); fallback sulle costanti se il DB tace.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LINEE_ATTIVE } from '@/types';
import { fetchNomiLineeAttive } from '@/lib/db';
import { colors, radius } from '@/lib/theme';

export function LineaSelector({
  value,
  onChange,
  soloCanoniche,
}: {
  value: string[];
  onChange: (linee: string[]) => void;
  // Mostra SOLO le linee del catalogo (= Anagrafiche): non aggiunge chip per
  // valori legacy fuori catalogo. Il chiamante passa già valori canonici.
  soloCanoniche?: boolean;
}) {
  const [linee, setLinee] = useState<string[]>([...LINEE_ATTIVE]);
  useEffect(() => {
    let vivo = true;
    fetchNomiLineeAttive()
      .then((l) => vivo && l.length && setLinee(l))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  function toggle(l: string) {
    onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]);
  }
  // Di norma include anche linee già selezionate ma non più attive (per non
  // perderle). In modalità soloCanoniche si mostrano SOLO le linee del catalogo.
  const daMostrare = soloCanoniche ? linee : [...new Set([...linee, ...value])];
  return (
    <View style={styles.wrap}>
      {daMostrare.map((l) => {
        const on = value.includes(l);
        return (
          <Pressable key={l} onPress={() => toggle(l)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.txt, on && styles.txtOn]}>
              {on ? '✓ ' : ''}
              {l}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.oro, borderColor: colors.oro },
  txt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  txtOn: { color: colors.bianco, fontWeight: '800' },
});
