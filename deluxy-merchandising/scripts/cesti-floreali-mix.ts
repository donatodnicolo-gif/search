// **I cesti floreali diventano «mix / composizione».**
//
// Richiesta dell'utente (10/09/2026): «metti anche i cesti floreali come tipo
// di prodotto mix per l'app delivery».
//
// ⚠️⚠️ **Non è un'etichetta interna: la legge la piattaforma consegne.**
// `tipologiaVendita` esce dall'API `/api/v1/prodotti` ed è il campo con cui la
// piattaforma decide **come si sceglie il fornitore e come si fa il prezzo**.
// Passando da «preventivo» a «mix», questi prodotti smettono di richiedere il
// preventivo del partner prima di accettare la vendita e cominciano a essere
// proposti con la percentuale di sconto della provincia e la lista di
// priorità. È un cambio di comportamento su vendite vere, non una parola.
//
// ⚠️ **Si va per TIPO, non per nome.** «Cesto» nel nome prende 50 prodotti, di
// cui la maggior parte sono cesti natalizi di gastronomia, box di Pasqua e
// dolci: spostarli sarebbe un errore grosso. Il tipo «Cesti Floreali» ne
// individua 21, tutti in categoria FIORI.
//
// ⚠️ Restano fuori di proposito:
//   · «cesti di natale» (gastronomia): un altro prodotto con un nome simile;
//   · i due «MAXI Cesto … e Palloncini», che il negozio tiene come «Originali
//     Deluxy» — i bouquet di palloncini restano a preventivo per la legenda;
//   · due schede archiviate.
//
//   npx tsx scripts/cesti-floreali-mix.ts            # prova, non scrive
//   npx tsx scripts/cesti-floreali-mix.ts --applica

import { writeFileSync } from "node:fs";
import { caricaEnv } from "./vecchio-gestionale";

const TIPO = "Cesti Floreali";
const NUOVA = "mix";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const p = await prisma.prodotto.findMany({
    where: { tipoShopify: TIPO },
    select: { id: true, codice: true, nome: true, categoria: true, fase: true, tipologiaVendita: true },
    orderBy: { nome: "asc" },
  });

  // ⚠️ Se qualcuno di questi non fosse FIORI, il tipo del negozio starebbe
  // dicendo una cosa e la nostra categoria un'altra: si ferma e lo dice invece
  // di spostarlo lo stesso.
  const stonati = p.filter((x) => x.categoria !== "FIORI");
  const daFare = p.filter((x) => x.categoria === "FIORI" && x.tipologiaVendita !== NUOVA);

  console.log(`Prodotti col tipo «${TIPO}»: ${p.length}`);
  const conta = new Map<string, number>();
  for (const x of p) conta.set(x.tipologiaVendita ?? "(nessuna)", (conta.get(x.tipologiaVendita ?? "(nessuna)") ?? 0) + 1);
  for (const [k, v] of conta) console.log(`  ${String(v).padStart(3)}  oggi «${k}»`);
  console.log(`\n  da spostare a «${NUOVA}»: ${daFare.length}`);
  for (const x of daFare.slice(0, 25)) {
    console.log(`   ${(x.codice ?? "").padEnd(12)} ${x.fase.padEnd(11)} ${(x.tipologiaVendita ?? "—").padEnd(11)} ${x.nome.slice(0, 44)}`);
  }
  if (stonati.length) {
    console.log(`\n  ⚠️ col tipo «${TIPO}» ma NON in categoria FIORI — non toccati:`);
    for (const x of stonati) console.log(`   ${(x.codice ?? "").padEnd(12)} ${x.categoria} ${x.nome.slice(0, 40)}`);
  }

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  if (!daFare.length) { console.log("\nNiente da fare."); await prisma.$disconnect(); return; }

  // La copia PRIMA di toccare: qui si cambia come la piattaforma tratta una
  // vendita, e tornare indietro deve essere possibile senza indovinare.
  const file = `docs/cesti-floreali-prima-del-mix-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(daFare, null, 1), "utf8");
  console.log(`\nCopia di sicurezza: ${file}`);

  const fatti = await prisma.prodotto.updateMany({
    where: { id: { in: daFare.map((x) => x.id) } },
    data: { tipologiaVendita: NUOVA },
  });
  console.log(`Spostati a «${NUOVA}»: ${fatti.count}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
