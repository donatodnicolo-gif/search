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
// ---------- Il TFR di chi smette ----------
//
// Il TFR matura per tutti, ma **si paga quando il rapporto finisce**: per chi
// resta e un accantonamento, per chi se ne va e un costo dell anno, e nel
// budget va messo li dove esce (regola dell utente, 23/08/2026: «aggiungi tfr
// per chi smette»).
//
// Quota annua di legge: la retribuzione dell anno divisa **13,5**. Qui si
// prende il lordo gia riproporzionato ai mesi lavorati — il TFR del 2026 e
// quello maturato nel 2026, non tutta l anzianita, che questa app non conosce.
//
// Solo i **dipendenti**: un consulente fattura e uno stagista prende un
// rimborso, il TFR non lo maturano ne l uno ne l altro.
const TFR_DIVISORE = 13.5;

// L ultimo mese in cui la persona e in forza; 0 se non ha mesi.
export function ultimoMese(p: Persona): number {
  return p.mesi.length > 0 ? Math.max(...p.mesi) : 0;
}

// Vero se il rapporto finisce **dentro** l anno: e allora che il TFR si paga.
// Chi arriva a dicembre non smette — il suo TFR resta accantonato.
export function smetteNellAnno(p: Persona): boolean {
  return haNetto(p) && p.mesi.length > 0 && ultimoMese(p) < 12;
}

export function tfrDi(p: Persona): number {
  if (!smetteNellAnno(p)) return 0;
  const lordoMaturato = (lordoAnnuo(p) / 12) * p.mesi.length;
  return lordoMaturato / TFR_DIVISORE;
}

export function costoPersonaMese(p: Persona, month: number): number {
  if (!p.mesi.includes(month)) return 0;
  const stipendio = (lordoAnnuo(p) / 12) * (1 + p.contributiPct / 100);
  // Il TFR cade **tutto nel mese in cui il rapporto finisce**, perche e li che
  // si liquida: spalmarlo sui dodicesimi direbbe che quel costo esce a gennaio,
  // e non e vero.
  return stipendio + (month === ultimoMese(p) ? tfrDi(p) : 0);
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