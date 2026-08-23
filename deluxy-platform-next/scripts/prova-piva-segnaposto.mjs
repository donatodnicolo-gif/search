// La vista d'insieme abbina per P.IVA con una mappa: perPiva.set(pIva, record).
// Se il registro contiene un record con la P.IVA segnaposto 11111111111,
// allora TUTTI i partner della piattaforma che portano quello stesso
// segnaposto risultano «abbinabili» a quell'unico record — cioe' a un'azienda
// che non c'entra nulla. Qui si conta se il caso e' reale.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (s) => `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=${s}&pgbouncer=true&connection_limit=1`;
const pia = new PrismaClient({ datasources: { db: { url: url('platform') } } });
const reg = new PrismaClient({ datasources: { db: { url: url('anagrafiche') } } });

const finta = (v) => { const p = (v ?? '').trim(); return p.length >= 1 && (/^(\d)\1+$/.test(p) || p.length < 8); };

const pPart = await pia.partner.findMany({ select: { insegna: true, vatNumber: true, active: true, _count: { select: { deliveries: true } } } });
const rPart = await reg.$queryRawUnsafe('select nome, "ragioneSociale", "pIva" from "anagrafiche"."Partner" where "pIva" is not null');

const gruppi = new Map();
for (const p of pPart) if (finta(p.vatNumber)) {
  const k = p.vatNumber.trim();
  (gruppi.get(k) ?? gruppi.set(k, []).get(k)).push(p);
}
console.log('P.IVA NON ATTENDIBILI IN PIATTAFORMA');
for (const [k, v] of [...gruppi].sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${k.padEnd(14)} su ${String(v.length).padStart(3)} partner (${v.filter((x) => x.active).length} attivi, ${v.reduce((s, x) => s + x._count.deliveries, 0)} consegne)`);
if (!gruppi.size) console.log('  nessuna');

console.log('\nSTESSA P.IVA NEL REGISTRO?');
let danno = 0;
for (const [k, v] of gruppi) {
  const c = rPart.filter((r) => (r.pIva ?? '').trim() === k);
  if (c.length) {
    danno += v.length;
    console.log(`  🔴 ${k} → nel registro e' di «${c[0].nome}»: ${v.length} partner della piattaforma`);
    console.log(`     verrebbero dichiarati abbinabili a quell'azienda: ${v.slice(0, 8).map((x) => x.insegna).join(' · ')}${v.length > 8 ? ' …' : ''}`);
  } else console.log(`  ✅ ${k} non esiste nel registro (nessun abbinamento sbagliato)`);
}
console.log(`\n  partner che oggi verrebbero abbinati all'azienda sbagliata: ${danno}`);
await pia.$disconnect(); await reg.$disconnect();
