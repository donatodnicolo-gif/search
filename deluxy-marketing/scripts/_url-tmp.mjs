import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const tot = await p.copyAnnuncio.count();
const conUrl = await p.copyAnnuncio.count({ where: { NOT: { finalUrl: null } } });
console.log(`CopyAnnuncio: ${tot} righe, ${conUrl} con finalUrl`);
const perTipo = await p.$queryRawUnsafe(
  `select tipo, count(*)::int as righe, count("finalUrl")::int as con_url from marketing."CopyAnnuncio" group by tipo order by 2 desc`
);
for (const t of perTipo) console.log(" ", t.tipo.padEnd(14), "righe", String(t.righe).padStart(5), "· con url", t.con_url);

const C = "cmrxo1aa7001ci61cbubejapu";
const camp = await p.campagna.findUnique({ where: { id: C }, select: { nome: true, landingId: true } });
console.log("\nCAMPAGNA:", camp?.nome);
const url = await p.$queryRawUnsafe(
  `select "finalUrl", count(*)::int as annunci, sum(coalesce(spesa,0))::float as spesa, sum(coalesce(clic,0))::int as clic
   from marketing."CopyAnnuncio" where campagna = $1 and "finalUrl" is not null group by 1 order by 2 desc`,
  camp?.nome
);
console.log("URL distinti sugli annunci di questa campagna:", url.length);
for (const u of url) console.log("  ", u.annunci, "annunci ·", u.spesa.toFixed(2), "€ ·", u.clic, "clic ·", u.finalUrl);

console.log("\nLandingPage censite:", await p.landingPage.count());
await p.$disconnect();
