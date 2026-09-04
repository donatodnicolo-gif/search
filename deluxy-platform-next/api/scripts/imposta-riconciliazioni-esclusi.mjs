/**
 * PARTNER ESCLUSI DALLE RICONCILIAZIONI (04/09/2026, regola utente: «escludi
 * da riconciliazioni l'artista locale»).
 *
 * Scrive `AppSetting.riconciliazioniPartnerEsclusi` = elenco di ID partner
 * separati da virgola. Gli ID, non i nomi: due partner possono chiamarsi
 * uguale e un'insegna si rinomina ([[trappola-mascheratura-per-nome]]).
 *
 * Uso:
 *   node scripts/imposta-riconciliazioni-esclusi.mjs                 → mostra chi è escluso oggi
 *   node scripts/imposta-riconciliazioni-esclusi.mjs "Artista Locale" [altra insegna…]
 *   node scripts/imposta-riconciliazioni-esclusi.mjs --nessuno       → svuota la lista
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
const CHIAVE = 'riconciliazioniPartnerEsclusi';

const mostra = async () => {
  const s = await prisma.appSetting.findUnique({ where: { key: CHIAVE } });
  const ids = (s?.value ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!ids.length) return console.log('Nessun partner escluso.');
  const p = await prisma.partner.findMany({ where: { id: { in: ids } }, select: { id: true, insegna: true } });
  console.log('Esclusi:', p.map((x) => `${x.insegna} (${x.id})`).join(' · '));
  const orfani = ids.filter((id) => !p.some((x) => x.id === id));
  if (orfani.length) console.log('⚠️ id non più esistenti:', orfani.join(', '));
};

const argomenti = process.argv.slice(2);
if (!argomenti.length) {
  await mostra();
} else if (argomenti.includes('--nessuno')) {
  await prisma.appSetting.upsert({ where: { key: CHIAVE }, update: { value: '' }, create: { key: CHIAVE, value: '' } });
  console.log('Lista svuotata.');
} else {
  const ids = [];
  for (const nome of argomenti) {
    const p = await prisma.partner.findMany({ where: { insegna: { equals: nome, mode: 'insensitive' } }, select: { id: true, insegna: true } });
    if (!p.length) { console.error(`⛔ nessun partner si chiama «${nome}»: non scrivo niente.`); await prisma.$disconnect(); process.exit(1); }
    if (p.length > 1) { console.error(`⛔ «${nome}» corrisponde a ${p.length} partner: passa gli id a mano.`); await prisma.$disconnect(); process.exit(1); }
    ids.push(p[0].id);
    console.log('·', p[0].insegna, '→', p[0].id);
  }
  const value = [...new Set(ids)].join(',');
  await prisma.appSetting.upsert({ where: { key: CHIAVE }, update: { value }, create: { key: CHIAVE, value } });
  await mostra();
}
await prisma.$disconnect();
