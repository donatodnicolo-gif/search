import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true`;
const prisma = new PrismaClient();
const d = await prisma.delivery.findFirst({ where: { code: 100093 },
  select: { id: true, serviceTypeId: true, serviceType: { select: { name: true } },
    provinceId: true, province: { select: { code: true, name: true } }, recipientAddress: true } });
console.log('consegna #100093:', JSON.stringify({ servizio: d?.serviceType?.name, provincia: d?.province?.code ?? d?.provinceId ?? 'NON SCRITTA' }));
const salazar = await prisma.valet.findFirst({ where: { lastName: { contains: 'alazar', mode: 'insensitive' } },
  select: { id: true, firstName: true, lastName: true, active: true,
    provinces: { select: { province: { select: { code: true } } } },
    services: { select: { serviceType: { select: { id: true, name: true } } } } } });
console.log('Salazar:', JSON.stringify({ nome: salazar?.firstName + ' ' + salazar?.lastName, attivo: salazar?.active,
  province: salazar?.provinces.map((p) => p.province.code),
  servizi: salazar?.services.map((s) => s.serviceType.name) }));
console.log('ha il servizio della consegna?', salazar?.services.some((s) => s.serviceType.id === d?.serviceTypeId));
// quanti valet di MI hanno quel servizio?
const conMI = await prisma.valet.count({ where: { active: true,
  provinces: { some: { province: { code: 'MI' } } },
  services: { some: { serviceTypeId: d.serviceTypeId } } } });
const soloMI = await prisma.valet.count({ where: { active: true, provinces: { some: { province: { code: 'MI' } } } } });
console.log(`valet attivi su MI: ${soloMI} · di cui col servizio «${d.serviceType?.name}»: ${conMI}`);
await prisma.$disconnect();
