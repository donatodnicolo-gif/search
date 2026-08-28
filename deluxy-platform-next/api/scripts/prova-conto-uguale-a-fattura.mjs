/**
 * Il conto mostrato al partner e quello della FATTURA devono dare lo stesso
 * numero — soprattutto sulle 1.417 vendite dove `productValue` diverge dalla
 * somma delle righe.
 *
 * ⚠️ La prova che conta si fa PROPRIO su quelle: su una consegna dove i due
 * campi coincidono passerebbe anche una formula sbagliata.
 */
import fs from 'node:fs';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const jwt = await import('jsonwebtoken');
const p = new PrismaClient();
const API = 'http://localhost:3399/api/v1';
const SEGRETO = 'segreto-solo-per-la-prova-locale';
const esiti = [];
const ok = (n, c, extra = '') => esiti.push({ n, c, extra });

const admin = await p.user.findFirst({ where: { role: 'ADMIN', status: 'active' }, select: { id: true } });
const token = jwt.default.sign({ sub: admin.id }, SEGRETO, { expiresIn: '1h' });

// Vendite dove productValue DIVERGE dalla somma delle righe: sono il caso duro.
const divergenti = await p.$queryRawUnsafe(`
  SELECT d.id, d.code, d."productValue" AS scritto, x.somma, d.price
  FROM platform."Delivery" d
  JOIN platform."ServiceType" s ON s.id = d."serviceTypeId" AND s."pricingModel" = 'VENDITA'
  JOIN (SELECT dp."deliveryId" AS did, sum(dp.price * dp.quantity) AS somma
        FROM platform."DeliveryProduct" dp GROUP BY dp."deliveryId") x ON x.did = d.id
  WHERE d."deletedAt" IS NULL AND d.price > 0
    AND abs(COALESCE(d."productValue",0) - x.somma) > 0.02
  LIMIT 12`);
console.log('vendite divergenti provate:', divergenti.length);

let quadrano = 0, usavaIlCampo = 0, senzaValore = 0, sbagliati = 0;
for (const d of divergenti) {
  const r = await fetch(`${API}/deliveries/${d.id}`, { headers: { authorization: `Bearer ${token}` } });
  const j = await r.json();
  const v = j?.economiaVendita;
  const somma0 = Math.round(Number(d.somma) * 100) / 100;
  if (!v) {
    // ⚠️ Assente e' la risposta GIUSTA quando la merce non ha un valore
    // calcolabile: la fattura in quel caso non deve niente al partner, e un
    // «incasso 47 €» preso da `productValue` la smentirebbe.
    console.log(`  #${d.code}  righe ${somma0}  ·  productValue ${Math.round(Number(d.scritto) * 100) / 100}  ·  conto ASSENTE`);
    if (somma0 === 0) { senzaValore++; } else { sbagliati++; }
    continue;
  }
  const somma = Math.round(Number(d.somma) * 100) / 100;
  const scritto = Math.round(Number(d.scritto) * 100) / 100;
  if (Math.abs(v.incasso - somma) < 0.02) quadrano++;
  else if (Math.abs(v.incasso - scritto) < 0.02) usavaIlCampo++;
  console.log(`  #${d.code}  righe ${somma}  ·  productValue ${scritto}  ·  incasso mostrato ${v.incasso}  → ${Math.abs(v.incasso - somma) < 0.02 ? 'RIGHE (come la fattura)' : 'productValue (SBAGLIATO)'}`);
}
ok('il conto usa la somma delle RIGHE, come la fattura',
  quadrano + senzaValore === divergenti.length && usavaIlCampo === 0 && sbagliati === 0,
  `${quadrano} col valore delle righe · ${senzaValore} senza valore (conto assente, giusto) · ${usavaIlCampo} col vecchio campo · ${sbagliati} sbagliati`);
ok('nessuna consegna mostra il valore preso da productValue', usavaIlCampo === 0, `${usavaIlCampo}`);

// E su una vendita normale il conto resta quello di prima.
{
  const d = await p.delivery.findFirst({ where: { code: 62455 }, select: { id: true } });
  const r = await fetch(`${API}/deliveries/${d.id}`, { headers: { authorization: `Bearer ${token}` } });
  const v = (await r.json())?.economiaVendita;
  ok('la #62455 resta 44,63 / 8,93 / 33,74',
    v && v.incasso === 44.63 && v.commissione === 8.93 && v.dovutoNetto === 33.74, JSON.stringify(v));
}
await p.$disconnect();
let falliti = 0;
for (const e of esiti) { if (!e.c) falliti++; console.log(`${e.c ? '\u2714' : '\u2718'} ${e.n}${e.extra ? `  (${e.extra})` : ''}`); }
process.exit(falliti ? 1 : 0);
