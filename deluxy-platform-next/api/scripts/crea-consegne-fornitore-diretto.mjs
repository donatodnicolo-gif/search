/**
 * ORDINI A FORNITORE DIRETTO → VENDITA IN STORICO + CONSEGNA (04/09/2026,
 * regola utente: «in questi casi metti direttamente in app delivery con
 * vendita che va in storico, con fornitore Artista Locale e prezzo partner il
 * prezzo dato al fornitore»).
 *
 * Il Customer Service, dando l'ordine a un fornitore esterno in chat, scrive
 * in Orders `evasione = fornitore_diretto` e il costo del fornitore. Fino a
 * oggi lo smistamento saltava quegli ordini e in piattaforma non entrava
 * niente: l'ufficio rifaceva a mano vendita e consegna (53 volte su 72).
 * Questo script fa la stessa cosa, uguale, per quelli rimasti fuori.
 *
 * Che cosa crea, per ogni ordine:
 *   CONSEGNA  servizio «Vendita Deluxy», partner ARTISTA LOCALE, una riga
 *             prodotto col PREZZO DATO AL FORNITORE, DDT = numero d'ordine.
 *   VENDITA   importo = totale dell'ordine (il pubblico), sconto 0, partner
 *             Artista Locale, stato ACCETTATA (storico) e collegata a quella
 *             consegna.
 *
 * ⚠️ L'identità dell'ordine è l'ID di Orders, MAI il numero: lo stesso numero
 * esiste su negozi e anni diversi ([[trappola-numero-non-e-identita]]).
 * ⚠️ Idempotente: salta gli ordini che hanno già una vendita con quell'id.
 * ⚠️ Legge lo schema `orders` in sola lettura: è un'operazione una tantum di
 * ufficio, non codice dell'app (Standard §7).
 *
 * Uso: node scripts/crea-consegne-fornitore-diretto.mjs [--applica]
 * Senza `--applica` non scrive niente e mostra che cosa farebbe.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const base = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
const conSchema = (schema) => { const u = new URL(base); u.searchParams.set('schema', schema); return u.toString(); };
const orders = new PrismaClient({ datasources: { db: { url: conSchema('orders') } } });
const platform = new PrismaClient({ datasources: { db: { url: conSchema('platform') } } });

const applica = process.argv.includes('--applica');
const PARTNER_ARTISTA = 'cmt5t8yjd00ari6v4aa2vlrbc'; // Artista Locale
const SERVIZIO_VENDITA = 'cmt5yxrke0002i6awmgz8rpeh'; // Vendita Deluxy

const arrotonda = (n) => Math.round((n ?? 0) * 100) / 100;

try {
  const artista = await platform.partner.findUnique({ where: { id: PARTNER_ARTISTA }, select: { insegna: true } });
  const servizio = await platform.serviceType.findUnique({ where: { id: SERVIZIO_VENDITA }, select: { name: true } });
  if (!artista || !servizio) throw new Error('Partner «Artista Locale» o servizio «Vendita Deluxy» non trovati.');

  const daFornitore = await orders.$queryRawUnsafe(`
    SELECT id, numero, brand, "data", "dataConsegna", "fasciaConsegna", "spedizioneNome", indirizzo, citta, cap,
           provincia, paese, "clienteTelefono", "clienteNome", biglietto, totale, "costoFornitore", fornitore, "annullatoIl"
    FROM orders."Ordine" WHERE evasione = 'fornitore_diretto' ORDER BY "data" ASC`);

  // ⚠️ Il confronto è sull'ID di Orders: il numero si ripete fra negozi.
  const giaDentro = await platform.sale.findMany({
    where: { externalOrderId: { in: daFornitore.map((o) => o.id) } },
    select: { externalOrderId: true },
  });
  const noti = new Set(giaDentro.map((s) => s.externalOrderId));
  const mancanti = daFornitore.filter((o) => !noti.has(o.id) && !o.annullatoIl);

  console.log(`fornitore diretto in Orders: ${daFornitore.length} · già in piattaforma: ${noti.size} · da creare: ${mancanti.length}`);
  if (!mancanti.length) { console.log('Niente da fare.'); process.exit(0); }

  const province = await platform.province.findMany({ select: { id: true, code: true } });
  const perCodice = new Map(province.map((p) => [p.code.toUpperCase(), p.id]));
  const estero = perCodice.get('EE');
  if (!estero) throw new Error('Manca la provincia «EE» (Estero): senza, gli ordini esteri non si possono creare.');

  let creati = 0;
  for (const o of mancanti) {
    const righe = await orders.$queryRawUnsafe(
      `SELECT titolo, variante, sku, quantita, prezzo FROM orders."RigaOrdine" WHERE "ordineId" = $1`, o.id);
    // La riga del prodotto è la prima vera: il costo del fornitore è UNO per
    // ordine, e spalmarlo su più righe inventerebbe prezzi che nessuno ha dato.
    const primaRiga = righe[0] ?? null;
    const codice = (o.provincia ?? '').trim().toUpperCase();
    const provinceId = perCodice.get(codice) ?? estero;
    const numero = String(o.numero ?? '').replace('#', '').trim();
    const nome = String(o.spedizioneNome ?? o.clienteNome ?? '').trim();
    const spazio = nome.lastIndexOf(' ');
    const primoNome = spazio > 0 ? nome.slice(0, spazio) : nome || '—';
    const cognome = spazio > 0 ? nome.slice(spazio + 1) : '';
    const indirizzo = [o.indirizzo, o.cap, o.citta, o.provincia, o.paese && o.paese !== 'IT' ? o.paese : null]
      .map((t) => (t ?? '').toString().trim()).filter(Boolean).join(', ');
    const quando = o.dataConsegna ?? o.data;
    const prezzoPartner = arrotonda(o.costoFornitore);
    const prodotto = primaRiga?.sku
      ? await platform.product.findFirst({ where: { sku: String(primaRiga.sku) }, select: { id: true, name: true, sku: true } })
      : null;

    console.log(
      `${applica ? 'CREO' : 'creerei'} · #${numero} ${o.brand} · ${quando?.toISOString().slice(0, 10) ?? 'senza data'} · ` +
      `prov ${perCodice.has(codice) ? codice : 'EE (' + (codice || o.paese || '?') + ')'} · ${o.fornitore ?? '—'} · partner ${prezzoPartner} € · pubblico ${arrotonda(o.totale)} € · ` +
      `«${primaRiga?.titolo ?? 'prodotto non indicato'}»`,
    );
    if (!applica) continue;

    await platform.$transaction(async (tx) => {
      const ultimo = await tx.delivery.aggregate({ _max: { code: true } });
      const consegna = await tx.delivery.create({
        data: {
          code: (ultimo._max.code ?? 0) + 1,
          date: quando,
          status: 'created',
          partnerId: PARTNER_ARTISTA,
          serviceTypeId: SERVIZIO_VENDITA,
          provinceId,
          ddtNumber: numero || null,
          ddtBrand: o.brand ?? null,
          recipientFirstName: primoNome,
          recipientLastName: cognome || primoNome,
          recipientAddress: indirizzo || 'indirizzo non indicato',
          recipientPhone: (o.clienteTelefono ?? '').trim() || null,
          notes: (o.biglietto ?? '').trim() || null,
          payable: true,
          products: {
            create: [{
              productId: prodotto?.id ?? null,
              productName: primaRiga?.titolo ?? prodotto?.name ?? 'Prodotto dell\'ordine',
              productSku: primaRiga?.sku ?? prodotto?.sku ?? null,
              variantName: primaRiga?.variante ?? null,
              quantity: 1,
              // ⭐ Il prezzo del partner È il costo dato al fornitore.
              price: prezzoPartner,
            }],
          },
          logs: {
            create: [{
              type: 'note',
              message: `Creata dall'ordine ${o.brand} #${numero}: evasione «fornitore diretto» in Orders, fornitore ${o.fornitore ?? '—'}, costo ${prezzoPartner} €`,
            }],
          },
        },
        select: { id: true, code: true },
      });
      await tx.sale.create({
        data: {
          productId: prodotto?.id ?? null,
          productName: primaRiga?.titolo ?? prodotto?.name ?? null,
          productSku: primaRiga?.sku ?? null,
          variantName: primaRiga?.variante ?? null,
          partnerId: PARTNER_ARTISTA,
          provinceId,
          brand: o.brand ?? 'DELUXY',
          amount: arrotonda(o.totale),
          discountPercent: 0,
          status: 'accettata',
          historyAt: new Date(),
          assignmentReason: `evasione «fornitore diretto» in Orders: fornitore ${o.fornitore ?? '—'}, costo ${prezzoPartner} €`,
          source: 'deluxy-orders',
          externalOrderId: o.id,
          externalOrderNumber: numero || null,
          recipientFirstName: primoNome,
          recipientLastName: cognome || primoNome,
          recipientAddress: indirizzo || null,
          recipientPhone: (o.clienteTelefono ?? '').trim() || null,
          deliveryDate: quando,
          serviceTypeId: SERVIZIO_VENDITA,
          deliveryId: consegna.id,
          logs: {
            create: [{
              type: 'stato',
              message: `Creata dall'ordine a fornitore diretto (${o.fornitore ?? '—'}, ${prezzoPartner} €): in storico e collegata alla consegna #${consegna.code}`,
            }],
          },
        },
      });
      console.log(`   → consegna #${consegna.code}`);
    });
    creati++;
  }
  console.log(applica ? `\n✓ create ${creati} consegne con la loro vendita in storico.` : `\n(prova: nessuna scrittura. Rilancia con --applica.)`);
} finally {
  await orders.$disconnect();
  await platform.$disconnect();
}
