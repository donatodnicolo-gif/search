import type { Partner, FatturaServizio, TransazioneBancaria } from "@prisma/client";
import { ivato } from "./calc";

// Motore di riconciliazione: abbina i movimenti dell'estratto conto alle
// attese del database. Ordine di forza degli agganci:
//   1. numero fattura citato nella causale (es. "181/2026")
//   2. importo esatto (±2 centesimi) di una fattura aperta del partner
//   3. nome partner (incluse le ragioni sociali tra parentesi) + importo
//   4. causale della distinta SEPA generata dall'app (uscite)
// Nessuna scrittura avviene qui: solo suggerimenti, che l'operatore conferma.

const TOLLERANZA = 0.02;

export type Suggerimento =
  | { tipo: "fattura"; fattura: FatturaServizio & { partner: Partner }; motivo: string }
  | { tipo: "incasso_partner"; partner: Partner; motivo: string }
  | { tipo: "bonifico_partner"; partner: Partner; mesePagamento: number | null; motivo: string }
  | { tipo: "discrepanza"; partner: Partner; motivo: string }
  | { tipo: "sconosciuta"; motivo: string };

export function normalizza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PAROLE_GENERICHE = new Set([
  // forme societarie e parole di causale
  "BONIFICO", "SEPA", "FAVORE", "ORDINE", "SRLS", "SRL", "SNC", "SAS", "SPA", "DITTA",
  "PAGAMENTO", "SALDO", "FATTURA", "FATT", "RIF", "CRO", "TRN", "DELUXY", "VENDITE",
  // città e paesi ricorrenti
  "MILANO", "ROMA", "FIRENZE", "TORINO", "GENOVA", "MONZA", "COMO", "ITALIA", "ITALY",
  "DELLA", "DELLE", "DEGLI", "DEL",
  // mesi (compaiono in alcuni nomi partner e in molte causali)
  "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO",
  "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE",
  // categorie merceologiche: comuni sia nei nomi partner sia nei negozi da carta
  "FIORI", "FIORE", "FIORAIO", "FIORISTA", "FIORERIA", "FLOWERS", "FLOWER", "FLEURS",
  "PASTICCERIA", "BOTTEGA", "MARKET", "SHOP", "STORE", "ATELIER", "CAFFE", "BAR",
  "DOLCE", "DOLCI", "NUOVO", "NUOVA", "REAL", "GRUPPO", "CASA", "ANGOLO", "OASI",
]);

// token significativi del nome partner (incluso il contenuto tra parentesi)
export function tokenPartner(nome: string): string[] {
  return [...new Set(normalizza(nome).split(" "))].filter(
    (t) => t.length >= 4 && !PAROLE_GENERICHE.has(t)
  );
}

export function matchPartner(testo: string, partners: Partner[]): Partner | null {
  // confronto per PAROLE INTERE, non per sottostringa ("FIORE" non deve
  // combaciare con "FIORERIA")
  const parole = new Set(normalizza(testo).split(" "));
  let migliore: Partner | null = null;
  let migliorPunteggio = 0;
  for (const p of partners) {
    const tokens = tokenPartner(p.nome);
    if (!tokens.length) continue;
    const presenti = tokens.filter((tok) => parole.has(tok));
    if (!presenti.length) continue;
    // serve un token forte (>=5 caratteri) o almeno due token
    const forte = presenti.some((tok) => tok.length >= 5);
    if (!forte && presenti.length < 2) continue;
    const punteggio = presenti.reduce((a, tok) => a + tok.length, 0);
    if (punteggio > migliorPunteggio) { migliorPunteggio = punteggio; migliore = p; }
  }
  return migliore;
}

// numeri fattura citati nel testo (es. "181/2026", "fatt. 68-69/2026").
// Il lookbehind esclude le DATE: in "del 16/07/2026" il pezzo "07/2026" non è
// un numero di fattura (è preceduto da cifra+separatore).
function numeriFattura(testo: string): string[] {
  // (?<!\d) impedisce di partire a metà numero ("7" dentro "07").
  // Il mese delle date va escluso ("07/2026" dentro "16/07/2026"): se il numero
  // è preceduto da cifra+separatore ED è un possibile mese (≤12) lo scartiamo,
  // così "70/2026" in "fatt. 68-69-70/2026" resta valido.
  const out: string[] = [];
  for (const m of testo.matchAll(/(?<!\d)(\d{1,4})\s*\/\s*(20\d{2})/g)) {
    const idx = m.index ?? 0;
    const prima = testo.slice(Math.max(0, idx - 2), idx);
    const num = +m[1];
    if (/\d[\/\-.]$/.test(prima) && num <= 12) continue; // mese di una data
    out.push(`${num}/${m[2]}`);
  }
  return out;
}

function normalizzaNumero(numero: string | null): string[] {
  // "68-69-70/2026" → ["68/2026","69/2026","70/2026"]; "141/2026" → ["141/2026"]
  if (!numero) return [];
  const anni = numero.match(/20\d{2}/g);
  const anno = anni?.[anni.length - 1];
  if (!anno) return [numero.trim()];
  return numero
    .split(/[-,;]/)
    .map((p) => p.replace(/\/?20\d{2}/g, "").replace(/\D/g, ""))
    .filter(Boolean)
    .map((n) => `${+n}/${anno}`);
}

// Chiave stabile del soggetto di un movimento (per le associazioni salvate):
// la controparte quando c'è, altrimenti la descrizione.
export function chiaveControparte(tx: { controparte: string | null; descrizione: string }): string | null {
  const base = (tx.controparte ?? "").trim() || tx.descrizione.trim();
  const n = normalizza(base);
  return n.length >= 3 ? n : null;
}

export function suggerisci(
  tx: Pick<TransazioneBancaria, "importo" | "descrizione" | "controparte" | "data">,
  ctx: {
    partners: Partner[];
    fattureAperte: (FatturaServizio & { partner: Partner })[];
    daBonificare: { partner: Partner; mese: number; importo: number }[];
    associazioni?: Map<string, Partner>; // controparte normalizzata → partner
  }
): Suggerimento {
  const testo = `${tx.descrizione} ${tx.controparte ?? ""}`;
  const testoNorm = normalizza(testo);
  // Una regola salvata dall'operatore ha la precedenza sul match automatico.
  const chiave = chiaveControparte(tx);
  const forzato = chiave ? ctx.associazioni?.get(chiave) ?? null : null;
  const partner = forzato ?? matchPartner(testo, ctx.partners);

  if (tx.importo > 0) {
    // ACCREDITO → incasso di fatture
    const citati = numeriFattura(testo);
    if (citati.length) {
      const perNumero = ctx.fattureAperte.filter((f) =>
        normalizzaNumero(f.numero).some((n) => citati.includes(n))
      );
      if (perNumero.length) {
        const somma = perNumero.reduce((a, f) => a + ivato(f), 0);
        const ok = Math.abs(somma - tx.importo) <= TOLLERANZA;
        return {
          tipo: "fattura",
          fattura: perNumero[0],
          motivo:
            `causale cita fatt. ${perNumero.map((f) => f.numero).join(", ")}` +
            (ok ? " e l'importo coincide" : ` ma l'importo atteso è ${somma.toFixed(2)} €`),
        };
      }
    }
    // per importo esatto (con o senza partner riconosciuto)
    const candidate = ctx.fattureAperte.filter(
      (f) => Math.abs(ivato(f) - tx.importo) <= TOLLERANZA && (!partner || f.partnerId === partner.id)
    );
    if (candidate.length === 1) {
      return { tipo: "fattura", fattura: candidate[0], motivo: partner ? "partner e importo coincidono" : "importo esatto di una sola fattura aperta" };
    }
    if (partner) {
      // somma delle fatture aperte del partner
      const sue = ctx.fattureAperte.filter((f) => f.partnerId === partner.id);
      const somma = sue.reduce((a, f) => a + ivato(f), 0);
      if (sue.length && Math.abs(somma - tx.importo) <= TOLLERANZA) {
        return { tipo: "fattura", fattura: sue[0], motivo: `copre tutte le ${sue.length} fatture aperte del partner` };
      }
      // Un'associazione salvata è una scelta esplicita dell'operatore: mai
      // "discrepanza", si registra come incasso dal partner.
      if (sue.length && !forzato) {
        return { tipo: "discrepanza", partner, motivo: `partner riconosciuto ma l'importo non corrisponde a nessuna fattura aperta (aperte: ${somma.toFixed(2)} €)` };
      }
      return {
        tipo: "incasso_partner",
        partner,
        motivo: forzato ? "associazione salvata: incasso dal partner" : "partner riconosciuto, nessuna fattura aperta: possibile incasso in compensazione",
      };
    }
    return { tipo: "sconosciuta", motivo: "nessun partner o fattura riconosciuti nella causale" };
  }

  // ADDEBITO → bonifico verso partner
  const uscita = Math.abs(tx.importo);
  const daNoi = /SALDO VENDITE/.test(testoNorm); // causale della nostra distinta SEPA
  const attesi = ctx.daBonificare.filter(
    (x) => (!partner || x.partner.id === partner.id) && Math.abs(x.importo - uscita) <= TOLLERANZA
  );
  if (attesi.length === 1) {
    return {
      tipo: "bonifico_partner",
      partner: attesi[0].partner,
      mesePagamento: attesi[0].mese,
      motivo: daNoi ? "causale della distinta SEPA e importo atteso" : "importo atteso per il partner",
    };
  }
  if (partner) {
    const suoi = ctx.daBonificare.filter((x) => x.partner.id === partner.id);
    // Con un'associazione salvata non è una discrepanza: si registra come bonifico.
    if (suoi.length && !forzato) {
      return { tipo: "discrepanza", partner, motivo: `partner riconosciuto ma importo diverso dagli attesi (${suoi.map((s) => s.importo.toFixed(2)).join(", ")} €)` };
    }
    // Partner riconosciuto ma nessun dovuto aperto: se il match viene da una
    // regola salvata dall'operatore o dalla causale della distinta SEPA, lo
    // proponiamo come bonifico extra; altrimenti — tipico dei conti carta, dove il
    // nome coincide con un negozio — resta non riconosciuto per non inventare pagamenti.
    if (forzato) {
      return { tipo: "bonifico_partner", partner, mesePagamento: null, motivo: "associazione salvata: pagamento verso il partner" };
    }
    if (daNoi) {
      return { tipo: "bonifico_partner", partner, mesePagamento: null, motivo: "causale della distinta SEPA, nessun dovuto aperto: possibile bonifico extra" };
    }
    return { tipo: "sconosciuta", motivo: `nome simile a ${partner.nome} ma nessun dovuto aperto: probabile spesa non collegata` };
  }
  return { tipo: "sconosciuta", motivo: "nessun partner riconosciuto nella causale" };
}
