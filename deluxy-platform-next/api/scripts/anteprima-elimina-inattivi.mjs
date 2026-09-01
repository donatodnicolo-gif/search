import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
const SOGLIA = new Date('2025-01-01T00:00:00.000Z');
const NON = ['cancelled','not_delivered','invalidated','not_accepted'];
// partner CON almeno una consegna fatturabile dal 2025
const attP = await prisma.delivery.groupBy({ by:['partnerId'], where: { deletedAt:null, billable:true, status:{notIn:NON}, date:{gte:SOGLIA} } });
const setP = new Set(attP.map(x=>x.partnerId));
const partners = await prisma.partner.findMany({ where: { deleted:false }, select: { id:true, insegna:true } });
const pElim = partners.filter(p=>!setP.has(p.id)).map(p=>p.insegna).sort();
// valet CON almeno una consegna pagabile dal 2025
const attV = await prisma.delivery.groupBy({ by:['valetId'], where: { deletedAt:null, payable:true, valetId:{not:null}, status:{notIn:NON}, date:{gte:SOGLIA} } });
const setV = new Set(attV.map(x=>x.valetId));
const valets = await prisma.valet.findMany({ where: { deleted:false, placeholder:false }, select: { id:true, firstName:true, lastName:true } });
const vElim = valets.filter(v=>!setV.has(v.id)).map(v=>`${v.lastName} ${v.firstName}`).sort();
console.log(`PARTNER da eliminare (0 da fatturare dal 2025): ${pElim.length} su ${partners.length}`);
console.log('  ' + pElim.join(' · '));
console.log(`\nVALET da eliminare (0 da pagare dal 2025): ${vElim.length} su ${valets.length}`);
console.log('  ' + vElim.join(' · '));
await prisma.$disconnect();
