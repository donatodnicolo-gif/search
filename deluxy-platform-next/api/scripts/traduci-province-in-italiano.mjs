/**
 * PROVINCE IN ITALIANO (04/09/2026, regola utente: «le province vanno salvate
 * tutte in italiano»).
 *
 * Nell'import dal legacy dodici province erano rimaste col nome inglese
 * (Florence, Naples, Milan…) e si vedevano ovunque: schede partner, province
 * servite, pop-up di assegnazione. Qui si riportano in italiano.
 *
 * ⚠️ Si tocca SOLO il nome, mai il codice (FI, NA…), che è l'identità della
 * provincia: i collegamenti di partner, valet e consegne non si spostano.
 * La geocodifica chiede già `language=it`, quindi le province nuove nascono
 * in italiano: questa è una correzione una tantum, non un ripasso periodico.
 *
 * Uso: node scripts/traduci-province-in-italiano.mjs [--applica]
 * Senza `--applica` dice solo che cosa cambierebbe.
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

/** Nome ufficiale italiano, per codice. Solo quelli che erano in inglese. */
const IN_ITALIANO = {
  BZ: 'Bolzano',
  FI: 'Firenze',
  GE: 'Genova',
  MB: 'Monza e della Brianza',
  MI: 'Milano',
  MN: 'Mantova',
  NA: 'Napoli',
  PD: 'Padova',
  SR: 'Siracusa',
  SU: 'Sud Sardegna',
  VE: 'Venezia',
};

const applica = process.argv.includes('--applica');
const province = await prisma.province.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });
const daCambiare = province.filter((p) => IN_ITALIANO[p.code] && IN_ITALIANO[p.code] !== p.name);
if (!daCambiare.length) {
  console.log('Tutte le province sono già in italiano.');
} else {
  for (const p of daCambiare) console.log(`${p.code}: «${p.name}» → «${IN_ITALIANO[p.code]}»`);
  if (applica) {
    for (const p of daCambiare) {
      await prisma.province.update({ where: { id: p.id }, data: { name: IN_ITALIANO[p.code] } });
    }
    console.log(`\n✓ aggiornate ${daCambiare.length} province.`);
  } else {
    console.log(`\n(prova: nessuna scrittura. Rilancia con --applica per cambiarle.)`);
  }
}
// Quel che resta fuori dall'elenco: si dice, invece di dare per fatto.
const sospette = province.filter((p) => !IN_ITALIANO[p.code] && /[a-z] (and|of) |^South |^North /i.test(p.name));
if (sospette.length) console.log('⚠️ altri nomi che sembrano inglesi:', sospette.map((p) => `${p.code}=${p.name}`).join(' · '));
await prisma.$disconnect();
