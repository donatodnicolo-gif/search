import type { OrdineShopify, TransazioneBancaria } from "@prisma/client";

// Helper puri per gli ordini Shopify (etichette, categorie, suggerimento match).

export const STATI_ORDINE: Record<string, { label: string; badge: string }> = {
  da_riconciliare: { label: "Da riconciliare", badge: "orange" },
  riconciliato: { label: "Riconciliato", badge: "green" },
  incassato_gateway: { label: "Incassato (gateway)", badge: "blue" },
  ignorato: { label: "Ignorato", badge: "neutral" },
};

export const CATEGORIE_PAG: Record<string, string> = {
  bonifico: "Bonifico",
  carta: "Carta / gateway",
  contrassegno: "Contrassegno",
  altro: "Altro",
};

const TOLLERANZA = 0.02;

// Estrae il numero d'ordine (solo cifre) da `nome` tipo "#2582" → "2582".
export function numeroOrdine(nome: string): string {
  return (nome.match(/\d+/g)?.join("") ?? "").trim();
}

// La causale del movimento contiene il numero dell'ordine come numero a sé
// (non pezzo di un numero più lungo: "2582" ma non "12582")? È il match più
// affidabile — molti estratti (es. Vivid) riportano il n° ordine in causale.
export function causaleContieneNumero(t: TransazioneBancaria, numero: string): boolean {
  if (!numero || numero.length < 2) return false;
  const testo = `${t.descrizione} ${t.controparte ?? ""}`;
  return new RegExp(`(?<!\\d)${numero}(?!\\d)`).test(testo);
}

// Suggerisce i movimenti bancari (accrediti) compatibili con un ordine a
// bonifico. Due segnali, dal più forte:
//   1) il NUMERO dell'ordine compare nella causale del movimento;
//   2) stesso importo (±2 cent), rafforzato se c'è anche il nome cliente.
// I candidati per numero sono mostrati anche se l'importo non combacia.
export function suggerisciMovimenti(
  ordine: OrdineShopify,
  movimenti: TransazioneBancaria[],
  giaAbbinati: Set<string>
): { tx: TransazioneBancaria; forte: boolean; matchNumero: boolean }[] {
  const nome = (ordine.clienteNome ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const numero = numeroOrdine(ordine.nome);
  return movimenti
    .filter((t) => t.importo > 0 && !giaAbbinati.has(t.id))
    .map((t) => {
      const matchNumero = causaleContieneNumero(t, numero);
      const matchImporto = Math.abs(t.importo - ordine.totale) <= TOLLERANZA;
      const desc = `${t.descrizione} ${t.controparte ?? ""}`.toLowerCase();
      const matchNome = nome.length > 0 && nome.some((w) => desc.includes(w));
      return { tx: t, matchNumero, matchImporto, forte: matchNumero || (matchImporto && matchNome) };
    })
    .filter((c) => c.matchNumero || c.matchImporto)
    .sort((a, b) => Number(b.matchNumero) - Number(a.matchNumero) || Number(b.forte) - Number(a.forte))
    .map(({ tx, forte, matchNumero }) => ({ tx, forte, matchNumero }));
}
