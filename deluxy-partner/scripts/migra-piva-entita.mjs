// Migrazione una-tantum: indice P.IVA → partner per il Registro fatture.
//
// Crea la tabella FINANCE "PartnerPivaEntita" (soggetti fiscali di ogni partner:
// un partner può averne più d'uno — es. «Tiffany» ha la S.p.A. italiana e
// l'entità NL), la riempie dai `partner.pIva` già presenti e ci semina le due
// entità di Tiffany. Il Registro fatture aggancia il cliente PRIMA per P.IVA e
// solo in mancanza per nome.
//
// ⚠️ Tabella gestita via SQL raw, NON in schema.prisma (che è editato in
// parallelo da un'altra sessione). Una `prisma db push` la vedrebbe «di troppo»:
// non toglierla. È idempotente: si può rilanciare senza danni.
//
// Uso, dalla cartella deluxy-partner:
//   node --env-file=.env scripts/migra-piva-entita.mjs
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const norm = (s) => (s || "").toUpperCase().replace(/[\s.]/g, "");

async function main() {
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "public"."PartnerPivaEntita" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "partnerId" TEXT NOT NULL,
      "pIva" TEXT NOT NULL,
      "nome" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPivaEntita_piva_key" ON "public"."PartnerPivaEntita" ("pIva");`);
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PartnerPivaEntita_partner_idx" ON "public"."PartnerPivaEntita" ("partnerId");`);
  console.log("Tabella PartnerPivaEntita pronta.");

  // Backfill dai partner con P.IVA locale (identità primaria).
  const conPiva = await p.partner.findMany({
    where: { pIva: { not: null } },
    select: { id: true, pIva: true, ragioneSociale: true, nome: true },
  });
  let ins = 0;
  for (const pt of conPiva) {
    const n = norm(pt.pIva);
    if (!n) continue;
    ins += await p.$executeRaw`
      INSERT INTO "public"."PartnerPivaEntita" ("partnerId","pIva","nome")
      VALUES (${pt.id}, ${n}, ${pt.ragioneSociale ?? pt.nome})
      ON CONFLICT ("pIva") DO NOTHING;`;
  }
  console.log(`Backfill: ${conPiva.length} partner con P.IVA, ${ins} inseriti.`);

  // Seed Tiffany: due soggetti fiscali sullo stesso partner.
  const tif = await p.partner.findFirst({
    where: { nome: { equals: "TIFFANY", mode: "insensitive" } },
    select: { id: true, pIva: true },
  });
  if (tif) {
    if (!tif.pIva) {
      await p.partner.update({ where: { id: tif.id }, data: { pIva: "09985080150" } });
      console.log("Impostata P.IVA primaria di Tiffany: 09985080150 (S.p.A. italiana).");
    }
    for (const [piva, nome] of [
      ["09985080150", "Tiffany & Co. Italia S.p.A."],
      ["NL822203893B01", "Tiffany & Co. (NL)"],
    ]) {
      await p.$executeRaw`
        INSERT INTO "public"."PartnerPivaEntita" ("partnerId","pIva","nome")
        VALUES (${tif.id}, ${norm(piva)}, ${nome})
        ON CONFLICT ("pIva") DO UPDATE SET "partnerId" = EXCLUDED."partnerId", "nome" = EXCLUDED."nome";`;
    }
    console.log(`Seed Tiffany OK (partnerId ${tif.id}): IT09985080150 + NL822203893B01.`);
  } else {
    console.log("Partner TIFFANY non trovato: seed saltato.");
  }

  const tot = await p.$queryRawUnsafe(`SELECT count(*)::int AS c FROM "public"."PartnerPivaEntita";`);
  console.log(`Righe totali nell'indice P.IVA: ${tot[0].c}.`);
}

main()
  .catch((e) => {
    console.error("ERRORE:", e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
