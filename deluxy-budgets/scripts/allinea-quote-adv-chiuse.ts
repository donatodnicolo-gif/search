// Allinea le quote ADV dei **mesi già chiusi** a quello che è stato speso davvero.
//
// ---- Perché serve ----
//
// Dal 23/08/2026 la percentuale di `/spese` vuol dire «quota del budget
// pubblicitario dell'anno», non più «% del venduto di quel mese». Le quote
// scritte con la regola vecchia sono rimaste a database, e siccome i mesi chiusi
// sono **in sola lettura** nessuno può correggerle dall'interfaccia.
//
// Effetto misurato il 23/08/2026: il P&L attribuiva ai mesi chiusi **255.907 €**
// di pubblicità quando ne erano usciti **124.093** — più del doppio — e l'EBITDA
// ne usciva peggiore di 132.000 €. In `/spese` il problema non si vedeva, perché
// lì i mesi chiusi mostrano la quota **davvero consumata**: quella è la lettura,
// il database aveva ancora l'altra.
//
// ---- Cosa fa, e cosa non fa ----
//
//   quota nuova = speso davvero nel mese ÷ monte pubblicitario dell'anno × 100
//
// Tocca **solo** i mesi chiusi, **solo** il campo `percent`, e **solo** dove
// Marketing ha una misura: per B2B ed Experience, che campagne non ne fanno, non
// cambia niente — una quota non si sostituisce con un dato che non esiste.
// I mesi aperti non si toccano: quelli sono decisioni, e le prende l'utente.
//
// ⚠️ Il monte annuo si muove con le vendite (è `vendite ÷ ROS`), quindi la quota
// scritta oggi riproduce lo speso di oggi: se le vendite cambiano molto, il
// riallineamento va rifatto. È il prezzo di tenere una **quota** invece di un
// importo, ed è la stessa ragione per cui la quota è la cosa giusta da salvare.
//
// Uso:
//   npx tsx@4 --env-file=.env scripts/allinea-quote-adv-chiuse.ts          → prova a vuoto
//   npx tsx@4 --env-file=.env scripts/allinea-quote-adv-chiuse.ts scrivi   → applica

import { prisma } from "../src/lib/db";
import { ANNO_CORRENTE, budgetAdvAnno, caricaAnno } from "../src/lib/calc";
import { fetchSpesaPerBrand } from "../src/lib/marketing";
import { primoMeseAperto } from "../src/lib/periodo";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const eur = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;
const pc = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;

async function main() {
  const scrivi = process.argv.includes("scrivi");
  const anno = ANNO_CORRENTE;
  const dati = await caricaAnno(anno);
  const aperto = primoMeseAperto(anno);
  const mesiChiusi = Array.from({ length: aperto - 1 }, (_, i) => i + 1).filter((m) => m <= 12);

  if (mesiChiusi.length === 0) {
    console.log("Nessun mese chiuso: non c'è niente da allineare.");
    return;
  }

  const spesa = await fetchSpesaPerBrand(anno, mesiChiusi);
  if (!spesa.ok) {
    console.log("Marketing non ha risposto: senza la spesa vera non si scrive niente.");
    return;
  }

  console.log(
    `${scrivi ? "SCRITTURA" : "PROVA A VUOTO"} · anno ${anno} · mesi chiusi ${MESI[0]}–${MESI[aperto - 2]}\n`
  );

  let cambiate = 0;
  let primaTot = 0;
  let dopoTot = 0;

  for (const m of dati.maisons) {
    const speso = spesa.perMaison.get(m.slug);
    const monte = budgetAdvAnno(m, anno);
    if (!speso || monte <= 0) {
      console.log(`${m.nome}: nessuna misura in Marketing — lasciato com'è.`);
      continue;
    }
    console.log(`${m.nome} · monte pubblicitario ${eur(monte)}`);
    for (const mese of mesiChiusi) {
      const x = m.mesi.find((y) => y.month === mese);
      if (!x) continue;
      const vero = speso[mese - 1];
      if (vero === null || vero === undefined) {
        console.log(`  ${MESI[mese - 1]}: mese non misurato — lasciato com'è.`);
        continue;
      }
      const prima = x.advPercent;
      const dopo = (vero / monte) * 100;
      primaTot += (monte * prima) / 100;
      dopoTot += vero;
      if (Math.abs(prima - dopo) < 0.05) continue;
      cambiate++;
      console.log(
        `  ${MESI[mese - 1]}: ${pc(prima)} → ${pc(dopo)}   ` +
          `(${eur((monte * prima) / 100)} → ${eur(vero)} davvero spesi)`
      );
      if (scrivi) {
        await prisma.advPercent.upsert({
          where: { year_maisonId_month: { year: anno, maisonId: m.id, month: mese } },
          update: { percent: dopo },
          create: { year: anno, maisonId: m.id, month: mese, percent: dopo },
        });
      }
    }
  }

  console.log(
    `\n${cambiate} quote ${scrivi ? "riscritte" : "da riscrivere"} · ` +
      `pubblicità dei mesi chiusi ${eur(primaTot)} → ${eur(dopoTot)} (${eur(dopoTot - primaTot)})`
  );
  if (!scrivi) console.log("\nNiente è stato scritto. Per applicare: aggiungere «scrivi» al comando.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
