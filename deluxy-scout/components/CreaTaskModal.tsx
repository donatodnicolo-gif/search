// Modal per creare un task collegato a un negozio (dalla scheda attività).
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Priorita } from '@/types';
import { colors, coloreProprita, radius, spacing } from '@/lib/theme';
import { inserisciTask } from '@/lib/db';

const PRIORITA: { v: Priorita; label: string }[] = [
  { v: 'P1', label: 'Alta' },
  { v: 'P2', label: 'Media' },
  { v: 'P3', label: 'Bassa' },
];
const SCAD: { label: string; giorni: number | null }[] = [
  { label: 'Nessuna', giorni: null },
  { label: 'Oggi', giorni: 0 },
  { label: 'Domani', giorni: 1 },
  { label: '+7g', giorni: 7 },
];

function isoTraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function CreaTaskModal({
  placeId,
  placeNome,
  onClose,
  onCreato,
}: {
  placeId: string;
  placeNome: string;
  onClose: () => void;
  onCreato?: () => void;
}) {
  const [titolo, setTitolo] = useState('');
  const [priorita, setPriorita] = useState<Priorita>('P2');
  const [scadenza, setScadenza] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salva() {
    const t = titolo.trim();
    if (!t || salvando) return;
    setSalvando(true);
    try {
      await inserisciTask({ titolo: t, priorita, scadenza, place_id: placeId });
      onCreato?.();
      onClose();
    } catch {
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.titolo}>Nuovo task</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.testoSoft} />
            </Pressable>
          </View>
          <Text style={styles.negozio} numberOfLines={1}>
            <Ionicons name="storefront-outline" size={13} color={colors.oro} /> {placeNome}
          </Text>

          <TextInput
            style={styles.input}
            value={titolo}
            onChangeText={setTitolo}
            placeholder="Cosa devi fare per questo negozio?"
            placeholderTextColor={colors.grigio}
            autoFocus
          />

          <Text style={styles.label}>Priorità</Text>
          <View style={styles.chips}>
            {PRIORITA.map((p) => (
              <Pressable
                key={p.v}
                style={[styles.chip, priorita === p.v && { backgroundColor: coloreProprita[p.v], borderColor: coloreProprita[p.v] }]}
                onPress={() => setPriorita(p.v)}
              >
                <Text style={[styles.chipTxt, priorita === p.v && styles.chipTxtOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Scadenza</Text>
          <View style={styles.chips}>
            {SCAD.map((o) => {
              const iso = o.giorni == null ? null : isoTraGiorni(o.giorni);
              const on = scadenza === iso;
              return (
                <Pressable key={o.label} style={[styles.chip, on && styles.chipOn]} onPress={() => setScadenza(iso)}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={[styles.btn, (!titolo.trim() || salvando) && styles.btnOff]} disabled={!titolo.trim() || salvando} onPress={salva}>
            {salvando ? <ActivityIndicator color={colors.bianco} /> : <Text style={styles.btnTxt}>Crea task</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.sfondo,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titolo: { fontSize: 18, fontWeight: '900', color: colors.testo },
  negozio: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
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
  label: { fontSize: 11, fontWeight: '800', color: colors.grigio, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  btn: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnOff: { opacity: 0.4 },
  btnTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
