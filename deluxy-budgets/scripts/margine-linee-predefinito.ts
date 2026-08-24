// Scrive un margine sulle linee commerciali che non ne hanno ancora uno.
//
// ---- Perché serve ----
//
// Le linee entrano nel conto economico dal 23/08/2026, ma senza margine valgono
// **zero**: il costo del venduto si prende tutto il ricavo. Su 500.000 € di
// budget faceva 500.000 € di COGS, e il conto economico mostrava 808.320 € su
// 1.101.929 di ricavi — un numero che si legge come misurato e non lo è.
//
// ⚠️ **Il margine di default è un'assunzione, non una misura.** Il 20% è quello
// che l'azienda usa già per **B2B ed Eventi**, cioè per gli stessi servizi che
// queste linee vendono. Va corretto riga per riga da `/margini` dove non torna:
// su una fee di affiliazione, per dire, il margine vero è molto più alto.
//
// ⚠️ Tocca **solo le linee senza margine**: una percentuale già scritta è una
// decisione di qualcuno, e non si sovrascrive.
//
// Uso:
//   npx tsx@4 --env-file=.env scripts/margine-linee-predefinito.ts [pct]        → prova a vuoto
//   npx tsx@4 --env-file=.env scripts/margine-linee-predefinito.ts [pct] scrivi → applica

import { prisma } from "../src/lib/db";
import { ANNO_CORRENTE, caricaAnno, contoEconomico } from "../src/lib/calc";
import { quotaDeluxyAnno } from "../src/lib/quota";

const eur = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;

async function main() {
  const argomenti = process.argv.slice(2);
  const scrivi = argomenti.includes("scrivi");
  const pct = Number(argomenti.find((a) => a !== "scrivi") ?? 20);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    console.log("Il margine dev'essere un numero fra 0 e 100.");
    return;
  }

  const prima = await misura();
  const linee = await prisma.lineaCommerciale.findMany({
    where: { marginePct: null },
    orderBy: { ordine: "asc" },
    include: { targets: { where: { year: ANNO_CORRENTE } } },
  });

  console.log(`${scrivi ? "SCRITTURA" : "PROVA A VUOTO"} · margine ${pct}% sulle linee che non ne hanno\n`);
  if (linee.length === 0) {
    console.log("Tutte le linee hanno già un margine: niente da fare.");
    return;
  }

  for (const l of linee) {
    const budget = l.targets.reduce((s, t) => s + t.valore, 0);
    console.log(
      `${l.nome}: budget ${eur(budget)} → margine ${eur((budget * pct) / 100)}, ` +
        `costo del venduto ${eur(budget * (1 - pct / 100))}`
    );
    if (scrivi) await prisma.lineaCommerciale.update({ where: { id: l.id }, data: { marginePct: pct } });
  }

  if (scrivi) {
    const dopo = await misura();
    console.log(
      `\n${linee.length} linee scritte · costo del venduto ${eur(prima.cogs)} → ${eur(dopo.cogs)} · ` +
        `EBITDA ${eur(prima.ebitda)} → ${eur(dopo.ebitda)}`
    );
  } else {
    console.log("\nNiente è stato scritto. Per applicare: aggiungere «scrivi» al comando.");
  }
}

async function misura() {
  const d = await caricaAnno(ANNO_CORRENTE);
  const q = await quotaDeluxyAnno(ANNO_CORRENTE, d.maisons);
  const pl = contoEconomico(d, "RAGGIUNGIBILE", undefined, q.percentuale / 100);
  return { cogs: pl.cogs, ebitda: pl.ebitda, margine: pl.margineLordo };
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
