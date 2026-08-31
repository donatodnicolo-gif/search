import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true`;
const prisma = new PrismaClient();
const APPLICA = process.argv.includes('--applica');
const NUOVA = 'Deluxy26%';

// ⚠️ Non ci si fida dell'elenco salvato: si RIVERIFICA ADESSO che la password
// sia ancora «123» (qualcuno può averla già cambiata). Solo chi lo è davvero
// viene toccato.
const utenti = await prisma.user.findMany({
  where: { passwordHash: { not: null }, status: { in: ['active', 'invited'] } },
  select: { id: true, email: true, role: true, status: true, passwordHash: true },
});
const bersagli = [];
const CONC = 8; let i = 0;
async function w() { while (i < utenti.length) { const x = utenti[i++]; if (await bcrypt.compare('123', x.passwordHash)) bersagli.push(x); } }
await Promise.all(Array.from({ length: CONC }, w));
console.log('con password «123» adesso:', bersagli.length);
const perRuolo = {};
for (const b of bersagli) perRuolo[b.role] = (perRuolo[b.role] ?? 0) + 1;
console.log('per ruolo:', JSON.stringify(perRuolo));

if (!APPLICA) { console.log('\nPROVA A VUOTO: niente scritto. Rilancia con --applica.'); }
else {
  const hash = await bcrypt.hash(NUOVA, 10);
  let n = 0;
  for (const b of bersagli) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: b.id },
        data: { passwordHash: hash, mustChangePassword: true } }),
      prisma.userEvent.create({ data: { userId: b.id, action: 'password-reset',
        note: 'Bonifica password deboli (31/08/2026): password temporanea, cambio obbligatorio al primo accesso.' } }),
    ]);
    n++;
  }
  console.log(`\nAGGIORNATI: ${n} account -> password temporanea «${NUOVA}» + mustChangePassword`);
}
await prisma.$disconnect();
