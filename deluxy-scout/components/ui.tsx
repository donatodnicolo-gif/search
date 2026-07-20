// Kit UI condiviso — implementa i pattern del Deluxy Design System v1.0
// (deluxy-design-system/DESIGN-SYSTEM.md §3 Componenti e §4 Pattern).
// Ogni schermata compone questi pezzi invece di ridefinirli in locale.
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Caption di pagina (pattern DS "Pagina"): una frase grigia sotto il titolo
 * che spiega cosa contiene la sezione e come si usa. Il titolo vive già
 * nell'header di navigazione, quindi qui rendiamo solo la spiegazione.
 */
export function PageIntro({ testo }: { testo: string }) {
  return <Text style={styles.pageIntro}>{testo}</Text>;
}

/** Etichetta di sezione MAIUSCOLA (token `label`: 11px 600 +0.06em). */
export function SectionLabel({ testo, colore }: { testo: string; colore?: string }) {
  return <Text style={[styles.sectionLabel, colore ? { color: colore } : null]}>{testo}</Text>;
}

/** Card DS: surface + hairline + radius-l + shadow-card. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Empty state DS: icona in quadratino gold-soft, titolo, frase di aiuto,
 * eventuale azione secondaria. Sempre dentro una card.
 */
export function EmptyState({
  icona,
  titolo,
  aiuto,
  azione,
  onAzione,
  loading,
}: {
  icona: IconName;
  titolo: string;
  aiuto?: string;
  azione?: string;
  onAzione?: () => void;
  loading?: boolean;
}) {
  if (loading) return <Text style={styles.loading}>Caricamento…</Text>;
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcona}>
        <Ionicons name={icona} size={22} color={colors.goldStrong} />
      </View>
      <Text style={styles.emptyTitolo}>{titolo}</Text>
      {aiuto ? <Text style={styles.emptyAiuto}>{aiuto}</Text> : null}
      {azione && onAzione ? (
        <Btn tipo="secondario" label={azione} onPress={onAzione} style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

/**
 * Badge di stato DS: pillola con dot colorato + testo, tinta di sfondo
 * 9-12% + testo semantico pieno.
 */
export function StatusBadge({ label, colore, small }: { label: string; colore: string; small?: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: tinta(colore) }, small && styles.badgeSmall]}>
      <View style={[styles.badgeDot, { backgroundColor: colore }]} />
      <Text style={[styles.badgeTxt, { color: colore }, small && styles.badgeTxtSmall]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Tinta al ~10% di un colore hex (per gli sfondi dei badge). */
export function tinta(hex: string): string {
  return hex.startsWith('#') && hex.length === 7 ? `${hex}1A` : colors.fill;
}

/**
 * Bottone DS, sempre a pillola.
 * primario = ink · secondario = fill · oro = solo brand · distruttivo = testo rosso su fill.
 */
export function Btn({
  label,
  onPress,
  tipo = 'primario',
  icona,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  tipo?: 'primario' | 'secondario' | 'oro' | 'distruttivo';
  icona?: IconName;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const testo =
    tipo === 'primario' || tipo === 'oro' ? colors.bianco : tipo === 'distruttivo' ? colors.errore : colors.testo;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        tipo === 'primario' && { backgroundColor: colors.ink },
        tipo === 'oro' && { backgroundColor: colors.gold },
        (tipo === 'secondario' || tipo === 'distruttivo') && { backgroundColor: colors.fill },
        small && styles.btnSmall,
        disabled && { opacity: 0.55 },
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      {icona ? <Ionicons name={icona} size={small ? 14 : 16} color={testo} /> : null}
      <Text style={[styles.btnTxt, { color: testo }, small && styles.btnTxtSmall]}>{label}</Text>
    </Pressable>
  );
}

/** Riga "chiave → link" per rimandi in fondo alle sezioni ("Vedi tutto ›"). */
export function LinkRiga({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link">
      <Text style={styles.link}>{label} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageIntro: {
    color: colors.testoSoft,
    fontSize: 13.5,
    lineHeight: 19,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sectionLabel: {
    color: colors.testoSoft,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    ...shadow.card,
  },
  loading: { textAlign: 'center', color: colors.grigio, paddingVertical: spacing.xl, fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: 6 },
  emptyIcona: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitolo: { color: colors.testo, fontSize: 17, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  emptyAiuto: { color: colors.testoSoft, fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeSmall: { paddingHorizontal: 8, paddingVertical: 2, gap: 5 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeTxt: { fontSize: 12.5, fontWeight: '600' },
  badgeTxtSmall: { fontSize: 11.5 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  btnSmall: { paddingHorizontal: 14, paddingVertical: 7 },
  btnTxt: { fontSize: 14.5, fontWeight: '600' },
  btnTxtSmall: { fontSize: 13 },
  link: { color: colors.goldStrong, fontWeight: '600', fontSize: 13, paddingVertical: 4 },
});
