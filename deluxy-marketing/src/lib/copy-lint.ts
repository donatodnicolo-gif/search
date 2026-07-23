// Validatore del copy per brand: le regole di tono (7.2) e di claim (7.3)
// tradotte in un lint. Il Copy Score segue il doc 7 §6.6.

export type Violazione = {
  tipo: "vietato" | "tossica";
  parola: string;
  motivo: string;
  sostituzione: string | null;
};

type Regola = {
  pattern: RegExp;
  brands: string[]; // brand a cui la regola si applica
  tipo: "vietato" | "tossica";
  motivo: string;
  sostituzione?: string;
};

// Regola d'oro 7.3: "guanti bianchi / white-glove / Valet" è ESCLUSIVA di
// deluxy.it. "Consegna sempre gratuita" è legittima SOLO su Flowers.
const REGOLE: Regola[] = [
  {
    pattern: /guant[oi] bianc|white[- ]glove|valet/i,
    brands: ["flowers", "cake"],
    tipo: "vietato",
    motivo: "Il claim 'guanti bianchi' è esclusiva di deluxy.it (7.3 §0): mai su Flowers o Cakedesign",
  },
  {
    pattern: /consegna (sempre )?gratuita|spedizione gratuita|free (shipping|delivery)/i,
    brands: ["gifts", "cake"],
    tipo: "vietato",
    motivo: "Solo Deluxy Flowers ha la consegna sempre gratuita: deluxy.it e Cakedesign consegnano a pagamento (7.3)",
  },
  // Parole tossiche del lusso (7.2 §2.2) — su Flowers e Gifts. Su Cake sono
  // ammesse (unica eccezione mass-market: sconti e CTA dirette in BOFU).
  { pattern: /\bscont[oi]\b|-\s?\d{1,2}\s?%/i, brands: ["flowers", "gifts"], tipo: "tossica", motivo: "Sconti urlati fuori codice lusso (7.2 §2.2)", sostituzione: "un'attenzione riservata / una selezione dedicata" },
  { pattern: /\bsaldi\b/i, brands: ["flowers", "gifts"], tipo: "tossica", motivo: "Parola da volantino, non da maison (7.2 §2.2)", sostituzione: "selezione" },
  { pattern: /\bgratis\b/i, brands: ["flowers", "gifts"], tipo: "tossica", motivo: "'Gratis' svaluta il servizio (7.2 §2.2)", sostituzione: "inclusa nel servizio / in omaggio" },
  { pattern: /affrettati|ultimi (pezzi|giorni)|solo oggi|scade (oggi|domani)|countdown/i, brands: ["flowers", "gifts"], tipo: "tossica", motivo: "Urgenza artificiale vietata dal codice lusso (7.2)", sostituzione: "disponibilità limitata della collezione" },
  { pattern: /compra (ora|subito)|acquista ora/i, brands: ["flowers", "gifts"], tipo: "tossica", motivo: "CTA transazionale dura: per il lusso CTA da servizio (7.2)", sostituzione: "Scopri la collezione / Prenota per domani" },
  { pattern: /\bbest ?seller\b/i, brands: ["flowers"], tipo: "tossica", motivo: "Riprova sociale di massa fuori tono per l'atelier (7.2)", sostituzione: "i più amati della collezione" },
  { pattern: /\bmazzo\b/i, brands: ["flowers"], tipo: "tossica", motivo: "Per l'atelier è 'bouquet' o 'composizione', mai 'mazzo' (7.2)", sostituzione: "bouquet" },
  { pattern: /\bofferta\b/i, brands: ["flowers"], tipo: "tossica", motivo: "'Offerta' è linguaggio da promozione (7.2)", sostituzione: "proposta / creazione" },
  { pattern: /last ?minute/i, brands: ["gifts"], tipo: "tossica", motivo: "'Last minute' svaluta l'esperienza del maggiordomo (7.2)", sostituzione: "anche per oggi, con la stessa cura" },
  { pattern: /\bspedizione\b/i, brands: ["gifts"], tipo: "tossica", motivo: "deluxy.it non 'spedisce': consegna con i guanti bianchi (7.2)", sostituzione: "consegna" },
];

export function lintCopy(testo: string, brand: string): Violazione[] {
  const violazioni: Violazione[] = [];
  for (const r of REGOLE) {
    if (!r.brands.includes(brand)) continue;
    const m = testo.match(r.pattern);
    if (m) {
      violazioni.push({
        tipo: r.tipo,
        parola: m[0],
        motivo: r.motivo,
        sostituzione: r.sostituzione ?? null,
      });
    }
  }
  return violazioni;
}

// ---------- Copy Score /100 (doc 7 §6.6) ----------
// Criteri 0-5 pesati: Attention 25% · Interest 25% · Desire 30% · Action 10% ·
// Igiene 10%. Score = Σ (criterio × 20 × peso). Penalità −5 per parola
// tossica non giustificata (−10 se negazione nell'hook).
export const CRITERI_COPY = [
  { chiave: "attention", nome: "Attention / hook", peso: 0.25 },
  { chiave: "interest", nome: "Interest / ricalco", peso: 0.25 },
  { chiave: "desire", nome: "Desire / leve", peso: 0.3 },
  { chiave: "action", nome: "Action / CTA", peso: 0.1 },
  { chiave: "igiene", nome: "Igiene (refusi, limiti, coerenza)", peso: 0.1 },
] as const;

export function copyScore(
  criteri: Record<string, number>,
  penalita: number
): { score: number; giudizio: string; faseDebole: string } {
  let somma = 0;
  let peggiore: (typeof CRITERI_COPY)[number] = CRITERI_COPY[0];
  for (const c of CRITERI_COPY) {
    const v = Math.max(0, Math.min(5, criteri[c.chiave] ?? 0));
    somma += v * 20 * c.peso;
    if ((criteri[c.chiave] ?? 0) < (criteri[peggiore.chiave] ?? 0)) peggiore = c;
  }
  const score = Math.max(0, Math.round(somma - penalita));
  const giudizio = score >= 80 ? "eccellente" : score >= 65 ? "buono" : score >= 50 ? "sufficiente" : "da_rifare";
  return { score, giudizio, faseDebole: peggiore.nome };
}

export const ETICHETTA_GIUDIZIO_COPY: Record<string, string> = {
  eccellente: "Eccellente — scala",
  buono: "Buono — lancia e testa 1 variante",
  sufficiente: "Sufficiente — riscrivi il criterio debole",
  da_rifare: "Da rifare",
};
export const COLORE_GIUDIZIO_COPY: Record<string, string> = {
  eccellente: "var(--green)",
  buono: "var(--blue)",
  sufficiente: "var(--orange)",
  da_rifare: "var(--red)",
};

// ---------- Scorecard landing (doc 9.2 §10) ----------
// 13 criteri 0-5 × peso, riportato a /100. Fasce: 0-40 critica · 41-70 da
// migliorare · 71-90 buona · 91-100 eccellente.
export const CRITERI_LANDING = [
  { chiave: "messageMatch", nome: "Message match annuncio → pagina", peso: 1.5 },
  { chiave: "titolo", nome: "Titolo e proposta di valore", peso: 1.2 },
  { chiave: "cta", nome: "CTA visibile e unica", peso: 1.2 },
  { chiave: "velocita", nome: "Velocità (LCP/INP/CLS)", peso: 1.2 },
  { chiave: "mobile", nome: "Esperienza mobile", peso: 1.2 },
  { chiave: "immagini", nome: "Immagini e qualità percepita", peso: 1 },
  { chiave: "fiducia", nome: "Fiducia (recensioni, garanzie)", peso: 1 },
  { chiave: "prezzo", nome: "Chiarezza di prezzo e consegna", peso: 1 },
  { chiave: "friction", nome: "Friction del percorso d'acquisto", peso: 1 },
  { chiave: "coerenzaLingua", nome: "Coerenza di lingua (/en)", peso: 0.8 },
  { chiave: "contenuto", nome: "Contenuto sopra la piega", peso: 0.8 },
  { chiave: "tracciamento", nome: "Tracciamento eventi", peso: 0.6 },
  { chiave: "seo", nome: "Base SEO/soci d'ingresso", peso: 0.5 },
] as const;

export function votoLanding(criteri: Record<string, number>): { voto: number; fascia: string } {
  const pesoTotale = CRITERI_LANDING.reduce((s, c) => s + c.peso, 0);
  let somma = 0;
  for (const c of CRITERI_LANDING) {
    somma += Math.max(0, Math.min(5, criteri[c.chiave] ?? 0)) * c.peso;
  }
  const voto = Math.round((somma / (pesoTotale * 5)) * 100);
  const fascia = voto <= 40 ? "critica" : voto <= 70 ? "da_migliorare" : voto <= 90 ? "buona" : "eccellente";
  return { voto, fascia };
}

export const ETICHETTA_FASCIA_LANDING: Record<string, string> = {
  critica: "Critica (0-40)",
  da_migliorare: "Da migliorare (41-70)",
  buona: "Buona (71-90)",
  eccellente: "Eccellente (91-100)",
};
export const COLORE_FASCIA_LANDING: Record<string, string> = {
  critica: "var(--red)",
  da_migliorare: "var(--orange)",
  buona: "var(--blue)",
  eccellente: "var(--green)",
};
