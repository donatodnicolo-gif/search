// Risoluzione dei periodi per le analisi: preset ("30g", "mese", "trimestre"…)
// o date libere, più le due finestre di confronto che i Definitivi chiedono
// sempre (doc 10): il periodo precedente della stessa lunghezza e lo stesso
// periodo dell'anno prima (la stagionalità nel gifting domina tutto).

export type Periodo = {
  da: Date;
  a: Date; // esclusiva: [da, a)
  etichetta: string;
};

export type PeriodoRisolto = {
  corrente: Periodo;
  precedente: Periodo; // stessa lunghezza, subito prima
  annoPrima: Periodo; // stesse date, un anno indietro
  preset: string;
};

const GIORNO = 86_400_000;

function mezzanotte(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export const PRESET_PERIODO: { chiave: string; nome: string }[] = [
  { chiave: "7g", nome: "Ultimi 7 giorni" },
  { chiave: "30g", nome: "Ultimi 30 giorni" },
  { chiave: "mese", nome: "Mese corrente" },
  { chiave: "mese-scorso", nome: "Mese scorso" },
  { chiave: "trimestre", nome: "Trimestre" },
  { chiave: "anno", nome: "Anno" },
  { chiave: "libero", nome: "Date libere" },
];

export function risolviPeriodo(preset?: string, daStr?: string, aStr?: string, adesso?: Date): PeriodoRisolto {
  const oggi = mezzanotte(adesso ?? new Date());
  const domani = new Date(oggi.getTime() + GIORNO);
  let da: Date;
  let a: Date;
  let etichetta: string;
  let chiave = preset ?? "30g";

  // Date libere esplicite vincono sul preset
  if (daStr && aStr && !isNaN(new Date(daStr).getTime()) && !isNaN(new Date(aStr).getTime())) {
    da = mezzanotte(new Date(daStr));
    a = new Date(mezzanotte(new Date(aStr)).getTime() + GIORNO); // inclusiva → esclusiva
    etichetta = `${da.toLocaleDateString("it-IT")} – ${new Date(a.getTime() - GIORNO).toLocaleDateString("it-IT")}`;
    chiave = "libero";
  } else if (chiave === "7g") {
    a = domani;
    da = new Date(a.getTime() - 7 * GIORNO);
    etichetta = "Ultimi 7 giorni";
  } else if (chiave === "mese") {
    da = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    a = domani;
    etichetta = `${MESI[oggi.getMonth()]} ${oggi.getFullYear()}`;
  } else if (chiave === "mese-scorso") {
    da = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1);
    a = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    etichetta = `${MESI[da.getMonth()]} ${da.getFullYear()}`;
  } else if (chiave === "trimestre") {
    const q = Math.floor(oggi.getMonth() / 3);
    da = new Date(oggi.getFullYear(), q * 3, 1);
    a = domani;
    etichetta = `Q${q + 1} ${oggi.getFullYear()}`;
  } else if (chiave === "anno") {
    da = new Date(oggi.getFullYear(), 0, 1);
    a = domani;
    etichetta = `${oggi.getFullYear()}`;
  } else {
    chiave = "30g";
    a = domani;
    da = new Date(a.getTime() - 30 * GIORNO);
    etichetta = "Ultimi 30 giorni";
  }

  const durata = a.getTime() - da.getTime();
  const precedente: Periodo = {
    da: new Date(da.getTime() - durata),
    a: new Date(da.getTime()),
    etichetta: "periodo precedente",
  };
  const annoPrima: Periodo = {
    da: new Date(new Date(da).setFullYear(da.getFullYear() - 1)),
    a: new Date(new Date(a).setFullYear(a.getFullYear() - 1)),
    etichetta: "stesso periodo 2025",
  };

  return { corrente: { da, a, etichetta }, precedente, annoPrima, preset: chiave };
}

// Variazione percentuale con gestione dei casi vuoti
export function variazione(ora: number, prima: number): number | null {
  if (!prima) return null;
  return ((ora - prima) / prima) * 100;
}
