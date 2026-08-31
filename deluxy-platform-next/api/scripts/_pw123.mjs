import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true`;
const prisma = new PrismaClient();
const utenti = await prisma.user.findMany({
  where: { passwordHash: { not: null }, status: { in: ['active', 'invited'] } },
  select: { email: true, role: true, status: true, passwordHash: true },
});
await prisma.$disconnect();
console.log('da controllare:', utenti.length, '— solo «123», in parallelo');
const deboli = [];
const CONC = 8;
let i = 0;
async function worker() {
  while (i < utenti.length) {
    const usr = utenti[i++];
    if (await bcrypt.compare('123', usr.passwordHash)) deboli.push({ email: usr.email, role: usr.role, status: usr.status });
    if (i % 50 === 0) process.stdout.write(`\r  ${i}/${utenti.length} · trovate ${deboli.length}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\n\nPASSWORD «123»: ${deboli.length}`);
deboli.forEach((d) => console.log(`  ${d.email} · ${d.role} · ${d.status}`));
fs.writeFileSync('scripts/_pw123-esito.json', JSON.stringify(deboli, null, 2));
