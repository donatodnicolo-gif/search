/**
 * PRODOTTI GENERICI AL POSTO DEI DOPPIONI SPENTI (07/09/2026, regola utente).
 *
 * «Per i prodotti non su Shopify, non attivi e non approvati: crea prodotti generici sulla
 * base dei prodotti non unici che vedi. Esempio: bouquet 100 € e bouquet 250 € vanno in
 * archivio e si crea un unico prodotto Bouquet associato a Deluxy come partner. Stessa cosa
 * per le torte, per il vino, eccetera.»
 *
 * Perché: quei prodotti sono nati per far quadrare un ordine — il prezzo è dentro al NOME
 * («Bouquet girasoli 110€», «€49,20 colazione»), quindi ognuno vale una volta sola e a
 * catalogo restano decine di righe che nessuno può riusare. Il generico è una riga sola per
 * famiglia: il prezzo si scrive sulla consegna, dove è sempre stato.
 *
 * COSA NON SI TOCCA, ed è la parte importante:
 *  · i prodotti su Shopify (`platforms` valorizzato), quelli ATTIVI e quelli APPROVATI;
 *  · i prodotti UNICI di un partner (sono il suo listino);
 *  · le consegne passate: si ARCHIVIA, non si cancella, e le righe continuano a puntare al
 *    prodotto di prima col loro prezzo scritto. Lo script misura la somma prima e dopo.
 *
 * PROVA di default; `--scrivi` esegue; `--ripristina` disarchivia e cancella i generici nati
 * qui (solo se non sono ancora stati usati in una consegna).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const RIPRISTINA = process.argv.includes('--ripristina');
const MOTIVO = 'sostituito-da-generico-2026-09-07';
const NATO = 'generico-2026-09-07';
const p = new PrismaClient();

/** Le famiglie: nome del generico, come si riconosce, categoria in cui metterlo. */
const FAMIGLIE = [
  { nome: 'Bouquet', sku: 'GEN-BOUQUET', re: /bouquet|mazzo/i, categoria: /^fiori$/i },
  { nome: 'Fiori', sku: 'GEN-FIORI', re: /fior|rose|rosa|ortensi|orchide|tulipan|girasol|peoni|piant|composizion|cesto|cappellier/i, categoria: /^fiori$/i },
  { nome: 'Torte e dolci', sku: 'GEN-TORTE', re: /torta|torte|cake|red velvet|dolc|tiramis|crostat|pasticc|macaron|pralin|cioccolat|brioche|croissant|colazion/i, categoria: /cake design|torte/i },
  { nome: 'Vino e bollicine', sku: 'GEN-VINO', re: /vino|champagne|prosecco|spumante|bollicin|bottigli|dom p|moet|veuve/i, categoria: /enotec|vino/i },
  { nome: 'Palloncini', sku: 'GEN-PALLONCINI', re: /pallonc/i, categoria: /pallonc/i },
  { nome: 'Regali', sku: 'GEN-REGALI', re: /regal|gift|profum|candel|peluche/i, categoria: /regal/i },
];

const deluxy = await p.partner.findFirst({ where: { insegna: 'Deluxy' }, select: { id: true, insegna: true } });
if (!deluxy) { console.error('Partner «Deluxy» non trovato: senza di lui i generici non hanno una casa.'); process.exit(1); }

const candidati = await p.product.findMany({
  where: { deletedAt: null, archived: false, type: 'NON_UNICO', active: false, approved: false },
  select: { id: true, name: true, sku: true, price: true, platforms: true, categoryId: true, category: { select: { name: true } } },
});
// «non su Shopify»: nessuna piattaforma dichiarata.
const fuoriShopify = candidati.filter((x) => (x.platforms ?? '').replace(/[[\]"\s]/g, '').length === 0);

const gruppi = new Map();
const resto = [];
for (const x of fuoriShopify) {
  const f = FAMIGLIE.find((fam) => fam.re.test(`${x.name} ${x.category?.name ?? ''}`));
  if (f) { const a = gruppi.get(f.nome) ?? []; a.push(x); gruppi.set(f.nome, a); }
  else resto.push(x);
}

const categorie = await p.category.findMany({ select: { id: true, name: true } });
const esito = [];
for (const fam of FAMIGLIE) {
  const righe = gruppi.get(fam.nome) ?? [];
  if (!righe.length) continue;
  const cat = categorie.find((c) => fam.categoria.test(c.name)) ?? null;
  esito.push({ generico: fam.nome, sku: fam.sku, sostituisce: righe.length, categoria: cat?.name ?? '(nessuna)', esempi: righe.slice(0, 3).map((x) => x.name).join(' · ').slice(0, 70) });
}

const ids = [...gruppi.values()].flat().map((x) => x.id);
const righeConsegna = ids.length ? await p.deliveryProduct.findMany({ where: { productId: { in: ids } }, select: { price: true, quantity: true } }) : [];
const somma = righeConsegna.reduce((n, r) => n + (r.price ?? 0) * (r.quantity ?? 1), 0);

console.table(esito);
console.table([
  { voce: 'candidati (non unici, non attivi, non approvati)', n: candidati.length },
  { voce: '→ fuori da Shopify', n: fuoriShopify.length },
  { voce: '→ DA ARCHIVIARE, sostituiti da un generico', n: ids.length },
  { voce: '→ senza famiglia, lasciati stare', n: resto.length },
  { voce: 'righe di consegna che li usano', n: righeConsegna.length },
  { voce: 'somma dei loro prezzi scritti (€)', n: Math.round(somma * 100) / 100 },
]);
console.log('senza famiglia:', resto.map((x) => x.name).join(' · ') || 'nessuno');

if (RIPRISTINA) {
  const r = await p.product.updateMany({ where: { archivedReason: MOTIVO }, data: { archived: false, archivedAt: null, archivedReason: null } });
  const generici = await p.product.findMany({ where: { createdFrom: NATO }, select: { id: true, name: true } });
  let tolti = 0;
  for (const g of generici) {
    const usato = await p.deliveryProduct.count({ where: { productId: g.id } });
    if (usato) { console.log(`  ${g.name}: già usato in ${usato} righe, non si cancella`); continue; }
    await p.product.delete({ where: { id: g.id } });
    tolti++;
  }
  console.log(`RIPRISTINATI: ${r.count} · generici rimossi: ${tolti}`);
} else if (SCRIVI) {
  let creati = 0, gia = 0, archiviati = 0;
  for (const fam of FAMIGLIE) {
    const righe = gruppi.get(fam.nome) ?? [];
    if (!righe.length) continue;
    const cat = categorie.find((c) => fam.categoria.test(c.name)) ?? null;
    const esiste = await p.product.findFirst({ where: { sku: fam.sku }, select: { id: true } });
    const dati = {
      name: fam.nome,
      description: `Prodotto generico: si usa quando la consegna non ha un articolo preciso a catalogo. Il prezzo si scrive sulla riga della consegna. Creato il 07/09/2026 al posto di ${righe.length} righe col prezzo nel nome.`,
      price: 0,
      type: 'NON_UNICO',
      partnerId: deluxy.id,
      categoryId: cat?.id ?? null,
      active: true,
      approved: true,
      hasVariants: false,
      tipologiaVendita: 'mix',
      createdFrom: NATO,
    };
    if (esiste) { await p.product.update({ where: { id: esiste.id }, data: dati }); gia++; }
    else { await p.product.create({ data: { ...dati, sku: fam.sku } }); creati++; }
    const r = await p.product.updateMany({
      where: { id: { in: righe.map((x) => x.id) } },
      data: { archived: true, archivedAt: new Date(), archivedReason: MOTIVO },
    });
    archiviati += r.count;
  }
  const dopo = ids.length ? await p.deliveryProduct.findMany({ where: { productId: { in: ids } }, select: { price: true, quantity: true } }) : [];
  const sommaDopo = dopo.reduce((n, r) => n + (r.price ?? 0) * (r.quantity ?? 1), 0);
  const restano = await p.product.count({ where: { deletedAt: null, archived: false } });
  console.log(`\nGENERICI creati: ${creati} · aggiornati: ${gia} · prodotti archiviati: ${archiviati}`);
  console.log(`righe di consegna dopo: ${dopo.length} · somma dopo: ${Math.round(sommaDopo * 100) / 100} €`);
  console.log(Math.abs(sommaDopo - somma) < 0.01 && dopo.length === righeConsegna.length ? '✓ i valori delle consegne NON sono cambiati' : '⚠️ CONTROLLARE');
  console.log('prodotti non archiviati rimasti a catalogo:', restano);
} else console.log('PROVA: nulla scritto. `--scrivi` per applicare.');

await p.$disconnect();
