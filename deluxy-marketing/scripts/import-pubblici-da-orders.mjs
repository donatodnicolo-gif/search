// Importa i PUBBLICI dal registro centrale Deluxy Orders.
//
// Orders sa chi sono i clienti e come si comportano: quanto hanno speso, ogni
// quanto tornano, cosa comprano, per quali occasioni. Da lì ricava 39 liste
// pronte (VIP, da riattivare, compra fiori, ha comprato per San Valentino…).
// Qui diventano PUBBLICI: la stessa lista, vista come qualcosa da caricare su
// Meta o Google come Customer Match.
//
//   npm run import:pubblici-orders
//   npm run import:pubblici-orders -- --minimo 50   (salta le liste piccole)
//
// Serve ORDERS_API_KEY (sola lettura) nel .env, come per gli ordini.
//
// COSA SIGNIFICA LO STATO CHE VIENE SCRITTO
// I pubblici importati nascono "da_creare": la lista ESISTE come segmento di
// clienti, ma non è ancora un pubblico caricato su una piattaforma. Chiamarli
// "attivi" farebbe credere che stiano già girando in campagna.
// Su un pubblico già presente lo stato NON si tocca: se qualcuno l'ha portato
// a "attivo" o "obsoleto", quella è una scelta e l'import non la ribalta.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const valoreDi = (nome, predefinito = null) => {
  const i = argomenti.indexOf(`--${nome}`);
  return i >= 0 && argomenti[i + 1] && !argomenti[i + 1].startsWith("--") ? argomenti[i + 1] : predefinito;
};
const minimo = Number(valoreDi("minimo", "0")) || 0;

const URL_ORDERS = (process.env.ORDERS_URL || "https://deluxy-orders.vercel.app").replace(/\/+$/, "");
const CHIAVE = process.env.ORDERS_API_KEY;
if (!CHIAVE) {
  console.error("Manca ORDERS_API_KEY (chiave di sola lettura di deluxy-orders).");
  process.exit(1);
}

// Le famiglie di Orders diventano il "tipo" di pubblico dell'app.
const TIPO = {
  valore: "segmento",
  tipologia: "segmento",
  occasioni: "segmento",
  gusti: "segmento",
  attivazione: "retargeting",
};

const risposta = await fetch(`${URL_ORDERS}/api/v1/liste`, { headers: { "x-api-key": CHIAVE } });
if (!risposta.ok) {
  console.error(`Orders ha risposto ${risposta.status}: ${(await risposta.text()).slice(0, 200)}`);
  process.exit(1);
}
const { liste } = await risposta.json();

const oggi = new Date();
oggi.setUTCHours(0, 0, 0, 0);

let nuovi = 0;
let aggiornati = 0;
let saltati = 0;

for (const l of liste) {
  if (l.clienti < minimo) {
    saltati++;
    continue;
  }
  // Una lista vuota non è un pubblico: è una lista vuota. Si salta, così non
  // riempie la pagina di righe da zero che nessuno userà mai.
  if (l.clienti === 0) {
    saltati++;
    continue;
  }

  const nome = `Orders — ${l.nome}`;
  const note = [
    l.criterio,
    l.consiglio ? `Consiglio: ${l.consiglio}` : null,
    `Valore complessivo dei clienti in lista: ${Math.round(l.speso).toLocaleString("it-IT")} €`,
    `Chiave in Orders: ${l.chiave} (famiglia ${l.famiglia})`,
  ]
    .filter(Boolean)
    .join(" · ");

  const esistente = await prisma.pubblico.findUnique({
    where: { nome_piattaforma: { nome, piattaforma: "shopify" } },
    select: { id: true, stato: true },
  });

  if (esistente) {
    await prisma.pubblico.update({
      where: { id: esistente.id },
      // Lo stato resta quello deciso nell'app: l'import porta i numeri, non i giudizi.
      data: { dimensione: l.clienti, tipo: TIPO[l.famiglia] ?? "segmento", note, fonte: "deluxy-orders" },
    });
    aggiornati++;
  } else {
    const creato = await prisma.pubblico.create({
      data: {
        nome,
        piattaforma: "shopify",
        brand: "cross",
        tipo: TIPO[l.famiglia] ?? "segmento",
        dimensione: l.clienti,
        stato: "da_creare",
        fonte: "deluxy-orders",
        note,
      },
    });
    esistente ?? nuovi++;
    var idNuovo = creato.id;
  }

  // La misura del giorno: così la dimensione di una lista si può guardare nel
  // tempo invece di sapere solo com'è adesso.
  const pubblicoId = esistente?.id ?? idNuovo;
  await prisma.misuraPubblico.upsert({
    where: { pubblicoId_data: { pubblicoId, data: oggi } },
    create: { pubblicoId, data: oggi, dimensione: l.clienti, note: `${Math.round(l.speso)} € di valore` },
    update: { dimensione: l.clienti, note: `${Math.round(l.speso)} € di valore` },
  });
}

console.log(`Fatto: ${nuovi} pubblici nuovi, ${aggiornati} aggiornati, ${saltati} saltati (vuoti o sotto la soglia)`);
console.log("Nascono 'da creare': esistono come segmento di clienti, non ancora come pubblico su Meta o Google.");

await prisma.$disconnect();
