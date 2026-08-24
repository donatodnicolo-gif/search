#!/usr/bin/env node
// Crea (o ruota) la chiave API app-to-app di un'app Deluxy sulla piattaforma.
//
//   node scripts/crea-chiave-app.mjs deluxy-orders
//   node scripts/crea-chiave-app.mjs deluxy-messaging --scrittura
//
// La chiave si vede UNA VOLTA, qui sotto: nel database resta solo lo SHA-256
// (standard Deluxy §4). Rilanciare con lo stesso nome RUOTA la chiave: quella
// vecchia smette di valere nell'istante in cui questa viene salvata.
//
// ⚠️ Va lanciato con la DATABASE_URL dell'ambiente giusto: in locale l'.env di
// questa cartella è SQLite di sviluppo — per la produzione esportare prima la
// stringa del cluster (schema=platform), senza mai scriverla in un file.

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const nome = process.argv[2];
const scrittura = process.argv.includes('--scrittura');
if (!nome || nome.startsWith('--')) {
  console.error('Uso: node scripts/crea-chiave-app.mjs <nome-app> [--scrittura]');
  process.exit(1);
}

const chiave = `dlxp_${randomBytes(24).toString('base64url')}`;
const hash = createHash('sha256').update(chiave).digest('hex');

const prisma = new PrismaClient();
try {
  await prisma.appApiKey.upsert({
    where: { nome },
    create: { nome, hash, scrittura, attiva: true },
    update: { hash, scrittura, attiva: true, ultimoUso: null },
  });
  console.log(`\nChiave per «${nome}»${scrittura ? ' (con scrittura)' : ''} — copiala ORA, non si rivede:\n`);
  console.log(`  ${chiave}\n`);
  console.log('Va nelle variabili d’ambiente dell’app che chiama (es. PLATFORM_API_KEY su Vercel).');
} finally {
  await prisma.$disconnect();
}
