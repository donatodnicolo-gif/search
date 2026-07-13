// Palette e token di stile Deluxy. Un unico posto per colori/spaziature.
import type { Priorita, StatoPlace } from '@/types';

export const colors = {
  navy: '#1B2A4A',
  oro: '#A6832B',
  sfondo: '#F2EFE8',
  bianco: '#FFFFFF',
  grigio: '#8A8A8A',
  grigioChiaro: '#D8D4CA',
  testo: '#1B2A4A',
  testoSoft: '#5A6274',
  successo: '#2E7D5B',
  attenzione: '#C9962B',
  errore: '#B23A3A',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

// Colore pin per priorità (regola di prodotto #1).
export const coloreProprita: Record<Priorita, string> = {
  P1: colors.oro,
  P2: colors.navy,
  P3: colors.grigio,
};

export const labelStato: Record<StatoPlace, string> = {
  da_visitare: 'Da visitare',
  visitato: 'Visitato',
  cliente: 'Cliente',
  perso: 'Perso',
};

// Piccola icona sovrapposta al pin per lo stato.
export const iconaStato: Record<StatoPlace, string> = {
  da_visitare: '○',
  visitato: '◐',
  cliente: '★',
  perso: '✕',
};
