// Palette e token di stile Deluxy Scout — MIGRAZIONE COMPLETA al **Deluxy Design
// System v1.4** (28/08/2026): i valori vengono da lib/ds.ts (copia locale di
// deluxy-design-system/tokens/theme.ts), qui restano solo gli ALIAS storici
// (navy/oro/…) e i cataloghi semantici dell'app. Le chiavi in collisione sono
// state RINOMINATE nelle schermate prima dello swap (Libro UX&UI, cap. 12):
// spacing locale md16/lg24/xl32 → DS lg/xxl/xxxl; radius sm/md/lg → DS s/m/l.
import type { DealStage, Priorita, StatoAffiliazione, StatoPlace } from '@/types';
import {
  colors as ds,
  motion,
  radius,
  shadow,
  spacing,
  touchMin,
  typography,
} from './ds';

export { motion, radius, shadow, spacing, touchMin, typography };

export const colors = {
  // Superfici
  sfondo: ds.bg, // bg pagina (mai bianco pieno)
  bianco: ds.surface,
  surfaceTranslucent: ds.surfaceTranslucent, // barre/overlay in vetro
  // Testo
  testo: ds.text,
  testoSoft: ds.textSecondary,
  grigio: ds.textTertiary,
  grigioChiaro: '#E3E3E6', // hairline SOLIDO per bordi: non esiste nel DS (le hairline DS sono in alpha)
  // Brand scuro = azioni primarie (ink). "navy" resta come alias per le schermate.
  navy: ds.ink,
  ink: ds.ink,
  inkHover: ds.inkHover,
  // Accento oro (icone attive, focus, stelle, badge brand) — usato con parsimonia.
  oro: ds.gold,
  gold: ds.gold,
  goldStrong: ds.goldStrong,
  goldSoft: ds.goldSoft,
  // Bordi e riempimenti neutri
  hairline: ds.hairline,
  hairlineStrong: ds.hairlineStrong,
  fill: ds.fill,
  fillHover: ds.fillHover,
  fillActive: ds.fillActive,
  // Semantici (solo per stati/feedback) — alias italiani dei nomi DS
  successo: ds.green,
  attenzione: ds.orange,
  errore: ds.red,
  blue: ds.blue,
  purple: ds.purple,
  // Tinte «-soft» dei semantici: sfondo dei badge a pillola (testo = colore pieno)
  blueSoft: ds.blueSoft,
  greenSoft: ds.greenSoft,
  orangeSoft: ds.orangeSoft,
  redSoft: ds.redSoft,
  purpleSoft: ds.purpleSoft,
  successoSoft: ds.greenSoft,
  attenzioneSoft: ds.orangeSoft,
  erroreSoft: ds.redSoft,
  goldSoftStrong: 'rgba(184, 150, 62, 0.20)', // oro al 20%: locale, non nel DS
  // Testo/icone su superfici scure (ink/oro).
  onInk: ds.onInk,
  // Stato neutro/terminato (annullata, archiviata, bozza). Distinto da `grigio`,
  // che è il text-tertiary: qui è il grigio-STATO del DS (`grey`).
  grey: ds.grey,
  // Nuovi dal DS v1.4, disponibili alle schermate
  surfaceSunken: ds.surfaceSunken,
  scrim: ds.scrim,
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
  // Stesso grigio-stato del badge SELEZIONATO nelle liste (lib/livelli.ts →
  // colors.grey): è lo stesso concetto, deve avere lo stesso colore.
  selezionato: colors.grey,
  // «In lavorazione» come il lead della scala Scout: blu semantico, non un
  // azzurro Material a parte (#5B8DEF).
  lead: colors.blue,
  prospect: colors.grigio,
  // ⚠️ D23 (Libro UX cap.5): l'ORO NON È MAI UNO STATO. «In trattativa» = ha
  // risposto, c'è una trattativa aperta → è «in lavorazione» → blu semantico.
  // L'oro resta solo come ACCENTO brand (avatar, focus, polyline del giro).
  in_trattativa: colors.blue,
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
// 1560 → 1608 il 28/08/2026: la colonna azioni di Ordini è cresciuta di 48px
// (icone grandi, Libro v1.8) e dentro un cap fermo quei 48 li pagava la
// colonna elastica del cliente — strizzata fino alle lettere in verticale.
// Il cap cresce di quanto è cresciuta la colonna.
export const CONTENUTO_EXTRA_LARGO = 1608;
export const contenutoExtraLargo = { width: '100%' as const, maxWidth: CONTENUTO_EXTRA_LARGO, alignSelf: 'center' as const };
