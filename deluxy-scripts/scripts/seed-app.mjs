// Popola il registro delle app collegate con l'ecosistema Deluxy, così il primo
// avvio non parte da una pagina vuota. Idempotente: le app già presenti non
// vengono toccate (nome e colore restano quelli eventualmente modificati a mano).
//
// Uso: npm run seed:app
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Le chiavi sono quelle che le app useranno nelle API (?app=<chiave>).
const APP = [
  { chiave: "deluxy-platform-next", nome: "Consegne", descrizione: "Piattaforma logistica app.deluxy.it", colore: "#111318" },
  { chiave: "deluxy-hub", nome: "Hub", descrizione: "Portale unico di accesso", colore: "#6e6e73" },
  { chiave: "deluxy-partner", nome: "Finance", descrizione: "Fatture, vendite vendor, SEPA", colore: "#248a3d" },
  { chiave: "deluxy-anagrafiche", nome: "Anagrafiche", descrizione: "Registro partner e prospect B2B", colore: "#0071e3" },
  { chiave: "deluxy-orders", nome: "Orders", descrizione: "Registro centralizzato ordini Shopify", colore: "#b8963e" },
  { chiave: "deluxy-marketing", nome: "Marketing", descrizione: "Memoria operativa ADV", colore: "#6d3fc4" },
  { chiave: "deluxy-messaging", nome: "Customer Service", descrizione: "Reclami, ordini da lavorare, inbox", colore: "#c93400" },
  { chiave: "deluxy-merchandising", nome: "Merchandising", descrizione: "Collezioni, PLM, costi e margini", colore: "#a07f2c" },
  { chiave: "deluxy-budgets", nome: "Budgets", descrizione: "Budget su 3 livelli e P&L", colore: "#248a3d" },
  { chiave: "deluxy-transactions", nome: "Transactions", descrizione: "Autorizzazione dei pagamenti", colore: "#d70015" },
  { chiave: "deluxy-mail", nome: "AI Mail", descrizione: "Smistamento della posta", colore: "#0071e3" },
  { chiave: "deluxy-scout", nome: "Scout", descrizione: "App mobile di prospezione", colore: "#6d3fc4" },
  { chiave: "google-ads", nome: "Google Ads", descrizione: "Script incollati in Google Ads (Azioni collettive)", colore: "#c93400" },
  { chiave: "shopify", nome: "Shopify", descrizione: "Snippet e Liquid dei temi dei siti", colore: "#248a3d" },
];

let creati = 0;
for (const [i, app] of APP.entries()) {
  const esiste = await prisma.appCollegata.findUnique({ where: { chiave: app.chiave } });
  if (esiste) continue;
  await prisma.appCollegata.create({ data: { ...app, ordine: i } });
  creati++;
}

console.log(`App collegate: ${creati} create, ${APP.length - creati} già presenti.`);
await prisma.$disconnect();
