/**
 * SOSPENDE (deleted=true, «Sospeso») partner senza consegne da FATTURARE e valet
 * senza consegne da PAGARE dal 1/1/2025. Reversibile (Ricrea da /users).
 * Anteprima di default; scrive con --applica.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
const SOGLIA = new Date('2025-01-01T00:00:00.000Z');
const NON = ['cancelled','not_delivered','invalidated','not_accepted'];
const attP = await prisma.delivery.groupBy({ by:['partnerId'], where: { deletedAt:null, billable:true, status:{notIn:NON}, date:{gte:SOGLIA} } });
const setP = new Set(attP.map(x=>x.partnerId));
const partners = await prisma.partner.findMany({ where: { deleted:false }, select: { id:true } });
const pIds = partners.filter(p=>!setP.has(p.id)).map(p=>p.id);
const attV = await prisma.delivery.groupBy({ by:['valetId'], where: { deletedAt:null, payable:true, valetId:{not:null}, status:{notIn:NON}, date:{gte:SOGLIA} } });
const setV = new Set(attV.map(x=>x.valetId));
const valets = await prisma.valet.findMany({ where: { deleted:false, placeholder:false }, select: { id:true } });
const vIds = valets.filter(v=>!setV.has(v.id)).map(v=>v.id);
console.log(`partner da sospendere: ${pIds.length} | valet da sospendere: ${vIds.length}`);
if (!APPLICA) { console.log('ANTEPRIMA: niente scritto. Rilancia con --applica.'); await prisma.$disconnect(); process.exit(0); }
const rp = await prisma.partner.updateMany({ where: { id: { in: pIds } }, data: { deleted: true, active: false } });
const rv = await prisma.valet.updateMany({ where: { id: { in: vIds } }, data: { deleted: true, active: false } });
console.log(`SOSPESI: partner ${rp.count}, valet ${rv.count}`);
await prisma.$disconnect();
