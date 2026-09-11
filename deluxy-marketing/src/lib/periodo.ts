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
    etichetta = `${da.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} – ${new Date(a.getTime() - GIORNO).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`;
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
    // ⚠️ L'anno si CALCOLA. Era scritto a mano («stesso periodo 2025»): giusto
    // finché si guardava il 2026, una bugia dal 1° gennaio dopo — e una bugia
    // su un'etichetta di confronto fa leggere i numeri dell'anno sbagliato.
    etichetta: `stesso periodo ${da.getFullYear() - 1}`,
  };

  return { corrente: { da, a, etichetta }, precedente, annoPrima, preset: chiave };
}

/**
 * CONTRO CHE COSA si confronta il periodo scelto.
 *
 * Fino all'11/09/2026 il confronto non era una scelta: le tessere della
 * dashboard mostravano **due** delta fissi (periodo precedente e anno prima) e
 * le tabelle nessuno. Due numeri di confronto sempre accesi accanto a ogni
 * numero sono rumore quando uno dei due non interessa; e zero confronti dentro
 * una tabella vuol dire leggere 220 € senza sapere se è tanto o poco.
 *
 * ⚠️ «Nessuno» è una scelta vera, non un ripiego: senza confronto le tabelle
 * non fanno la seconda lettura sul database. Chi guarda un elenco per trovare
 * una riga non deve pagare il conto di un confronto che non guarderà.
 */
export const TIPI_CONFRONTO: { chiave: string; nome: string }[] = [
  { chiave: "precedente", nome: "Periodo precedente" },
  { chiave: "anno", nome: "Anno precedente" },
  { chiave: "libero", nome: "Personalizzato" },
  { chiave: "nessuno", nome: "Nessuno" },
];

export function risolviConfronto(
  p: PeriodoRisolto,
  tipo?: string,
  daStr?: string,
  aStr?: string
): { periodo: Periodo | null; tipo: string } {
  const scelto = (tipo ?? "").trim() || "precedente";

  if (scelto === "nessuno") return { periodo: null, tipo: "nessuno" };

  if (scelto === "libero") {
    const dOk = daStr && !isNaN(new Date(daStr).getTime());
    const aOk = aStr && !isNaN(new Date(aStr).getTime());
    // ⚠️ Un «personalizzato» senza date non è un confronto: si dichiara tale e
    // si torna al periodo precedente, invece di confrontare con l'epoca zero.
    if (!dOk || !aOk) return { periodo: p.precedente, tipo: "precedente" };
    const da = mezzanotte(new Date(daStr as string));
    const a = new Date(mezzanotte(new Date(aStr as string)).getTime() + GIORNO);
    return {
      periodo: {
        da,
        a,
        etichetta: `${da.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} – ${new Date(
          a.getTime() - GIORNO
        ).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`,
      },
      tipo: "libero",
    };
  }

  if (scelto === "anno") return { periodo: p.annoPrima, tipo: "anno" };
  return { periodo: p.precedente, tipo: "precedente" };
}

// Variazione percentuale con gestione dei casi vuoti
export function variazione(ora: number, prima: number): number | null {
  if (!prima) return null;
  return ((ora - prima) / prima) * 100;
}

// Le SCORCIATOIE DI PERIODO del Libro UX&UI v1.9 §8-bis: UN parametro
// (`?periodo=mese|scorso|trimestre|anno`) per le pagine-elenco che non hanno
// il selettore completo (quello, `SceltaPeriodo`, resta sulle pagine di
// performance col suo `preset` e le date libere).
//
// ⚠️ La semantica è quella del Libro, non quella di `risolviPeriodo`:
// «trimestre» = ultimi 3 mesi COMPRESO il corrente (dal 1° di due mesi fa a
// oggi), non il trimestre solare. «mese» = mese corrente, «scorso» = mese
// precedente intero, «anno» = anno solare corrente. `a` è ESCLUSIVA, come in
// `Periodo`: le query usano `lt`.
export function intervalloScorciatoia(periodo?: string): { da: Date; a: Date } | null {
  const oggi = mezzanotte(new Date());
  const domani = new Date(oggi.getTime() + GIORNO);
  if (periodo === "mese")
    return { da: new Date(oggi.getFullYear(), oggi.getMonth(), 1), a: domani };
  if (periodo === "scorso")
    return {
      da: new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1),
      a: new Date(oggi.getFullYear(), oggi.getMonth(), 1),
    };
  if (periodo === "trimestre")
    return { da: new Date(oggi.getFullYear(), oggi.getMonth() - 2, 1), a: domani };
  if (periodo === "anno")
    return { da: new Date(oggi.getFullYear(), 0, 1), a: domani };
  return null;
}
