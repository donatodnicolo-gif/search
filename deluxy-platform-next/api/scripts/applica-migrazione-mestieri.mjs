/**
 * MESTIERI (06/09/2026, decisione utente «vai con 8 mestieri, cake e pasticceria separati»).
 * 1) tabelle Mestiere e PartnerMestiere, colonne Category.mestiereId, PriorityList.mestiereId
 *    (+ categoryId che diventa facoltativo), Partner.minimoOrdineVendita / raggioMaxConsegnaKm;
 * 2) semina gli 8 mestieri; 3) colloca le 65 categorie per nome; 4) propone i mestieri
 *    dei partner dalle categorie che hanno (origine «categorie») e dalle vendite accettate
 *    negli ultimi 12 mesi (origine «storico»).
 * Solo CREATE/ALTER IF NOT EXISTS e INSERT ... ON CONFLICT DO NOTHING: idempotente, niente
 * righe esistenti riscritte. Uso: node scripts/applica-migrazione-mestieri.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
const q = (s, ...a) => p.$executeRawUnsafe(s, ...a);

// 1) schema
await q(`CREATE TABLE IF NOT EXISTS platform."Mestiere" (
  "id" TEXT PRIMARY KEY, "chiave" TEXT NOT NULL UNIQUE, "nome" TEXT NOT NULL, "ordine" INTEGER NOT NULL DEFAULT 0,
  "smistamentoAutomatico" BOOLEAN NOT NULL DEFAULT false, "attivo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS platform."PartnerMestiere" (
  "id" TEXT PRIMARY KEY, "partnerId" TEXT NOT NULL REFERENCES platform."Partner"("id") ON DELETE CASCADE,
  "mestiereId" TEXT NOT NULL REFERENCES platform."Mestiere"("id"), "origine" TEXT NOT NULL DEFAULT 'ufficio',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("partnerId", "mestiereId"))`);
await q(`ALTER TABLE platform."Category" ADD COLUMN IF NOT EXISTS "mestiereId" TEXT REFERENCES platform."Mestiere"("id")`);
await q(`ALTER TABLE platform."PriorityList" ADD COLUMN IF NOT EXISTS "mestiereId" TEXT REFERENCES platform."Mestiere"("id")`);
await q(`ALTER TABLE platform."PriorityList" ALTER COLUMN "categoryId" DROP NOT NULL`);
await q(`CREATE UNIQUE INDEX IF NOT EXISTS "PriorityList_provinceId_mestiereId_key" ON platform."PriorityList" ("provinceId", "mestiereId")`);
await q(`ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "minimoOrdineVendita" DOUBLE PRECISION`);
await q(`ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "raggioMaxConsegnaKm" DOUBLE PRECISION`);
console.log('✓ schema');

// 2) gli 8 mestieri (+ «interni», non smistabile, per Magazzino/Servizi/Richieste speciali)
const MESTIERI = [
  ['fiorista', 'Fiorista', 1, true],
  ['cake_designer', 'Cake designer', 2, false],
  ['pasticceria', 'Pasticceria', 3, false],
  ['originali', 'Originali Deluxy (composti)', 4, false],
  ['gastronomia', 'Gastronomia & catering', 5, false],
  ['enoteca', 'Enoteca', 6, false],
  ['regali', 'Regali & oggetti', 7, false],
  ['feste', 'Feste', 8, false],
  ['interni', 'Deluxy interni (non si smista)', 99, false],
];
const cuid = () => 'cm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
for (const [chiave, nome, ordine, auto] of MESTIERI) {
  await q(`INSERT INTO platform."Mestiere" ("id","chiave","nome","ordine","smistamentoAutomatico","attivo") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("chiave") DO NOTHING`, cuid(), chiave, nome, ordine, auto, chiave !== 'interni');
}
const mest = Object.fromEntries((await p.$queryRawUnsafe(`SELECT id, chiave FROM platform."Mestiere"`)).map((m) => [m.chiave, m.id]));
console.log('✓ mestieri:', Object.keys(mest).length);

// 3) categorie → mestiere, per nome (solo quelle ancora senza mestiere)
const MAPPA = {
  fiorista: ['Fiori (2)', 'Fiori Classici', "Fiori d'Arte", 'Rose', 'Cappelliere', 'Cesti Floreali', 'Fiori', 'Fiori in Vaso', 'Terrarium', 'Ghirlande', 'Rosa Eterna', 'Piante', 'Abbonamento Fiori'],
  cake_designer: ['Cake Design', 'CDM Torte', 'CDM FunnyCake', 'CDM Cream Tart', 'CDM Adulti', 'CDM Romantiche', 'CDM Domani', 'CDM Nascite e Battesimi', 'CDM Bambini', 'CDM Matrimoni', 'CDM Laurea', 'CDM Pasqua', 'CDM Natale', 'CDM Halloween', 'CDM Brand', 'CDM Squadre'],
  pasticceria: ['Torte (2)', 'Torte', 'Dolci', 'Dolci di Natale', 'Dolci di Pasqua', 'Colazioni & Brunch'],
  originali: ['Originali Deluxy'],
  gastronomia: ['Gastronomia', 'Cene', 'Degustazioni & Aperitivi', 'B2B Colazione', 'B2B Lunch', 'B2B Break', 'B2B Aperitivo', 'Lunch', 'Break'],
  enoteca: ['Vini', 'Spirits'],
  regali: ['Regali personalizzabili', 'Peluche', 'Gift Boutique', 'Giochi', 'Arte', 'Borse', 'Box Regalo', 'Accessori', 'Personalizzazioni', 'SACCHETTI', 'Regalistica Natale 2026'],
  feste: ['Palloncini'],
  interni: ['Magazzino', 'Servizi Deluxy', 'Richieste Speciali', 'Boutique Activation', 'Speciali', '(NO) Test Categoria'],
};
let collocate = 0;
for (const [chiave, nomi] of Object.entries(MAPPA)) {
  for (const nome of nomi) {
    const r = await q(`UPDATE platform."Category" SET "mestiereId" = $1 WHERE name = $2 AND "mestiereId" IS NULL`, mest[chiave], nome);
    collocate += r;
  }
}
const senza = await p.$queryRawUnsafe(`SELECT name FROM platform."Category" WHERE "mestiereId" IS NULL`);
console.log('✓ categorie collocate ora:', collocate, '| ancora da assegnare:', senza.map((s) => s.name).join(', ') || 'nessuna');

// 4) mestieri dei partner: dalle categorie che hanno, e dalle vendite accettate (12 mesi)
const daCategorie = await q(`INSERT INTO platform."PartnerMestiere" ("id","partnerId","mestiereId","origine")
  SELECT 'pm' || substr(md5(pc."partnerId" || c."mestiereId"), 1, 20), pc."partnerId", c."mestiereId", 'categorie'
  FROM platform."PartnerCategory" pc JOIN platform."Category" c ON c.id = pc."categoryId" JOIN platform."Partner" pa ON pa.id = pc."partnerId"
  WHERE c."mestiereId" IS NOT NULL AND c."mestiereId" <> $1 AND NOT pa.deleted
  ON CONFLICT ("partnerId","mestiereId") DO NOTHING`, mest.interni);
const daStorico = await q(`INSERT INTO platform."PartnerMestiere" ("id","partnerId","mestiereId","origine")
  SELECT DISTINCT 'ps' || substr(md5(s."partnerId" || c."mestiereId"), 1, 20), s."partnerId", c."mestiereId", 'storico'
  FROM platform."Sale" s JOIN platform."Product" pr ON pr.id = s."productId" JOIN platform."Category" c ON c.id = pr."categoryId" JOIN platform."Partner" pa ON pa.id = s."partnerId"
  WHERE s.status = 'accettata' AND s."createdAt" >= now() - interval '12 months' AND c."mestiereId" IS NOT NULL AND c."mestiereId" <> $1 AND NOT pa.deleted
  ON CONFLICT ("partnerId","mestiereId") DO NOTHING`, mest.interni);
const rie = await p.$queryRawUnsafe(`SELECT m.nome, count(pm.id)::int AS partner FROM platform."Mestiere" m LEFT JOIN platform."PartnerMestiere" pm ON pm."mestiereId" = m.id LEFT JOIN platform."Partner" pa ON pa.id = pm."partnerId" AND pa.active AND NOT pa.deleted GROUP BY m.nome, m.ordine ORDER BY m.ordine`);
const senzaM = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."Partner" pa WHERE pa.active AND NOT pa.deleted AND NOT EXISTS (SELECT 1 FROM platform."PartnerMestiere" pm WHERE pm."partnerId" = pa.id)`);
console.log('✓ partner-mestiere: da categorie +' + daCategorie + ', da storico +' + daStorico);
for (const r of rie) console.log('   ', r.nome, '→', r.partner, 'partner attivi');
console.log('   partner attivi ancora senza mestiere:', senzaM[0].n);
await p.$disconnect();
