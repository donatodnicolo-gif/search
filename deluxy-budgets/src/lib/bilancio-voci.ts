// Lo schema del conto economico civilistico e le funzioni che non toccano il
// database: stanno separate perché servono **anche ai componenti client**, e un
// file che importa Prisma o node:crypto nel browser non si compila.

export type Voce = {
  codice: string;
  nome: string;
  // "sezione" = totale calcolato, non digitabile
  tipo: "voce" | "sezione";
  // Come entra nei totali: i costi si sommano dentro B e si sottraggono da A.
  gruppo: "A" | "B" | "C" | "D" | "IMPOSTE" | "RISULTATO";
  // Aiuto per capire cosa ci va dentro, con le parole dell'azienda.
  aiuto?: string;
};

// Voci del conto economico civilistico. Sono quelle che compaiono davvero in un
// bilancio di una società come questa: le voci che non si usano mai (B12
// accantonamenti per rischi, B13 altri accantonamenti) restano fuori finché non
// servono — si aggiungono qui, in un punto solo.
export const SCHEMA: Voce[] = [
  { codice: "A1", nome: "Ricavi delle vendite e delle prestazioni", tipo: "voce", gruppo: "A", aiuto: "Il fatturato: consegne, eventi, B2B, ecommerce." },
  { codice: "A5", nome: "Altri ricavi e proventi", tipo: "voce", gruppo: "A", aiuto: "Contributi, sopravvenienze attive, rimborsi." },
  { codice: "A", nome: "Valore della produzione", tipo: "sezione", gruppo: "A" },

  { codice: "B6", nome: "Materie prime, sussidiarie e merci", tipo: "voce", gruppo: "B", aiuto: "Fiori, materiali, prodotti acquistati per la rivendita." },
  { codice: "B7", nome: "Servizi", tipo: "voce", gruppo: "B", aiuto: "Partner che eseguono gli ordini, valet, consulenze, ADV, spedizioni, utenze." },
  { codice: "B8", nome: "Godimento di beni di terzi", tipo: "voce", gruppo: "B", aiuto: "Affitti, noleggi, leasing." },
  { codice: "B9", nome: "Per il personale", tipo: "voce", gruppo: "B", aiuto: "Salari, oneri sociali, TFR: il costo pieno del lavoro dipendente." },
  { codice: "B10", nome: "Ammortamenti e svalutazioni", tipo: "voce", gruppo: "B", aiuto: "Non passa dalla banca: è il motivo principale per cui il gestionale non torna col bilancio." },
  { codice: "B11", nome: "Variazione delle rimanenze", tipo: "voce", gruppo: "B", aiuto: "Segno positivo se le rimanenze calano (costo), negativo se crescono." },
  { codice: "B14", nome: "Oneri diversi di gestione", tipo: "voce", gruppo: "B", aiuto: "Imposte non sul reddito, sopravvenienze passive, arrotondamenti." },
  { codice: "B", nome: "Costi della produzione", tipo: "sezione", gruppo: "B" },

  { codice: "AB", nome: "Differenza tra valore e costi della produzione (A − B)", tipo: "sezione", gruppo: "RISULTATO" },

  { codice: "C16", nome: "Altri proventi finanziari", tipo: "voce", gruppo: "C" },
  { codice: "C17", nome: "Interessi e altri oneri finanziari", tipo: "voce", gruppo: "C", aiuto: "Interessi passivi, commissioni bancarie, oneri sui finanziamenti." },
  { codice: "C", nome: "Proventi e oneri finanziari", tipo: "sezione", gruppo: "C" },

  { codice: "D", nome: "Rettifiche di valore di attività finanziarie", tipo: "voce", gruppo: "D" },

  { codice: "ANTE", nome: "Risultato prima delle imposte", tipo: "sezione", gruppo: "RISULTATO" },
  { codice: "IMPOSTE", nome: "Imposte sul reddito dell'esercizio", tipo: "voce", gruppo: "IMPOSTE", aiuto: "IRES e IRAP di competenza." },
  { codice: "UTILE", nome: "Utile (perdita) dell'esercizio", tipo: "sezione", gruppo: "RISULTATO" },
];

export const VOCI_DIGITABILI = SCHEMA.filter((v) => v.tipo === "voce");

// Leggere un importo copiato da un bilancio è più delicato di quanto sembri:
// «1.250.000,00» è italiano, «1,250,000.00» è inglese, e trattare il punto
// come separatore delle migliaia in entrambi i casi trasforma 1250000.00 in
// centoventicinque milioni. La regola qui è una sola e non tira a indovinare:
// **l'ultimo fra punto e virgola è il separatore decimale**, tutto il resto è
// rumore. Se non ce n'è nessuno, è un intero.
export function numero(v: unknown): number | null {
  const grezzo = String(v ?? "").trim();
  if (!grezzo) return null;
  const negativo = /^-/.test(grezzo) || /\(.*\)/.test(grezzo); // i bilanci scrivono i negativi fra parentesi
  const soloCifre = grezzo.replace(/[^\d.,]/g, "");
  if (!soloCifre) return null;

  const ultimoPunto = soloCifre.lastIndexOf(".");
  const ultimaVirgola = soloCifre.lastIndexOf(",");
  let normalizzato: string;
  if (ultimoPunto === -1 && ultimaVirgola === -1) {
    normalizzato = soloCifre;
  } else {
    const posDecimale = Math.max(ultimoPunto, ultimaVirgola);
    const interi = soloCifre.slice(0, posDecimale).replace(/[.,]/g, "");
    const decimali = soloCifre.slice(posDecimale + 1).replace(/[.,]/g, "");
    // Tre cifre dopo l'ultimo separatore = erano le migliaia, non i decimali
    // («1.250.000» senza decimali). Meglio questo che leggere 1.250 come 1,25.
    normalizzato = decimali.length === 3 ? `${interi}${decimali}` : `${interi}.${decimali || "0"}`;
  }
  const n = Number(normalizzato);
  if (!Number.isFinite(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

// I totali. Si **calcolano**, non si digitano: un bilancio in cui il totale è
// un campo libero è un bilancio che prima o poi non quadra, e nessuno se ne
// accorge finché non lo guarda il commercialista.
export function totali(valori: Map<string, number>) {
  const v = (c: string) => valori.get(c) ?? 0;
  const A = v("A1") + v("A5");
  const B = v("B6") + v("B7") + v("B8") + v("B9") + v("B10") + v("B11") + v("B14");
  const AB = A - B;
  const C = v("C16") - v("C17");
  const D = v("D");
  const ANTE = AB + C + D;
  const UTILE = ANTE - v("IMPOSTE");
  return { A, B, AB, C, D, ANTE, UTILE };
}

export function valoreSezione(codice: string, t: ReturnType<typeof totali>): number {
  switch (codice) {
    case "A": return t.A;
    case "B": return t.B;
    case "AB": return t.AB;
    case "C": return t.C;
    case "ANTE": return t.ANTE;
    case "UTILE": return t.UTILE;
    default: return 0;
  }
}

// La ripartizione mensile salvata come JSON: dodici numeri o niente.
export function leggiMesi(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v) || v.length !== 12) return null;
    return v.map((x) => Number(x) || 0);
  } catch {
    return null;
  }
}
