// Palette e token di stile Deluxy Scout — allineati al **Deluxy Design System v1.0**
// (deluxy-design-system/tokens/theme.ts). Stile Apple: sfondi neutri, testo scuro,
// UN accento oro usato poco, azioni primarie NERE (ink). I nomi storici (navy/oro/…)
// restano per compatibilità con le schermate, ma i valori sono quelli del DS.
import type { DealStage, Priorita, StatoAffiliazione, StatoPlace } from '@/types';

export const colors = {
  // Superfici
  sfondo: '#F5F5F7', // bg pagina (mai bianco pieno)
  bianco: '#FFFFFF', // surface
  surfaceTranslucent: 'rgba(255, 255, 255, 0.72)', // barre/overlay in vetro (DS)
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
  xl: 24, // card hero/login (DS)
  pill: 980, // valore canonico DS
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

// Colore semantico DS per lo stato del negozio (per i badge a pillola con dot).
export const coloreStato: Record<StatoPlace, string> = {
  da_visitare: colors.attenzione, // da gestire
  visitato: colors.blue, // in corso
  cliente: colors.successo,
  perso: colors.errore,
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

// Icone line-art (Ionicons) per tipologia — look premium, stile SF Symbols.
export const lineaIconName: Record<string, string> = {
  Consegne: 'cube-outline',
  Catering: 'restaurant-outline',
  'Regali aziendali': 'gift-outline',
  Affiliazioni: 'people-outline',
  'Re-seller': 'storefront-outline',
  'Food Supplier': 'wine-outline',
  Clientelling: 'person-outline',
  Concierge: 'sparkles-outline',
  Magazzino: 'file-tray-stacked-outline',
};

export function iconaLineaNome(linea: string | null | undefined): string {
  return (linea && lineaIconName[linea]) || 'business-outline';
}

// Etichette leggibili per le fasi trattativa (dealstage HubSpot).
export const labelFase: Record<DealStage, string> = {
  appointmentscheduled: 'Appuntamento fissato',
  decisionmakerboughtin: 'Decisore coinvolto',
  contractsent: 'Proposta inviata',
  closedwon: 'Chiusa vinta',
  closedlost: 'Chiusa persa',
};

// Colore semantico DS per la fase (avanzamento pipeline → esito).
export const coloreFase: Record<DealStage, string> = {
  appointmentscheduled: colors.blue,
  decisionmakerboughtin: colors.purple,
  contractsent: colors.attenzione,
  closedwon: colors.successo,
  closedlost: colors.errore,
};

// Etichette + colore-dot per gli stati commerciali. ⚠️ Sono gli **stessi** del
// registro Anagrafiche (`deluxy-anagrafiche/src/lib/stati.ts`): stessi valori,
// stesso ordine, stesse etichette. Vedi types/index.ts.
export const labelAffiliazione: Record<StatoAffiliazione, string> = {
  selezionato: 'Selezionato',
  lead: 'Lead',
  prospect: 'Prospect',
  in_trattativa: 'In trattativa',
  // ⚠️ Il valore resta `attivo` ma si legge «Cliente» (31/07/2026): «attivo»
  // diceva due cose in una parola sola — la scheda ha già un `attivo` che vuol
  // dire «non archiviata». «Cliente» dice l'unica che conta: ci compra.
  attivo: 'Cliente',
  // Il valore resta `dismesso` (è quello del registro), ma si legge «Dormiente»:
  // è la stessa cosa, e chiamarla in due modi obbligava a tradurre a mente.
  dismesso: 'Dormiente',
};

export const coloreAffiliazione: Record<StatoAffiliazione, string> = {
  // Stesso grigio del badge SELEZIONATO nelle liste (lib/livelli.ts): è lo
  // stesso concetto, deve avere lo stesso colore.
  selezionato: '#8A8A8E',
  lead: '#5B8DEF',
  prospect: colors.grigio,
  in_trattativa: colors.oro,
  attivo: colors.successo,
  dismesso: colors.grigio,
};

// Su schermo largo (desktop) le liste diventavano un'unica colonna larghissima
// e faticosa da leggere. Questo stile — da applicare in array sul contenitore
// scrollabile e sulla barra filtri — cappa la larghezza e centra il contenuto.
// Su mobile (width < maxWidth) resta a piena larghezza: nessun effetto.
// 26/07/2026: abbassato da 960 a 760. Con la sidebar da 264px, su un portatile
// a 1280 il contenuto arrivava a 928px e lasciava 49px liberi: riempiva tutto
// lo schermo e nelle righe "nome … valore" i due estremi finivano lontanissimi.
export const CONTENUTO_MAX = 760;
export const contenutoCentrato = { width: '100%' as const, maxWidth: CONTENUTO_MAX, alignSelf: 'center' as const };

// Cap più largo per le schermate a TABELLA. I 760px sopra sono tarati sulle
// righe «nome … valore», dove una colonna larga allontana i due estremi; una
// tabella a sette colonne dentro 760px invece si strozza (~100px a colonna, e
// il telefono diventa illeggibile). Si usa solo dove c’è davvero una tabella.
export const CONTENUTO_LARGO = 1180;
export const contenutoLargo = { width: '100%' as const, maxWidth: CONTENUTO_LARGO, alignSelf: 'center' as const };

// Cap per la tabella PIÙ larga che abbiamo (Ordini: undici colonne più le
// azioni).
//
// ⚠️ Misurato, non stimato (27/08/2026): con 1180 di cap, a monitor grande la
// tabella restava ferma lì e al nome del cliente toccavano 56px — allargare la
// finestra non serviva a niente, perché il tetto non era lo schermo ma questo
// numero. Un elenco di undici colonne è l'unico posto dove una riga lunga aiuta
// a leggere invece di stancare.
export const CONTENUTO_EXTRA_LARGO = 1560;
export const contenutoExtraLargo = { width: '100%' as const, maxWidth: CONTENUTO_EXTRA_LARGO, alignSelf: 'center' as const };
