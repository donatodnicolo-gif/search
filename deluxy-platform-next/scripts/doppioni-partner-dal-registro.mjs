// Usa il registro Anagrafiche per trovare i DOPPIONI nella piattaforma.
//
// L'idea: il registro tiene un record per azienda. Se due partner della
// piattaforma corrispondono allo stesso record del registro, allora in
// piattaforma la stessa azienda e' stata inserita due volte.
//
// E' il caso di "142 RESTAURANT" e "BEYOND 142 S.R.L.": due schede qui, una
// con l'insegna e una con la ragione sociale, mentre nel registro sono lo
// stesso partner. Il secondo e' disattivato, con P.IVA finta e senza province,
// quindi nel form consegna non compare — ma resta in giro e confonde.
//
// Non modifica niente: elenca e basta.

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (schema) =>
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=${schema}&pgbouncer=true&connection_limit=1`;

const pia = new PrismaClient({ datasources: { db: { url: url('platform') } } });
const reg = new PrismaClient({ datasources: { db: { url: url('anagrafiche') } } });

const partners = await pia.partner.findMany({
  select: {
    id: true, insegna: true, businessName: true, email: true, vatNumber: true, active: true,
    _count: { select: { deliveries: true } },
  },
});
const anagrafiche = await reg.$queryRawUnsafe(
  'select id, nome, "ragioneSociale", "pIva", email, attivo from "anagrafiche"."Partner"');

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
/** P.IVA palesemente finte: non identificano nessuno, non vanno usate per abbinare. */
const pivaFinta = (v) => !v || /^(\d)\1{6,}$/.test(String(v).trim()) || String(v).trim().length < 8;

// Indici del registro
const perPiva = new Map(), perEmail = new Map(), perNome = new Map();
for (const a of anagrafiche) {
  if (!pivaFinta(a.pIva)) perPiva.set(norm(a.pIva), a);
  if (a.email) perEmail.set(norm(a.email), a);
  for (const n of [a.nome, a.ragioneSociale].filter(Boolean)) perNome.set(norm(n), a);
}

// Ogni partner della piattaforma -> a quale anagrafica corrisponde
const gruppi = new Map();
let senzaCorrispondenza = 0;
for (const p of partners) {
  const a = (!pivaFinta(p.vatNumber) && perPiva.get(norm(p.vatNumber)))
    || (p.email && perEmail.get(norm(p.email)))
    || perNome.get(norm(p.insegna))
    || (p.businessName && perNome.get(norm(p.businessName)));
  if (!a) { senzaCorrispondenza++; continue; }
  (gruppi.get(a.id) ?? gruppi.set(a.id, { a, partner: [] }).get(a.id)).partner.push(p);
}

const doppi = [...gruppi.values()].filter((g) => g.partner.length > 1)
  .sort((x, y) => y.partner.length - x.partner.length);

console.log(`partner in piattaforma: ${partners.length} · anagrafiche: ${anagrafiche.length}`);
console.log(`abbinati a un'anagrafica: ${partners.length - senzaCorrispondenza} · senza corrispondenza: ${senzaCorrispondenza}\n`);
console.log(`🔴 STESSA AZIENDA, PIU' SCHEDE IN PIATTAFORMA: ${doppi.length} casi`);
console.log(`   partner coinvolti: ${doppi.reduce((s, g) => s + g.partner.length, 0)}\n`);

for (const g of doppi) {
  const reg = g.a.ragioneSociale && g.a.ragioneSociale !== g.a.nome
    ? `${g.a.nome} (${g.a.ragioneSociale})` : g.a.nome;
  console.log(`  nel registro: ${reg}`);
  for (const p of g.partner.sort((a, b) => b._count.deliveries - a._count.deliveries)) {
    console.log(`     ${p.active ? '●' : '○'} ${p.insegna.slice(0, 30).padEnd(32)}`
      + `consegne ${String(p._count.deliveries).padStart(5)} · P.IVA ${p.vatNumber ?? '—'}`);
  }
}
console.log('\n  ● attivo · ○ disattivato');

await pia.$disconnect();
await reg.$disconnect();
