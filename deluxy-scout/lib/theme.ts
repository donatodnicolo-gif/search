// Palette e token di stile Deluxy Scout — allineati al **Deluxy Design System v1.0**
// (deluxy-design-system/tokens/theme.ts). Stile Apple: sfondi neutri, testo scuro,
// UN accento oro usato poco, azioni primarie NERE (ink). I nomi storici (navy/oro/…)
// restano per compatibilità con le schermate, ma i valori sono quelli del DS.
import type { DealStage, Priorita, StatoPlace } from '@/types';

export const colors = {
  // Superfici
  sfondo: '#F5F5F7', // bg pagina (mai bianco pieno)
  bianco: '#FFFFFF', // surface
  // Testo
  testo: '#1D1D1F', // text
  testoSoft: '#6E6E73', // text-secondary
  grigio: '#86868B', // text-tertiary
  grigioChiaro: '#E3E3E6', // hairline (solido, per bordi)
  // Brand scuro = azioni primarie (ink). "navy" resta come alias per le schermate.
  navy: '#111318',
  ink: '#111318',
  inkHover: '#2A2D35',
  // Accento oro (icone attive, focus, stelle, badge brand) — usato con parsimonia.
  oro: '#B8963E',
  gold: '#B8963E',
  goldStrong: '#A07F2C',
  goldSoft: 'rgba(184, 150, 62, 0.12)',
  // Bordi e riempimenti neutri
  hairline: 'rgba(0, 0, 0, 0.08)',
  hairlineStrong: 'rgba(0, 0, 0, 0.14)',
  fill: 'rgba(120, 120, 128, 0.08)',
  fillHover: 'rgba(120, 120, 128, 0.14)',
  fillActive: 'rgba(120, 120, 128, 0.20)',
  // Semantici (solo per stati/feedback)
  successo: '#248A3D', // green
  attenzione: '#C93400', // orange
  errore: '#D70015', // red
  blue: '#0071E3',
  purple: '#6D3FC4',
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
  lg: 18,
  pill: 999,
} as const;

// Due sole ombre (DS): card e float. Morbide, mai dure.
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

// Colore per priorità: P1 oro (accento) / P2 ink / P3 grigio.
export const coloreProprita: Record<Priorita, string> = {
  P1: colors.oro,
  P2: colors.ink,
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

// Icona per tipologia di interesse (linea Deluxy). Chiave = nome linea.
export const lineaIcona: Record<string, string> = {
  Consegne: '🚚',
  Catering: '🍽️',
  'Regali aziendali': '🎁',
  Affiliazioni: '🤝',
  'Re-seller': '🏪',
  'Food Supplier': '🥐',
  Clientelling: '👤',
  Concierge: '🛎️',
  Magazzino: '📦',
};

export function iconaLinea(linea: string | null | undefined): string {
  return (linea && lineaIcona[linea]) || '📍';
}

// Etichette leggibili per le fasi trattativa (dealstage HubSpot).
export const labelFase: Record<DealStage, string> = {
  appointmentscheduled: 'Appuntamento fissato',
  decisionmakerboughtin: 'Decisore coinvolto',
  contractsent: 'Proposta inviata',
  closedwon: 'Chiusa vinta',
  closedlost: 'Chiusa persa',
};
