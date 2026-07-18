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
  "BONIFICO", "SEPA", "FAVORE", "ORDINE", "SRLS", "SRL", "SNC", "SAS", "SPA", "DITTA",
  "PAGAMENTO", "SALDO", "FATTURA", "FATT", "RIF", "CRO", "TRN", "DELUXY", "MILANO", "ROMA",
  "FIRENZE", "ITALIA", "DELLA", "DELLE", "DEGLI",
]);

// token significativi del nome partner (incluso il contenuto tra parentesi)
export function tokenPartner(nome: string): string[] {
  return [...new Set(normalizza(nome).split(" "))].filter(
    (t) => t.length >= 4 && !PAROLE_GENERICHE.has(t)
  );
}

export function matchPartner(testo: string, partners: Partner[]): Partner | null {
  const t = normalizza(testo);
  let migliore: Partner | null = null;
  let migliorPunteggio = 0;
  for (const p of partners) {
    const tokens = tokenPartner(p.nome);
    if (!tokens.length) continue;
    const presenti = tokens.filter((tok) => t.includes(tok));
    if (!presenti.length) continue;
    // serve un token forte (>=5 caratteri) o almeno due token
    const forte = presenti.some((tok) => tok.length >= 5);
    if (!forte && presenti.length < 2) continue;
    const punteggio = presenti.reduce((a, tok) => a + tok.length, 0);
    if (punteggio > migliorPunteggio) { migliorPunteggio = punteggio; migliore = p; }
  }
  return migliore;
}

// numeri fattura citati nel testo (es. "181/2026", "fatt. 68-69/2026")
function numeriFattura(testo: string): string[] {
  return [...testo.matchAll(/(\d{1,4})\s*\/\s*(20\d{2})/g)].map((m) => `${+m[1]}/${m[2]}`);
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

export function suggerisci(
  tx: Pick<TransazioneBancaria, "importo" | "descrizione" | "controparte" | "data">,
  ctx: {
    partners: Partner[];
    fattureAperte: (FatturaServizio & { partner: Partner })[];
    daBonificare: { partner: Partner; mese: number; importo: number }[];
  }
): Suggerimento {
  const testo = `${tx.descrizione} ${tx.controparte ?? ""}`;
  const testoNorm = normalizza(testo);
  const partner = matchPartner(testo, ctx.partners);

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
      if (sue.length) {
        return { tipo: "discrepanza", partner, motivo: `partner riconosciuto ma l'importo non corrisponde a nessuna fattura aperta (aperte: ${somma.toFixed(2)} €)` };
      }
      return { tipo: "incasso_partner", partner, motivo: "partner riconosciuto, nessuna fattura aperta: possibile incasso in compensazione" };
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
    if (suoi.length) {
      return { tipo: "discrepanza", partner, motivo: `partner riconosciuto ma importo diverso dagli attesi (${suoi.map((s) => s.importo.toFixed(2)).join(", ")} €)` };
    }
    return { tipo: "bonifico_partner", partner, mesePagamento: null, motivo: "partner riconosciuto, nessun dovuto aperto: pagamento già registrato o extra" };
  }
  return { tipo: "sconosciuta", motivo: "nessun partner riconosciuto nella causale" };
}
