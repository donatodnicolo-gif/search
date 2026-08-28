/**
 * ⚠️ COPIA locale per Deluxy Scout del file deluxy-design-system/tokens/theme.ts.
 * Non modificare a mano: a ogni bump del DS si ricopia il file intero.
 *
 * Deluxy Design System — token per React Native / Expo (v1.4)
 * Fonte: deluxy-design-system/tokens/tokens.json
 * Le app mobile (es. Deluxy Scout) mappano gradualmente i loro theme locali su questi token.
 * ⚠️ MAI lo swap secco dell'import: le chiavi in collisione col theme locale
 * (es. spacing.md locale=16 vs qui 12) si RINOMINANO prima (Libro UX&UI, cap. 12).
 */

export const colors = {
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceTranslucent: 'rgba(255, 255, 255, 0.72)',
  text: '#1D1D1F',
  textSecondary: '#6E6E73',
  textTertiary: '#86868B',
  hairline: 'rgba(0, 0, 0, 0.08)',
  hairlineStrong: 'rgba(0, 0, 0, 0.14)',
  fill: 'rgba(120, 120, 128, 0.08)',
  fillHover: 'rgba(120, 120, 128, 0.14)',
  fillActive: 'rgba(120, 120, 128, 0.20)',
  ink: '#111318',
  inkHover: '#2A2D35',
  gold: '#B8963E',
  goldStrong: '#A07F2C',
  goldSoft: 'rgba(184, 150, 62, 0.12)',
  blue: '#0071E3',
  blueSoft: 'rgba(0, 113, 227, 0.10)',
  green: '#248A3D',
  greenSoft: 'rgba(36, 138, 61, 0.11)',
  orange: '#C93400',
  orangeSoft: 'rgba(201, 52, 0, 0.10)',
  red: '#D70015',
  redSoft: 'rgba(215, 0, 21, 0.09)',
  purple: '#6D3FC4',
  purpleSoft: 'rgba(109, 63, 196, 0.10)',
  /** Testo e icone su ink/gold e superfici scure. */
  onInk: '#FFFFFF',
  /** Stato neutro/terminato (annullata, archiviata, bozza). */
  grey: '#8A8A8E',
  /** SOLO incassi dentro card (segmented, blocchi codice/chiave). */
  surfaceSunken: '#ECECEF',
  /** Velo dietro modali e fogli. */
  scrim: 'rgba(0, 0, 0, 0.32)',
  /** I due capi del gradiente del logo. */
  logoDarkA: '#1D1F26',
  logoDarkB: '#3A3D47',
} as const;

/** Bersaglio minimo su touch: min-height/area di ogni elemento interattivo. */
export const touchMin = 44;

/** Soglia unica largo/stretto (px). Scout la usa già; le app nuove partono da qui. */
export const breakpointMobile = 900;

/** Sfondo badge = tinta 9–12%, testo = colore pieno. */
export const statusTint = {
  created: { bg: 'rgba(255, 149, 0, 0.12)', text: '#B25000' },
  assigned: { bg: 'rgba(0, 113, 227, 0.10)', text: colors.blue },
  inDelivery: { bg: 'rgba(109, 63, 196, 0.11)', text: colors.purple },
  delivered: { bg: 'rgba(36, 138, 61, 0.12)', text: colors.green },
  cancelled: { bg: 'rgba(215, 0, 21, 0.09)', text: colors.red },
  neutral: { bg: colors.fill, text: colors.textSecondary },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  page: 44,
} as const;

export const radius = {
  s: 8,
  m: 12,
  l: 18,
  xl: 24,
  pill: 980,
} as const;

export const typography = {
  titleXl: { fontSize: 32, fontWeight: '600' as const, letterSpacing: -0.8 },
  titleL: { fontSize: 24, fontWeight: '600' as const, letterSpacing: -0.5 },
  titleM: { fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.38 },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyS: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.66,
    textTransform: 'uppercase' as const,
  },
} as const;

export const shadow = {
  /** Card e tabelle. */
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  /** Modali, popover, fogli. */
  float: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

export const motion = {
  durationPress: 150,
  durationColor: 180,
  durationOverlay: 280,
  pressScale: 0.97,
} as const;
