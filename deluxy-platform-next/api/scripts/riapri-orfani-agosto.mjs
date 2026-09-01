/**
 * RIAPRE (invoiced=false) le consegne ORFANE di AGOSTO 2026: flag «fatturata»
 * dal legacy ma NESSUNA riga di fattura nella piattaforma. Le rimette in «da
 * fatturare» perché le emettiamo noi (regola utente 31/08). SOLO agosto, SOLO
 * gli orfani veri. Reversibile: salva gli id in scratchpad PRIMA di scrivere;
 * per annullare si rimette invoiced=true su quegli id. Anteprima di default,
 * scrive con --applica.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
const BACKUP = 'C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-app/b0b89068-1a6f-45f0-9c95-590c36e57e72/scratchpad/orfani-agosto-riaperti.json';

const NON = ['cancelled','not_delivered','invalidated','not_accepted'];
const orfani = await prisma.delivery.findMany({
  where: {
    invoiced: true, deletedAt: null, billable: true,
    status: { notIn: NON },
    invoiceLines: { none: {} },
    date: { gte: new Date('2026-08-01'), lt: new Date('2026-09-01') },
  },
  select: { id: true, code: true, price: true, partner: { select: { insegna: true } } },
});
console.log(`Orfani agosto trovati: ${orfani.length} (valore ~${Math.round(orfani.reduce((s,d)=>s+(d.price??0),0))} €)`);
if (!APPLICA) { console.log('ANTEPRIMA: niente scritto. Rilancia con --applica.'); await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync(BACKUP, JSON.stringify(orfani.map(d=>({ id:d.id, code:d.code })), null, 2));
console.log(`Id salvati per reversibilità in: ${BACKUP}`);
const r = await prisma.delivery.updateMany({ where: { id: { in: orfani.map(d=>d.id) } }, data: { invoiced: false } });
console.log(`RIAPERTE (invoiced=false) ${r.count} consegne: ora sono in «da fatturare».`);
await prisma.$disconnect();
