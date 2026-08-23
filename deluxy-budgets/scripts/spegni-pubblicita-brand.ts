// Spegne la pubblicità di uno o più brand: **niente monte, niente quote, zero
// nel P&L**.
//
// ---- Perché uno script e non solo l'interruttore ----
//
// L'interruttore c'è ed è in `/spese`, sulla scheda del brand. Questo script
// serve alla **prima applicazione**, quella decisa dall'utente il 23/08/2026 su
// B2B ed Experience: sono i due brand che in Marketing non hanno campagne, e le
// loro quote — scritte con la regola vecchia — sommavano 218,4% e 240%. Il P&L
// gli attribuiva 83.908 € di pubblicità contro un monte di 38.077, cioè soldi
// che nessuno ha mai speso.
//
// ⚠️ Non si esprime con un ROS a zero (sarebbe una divisione per zero) né
// lasciando le quote a zero: lì resterebbe un monte stimato che nessuno spende,
// e a schermo sembra budget disponibile.
//
// Uso:
//   npx tsx@4 --env-file=.env scripts/spegni-pubblicita-brand.ts <slug…>          → prova a vuoto
//   npx tsx@4 --env-file=.env scripts/spegni-pubblicita-brand.ts <slug…> scrivi   → applica

import { prisma } from "../src/lib/db";
import { ANNO_CORRENTE, advConsentitoMese, budgetAdvAnno, caricaAnno } from "../src/lib/calc";

const eur = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;

async function main() {
  const argomenti = process.argv.slice(2);
  const scrivi = argomenti.includes("scrivi");
  const slugs = argomenti.filter((a) => a !== "scrivi");
  if (slugs.length === 0) {
    console.log("Serve almeno uno slug di brand. Esempio: … spegni-pubblicita-brand.ts b2b experience");
    return;
  }

  const dati = await caricaAnno(ANNO_CORRENTE);
  console.log(`${scrivi ? "SCRITTURA" : "PROVA A VUOTO"} · anno ${ANNO_CORRENTE}\n`);

  let advTolta = 0;
  for (const slug of slugs) {
    const m = dati.maisons.find((x) => x.slug === slug);
    if (!m) {
      console.log(`«${slug}»: nessun brand con questo slug — saltato.`);
      continue;
    }
    if (!m.faPubblicita) {
      console.log(`${m.nome}: già senza pubblicità — niente da fare.`);
      continue;
    }
    const monte = budgetAdvAnno(m, ANNO_CORRENTE);
    const quote = m.mesi.reduce((s, x) => s + x.advPercent, 0);
    const attribuita = m.mesi.reduce((s, x) => s + advConsentitoMese(x, monte), 0);
    advTolta += attribuita;
    console.log(
      `${m.nome}: monte ${eur(monte)} · quote ${quote.toFixed(1)}% · ` +
        `il P&L gli attribuiva ${eur(attribuita)} → 0 €`
    );
    if (scrivi) {
      await prisma.maison.update({ where: { id: m.id }, data: { faPubblicita: false } });
      const esito = await prisma.advPercent.updateMany({
        where: { maisonId: m.id, percent: { not: 0 } },
        data: { percent: 0 },
      });
      console.log(`  → spento, ${esito.count} quote azzerate.`);
    }
  }

  const advPrima = dati.maisons.reduce(
    (s, m) => s + m.mesi.reduce((t, x) => t + advConsentitoMese(x, budgetAdvAnno(m, ANNO_CORRENTE)), 0),
    0
  );
  console.log(
    `\nPubblicità nel P&L: ${eur(advPrima)} → ${eur(advPrima - advTolta)} ` +
      `(${eur(-advTolta)}) · l'EBITDA si sposta dello stesso importo, in meglio.`
  );
  if (!scrivi) console.log("\nNiente è stato scritto. Per applicare: aggiungere «scrivi» al comando.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
