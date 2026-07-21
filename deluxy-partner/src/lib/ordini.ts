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

// Suggerisce i movimenti bancari (accrediti) compatibili con l'importo di un
// ordine a bonifico: stesso importo (±2 cent), non ancora abbinati ad altro
// ordine. Se il nome cliente compare nella descrizione, il candidato è più forte.
export function suggerisciMovimenti(
  ordine: OrdineShopify,
  movimenti: TransazioneBancaria[],
  giaAbbinati: Set<string>
): { tx: TransazioneBancaria; forte: boolean }[] {
  const nome = (ordine.clienteNome ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  return movimenti
    .filter((t) => t.importo > 0 && !giaAbbinati.has(t.id))
    .filter((t) => Math.abs(t.importo - ordine.totale) <= TOLLERANZA)
    .map((t) => {
      const desc = `${t.descrizione} ${t.controparte ?? ""}`.toLowerCase();
      const forte = nome.length > 0 && nome.some((w) => desc.includes(w));
      return { tx: t, forte };
    })
    .sort((a, b) => Number(b.forte) - Number(a.forte));
}
