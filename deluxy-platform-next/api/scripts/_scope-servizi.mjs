import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true`;
const prisma = new PrismaClient();
const scopi = await prisma.$queryRawUnsafe(
  `SELECT scope, count(*)::int AS n FROM platform."ServiceType" GROUP BY 1`);
console.log('scope:', JSON.stringify(scopi));
const s = await prisma.serviceType.findMany({ where: { name: { in: ['Vendita Deluxy', 'Consegna Standard', 'Servizio a Ora', 'Servizio a ora'] } },
  select: { name: true, scope: true, pricingModel: true, active: true } });
console.log(JSON.stringify(s, null, 1));
// per ogni scope: quanti servizi hanno ALMENO un valet a listino?
const conValet = await prisma.$queryRawUnsafe(
  `SELECT st.scope, count(DISTINCT st.id)::int AS servizi,
          count(DISTINCT vs."serviceTypeId")::int AS con_listino_valet
   FROM platform."ServiceType" st
   LEFT JOIN platform."ValetService" vs ON vs."serviceTypeId" = st.id
   GROUP BY 1`);
console.log('listini valet per scope:', JSON.stringify(conValet));
await prisma.$disconnect();
