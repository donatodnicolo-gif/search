/**
 * Prova la logica di prezzo per TIPO DI SERVIZIO sulle consegne da fatturare.
 *
 * Compila al volo `prezzoConsegna()` dal modulo vero (`src/invoices/`): provare
 * una copia proverebbe la copia, non quella che gira in produzione.
 *
 * Non scrive nulla: e' una misura.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import ts from 'typescript';

// Compila al volo la sola funzione dal modulo vero: provare una COPIA della
// logica proverebbe la copia, non quella che gira.
const src = fs.readFileSync('C:/Users/nicol/app/deluxy-platform-next/api/src/invoices/invoices.module.ts', 'utf8');
const da = src.indexOf('export type ConsegnaDaPrezzare');
const a = src.indexOf('/** Aliquota IVA');
const js = ts.transpileModule(src.slice(da, a), { compilerOptions: { target: 'ES2022', module: 'ESNext' } }).outputText;
fs.writeFileSync('C:/Users/nicol/app/deluxy-platform-next/scripts/_prezzo.mjs', js);
const { prezzoConsegna } = await import('./_prezzo.mjs');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice(13).trim().replace(/^"|"$/g,''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

// Le gia' fatturate secondo il legacy (`delivery.invoiced`) sono fuori: sono
// 35.135, e contarle avrebbe gonfiato il «da fatturare» a 47.126 invece di 22.031.
const where = { billable:true, deletedAt:null, status:{notIn:['cancelled','not_delivered','invalidated','not_accepted']}, invoiceLines:{none:{}}, invoiced:false };
const deliveries = await db.delivery.findMany({ where, select:{
  id:true,partnerId:true,serviceTypeId:true,price:true,additionalPrice:true,hours:true,
  distanceKm:true,extraKm:true,extraOutOfCity:true,
  serviceType:{select:{pricingModel:true,basePrice:true,perPiecePrice:true,minHours:true}},
  deliveryRule:{select:{partnerBillingAdjustment:true,toBill:true}} } });

const DA_PRODOTTI = ['VENDITA','CORPORATE','MAGAZZINO'];
const serve = deliveries.filter(d=>(d.price??0)<=0 && DA_PRODOTTI.includes(d.serviceType?.pricingModel??'')).map(d=>d.id);
const prodotti = new Map();
for (let i=0;i<serve.length;i+=2000) {
  for (const p of await db.deliveryProduct.findMany({ where:{deliveryId:{in:serve.slice(i,i+2000)}}, select:{deliveryId:true,quantity:true,price:true} })) {
    const arr = prodotti.get(p.deliveryId) ?? []; arr.push(p); prodotti.set(p.deliveryId, arr);
  }
}
const listini = new Map((await db.partnerService.findMany()).map(l=>[`${l.partnerId}|${l.serviceTypeId}`,l]));

const per = {};
let tot=0, senza=0, daListino=0, daConsegna=0;
for (const d of deliveries) {
  const m = d.serviceType?.pricingModel ?? '—';
  per[m] ??= { n:0, eur:0, senza:0, recuperate:0, recuperateEur:0 };
  per[m].n++;
  const c = prezzoConsegna({...d, products: prodotti.get(d.id) ?? []}, listini.get(`${d.partnerId}|${d.serviceTypeId}`) ?? null, d.deliveryRule ?? null);
  if (!c) { per[m].senza++; senza++; continue; }
  per[m].eur += c.amount; tot += c.amount;
  if (c.origine === 'listino') { daListino++; per[m].recuperate++; per[m].recuperateEur += c.amount; }
  else daConsegna++;
}
console.log('PREZZI PER TIPO DI SERVIZIO — consegne da fatturare\n');
console.log('  modello'.padEnd(16)+'n'.padStart(7)+'  prezzate'.padStart(10)+'  dal listino'.padStart(13)+'   recuperati EUR'.padStart(17)+'      imponibile');
for (const [m,x] of Object.entries(per).sort((a,b)=>b[1].eur-a[1].eur))
  console.log('  '+m.padEnd(14)+String(x.n).padStart(7)+String(x.n-x.senza).padStart(10)+String(x.recuperate).padStart(13)+x.recuperateEur.toLocaleString('it-IT',{maximumFractionDigits:0}).padStart(17)+x.eur.toLocaleString('it-IT',{minimumFractionDigits:2}).padStart(16)+' EUR');
console.log('');
console.log('  consegne considerate:', deliveries.length.toLocaleString('it-IT'));
console.log('  imponibile per tipo di servizio: '+tot.toLocaleString('it-IT',{minimumFractionDigits:2})+' EUR');
console.log('  consegne prezzate dal listino:', daListino.toLocaleString('it-IT'), '· dalla consegna:', daConsegna.toLocaleString('it-IT'));
console.log('  ⚠️ NON prezzabili (niente prezzo, niente listino):', senza.toLocaleString('it-IT'));
await db.$disconnect();
