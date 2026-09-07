/**
 * SECONDO GIRO DEI GENERICI: le righe NATE PER UN ORDINE SOLO (07/09/2026, regola utente:
 * «vedo ancora prodotti come 125 rose cuba o 15 rose: crea un generico Rose per questi e
 * archivia gli altri. Ci sono anche tanti prodotti come 25€ torta che dovrebbero essere stati
 * archiviati perché ora abbiamo Torta»).
 *
 * Il primo giro (`prodotti-generici-deluxy.mjs`) prendeva solo i prodotti NON ATTIVI e NON
 * APPROVATI, e questi gli sono sfuggiti: sono ATTIVI ma non approvati — 31 col prezzo nel
 * nome, 29 «rose» col numero davanti.
 *
 * COME SI RICONOSCE UNA RIGA NATA PER UN ORDINE SOLO — due segni, non uno:
 *  1. non è approvata (nessuno l'ha messa a catalogo per davvero) e non sta su Shopify;
 *  2. il NOME contiene il prezzo («Rosa bianca 6 €», «€15 Stampa Foto Torta») oppure comincia
 *     con un numero di pezzi («125 rose Piacenza», «15 Rose Cannavò 14 feb pagato bonifico»).
 * Il secondo segno è quello che conta: senza, il filtro «non approvato» prenderebbe anche i
 * prodotti arrivati da Merchandising, che entrano apposta con `approved: false` in attesa di
 * un prezzo vero.
 *
 * NON SI TOCCANO: i prodotti su Shopify, gli APPROVATI, gli UNICI dei partner e tutto quello
 * che è abbinato a CHANEL (regola dell'utente: sono le voci con cui le boutique inseriscono
 * le loro consegne).
 *
 * Si ARCHIVIA, non si cancella: le consegne passate continuano a puntare al prodotto di prima
 * col prezzo scritto sulla riga. Lo script misura la somma prima e dopo.
 * PROVA di default; `--scrivi` esegue; `--ripristina` disfa.
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
const MOTIVO = 'riga-di-un-ordine-solo-2026-09-07';
const NATO = 'generico-2026-09-07';
const p = new PrismaClient();

/** ⭐ «Rose» è una famiglia sua: si vendono a numero, e il numero cambia ogni volta. */
const FAMIGLIE = [
  { nome: 'Rose', sku: 'GEN-ROSE', re: /\brose\b|\brosa\b|\brose\s|rosa rossa|rosa bianca/i, categoria: /^rose$/i },
  { nome: 'Bouquet', sku: 'GEN-BOUQUET', re: /bouquet|boquet|mazzo/i, categoria: /^fiori$/i },
  { nome: 'Fiori', sku: 'GEN-FIORI', re: /fior|ortensi|orchide|orchid|tulipan|girasol|peoni|piant|composizion|cesto|cappellier/i, categoria: /^fiori$/i },
  { nome: 'Torte e dolci', sku: 'GEN-TORTE', re: /torta|torte|cake|dolc|tiramis|crostat|pasticc|mignon|macaron|pralin|cioccolat|brioche|croissant|colazion|candelina/i, categoria: /cake design|torte/i },
  { nome: 'Vino e bollicine', sku: 'GEN-VINO', re: /vino|champagne|prosecco|spumante|bollicin|bottigli|dom p|moet|veuve/i, categoria: /enotec|vino/i },
  { nome: 'Palloncini', sku: 'GEN-PALLONCINI', re: /pallonc|balloon/i, categoria: /pallonc/i },
  { nome: 'Sushi e gastronomia', sku: 'GEN-GASTRONOMIA', re: /sushi|maki|nigiri|gunkan|roll|tempura|sashimi|poke|uova/i, categoria: /gastronom|sushi/i },
  // Il resto delle righe di un ordine solo: candeline, vasi, biglietti, un bracciale scritto a
  // mano. Non hanno una famiglia loro e non ne meritano una: stanno insieme.
  { nome: 'Varie', sku: 'GEN-VARIE', re: /.*/, categoria: /regal/i },
];

const conPrezzo = (n) => /(\d+[.,]?\d*\s*€)|(€\s*\d+)/.test(n);
const numeroDavanti = (n) => /^\s*\d{1,3}\s+[a-zàèéìòù]/i.test(n);

const deluxy = await p.partner.findFirst({ where: { insegna: 'Deluxy' }, select: { id: true } });
if (!deluxy) { console.error('Partner «Deluxy» non trovato.'); process.exit(1); }
const chanel = new Set((await p.partner.findMany({ where: { insegna: { contains: 'chanel', mode: 'insensitive' } }, select: { id: true } })).map((x) => x.id));

const candidati = await p.product.findMany({
  where: { deletedAt: null, archived: false, type: 'NON_UNICO', approved: false },
  select: { id: true, name: true, sku: true, price: true, platforms: true, partnerId: true, category: { select: { name: true } } },
});
const adHoc = candidati.filter(
  (x) =>
    (x.platforms ?? '').replace(/[[\]"\s]/g, '').length === 0 &&
    !(x.partnerId && chanel.has(x.partnerId)) &&
    (conPrezzo(x.name) || numeroDavanti(x.name)),
);

const gruppi = new Map();
const resto = [];
for (const x of adHoc) {
  const f = FAMIGLIE.find((fam) => fam.re.test(`${x.name} ${x.category?.name ?? ''}`));
  if (f) { const a = gruppi.get(f.nome) ?? []; a.push(x); gruppi.set(f.nome, a); }
  else resto.push(x);
}

const categorie = await p.category.findMany({ select: { id: true, name: true } });
const ids = [...gruppi.values()].flat().map((x) => x.id);
const righeConsegna = ids.length ? await p.deliveryProduct.findMany({ where: { productId: { in: ids } }, select: { price: true, quantity: true } }) : [];
const somma = righeConsegna.reduce((n, r) => n + (r.price ?? 0) * (r.quantity ?? 1), 0);

console.table(
  FAMIGLIE.filter((f) => (gruppi.get(f.nome) ?? []).length).map((f) => ({
    generico: f.nome,
    sku: f.sku,
    archivia: (gruppi.get(f.nome) ?? []).length,
    esempi: (gruppi.get(f.nome) ?? []).slice(0, 3).map((x) => x.name).join(' · ').slice(0, 66),
  })),
);
console.table([
  { voce: 'non approvati a catalogo (non unici)', n: candidati.length },
  { voce: '→ righe nate per un ordine solo (prezzo o numero nel nome, fuori Shopify, non Chanel)', n: adHoc.length },
  { voce: '→ DA ARCHIVIARE, hanno un generico', n: ids.length },
  { voce: '→ senza famiglia, lasciati stare', n: resto.length },
  { voce: 'righe di consegna che li usano', n: righeConsegna.length },
  { voce: 'somma dei loro prezzi scritti (€)', n: Math.round(somma * 100) / 100 },
]);
console.log('senza famiglia:', resto.map((x) => x.name).join(' · ') || 'nessuno');

if (RIPRISTINA) {
  const r = await p.product.updateMany({ where: { archivedReason: MOTIVO }, data: { archived: false, archivedAt: null, archivedReason: null } });
  console.log('RIPRISTINATI:', r.count);
} else if (SCRIVI) {
  let creati = 0, gia = 0, archiviati = 0;
  for (const fam of FAMIGLIE) {
    const righe = gruppi.get(fam.nome) ?? [];
    if (!righe.length) continue;
    const cat = categorie.find((c) => fam.categoria.test(c.name)) ?? null;
    const esiste = await p.product.findFirst({ where: { sku: fam.sku }, select: { id: true } });
    const dati = {
      name: fam.nome,
      description: 'Prodotto generico: si usa quando la consegna non ha un articolo preciso a catalogo. Il prezzo si scrive sulla riga della consegna (07/09/2026).',
      price: 0,
      type: 'NON_UNICO',
      partnerId: deluxy.id,
      categoryId: cat?.id ?? null,
      active: true,
      approved: true,
      hasVariants: false,
      tipologiaVendita: fam.nome === 'Rose' ? 'quantita' : 'mix',
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
  console.log(`\nGENERICI creati: ${creati} · aggiornati: ${gia} · archiviati: ${archiviati}`);
  console.log(`righe di consegna dopo: ${dopo.length} · somma dopo: ${Math.round(sommaDopo * 100) / 100} €`);
  console.log(Math.abs(sommaDopo - somma) < 0.01 && dopo.length === righeConsegna.length ? '✓ i valori delle consegne NON sono cambiati' : '⚠️ CONTROLLARE');
  console.log('prodotti non archiviati a catalogo:', restano);
} else console.log('PROVA: nulla scritto. `--scrivi` per applicare.');

await p.$disconnect();
