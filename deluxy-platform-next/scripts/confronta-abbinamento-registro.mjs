// Prima/dopo dell'abbinamento della vista d'insieme (`statoSyncTutti`).
//
// PRIMA: platformId -> P.IVA (anche quella segnaposto) -> email.
// DOPO:  platformId -> P.IVA attendibile -> codice fiscale -> email ->
//        nome -> nome semplificato.
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

const pivaAttendibile = (v) => { const p = (v ?? '').trim(); return p.length >= 8 && !/^(\d)\1+$/.test(p); };
const semplificaNome = (v) => v.toLowerCase().replace(/[.,'`"()]/g, ' ')
  .replace(/\b(s\s*r\s*l|srls|s\s*p\s*a|s\s*a\s*s|s\s*n\s*c|societa|soc)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

const partners = await pia.partner.findMany({ select: {
  id: true, insegna: true, businessName: true, email: true, vatNumber: true, fiscalCode: true,
  active: true, _count: { select: { deliveries: true } } } });
const registro = await reg.$queryRawUnsafe(
  'select id, nome, "ragioneSociale", "pIva", "codiceFiscale", email, "platformId" from "anagrafiche"."Partner"');

const perPlatformId = new Map(), perPivaTutte = new Map(), perPiva = new Map(),
      perCf = new Map(), perEmail = new Map(), perNome = new Map(), perNomeSemplice = new Map();
for (const a of registro) {
  if (a.platformId) perPlatformId.set(a.platformId, a);
  if (a.pIva) perPivaTutte.set(a.pIva.trim().toUpperCase(), a);
  if (pivaAttendibile(a.pIva)) perPiva.set(a.pIva.trim().toUpperCase(), a);
  if (a.codiceFiscale) perCf.set(a.codiceFiscale.trim().toUpperCase(), a);
  if (a.email) perEmail.set(a.email.trim().toLowerCase(), a);
  for (const n of [a.nome, a.ragioneSociale].filter(Boolean)) {
    perNome.set(n.trim().toLowerCase(), a);
    const s = semplificaNome(n);
    if (s.length >= 3) perNomeSemplice.set(s, a);
  }
}

const conta = (criteri) => {
  const esiti = { collegato: 0, abbinabile: 0, assente: 0 };
  const perCriterio = {}; const nuovi = [];
  for (const p of partners) {
    if (perPlatformId.get(p.id)) { esiti.collegato++; continue; }
    const nomi = [p.businessName, p.insegna].filter(Boolean);
    let vinto = null;
    for (const [nome, f] of criteri) { if (f(p, nomi)) { vinto = nome; break; } }
    if (vinto) { esiti.abbinabile++; perCriterio[vinto] = (perCriterio[vinto] ?? 0) + 1; nuovi.push([vinto, p]); }
    else esiti.assente++;
  }
  return { esiti, perCriterio, nuovi };
};

const prima = conta([
  ['P.IVA (anche segnaposto)', (p) => p.vatNumber && perPivaTutte.get(p.vatNumber.trim().toUpperCase())],
  ['email', (p) => p.email && perEmail.get(p.email.trim().toLowerCase())],
]);
const dopo = conta([
  ['P.IVA', (p) => pivaAttendibile(p.vatNumber) && perPiva.get(p.vatNumber.trim().toUpperCase())],
  ['codice fiscale', (p) => p.fiscalCode && perCf.get(p.fiscalCode.trim().toUpperCase())],
  ['email', (p) => p.email && perEmail.get(p.email.trim().toLowerCase())],
  ['nome', (p, nomi) => nomi.some((n) => perNome.get(n.trim().toLowerCase()))],
  ['nome semplificato', (p, nomi) => nomi.some((n) => perNomeSemplice.get(semplificaNome(n)))],
]);

const mostra = (t, r) => {
  console.log(`${t}: collegati ${r.esiti.collegato} · abbinabili ${r.esiti.abbinabile} · assenti ${r.esiti.assente}`);
  for (const [k, v] of Object.entries(r.perCriterio)) console.log(`     per ${k.padEnd(26)} ${String(v).padStart(3)}`);
};
mostra('PRIMA', prima); console.log(); mostra('DOPO ', dopo);

const eranoAssenti = new Set(partners.map((p) => p.id));
for (const [, p] of prima.nuovi) eranoAssenti.delete(p.id);
const guadagnati = dopo.nuovi.filter(([, p]) => eranoAssenti.has(p.id) && !perPlatformId.get(p.id));
console.log(`\n🟢 partner che PRIMA risultavano assenti e ora si abbinano: ${guadagnati.length}`);
for (const [criterio, p] of guadagnati.sort((a, b) => b[1]._count.deliveries - a[1]._count.deliveries).slice(0, 20))
  console.log(`   ${p.active ? '●' : '○'} ${p.insegna.slice(0, 32).padEnd(34)}${String(p._count.deliveries).padStart(5)} consegne · per ${criterio}`);
await pia.$disconnect(); await reg.$disconnect();
