// **Le modifiche del 07/09 sono arrivate davvero sulle piattaforme?**
//
// Chiesto dall'utente l'08/09/2026. SOLA LETTURA: non scrive niente.
//
// La domanda non è «lo script ha risposto ok» — quello lo dice l'esito, e
// l'esito lo scrive chi esegue (trappola «la prova la scrive l'accusato»).
// La domanda è: **rileggendo la piattaforma, la modifica c'è?** La prova
// indipendente è il sync notturno, che ripassa da Google e riscrive le tabelle
// del censimento (NegativaCampagna, Campagna.statoPiattaforma, budget,
// CopyAnnuncio.statoPiattaforma). Se il sync di stanotte le vede, sono
// recepite; se non le vede, i 16 «rileggendo non risulta» di ieri sera erano
// rifiuti muti.
import { readFileSync } from "node:fs";
for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}
const { PrismaClient } = await import("@prisma/client");
const url = process.env.DATABASE_URL?.includes(":6543")
  ? process.env.DATABASE_URL + (process.env.DATABASE_URL.includes("?") ? "&" : "?") + "connection_limit=2&pool_timeout=20"
  : process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasourceUrl: url });

const DA = new Date(process.argv[2] ?? "2026-09-07T00:00:00.000Z");

const ops = await prisma.operazioneAdv.findMany({
  where: { OR: [{ creataIl: { gte: DA } }, { eseguitaIl: { gte: DA } }, { approvataIl: { gte: DA } }] },
  orderBy: { creataIl: "asc" },
});
console.log(`OPERAZIONI toccate dal 07/09: ${ops.length}\n`);

const perStato = {};
for (const o of ops) perStato[o.stato] = (perStato[o.stato] ?? 0) + 1;
console.log("per stato:", perStato);
const perTipo = {};
for (const o of ops) perTipo[`${o.canale}/${o.tipo}`] = (perTipo[`${o.canale}/${o.tipo}`] ?? 0) + 1;
console.log("per tipo:", perTipo, "\n");

// I sync: chi ha riletto la piattaforma, e quando
const ric = await prisma.ricezioneDati.findMany({
  where: { ricevutoIl: { gte: DA } },
  orderBy: { ricevutoIl: "asc" },
  select: { fonte: true, account: true, tipo: true, righe: true, campagne: true, esito: true, ricevutoIl: true },
});
console.log(`CONSEGNE dal 07/09: ${ric.length}`);
for (const r of ric) {
  console.log(`  ${r.ricevutoIl.toISOString().slice(5, 16)}  ${r.fonte.padEnd(11)} ${(r.account ?? "-").padEnd(14)} ${r.tipo.padEnd(12)} righe ${String(r.righe).padStart(6)} campagne ${String(r.campagne).padStart(4)} ${r.esito}`);
}
console.log();

// Dettaglio operazione per operazione
console.log("=== DETTAGLIO ===");
for (const o of ops) {
  const camp = o.campagnaId ? await prisma.campagna.findUnique({ where: { id: o.campagnaId }, select: { nome: true, account: true, stato: true, statoPiattaforma: true, budgetGiornaliero: true, aggiornataIl: true } }) : null;
  console.log(JSON.stringify({
    id: o.id,
    canale: o.canale,
    tipo: o.tipo,
    bersaglio: o.bersaglio,
    idEsterno: o.idEsterno,
    parametri: o.parametri,
    stato: o.stato,
    creata: o.creataIl?.toISOString(),
    approvata: o.approvataIl?.toISOString() ?? null,
    eseguita: o.eseguitaIl?.toISOString() ?? null,
    esito: o.esito?.slice(0, 320) ?? null,
    divergenzaAccettata: o.divergenzaAccettataIl?.toISOString() ?? null,
    campagna: camp ? { nome: camp.nome, account: camp.account, stato: camp.stato, piattaforma: camp.statoPiattaforma, budget: camp.budgetGiornaliero, aggiornata: camp.aggiornataIl?.toISOString() } : null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// LA PROVA INDIPENDENTE. L'esito lo scrive chi esegue; qui si rilegge il
// censimento riscritto dal sync notturno, che passa da Google.
console.log("\n=== NEGATIVE ESEGUITE: risultano nel censimento? ===");
for (const o of ops.filter((x) => x.tipo === "negativa" && x.stato === "eseguita")) {
  const p = JSON.parse(o.parametri ?? "{}");
  const trovate = await prisma.negativaCampagna.findMany({
    where: { campagna: o.bersaglio, testo: { equals: p.testo, mode: "insensitive" } },
    select: { corrispondenza: true, livello: true, gruppo: true, vistaIl: true, creataIl: true },
  });
  console.log(JSON.stringify({ campagna: o.bersaglio, testo: p.testo, chiesta: p.corrispondenza,
    eseguita: o.eseguitaIl?.toISOString(),
    trovate: trovate.map((t) => ({ m: t.corrispondenza, liv: t.livello, gruppo: t.gruppo, vista: t.vistaIl.toISOString().slice(0, 16), creata: t.creataIl.toISOString().slice(0, 16) })),
    esito: (o.esito ?? "").slice(0, 150) }));
}

console.log("\n=== CAMPAGNE TOCCATE: stato e budget letti da Google ===");
for (const nome of [...new Set(ops.map((o) => o.bersaglio))]) {
  const c = await prisma.campagna.findFirst({ where: { nome }, select: { nome: true, account: true, idEsterno: true, stato: true, statoPiattaforma: true, budgetGiornaliero: true, aggiornataIl: true } });
  if (c) console.log(JSON.stringify(c));
}

console.log("\n=== META: la coda ferma ===");
const meta = await prisma.operazioneAdv.findMany({ where: { canale: { not: "google_ads" }, stato: { in: ["approvata", "in_attesa"] } }, select: { tipo: true, bersaglio: true, stato: true, creataIl: true, approvataIl: true, eseguitaIl: true } });
for (const m of meta) console.log(JSON.stringify({ ...m, creataIl: m.creataIl.toISOString().slice(0, 16), approvataIl: m.approvataIl?.toISOString().slice(0, 16) ?? null }));

await prisma.$disconnect();
