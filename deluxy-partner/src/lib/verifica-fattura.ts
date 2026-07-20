import { prisma } from "./db";
import { ivato, nomeMese } from "./calc";

// Verifica lo stato di pagamento di una fattura servizi, per l'API pubblica.
// Cerca per id o per numero (es. "181/2026"), riconoscendo anche i numeri
// raggruppati ("68-69-70/2026" contiene 68/2026, 69/2026, 70/2026).

export type EsitoFattura =
  | {
      trovata: true;
      id: string;
      numero: string | null;
      partner: { id: string; nome: string };
      pagata: boolean;
      dataPagamento: string | null;
      scaduta: boolean;
      scadenza: string | null;
      competenza: string; // "Gennaio 2026"
      imponibile: number;
      aliquotaIva: number;
      totale: number; // IVA inclusa
      tipologia: string;
      aggiornatoAl: string;
    }
  | { trovata: false; motivo: string; candidati?: { id: string; numero: string | null; partner: string }[] };

// Espande il campo numero nei singoli "N/AAAA".
function numeriDiFattura(numero: string | null): string[] {
  if (!numero) return [];
  const anni = numero.match(/20\d{2}/g);
  const anno = anni ? anni[anni.length - 1] : null;
  if (!anno) return [numero.trim().toUpperCase()];
  return numero
    .replace(/20\d{2}/g, "")
    .split(/[-,;/\s]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean)
    .map((n) => `${+n}/${anno}`);
}

function normalizzaQuery(q: string): string | null {
  const m = q.trim().match(/(\d{1,4})\s*\/\s*(20\d{2})/);
  if (m) return `${+m[1]}/${m[2]}`;
  return null;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const round = (n: number) => Math.round(n * 100) / 100;

export async function verificaFattura(opts: { numero?: string; id?: string }): Promise<EsitoFattura> {
  let fattura = null;

  if (opts.id) {
    fattura = await prisma.fatturaServizio.findUnique({
      where: { id: opts.id },
      include: { partner: true, tipologia: true },
    });
  }

  let candidatiOverload: typeof fattura[] = [];
  if (!fattura && opts.numero) {
    const norm = normalizzaQuery(opts.numero);
    const q = opts.numero.trim();
    // candidate: stesso anno se presente, altrimenti tutte le fatturate
    const anno = norm ? parseInt(norm.split("/")[1]) : undefined;
    const tutte = await prisma.fatturaServizio.findMany({
      where: anno ? { anno } : { imponibile: { gt: 0 } },
      include: { partner: true, tipologia: true },
    });
    const match = tutte.filter((f) => {
      const numeri = numeriDiFattura(f.numero);
      if (norm) return numeri.includes(norm);
      return (f.numero ?? "").toUpperCase().includes(q.toUpperCase());
    });
    if (match.length === 1) fattura = match[0];
    else if (match.length > 1) candidatiOverload = match;
  }

  if (!fattura) {
    return {
      trovata: false,
      motivo: candidatiOverload.length
        ? "Più fatture corrispondono: specifica meglio il numero o usa l'id."
        : "Nessuna fattura corrisponde.",
      candidati: candidatiOverload.slice(0, 5).map((f) => ({ id: f!.id, numero: f!.numero, partner: f!.partner.nome })),
    };
  }

  const oggi = new Date();
  return {
    trovata: true,
    id: fattura.id,
    numero: fattura.numero,
    partner: { id: fattura.partnerId, nome: fattura.partner.nome },
    pagata: fattura.pagata,
    dataPagamento: iso(fattura.dataPagamento),
    scaduta: !fattura.pagata && !!fattura.scadenza && fattura.scadenza < oggi,
    scadenza: iso(fattura.scadenza),
    competenza: `${nomeMese(fattura.mese)} ${fattura.anno}`,
    imponibile: round(fattura.imponibile),
    aliquotaIva: fattura.aliquotaIva,
    totale: round(ivato(fattura)),
    tipologia: fattura.tipologia.nome,
    aggiornatoAl: new Date().toISOString(),
  };
}
