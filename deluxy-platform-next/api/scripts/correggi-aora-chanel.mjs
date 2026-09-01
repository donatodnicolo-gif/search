/**
 * CORREGGE le 4 consegne di Chanel Sant'Andrea nate sul «Servizio a Ora» per
 * errore (utente 01/09: «Sistema»): passano al Servizio Consegna Standard, col
 * prezzo del listino (18 + eventuali km oltre i 4 inclusi della scheda) e la
 * paga valet azzerata (gli stipendi la rifanno dal listino del valet). Ogni
 * cambio lascia una riga nel registro della consegna.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
const std = await prisma.serviceType.findFirst({ where: { name: 'Servizio Consegna Standard' }, select: { id: true } });
const p = await prisma.partner.findFirst({ where: { insegna: "Chanel Milano Sant'Andrea" }, select: { id: true, kmIncluded: true } });
const ps = await prisma.partnerService.findUnique({ where: { partnerId_serviceTypeId: { partnerId: p.id, serviceTypeId: std.id } } });
const inclusi = (ps.includedKm ?? 0) > 0 ? ps.includedKm : (p.kmIncluded ?? 0);
for (const code of [100810, 100774, 100559, 100558]) {
  const d = await prisma.delivery.findFirst({ where: { code }, select: { id: true, distanceKm: true, price: true, serviceTypeId: true } });
  if (!d || d.serviceTypeId === std.id) { console.log(`#${code}: già a posto`); continue; }
  const dist = d.distanceKm ?? 0;
  const extra = Math.max(0, dist - inclusi);
  const prezzo = Math.round((ps.price + extra * (ps.extraKmPrice ?? 0)) * 100) / 100;
  await prisma.delivery.update({ where: { id: d.id }, data: {
    serviceTypeId: std.id, price: prezzo, extraKm: Math.round(extra * 10) / 10, hours: null, valetSalary: null,
    logs: { create: [{ type: 'service_fix', message: `Servizio corretto: «Servizio a Ora» (25) → «Servizio Consegna Standard» (${prezzo}). Scelta involontaria del partner nel form (01/09).` }] },
  } });
  console.log(`#${code}: a Ora 25 → Standard ${prezzo} (dist ${dist}, extra ${extra})`);
}
await prisma.$disconnect();
