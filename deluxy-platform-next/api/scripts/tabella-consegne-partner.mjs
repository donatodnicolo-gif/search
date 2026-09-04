/**
 * TABELLA CONSEGNE DI UN PARTNER (richiesta utente 04/09/2026) — SOLA LETTURA.
 * Per ogni consegna del periodo: stato, servizio, km, regola carnet, il
 * LISTINO applicato (o «prezzo scritto in consegna»), plus/minus, il VALORE
 * FATTURATO (la riga di fattura se esiste, altrimenti lo stesso conto che fa
 * la Fatturazione: `prezzoConsegna` di invoices.module.ts, replicato qui) e
 * la fattura in cui sta.
 *
 * Uso: node scripts/tabella-consegne-partner.mjs --partner armani [--dal 2026-08-01] [--al 2026-09-04]
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
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile', e.message); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const TESTO = arg('--partner', 'armani');
const DAL = arg('--dal', '2026-08-01'), AL = arg('--al', '2026-09-04');
const IVA = 22;
const conIva = (n) => Math.round(n * (1 + IVA / 100) * 100) / 100;
const q2 = (n) => Math.round(n * 100) / 100;
const eur = (n) => (n == null ? '—' : q2(n).toFixed(2).replace('.', ',') + ' €');
const NON_BILLABLE = ['cancelled', 'invalidated', 'not_accepted'];
const STATO = { created: 'da gestire', assigned: 'in gestione', in_preparation: 'in preparazione', accepted: 'accettata', in_delivery: 'in consegna', delivered: 'consegnata', approved: 'approvata', not_delivered: 'non consegnata', not_accepted: 'non accettata', cancellation_requested: 'cancellazione richiesta', hours_to_approve: 'ore da approvare', cancelled: 'annullata', invalidated: 'annullata d\'ufficio', archived: 'archiviata' };

function valoreProdotti(righe, productValue) {
  const somma = (righe ?? []).reduce((s, p) => s + (p.price ?? p.productVariant?.price ?? p.productVariant?.publicPrice ?? p.product?.price ?? p.product?.publicPrice ?? 0) * (p.quantity ?? 1), 0);
  if (somma === 0 && (productValue ?? 0) > 0) return productValue;
  return somma;
}
/** Replica di prezzoConsegna (invoices.module.ts) + la SPIEGAZIONE del listino applicato. */
function prezzoConsegna(d, listino, regola) {
  if (regola && regola.toBill === false) return { amount: null, spiega: `regola «${regola.name}»: NON si fattura (carnet pagato in anticipo)` };
  // 04/09: plus MANUALE + valore della REGOLA (campo ruleAdjustment; ripiego sulla regola se non migrata)
  const extra = (d.additionalPrice ?? 0) + (d.ruleAdjustment ?? (regola?.partnerBillingAdjustment ?? 0));
  const maiNeg = (n) => Math.max(0, q2(n));
  const vp = valoreProdotti(d.products, d.productValue);
  const modello = d.serviceType?.pricingModel ?? '';
  const regoleVal = d.ruleAdjustment ?? (regola?.partnerBillingAdjustment ?? 0);
  const extraTxt = (regoleVal ? ` ${regoleVal > 0 ? "+" : ""}${q2(regoleVal)} Regole «${regola?.name ?? ""}»` : "") + (d.additionalPrice ? ` ${d.additionalPrice > 0 ? "+" : ""}${q2(d.additionalPrice)} plus/minus manuale` : "");
  if ((d.price ?? 0) > 0) {
    return { amount: maiNeg(d.price + extra), spiega: `prezzo SCRITTO in consegna ${eur(d.price)}${extraTxt}` };
  }
  const km = d.distanceKm ?? 0;
  const suppl = () => {
    if (!listino) return { v: 0, t: '' };
    if (d.extraOutOfCity) return { v: km * (listino.extraOutOfCityPrice ?? 0), t: `fuori città: ${q2(km)} km × ${eur(listino.extraOutOfCityPrice)}` };
    const inclusi = listino.includedKm ?? 0;
    const oltre = d.extraKm && d.extraKm > 0 ? d.extraKm : Math.max(0, km - inclusi);
    return { v: oltre * (listino.extraKmPrice ?? 0), t: oltre > 0 ? `+ ${q2(oltre)} km oltre i ${inclusi} inclusi × ${eur(listino.extraKmPrice)}` : `${q2(km)} km entro i ${inclusi} inclusi` };
  };
  if (!listino && modello !== 'CORPORATE') return { amount: null, spiega: 'nessun prezzo in consegna e nessun listino per il servizio' };
  switch (modello) {
    case 'PREZZO_FISSO': {
      const s = suppl();
      const base = listino?.price ?? 0;
      return d.extraOutOfCity
        ? { amount: maiNeg(s.v + extra), spiega: `listino ${s.t}${extraTxt}` }
        : { amount: maiNeg(base + s.v + extra), spiega: `listino base ${eur(base)} ${s.t}${extraTxt}` };
    }
    case 'A_ORA': {
      const ore = Math.max(d.hours ?? 0, d.serviceType?.minHours ?? 1);
      return { amount: maiNeg((listino?.price ?? 0) * ore + extra), spiega: `listino ${eur(listino?.price)}/ora × ${ore} h${extraTxt}` };
    }
    case 'MAGAZZINO': {
      const pezzi = (d.products ?? []).reduce((s, p) => s + (p.quantity ?? 1), 0);
      return { amount: maiNeg((listino?.price ?? 0) + (listino?.pricePerItem ?? 0) * pezzi + extra), spiega: `listino base ${eur(listino?.price)} + ${pezzi} pz × ${eur(listino?.pricePerItem)}${extraTxt}` };
    }
    case 'VENDITA': {
      const fee = listino?.price ?? 0;
      const a = maiNeg((vp * fee) / 100 + extra);
      return { amount: a, spiega: `vendita: quota ${fee}% su ${eur(vp)} di merce${extraTxt} (al partner netto ${eur(Math.max(0, vp - conIva(a)))})` };
    }
    case 'CORPORATE': {
      if (!(d.products ?? []).length) return { amount: null, spiega: 'aziendale senza prodotti: non prezzabile' };
      return { amount: maiNeg(vp + extra), spiega: `aziendale: valore prodotti ${eur(vp)}${extraTxt}` };
    }
    default: return { amount: null, spiega: `modello ${modello || '—'} non prezzabile` };
  }
}

const partners = await prisma.partner.findMany({
  where: { OR: [{ insegna: { contains: TESTO, mode: 'insensitive' } }, { businessName: { contains: TESTO, mode: 'insensitive' } }] },
  select: { id: true, insegna: true, businessName: true, active: true,
    services: { select: { serviceTypeId: true, price: true, includedKm: true, extraKmPrice: true, extraOutOfCityPrice: true, pricePerItem: true, serviceType: { select: { name: true, pricingModel: true } } } } },
});
if (!partners.length) { console.log(`Nessun partner con «${TESTO}»`); process.exit(0); }
const dal = new Date(`${DAL}T00:00:00.000Z`), al = new Date(`${AL}T23:59:59.999Z`);
for (const p of partners) {
  console.log(`\n## ${p.insegna}${p.businessName ? ` (${p.businessName})` : ''} — ${p.active ? 'attivo' : 'NON attivo'} — periodo ${DAL} → ${AL}\n`);
  console.log('### Listino del partner\n');
  console.log('| Servizio | Modello | Prezzo | Km inclusi | €/km oltre | €/km fuori città | €/pezzo |');
  console.log('|---|---|---:|---:|---:|---:|---:|');
  for (const s of p.services) console.log(`| ${s.serviceType.name} | ${s.serviceType.pricingModel} | ${s.serviceType.pricingModel === 'VENDITA' ? s.price + ' %' : eur(s.price)} | ${s.includedKm ?? 0} | ${eur(s.extraKmPrice)} | ${eur(s.extraOutOfCityPrice)} | ${s.pricePerItem != null ? eur(s.pricePerItem) : '—'} |`);
  const listini = new Map(p.services.map((s) => [s.serviceTypeId, s]));
  const cons = await prisma.delivery.findMany({
    where: { partnerId: p.id, deletedAt: null, date: { gte: dal, lte: al } },
    select: { id: true, code: true, date: true, status: true, serviceTypeId: true, price: true, additionalPrice: true, ruleAdjustment: true, hours: true, distanceKm: true, extraKm: true, extraOutOfCity: true, billable: true, invoiced: true, productValue: true,
      recipientFirstName: true, recipientLastName: true, recipientAddress: true,
      serviceType: { select: { name: true, pricingModel: true, minHours: true } },
      deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
      products: { where: { deletedAt: null }, select: { quantity: true, price: true, productVariant: { select: { price: true, publicPrice: true } }, product: { select: { price: true, publicPrice: true } } } },
      invoiceLines: { select: { amount: true, invoice: { select: { number: true, status: true, periodStart: true } } } } },
    orderBy: [{ date: 'asc' }, { code: 'asc' }],
  });
  console.log(`\n### Consegne (${cons.length})\n`);
  console.log('| Data | # | Stato | Servizio | Destinatario | Km | Listino applicato | Valore fatturato | Fattura |');
  console.log('|---|---|---|---|---|---:|---|---:|---|');
  let tot = 0, nFatt = 0, nEscluse = 0, nNonPrezz = 0, totInFattura = 0;
  for (const d of cons) {
    const nonFatt = NON_BILLABLE.includes(d.status) || !d.billable;
    const calc = prezzoConsegna(d, listini.get(d.serviceTypeId) ?? null, d.deliveryRule);
    const riga = d.invoiceLines[0];
    const inFattura = riga ? `${riga.invoice?.number ?? 'bozza'} (${riga.invoice?.status ?? '—'})` : (d.invoiced ? 'segnata fatturata' : 'no');
    let valore;
    if (riga) { valore = riga.amount; totInFattura += riga.amount; nFatt++; }
    else if (nonFatt) { valore = null; nEscluse++; }
    else if (calc.amount == null) { valore = null; nNonPrezz++; }
    else valore = calc.amount;
    if (valore != null) tot += valore;
    const dest = `${d.recipientFirstName ?? ''} ${d.recipientLastName ?? ''}`.trim() || '—';
    const spiega = nonFatt ? `${calc.spiega} — ESCLUSA (${!d.billable ? 'non fatturabile' : STATO[d.status] ?? d.status})` : calc.spiega;
    console.log(`| ${d.date.toISOString().slice(0, 10)} | #${d.code} | ${STATO[d.status] ?? d.status} | ${d.serviceType?.name ?? '—'} | ${dest} | ${d.distanceKm != null ? q2(d.distanceKm) : '—'} | ${spiega} | ${riga ? eur(riga.amount) + ' (riga fattura)' : valore != null ? eur(valore) : '—'} | ${inFattura} |`);
  }
  console.log(`\n**Totale valore fatturato/fatturabile: ${eur(tot)}** su ${cons.length} consegne — ${nFatt} già in fattura (${eur(totInFattura)}), ${cons.length - nFatt - nEscluse - nNonPrezz} da fatturare col conto della Fatturazione, ${nEscluse} escluse (annullate/non fatturabili), ${nNonPrezz} non prezzabili.`);
}
await prisma.$disconnect();
