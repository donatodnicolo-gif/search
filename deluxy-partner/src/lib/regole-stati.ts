// REGOLE DEGLI STATI DEL CLIENTE — punto unico in cui si cambiano le condizioni.
//
// Qui vivono i numeri che decidono come viene classificato un cliente:
//   • stato finanziario (credito): fasce di scaduto, materialità, tolleranza sul
//     ritardo medio, finestra dello storico;
//   • stato analisi (P.P. / Nuovo / Dismesso): da quanti mesi un cliente è
//     "nuovo" e dopo quanti mesi senza movimenti si considera "dismesso".
//
// I valori stanno nella tabella `Impostazione` (chiavi `regole.*`) e si
// modificano dall'app in **Impostazioni → Regole degli stati**: nessuna riga di
// codice da toccare per cambiare una soglia. Quando una chiave non c'è, vale il
// default qui sotto — che è anche la documentazione di com'era il comportamento
// prima che gli stati diventassero configurabili (23/07/2026).

import { prisma } from "./db";

export type RegoleCredito = {
  /** Sotto questa cifra uno scaduto non declassa il cliente (€, IVA inclusa). */
  materialita: number;
  /** Fine della prima fascia di scaduto, in giorni (default 30). */
  fascia1: number;
  /** Fine della seconda fascia (default 60). */
  fascia2: number;
  /** Fine della terza fascia; oltre è insoluto (default 90). */
  fascia3: number;
  /** Ritardo medio storico tollerato prima di passare a "da monitorare" (giorni). */
  ritardoTollerato: number;
  /** Finestra dello storico dei pagamenti considerata (mesi). */
  mesiStorico: number;
};

export type RegoleAnalisi = {
  /** Un cliente è "Nuovo" se il suo primo movimento è entro questi mesi. */
  mesiNuovo: number;
  /** È "Dismesso" se non ha movimenti da almeno questi mesi. */
  mesiDismesso: number;
};

export const REGOLE_CREDITO_DEFAULT: RegoleCredito = {
  materialita: 25,
  fascia1: 30,
  fascia2: 60,
  fascia3: 90,
  ritardoTollerato: 15,
  mesiStorico: 24,
};

export const REGOLE_ANALISI_DEFAULT: RegoleAnalisi = {
  mesiNuovo: 12,
  mesiDismesso: 12,
};

/** Etichette e descrizioni dei campi: usate dalla pagina Impostazioni. */
export const CAMPI_CREDITO: { campo: keyof RegoleCredito; etichetta: string; aiuto: string; unita: string }[] = [
  { campo: "materialita", etichetta: "Soglia di materialità", unita: "€", aiuto: "Sotto questa cifra uno scaduto non cambia lo stato del cliente: sono residui contabili, non rischio." },
  { campo: "fascia1", etichetta: "Fine 1ª fascia", unita: "giorni", aiuto: "Scaduto entro questi giorni → «Da monitorare»." },
  { campo: "fascia2", etichetta: "Fine 2ª fascia", unita: "giorni", aiuto: "Scaduto fino a questi giorni → «In ritardo»." },
  { campo: "fascia3", etichetta: "Fine 3ª fascia", unita: "giorni", aiuto: "Fino a qui è «Scaduto grave»; oltre diventa «Insoluto»." },
  { campo: "ritardoTollerato", etichetta: "Ritardo medio tollerato", unita: "giorni", aiuto: "Un cliente senza scaduto ma che paga mediamente oltre questo ritardo passa a «Da monitorare»." },
  { campo: "mesiStorico", etichetta: "Storico considerato", unita: "mesi", aiuto: "Finestra delle fatture già incassate su cui si misurano puntualità e ritardo medio." },
];

export const CAMPI_ANALISI: { campo: keyof RegoleAnalisi; etichetta: string; aiuto: string; unita: string }[] = [
  { campo: "mesiNuovo", etichetta: "Cliente «Nuovo» entro", unita: "mesi", aiuto: "Se il primo movimento (fattura o vendita) è più recente di così, il cliente è Nuovo." },
  { campo: "mesiDismesso", etichetta: "Cliente «Dismesso» dopo", unita: "mesi", aiuto: "Senza nessun movimento da almeno questi mesi il cliente è considerato Dismesso." },
];

const CHIAVE = (gruppo: "credito" | "analisi", campo: string) => `regole.${gruppo}.${campo}`;

function numero(v: string | undefined, dflt: number): number {
  const n = parseFloat((v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

/** Regole attualmente in vigore (default + eventuali valori salvati). */
export async function leggiRegole(): Promise<{ credito: RegoleCredito; analisi: RegoleAnalisi }> {
  const righe = await prisma.impostazione.findMany({ where: { chiave: { startsWith: "regole." } } });
  const m = Object.fromEntries(righe.map((r) => [r.chiave, r.valore]));
  const credito = { ...REGOLE_CREDITO_DEFAULT };
  for (const k of Object.keys(credito) as (keyof RegoleCredito)[]) {
    credito[k] = numero(m[CHIAVE("credito", k)], REGOLE_CREDITO_DEFAULT[k]);
  }
  const analisi = { ...REGOLE_ANALISI_DEFAULT };
  for (const k of Object.keys(analisi) as (keyof RegoleAnalisi)[]) {
    analisi[k] = numero(m[CHIAVE("analisi", k)], REGOLE_ANALISI_DEFAULT[k]);
  }
  // le fasce devono restare crescenti, altrimenti l'aging non ha senso
  credito.fascia2 = Math.max(credito.fascia2, credito.fascia1 + 1);
  credito.fascia3 = Math.max(credito.fascia3, credito.fascia2 + 1);
  return { credito, analisi };
}

/** Salva una regola; valore vuoto = torna al default. */
export async function salvaRegola(gruppo: "credito" | "analisi", campo: string, valore: string) {
  const chiave = CHIAVE(gruppo, campo);
  if (valore.trim() === "") {
    await prisma.impostazione.deleteMany({ where: { chiave } });
    return;
  }
  const v = String(numero(valore, NaN));
  if (v === "NaN") return;
  await prisma.impostazione.upsert({ where: { chiave }, create: { chiave, valore: v }, update: { valore: v } });
}

/** Riporta un intero gruppo di regole ai valori di default. */
export async function ripristinaRegole(gruppo: "credito" | "analisi") {
  await prisma.impostazione.deleteMany({ where: { chiave: { startsWith: `regole.${gruppo}.` } } });
}
