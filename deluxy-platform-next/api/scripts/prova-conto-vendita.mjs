/**
 * Il conto di una vendita: esce coi numeri giusti, e SOLO a chi spetta?
 *
 * ⚠️ Le prove che contano sono i divieti: il VALET non deve riceverlo affatto
 * (non nascosto in pagina — assente dalla risposta), e il PARTNER estraneo non
 * deve nemmeno vedere la consegna.
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

const d = await p.delivery.findFirst({
  where: { code: 62455 },
  select: { id: true, partnerId: true, valetId: true, price: true, productValue: true },
});
const token = (id) => jwt.default.sign({ sub: id }, SEGRETO, { expiresIn: '1h' });
const chiedi = async (userId) => {
  const r = await fetch(`${API}/deliveries/${d.id}`, { headers: { authorization: `Bearer ${token(userId)}` } });
  return { stato: r.status, j: await r.json().catch(() => null) };
};

const admin = await p.user.findFirst({ where: { role: 'ADMIN', status: 'active' }, select: { id: true, email: true } });
const suoPartner = await p.user.findFirst({ where: { role: 'PARTNER', partnerId: d.partnerId }, select: { id: true, email: true } });
const altroPartner = await p.user.findFirst({ where: { role: 'PARTNER', partnerId: { not: d.partnerId }, status: 'active' }, select: { id: true, email: true } });
const suoValet = await p.user.findFirst({ where: { role: 'VALET', valet: { id: d.valetId } }, select: { id: true, email: true } });

// I numeri attesi, calcolati a mano dalla stessa fonte.
const q2 = (n) => Math.round(n * 100) / 100;
const atteso = {
  incasso: q2(d.productValue),
  commissione: q2(d.price),
  commissioneConIva: q2(d.price * 1.22),
  dovutoLordo: q2(d.productValue - d.price),
  dovutoNetto: q2(d.productValue - q2(d.price * 1.22)),
};
console.log('consegna #62455 —', JSON.stringify(atteso));

{
  const r = await chiedi(admin.id);
  const v = r.j?.economiaVendita;
  ok("l'admin vede il conto", r.stato === 200 && !!v, `stato ${r.stato}`);
  ok('i numeri sono quelli attesi',
    v && v.incasso === atteso.incasso && v.commissione === atteso.commissione
      && v.commissioneConIva === atteso.commissioneConIva
      && v.dovutoLordo === atteso.dovutoLordo && v.dovutoNetto === atteso.dovutoNetto,
    v ? JSON.stringify(v) : 'assente');
}
if (suoPartner) {
  const r = await chiedi(suoPartner.id);
  ok('il PARTNER della consegna vede il proprio conto',
    r.stato === 200 && !!r.j?.economiaVendita, `stato ${r.stato}, ${suoPartner.email}`);
  ok('…e continua a NON vedere la paga del valet',
    r.j?.valetSalary === undefined, `valetSalary=${r.j?.valetSalary}`);
} else {
  ok('esiste un utente PARTNER per questa consegna', false, 'nessuno: la prova non dimostra niente');
}
{
  const r = await chiedi(altroPartner.id);
  ok('un ALTRO partner non vede nemmeno la consegna', r.stato === 404 || r.stato === 403, `stato ${r.stato}`);
}
if (suoValet) {
  const r = await chiedi(suoValet.id);
  ok('il VALET non riceve il conto (campo ASSENTE, non nascosto)',
    r.stato === 200 && r.j?.economiaVendita === undefined, `stato ${r.stato}, campo=${JSON.stringify(r.j?.economiaVendita)}`);
  ok('…e nemmeno il prezzo del partner', r.j?.price === undefined, `price=${r.j?.price}`);
} else {
  ok('esiste un utente VALET per questa consegna', false, 'nessuno');
}

// Una consegna NON di vendita non deve portare il blocco.
{
  const altra = await p.delivery.findFirst({
    where: { serviceType: { pricingModel: 'PREZZO_FISSO' }, deletedAt: null },
    select: { id: true, code: true },
  });
  const r = await fetch(`${API}/deliveries/${altra.id}`, { headers: { authorization: `Bearer ${token(admin.id)}` } });
  const j = await r.json();
  ok('su una consegna NON di vendita il conto non c\'è', j?.economiaVendita === null || j?.economiaVendita === undefined, `#${altra.code} → ${JSON.stringify(j?.economiaVendita)}`);
}

await p.$disconnect();
let falliti = 0;
for (const e of esiti) { if (!e.c) falliti++; console.log(`${e.c ? '\u2714' : '\u2718'} ${e.n}${e.extra ? `  (${e.extra})` : ''}`); }
console.log(`\n${esiti.length - falliti}/${esiti.length} prove passate`);
process.exit(falliti ? 1 : 0);
