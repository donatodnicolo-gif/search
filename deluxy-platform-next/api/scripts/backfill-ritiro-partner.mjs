/**
 * BACKFILL RITIRO (31/08/2026, chiesto dall'utente): le consegne senza indirizzo
 * di ritiro prendono l'indirizzo del LORO partner (stessa riga). Riempie solo i
 * vuoti, non sovrascrive un ritiro già presente. Anteprima di default; scrive
 * con --applica. Le vie di creazione ora lo fanno da sole: questo copre lo storico.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const COND = `(d."pickupAddress" IS NULL OR btrim(d."pickupAddress") = '') AND p."address" IS NOT NULL AND btrim(p."address") <> ''`;

const tot = await prisma.$queryRawUnsafe(
  `SELECT count(*)::int AS n FROM "platform"."Delivery" d JOIN "platform"."Partner" p ON d."partnerId"=p."id" WHERE ${COND}`
);
// Senza partner o con partner senza indirizzo: restano vuote (non si inventa).
const orfane = await prisma.$queryRawUnsafe(
  `SELECT count(*)::int AS n FROM "platform"."Delivery" d LEFT JOIN "platform"."Partner" p ON d."partnerId"=p."id" WHERE (d."pickupAddress" IS NULL OR btrim(d."pickupAddress")='') AND (p."id" IS NULL OR p."address" IS NULL OR btrim(p."address")='')`
);
console.log(`Consegne senza ritiro riempibili dal partner: ${tot[0].n}`);
console.log(`Consegne senza ritiro NON riempibili (partner senza indirizzo): ${orfane[0].n}`);

if (!APPLICA) { console.log('ANTEPRIMA: niente scritto. Rilancia con --applica.'); await prisma.$disconnect(); process.exit(0); }

const n = await prisma.$executeRawUnsafe(
  `UPDATE "platform"."Delivery" d SET "pickupAddress" = p."address" FROM "platform"."Partner" p WHERE d."partnerId" = p."id" AND ${COND}`
);
console.log(`RITIRO RIEMPITO su ${n} consegne.`);
await prisma.$disconnect();
