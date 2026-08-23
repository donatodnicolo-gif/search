// Quanti partner della piattaforma si riescono ad abbinare al registro, e
// COME: con quale criterio. Serve a capire se i 184 "senza corrispondenza"
// sono davvero assenti dal registro o solo scritti in modo diverso.
//
// Il caso che ha fatto nascere lo script: in piattaforma "BEYOND 142 S.R.L.",
// nel registro "BEYOND 142 SRL". Stessa azienda, due puntini di differenza.

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

const partners = await pia.partner.findMany({
  select: { id: true, insegna: true, businessName: true, email: true, vatNumber: true, active: true,
            _count: { select: { deliveries: true } } } });
const anag = await reg.$queryRawUnsafe('select id, nome, "ragioneSociale", "pIva", email from "anagrafiche"."Partner"');

const bassa = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const finta = (v) => !v || /^(\d)\1{6,}$/.test(String(v).trim()) || String(v).trim().length < 8;
/** Toglie forma societaria e punteggiatura: "BEYOND 142 S.R.L." -> "beyond 142". */
const nudo = (v) => bassa(v)
  .replace(/[.,'`"()]/g, ' ')
  .replace(/\b(s\s*r\s*l|srls|s\s*p\s*a|s\s*a\s*s|s\s*n\s*c|societa|soc|di|the)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

const piva = new Map(), mail = new Map(), esatto = new Map(), ridotto = new Map();
for (const a of anag) {
  if (!finta(a.pIva)) piva.set(bassa(a.pIva), a);
  if (a.email) mail.set(bassa(a.email), a);
  for (const n of [a.nome, a.ragioneSociale].filter(Boolean)) {
    esatto.set(bassa(n), a);
    if (nudo(n)) ridotto.set(nudo(n), a);
  }
}
const criteri = { 'P.IVA': 0, 'email': 0, 'nome esatto': 0, 'nome semplificato': 0 };
const orfani = [];
for (const p of partners) {
  const nomi = [p.insegna, p.businessName].filter(Boolean);
  if (!finta(p.vatNumber) && piva.get(bassa(p.vatNumber))) criteri['P.IVA']++;
  else if (p.email && mail.get(bassa(p.email))) criteri['email']++;
  else if (nomi.some((n) => esatto.get(bassa(n)))) criteri['nome esatto']++;
  else if (nomi.some((n) => ridotto.get(nudo(n)))) criteri['nome semplificato']++;
  else orfani.push(p);
}
console.log(`piattaforma ${partners.length} partner · registro ${anag.length}\n`);
for (const [k, v] of Object.entries(criteri)) console.log(`  abbinati per ${k.padEnd(18)} ${String(v).padStart(4)}`);
console.log(`  ${'NON nel registro'.padEnd(29)} ${String(orfani.length).padStart(4)}`);
const conStorico = orfani.filter((o) => o._count.deliveries > 0);
console.log(`\n  di cui con consegne fatte: ${conStorico.length} (${conStorico.reduce((s, o) => s + o._count.deliveries, 0)} consegne)`);
console.log('\n  i 15 piu' + String.fromCharCode(39) + ' grossi assenti dal registro:');
for (const o of conStorico.sort((a, b) => b._count.deliveries - a._count.deliveries).slice(0, 15))
  console.log(`     ${o.active ? '●' : '○'} ${o.insegna.slice(0, 34).padEnd(36)}${String(o._count.deliveries).padStart(5)} consegne`);
await pia.$disconnect(); await reg.$disconnect();
