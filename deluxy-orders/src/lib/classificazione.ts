import { prisma } from "./db";

// Vocabolari e utilità della classificazione Deluxy sovrapposta agli ordini.

// Categoria di pagamento — dedotta dai gateway Shopify, correggibile a mano.
export const CATEGORIE_PAGAMENTO = ["bonifico", "carta", "contrassegno", "altro"] as const;
export type CategoriaPagamento = (typeof CATEGORIE_PAGAMENTO)[number];

// Deduce la categoria di pagamento dai nomi dei gateway Shopify (come partner).
export function categoriaDaGateway(gateways: string[]): CategoriaPagamento {
  const g = gateways.join(" ").toLowerCase();
  if (/bonif|bank|transfer|manual|wire|sepa/.test(g)) return "bonifico";
  if (/cod|contrass|cash on delivery|contanti|alla consegna/.test(g)) return "contrassegno";
  if (/shopify_payments|stripe|paypal|card|carta|credit|klarna|scalapay|satispay|amazon/.test(g)) return "carta";
  return "altro";
}

// App di destinazione a cui un ordine può essere instradato. Gli id combaciano
// con quelli del catalogo del Hub (deluxy-hub/src/lib/apps.ts), così altre app
// riconoscono a colpo d'occhio se un ordine "è per loro".
export const APP_DESTINAZIONI = [
  { id: "search", nome: "Ricerca fornitori (smistamento)" },
  { id: "partner", nome: "Finance" },
  { id: "consegne", nome: "Consegne" },
  { id: "messaggi", nome: "Messaggi" },
  { id: "marketing", nome: "Marketing" },
] as const;

export function nomeApp(id: string | null | undefined): string | null {
  if (!id) return null;
  return APP_DESTINAZIONI.find((a) => a.id === id)?.nome ?? id;
}

// Registra un evento di storico su un ordine (chi ha fatto cosa e quando).
export async function registraEvento(
  ordineId: string,
  tipo: string,
  descrizione: string,
  autore = "operatore",
): Promise<void> {
  await prisma.eventoOrdine.create({
    data: { ordineId, tipo, descrizione, autore },
  });
}
