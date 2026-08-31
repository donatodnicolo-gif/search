/**
 * MIGRAZIONE (31/08/2026): aggiunge a platform.Invoice i due campi del ponte
 * verso FINANCE — financeRef (id/numero della bozza pro-forma) e financeSentAt.
 * Colonne NULLABLE su una tabella di proprietà della piattaforma: nessun lock
 * significativo, nessuna app terza la legge. Idempotente (IF NOT EXISTS).
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(`ALTER TABLE "platform"."Invoice" ADD COLUMN IF NOT EXISTS "financeRef" TEXT`);
await prisma.$executeRawUnsafe(`ALTER TABLE "platform"."Invoice" ADD COLUMN IF NOT EXISTS "financeSentAt" TIMESTAMP(3)`);
console.log('OK: colonne financeRef, financeSentAt presenti su platform.Invoice');
await prisma.$disconnect();
