// Costo del lavoro e busta paga: **niente database, niente rete**.
//
// Sta in un file suo e non dentro calc.ts per una ragione precisa: queste
// funzioni le usano anche i componenti **client** (l editor dei dipendenti, il
// team), e finche stavano insieme al resto del motore si portavano dietro nel
// bundle del browser tutta la catena prisma -> chiavi -> node:crypto. Finche
// calc.ts leggeva solo il database la cosa passava; il giorno in cui ha
// cominciato a leggere anche il venduto da Orders la build del client si e
// rotta di netto («Reading from node:crypto is not handled»).
//
// Regola che ne esce: **quello che serve al browser non sta in un modulo che
// tocca il database.**

export const TIPI_PERSONA = [
  { key: "DIPENDENTE", label: "Dipendente", badge: "blue" },
  { key: "STAGISTA", label: "Stagista", badge: "neutral" },
  { key: "CONSULENTE", label: "Consulente", badge: "gold" },
] as const;

export type Persona = {
  id: string;
  nome: string;
  ruolo: string | null;
  tipo: string;
  importo: number;
  superminimo: number;
  partTimePct: number;
  periodicita: string;
  contributiPct: number;
  mensilita: number;
  inpsPct: number;
  addizionaliPct: number;
  mesi: number[];
  maisonId: string | null;
  teamId: string | null;
  // Persona con un budget proprio: risponde di un numero e lo propone.
  budget: boolean;
  note: string | null;
};

// ---------- Costo del personale ----------

// Lordo annuo effettivo: tabellare + superminimo individuale, riproporzionati
// per la percentuale di part-time (100 = tempo pieno). Senza oneri.
export function lordoAnnuo(p: Persona): number {
  const pieno = p.periodicita === "ANNUO" ? p.importo + p.superminimo : (p.importo + p.superminimo) * 12;
  return (pieno * p.partTimePct) / 100;
}

// Costo azienda di una persona in un dato mese: zero se quel mese non è tra
// quelli di competenza. Il lordo (già riproporzionato per il part-time) si
// spalma su 12 mensilità e gli oneri si applicano sopra.
export function costoPersonaMese(p: Persona, month: number): number {
  if (!p.mesi.includes(month)) return 0;
  return (lordoAnnuo(p) / 12) * (1 + p.contributiPct / 100);
}

export function costoPersonaAnno(p: Persona): number {
  let tot = 0;
  for (let m = 1; m <= 12; m++) tot += costoPersonaMese(p, m);
  return tot;
}

// Costo del personale dell'anno, eventualmente della sola maison indicata.
const SCAGLIONI = [
  { fino: 28000, aliquota: 0.23 },
  { fino: 50000, aliquota: 0.35 },
  { fino: Infinity, aliquota: 0.43 },
];

export function irpefLorda(imponibile: number): number {
  let imposta = 0;
  let precedente = 0;
  for (const s of SCAGLIONI) {
    if (imponibile <= precedente) break;
    imposta += (Math.min(imponibile, s.fino) - precedente) * s.aliquota;
    precedente = s.fino;
  }
  return imposta;
}

// Detrazione per redditi da lavoro dipendente (art. 13 c.1 TUIR).
export function detrazioneLavoro(reddito: number): number {
  if (reddito <= 15000) return Math.max(690, 1955);
  if (reddito <= 28000) return 1910 + 1190 * ((28000 - reddito) / 13000);
  if (reddito <= 50000) return 1910 * ((50000 - reddito) / 22000);
  return 0;
}

// Cuneo fiscale (legge di bilancio 2025): sotto i 20.000 € è una somma in
// busta calcolata sul reddito di lavoro; tra 20.000 e 40.000 è un'ulteriore
// detrazione che si azzera progressivamente.
// ATTENZIONE: parametri 2025. Vanno riverificati con la legge di bilancio
// dell'anno di budget prima di usare il netto per trattative o contratti.
export function cuneoFiscale(reddito: number): number {
  if (reddito <= 8500) return reddito * 0.071;
  if (reddito <= 15000) return reddito * 0.053;
  if (reddito <= 20000) return reddito * 0.048;
  if (reddito <= 32000) return 1000;
  if (reddito <= 40000) return 1000 * ((40000 - reddito) / 8000);
  return 0;
}

export type Netto = {
  lordoPeriodo: number;
  contributi: number;
  imponibile: number;
  irpef: number;
  addizionali: number;
  cuneo: number;
  nettoPeriodo: number;
  nettoMese: number; // netto della singola busta paga
  buste: number;
};

// Il netto ha senso per il lavoro dipendente: consulenti (fattura) e stagisti
// (rimborso) seguono regole diverse, quindi lì non si stima.
export function haNetto(p: Persona): boolean {
  return p.tipo === "DIPENDENTE";
}

export function nettoBusta(p: Persona): Netto | null {
  if (!haNetto(p)) return null;
  // Chi lavora solo parte dell'anno matura reddito e detrazioni in proporzione.
  const quotaAnno = p.mesi.length / 12;
  const lordoPeriodo = lordoAnnuo(p) * quotaAnno;
  const contributi = (lordoPeriodo * p.inpsPct) / 100;
  const imponibile = lordoPeriodo - contributi;
  const irpef = Math.max(0, irpefLorda(imponibile) - detrazioneLavoro(imponibile) * quotaAnno);
  const addizionali = (imponibile * p.addizionaliPct) / 100;
  const cuneo = cuneoFiscale(imponibile) * quotaAnno;
  const nettoPeriodo = imponibile - irpef - addizionali + cuneo;
  const buste = Math.max(1, p.mensilita * quotaAnno);
  return {
    lordoPeriodo,
    contributi,
    imponibile,
    irpef,
    addizionali,
    cuneo,
    nettoPeriodo,
    nettoMese: nettoPeriodo / buste,
    buste,
  };
}

// Costo del lavoro di un team. `null` = persone senza team assegnato.