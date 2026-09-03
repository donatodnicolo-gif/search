/**
 * SOLA LETTURA: che cosa vede OGGI in Consegne un team leader con Milano in
 * ambito (03/09, richiesta utente) — stesso OR del server:
 * [le SUE consegne] ∪ [provinceId ∈ province di responsabilità].
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}
const idj = (t) => { if (!t) return []; try { const v = JSON.parse(t); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []; } catch { return []; } };

const mi = await prisma.province.findFirst({ where: { code: 'MI' }, select: { id: true } });
const tls = await prisma.valet.findMany({
  where: { isTeamLeader: true, active: true, deleted: false },
  select: { id: true, firstName: true, lastName: true, teamLeaderProvinces: true, provinces: { select: { provinceId: true } } },
});
const conMi = tls.filter((v) => {
  const dich = idj(v.teamLeaderProvinces);
  const ambito = dich.length ? dich : v.provinces.map((x) => x.provinceId);
  return ambito.includes(mi.id);
});
console.log('TL attivi con Milano in ambito:', conMi.map((v) => v.firstName + ' ' + v.lastName).join(', ') || 'nessuno');
const tl = conMi[0];
if (tl) {
  const dich = idj(tl.teamLeaderProvinces);
  const provIds = dich.length ? dich : tl.provinces.map((x) => x.provinceId);
  const codes = await prisma.province.findMany({ where: { id: { in: provIds } }, select: { code: true } });
  console.log('Ambito di', tl.lastName + ':', codes.map((c) => c.code).join(', '));
  const rows = await prisma.delivery.findMany({
    where: { deletedAt: null, date: { gte: new Date('2026-09-03'), lt: new Date('2026-09-04') },
      OR: [{ valetId: tl.id }, { provinceId: { in: provIds } }] },
    select: { code: true, status: true, deliveryTimeFrom: true, recipientAddress: true, valetId: true,
      partner: { select: { insegna: true } }, serviceType: { select: { name: true } },
      valet: { select: { lastName: true } }, province: { select: { code: true } } },
    orderBy: { code: 'asc' },
  });
  for (const r of rows) {
    const perche = r.valetId === tl.id ? 'SUA' : 'prov. ' + (r.province?.code ?? '?');
    console.log(['#' + r.code, (r.partner?.insegna ?? '—'), (r.serviceType?.name ?? '—'), r.deliveryTimeFrom ?? '—',
      (r.recipientAddress ?? '—').slice(0, 40), (r.valet?.lastName ?? 'da assegnare'), r.status, perche].join(' | '));
  }
  console.log('tot su «Tutte» oggi:', rows.length, '· di cui SUE:', rows.filter((r) => r.valetId === tl.id).length);
}
await prisma.$disconnect();
