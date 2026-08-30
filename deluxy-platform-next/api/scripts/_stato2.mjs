import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
let l = 0, c = 0;
for (const [t,col] of [['Product','imageUrl'],['Delivery','receipt'],['Invoice','documentUrl'],['Receipt','fileUrl'],['Receipt','fileUrlFrom'],['Delivery','receiverSign'],['Partner','imageUrl']]) {
  const [r] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FILTER (WHERE "${col}" LIKE '%app.deluxy.it%') a, COUNT(*) FILTER (WHERE "${col}" LIKE '%supabase.co%') b FROM platform."${t}"`);
  l += Number(r.a); c += Number(r.b);
}
console.log(`in casa: ${c} | ancora sul legacy: ${l} | ${(c/(c+l)*100).toFixed(1)}%`);
await prisma.$disconnect();
