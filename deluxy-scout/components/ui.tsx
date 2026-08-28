// Kit UI condiviso — implementa i pattern del Deluxy Design System v1.0
// (deluxy-design-system/DESIGN-SYSTEM.md §3 Componenti e §4 Pattern).
// Ogni schermata compone questi pezzi invece di ridefinirli in locale.
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, touchMin } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Caption di pagina (pattern DS "Pagina"): una frase grigia sotto il titolo
 * che spiega cosa contiene la sezione e come si usa. Il titolo vive già
 * nell'header di navigazione, quindi qui rendiamo solo la spiegazione.
 */
/**
 * @param dentroUnBloccoSpaziato  quando l'intro sta già dentro un contenitore
 *   con il suo padding. ⚠️ Senza, il rientro si SOMMA: 16 del contenitore più
 *   16 suoi, e il testo parte 32px dentro mentre i filtri sotto partono da 16.
 *   A schermo si legge come un blocco storto, e non si capisce perché.
 */
export function PageIntro({
  testo,
  dentroUnBloccoSpaziato,
}: {
  testo: string;
  dentroUnBloccoSpaziato?: boolean;
}) {
  return (
    <Text style={[styles.pageIntro, dentroUnBloccoSpaziato && styles.pageIntroNudo]}>{testo}</Text>
  );
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
  pageIntroNudo: { paddingHorizontal: 0, paddingTop: 0 },
  pageIntro: {
    color: colors.testoSoft,
    fontSize: 13.5,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    // ⚠️ Un tetto alla MISURA della riga, non alla larghezza del blocco: dentro
    // il contenitore delle tabelle l'intro arrivava a 1148px — una riga sola da
    // 141 caratteri — e su Trattative, dove la lista non ha cap, cresceva col
    // monitor. Il bordo sinistro resta allineato: cambia solo dove va a capo.
    maxWidth: 680,
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
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
    ...shadow.card,
  },
  loading: { textAlign: 'center', color: colors.grigio, paddingVertical: spacing.xxxl, fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xxl, gap: 6 },
  emptyIcona: {
    width: 44,
    height: 44,
    borderRadius: radius.m,
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
    // Bersaglio touch ≥44px (Libro UX cap.10 §1 / WCAG). Vale anche per btnSmall,
    // che riduce il padding ma non deve scendere sotto l'area minima.
    minHeight: touchMin,
    alignSelf: 'flex-start',
  },
  btnSmall: { paddingHorizontal: 14, paddingVertical: 7 },
  btnTxt: { fontSize: 14.5, fontWeight: '600' },
  btnTxtSmall: { fontSize: 13 },
  link: { color: colors.goldStrong, fontWeight: '600', fontSize: 13, paddingVertical: 4 },
});

/**
 * «12 di 340» — quante righe si stanno guardando, e quante ce ne sono in tutto.
 *
 * Sta in un file solo perché la stessa riga serve a sei elenchi, e sei copie
 * divergono al primo ritocco: è già successo con le azioni delle schede.
 *
 * ⚠️ Quando un filtro è attivo il numero **deve** cambiare: senza, una lista
 * ristretta a tre righe sembra una lista che ha perso i dati. È il motivo per
 * cui questa riga esiste (segnalazione dell'utente del 31/07/2026).
 */
export function ContoRighe({
  mostrati,
  totale,
  nome,
}: {
  mostrati: number;
  totale: number;
  /** Come si chiamano le righe: «clienti», «contatti», «negozi»… */
  nome: string;
}) {
  const filtrato = mostrati !== totale;
  return (
    <Text style={stiliConto.riga}>
      {filtrato ? `${mostrati} di ${totale} ${nome}` : `${totale} ${nome}`}
      {filtrato ? <Text style={stiliConto.nota}> · filtro attivo</Text> : null}
    </Text>
  );
}

const stiliConto = StyleSheet.create({
  riga: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '700' },
  nota: { color: colors.goldStrong, fontWeight: '700' },
});

/**
 * La riga di un GRUPPO di chip (Libro UX&UI v1.3 §8 punto 9, decisione utente
 * del 28/08/2026): sotto la soglia mobile sta su UNA riga e SCORRE in
 * orizzontale (il wrap faceva crescere la zona filtri in verticale); dalla
 * soglia in su i chip vanno a capo come prima.
 *
 * ⚠️ Le due guardie della regola: nella corsia che scorre stanno SOLO chip —
 * «Filtri (N)», «Azzera» e le azioni restano fuori, sempre visibili; e niente
 * scroll indicator (l'ultima chip che sbuca dal bordo è l'indizio che c'è
 * altro).
 */
/**
 * ⭐ IL CAMPO DI RICERCA DI OGNI ELENCO (28/08/2026, segnalazione dell'utente:
 * «IN TUTTA APP le varie sezioni NON HANNO la ricerca come da regola UX»).
 *
 * Libro UX&UI v1.9 §8-bis: ogni elenco ha la ricerca. Dodici schermate ne
 * erano rimaste senza, ognuna pronta a inventarsi il suo campo: questo è
 * quello UNICO, con la stessa forma di clienti/ordini/trattative. Il filtro
 * resta della schermata — solo lei sa su quali campi ha senso cercare.
 */
export function CampoCerca({
  valore,
  onCambia,
  placeholder,
}: {
  valore: string;
  onCambia: (v: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={stiliCerca.campo}
      value={valore}
      onChangeText={onCambia}
      placeholder={placeholder}
      placeholderTextColor={colors.grigio}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      accessibilityLabel={placeholder}
    />
  );
}

const stiliCerca = StyleSheet.create({
  campo: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.testo,
    fontSize: 14,
  },
});

export function RigaChips({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  if (width < 900) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // il nowrap sta DOPO lo style del chiamante: molti passano la loro
        // riga storica con flexWrap:'wrap', che qui deve perdere
        contentContainerStyle={[stiliChip.riga, style, { flexWrap: 'nowrap' }]}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[stiliChip.riga, style]}>{children}</View>;
}

/**
 * Chip di filtro a selezione SINGOLA (Libro UX&UI v1.2 §8). La stessa forma
 * era stata ricopiata in locale da dieci schermate (`{ label, on, onPress }`
 * quasi identico ovunque): questa è la copia che resta, le altre si tolgono
 * man mano che le schermate passano al pattern nuovo.
 */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    // «tutto risponde» (Libro cap.3): la pillola reagisce alla pressione.
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [stiliChip.chip, on && stiliChip.chipOn, pressed && { opacity: 0.6 }]}
    >
      <Text style={[stiliChip.txt, on && stiliChip.txtOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Gruppo di chip a selezione singola con «Tutti» in testa: la riga della
 * dimensione primaria fuori dal pannello, o un gruppo esclusivo dentro
 * (stato di un flusso, periodo, aperto/chiuso — Libro v1.2 §8 punto 4).
 * Le pillole vanno a capo, mai in scroll orizzontale.
 *
 * `valore === null` = «Tutti». Con `senzaTutti` (per i gruppi che DEVONO
 * avere sempre un valore, es. il periodo) la pillola «Tutti» non compare.
 */
export function GruppoScelta<T extends string>({
  titolo,
  opzioni,
  valore,
  onChange,
  etichettaTutti = 'Tutti',
  senzaTutti,
}: {
  titolo?: string;
  opzioni: { v: T; l: string }[];
  valore: T | null;
  onChange: (v: T | null) => void;
  etichettaTutti?: string;
  senzaTutti?: boolean;
}) {
  return (
    <View style={stiliChip.gruppo}>
      {titolo ? <Text style={stiliChip.titolo}>{titolo}</Text> : null}
      <RigaChips>
        {senzaTutti ? null : (
          <Chip label={etichettaTutti} on={valore === null} onPress={() => onChange(null)} />
        )}
        {opzioni.map((o) => (
          <Chip
            key={o.v}
            label={o.l}
            on={valore === o.v}
            onPress={() => onChange(senzaTutti ? o.v : valore === o.v ? null : o.v)}
          />
        ))}
      </RigaChips>
    </View>
  );
}

const stiliChip = StyleSheet.create({
  gruppo: { gap: 6 },
  titolo: { color: colors.testoSoft, fontSize: 12, fontWeight: '700' },
  riga: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    minHeight: touchMin,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  txt: { color: colors.testo, fontSize: 13, fontWeight: '600' },
  txtOn: { color: colors.onInk },
});
