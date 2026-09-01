/**
 * UNIFICA ARMANI (01/09/2026, richiesta utente): le consegne storiche delle due
 * schede «Armani Fiori» doppie (già sospese) passano alla scheda canonica.
 * Solo il puntatore partnerId: prezzi congelati, flag di fatturazione e tutto
 * il resto NON si toccano. «Armani Test» resta fuori (record di prova).
 * Anteprima di default; scrive con --applica.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const canonica = await prisma.partner.findFirst({ where: { insegna: 'Armani Fiori', deleted: false }, select: { id: true, insegna: true } });
const doppie = await prisma.partner.findMany({ where: { insegna: 'Armani Fiori', deleted: true }, select: { id: true } });
if (!canonica || !doppie.length) { console.log('Niente da unificare.'); process.exit(0); }
const ids = doppie.map((d) => d.id);
const n = await prisma.delivery.count({ where: { partnerId: { in: ids } } });
console.log(`Canonica: ${canonica.insegna} [${canonica.id.slice(-6)}] | doppie sospese: ${ids.length} | consegne da spostare: ${n}`);
if (!APPLICA) { console.log('ANTEPRIMA: niente scritto. Rilancia con --applica.'); await prisma.$disconnect(); process.exit(0); }
const r = await prisma.delivery.updateMany({ where: { partnerId: { in: ids } }, data: { partnerId: canonica.id } });
console.log(`SPOSTATE ${r.count} consegne sulla scheda canonica. Le schede doppie restano sospese (vuote).`);
await prisma.$disconnect();
