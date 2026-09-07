/**
 * ⭐ 07/09/2026 (regola utente: «il tipo di servizio è sempre Vendita Deluxy,
 * crea anche le consegne» e «per le 15 ferme controlla non fossero già state
 * create»). Le vendite ACCETTATE rimaste SENZA consegna — 15 dal 24/08, tutte
 * perché la vendita non aveva un tipo di servizio e `creaConsegna` usciva in
 * silenzio — qui trovano la loro consegna:
 *
 *  1. se per quell'ordine il partner HA GIÀ una consegna (inserita a mano
 *     dall'ufficio: DDT = numero d'ordine, oppure stesso partner, stessa data
 *     e stesso cognome del destinatario) → la vendita si AGGANCIA a quella,
 *     niente doppioni, righe non toccate;
 *  2. altrimenti nasce la consegna con i SERVIZI VERI dell'API
 *     (`SalesService.creaConsegnaMancante`, tipo di servizio «Vendita Deluxy»).
 *     Più vendite dello stesso ordine per lo STESSO partner = UNA consegna:
 *     la prima la crea, le altre ci aggiungono la loro riga prodotto.
 *
 * Prima, per le vendite nate da Orders con quantità 1, si rilegge la riga
 * d'ordine in Orders: se diceva «×2» o «×5» (#12901: 2 Macarons e 5 Praline
 * nati come 1 e 1), la vendita prende i pezzi e l'importo per i pezzi.
 * Lettura una tantum dello schema `orders` (Standard §7: mai nel codice
 * dell'app, ammessa in uno script di rimedio).
 *
 * Prova senza argomenti (non scrive niente); `--applica` per scrivere;
 * `--solo id1,id2` per limitare a certe vendite; `--salta id1,id2` per escluderne.
 *
 * Esecuzione: cd api && npx ts-node scripts/crea-consegne-vendite-ferme.ts [--applica]
 */
import * as fs from 'node:fs';

async function main() {
  const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
    .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))!;
  const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
  u.searchParams.set('schema', 'platform');
  process.env.DATABASE_URL = u.toString();

  const args = process.argv.slice(2);
  const APPLICA = args.includes('--applica');
  const lista = (flag: string) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : []; };
  const SOLO = lista('--solo');
  const SALTA = lista('--salta');

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { SalesService } = await import('../src/sales/sales.module');
  const { PrismaService } = await import('../src/prisma/prisma.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sales = app.get(SalesService);
  const prisma = app.get(PrismaService);
  const ufficio = { sub: null as any, email: 'script:crea-consegne-vendite-ferme', role: 'ADMIN' } as any;
  const gg = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

  const ferme = (await prisma.sale.findMany({
    where: { status: 'accettata', deliveryId: null },
    include: { product: { select: { name: true, sku: true, publicPrice: true } }, productVariant: { select: { id: true, sku: true, name: true, price: true, publicPrice: true } }, partner: { select: { insegna: true } } },
    orderBy: { createdAt: 'asc' },
  })).filter((v) => (!SOLO.length || SOLO.includes(v.id)) && !SALTA.includes(v.id));
  console.log(`${APPLICA ? 'APPLICO' : 'PROVA (niente scritto)'} · vendite accettate senza consegna: ${ferme.length}\n`);

  // Gruppi: stesso ordine, stesso partner = una consegna sola.
  const gruppi = new Map<string, typeof ferme>();
  for (const v of ferme) {
    const k = `${v.source}|${v.externalOrderId ?? v.id}|${v.partnerId ?? '-'}`;
    gruppi.set(k, [...(gruppi.get(k) ?? []), v]);
  }

  let create = 0, agganciate = 0, saltate = 0, corrette = 0, righeAggiunte = 0;
  for (const gruppo of gruppi.values()) {
    const prima = gruppo[0];
    const etichetta = (v: (typeof ferme)[number]) =>
      `#${v.externalOrderNumber ?? '?'} · ${v.partner?.insegna ?? 'SENZA PARTNER'} · ${v.product?.name ?? v.productName ?? '(senza prodotto)'}${v.productVariant?.name ? ' (' + v.productVariant.name + ')' : ''} · ${v.amount} € × ${v.quantity} · consegna ${gg(v.deliveryDate)}`;

    // 0. Pezzi e importo dalla riga di Orders, se la vendita dice 1 e l'ordine di più.
    for (const v of gruppo) {
      if (v.source !== 'deluxy-orders' || !v.externalOrderId || v.quantity > 1) continue;
      const skus = [v.productVariant?.sku, v.product?.sku, v.productSku].filter(Boolean).map((s) => String(s).toUpperCase());
      const righe = (await prisma.$queryRawUnsafe(
        `SELECT sku, titolo, quantita, prezzo FROM orders."RigaOrdine" WHERE "ordineId" = $1`, v.externalOrderId,
      ).catch(() => [])) as { sku: string | null; titolo: string | null; quantita: number | null; prezzo: number | null }[];
      const r = righe.find((x) => x.sku && skus.includes(String(x.sku).toUpperCase()))
        ?? righe.find((x) => x.titolo && v.product?.name && x.titolo.trim().toLowerCase() === v.product.name.trim().toLowerCase());
      if (r && (r.quantita ?? 1) > 1) {
        const pezzi = Math.round(Number(r.quantita));
        const importo = r.prezzo != null ? Math.round(Number(r.prezzo) * pezzi * 100) / 100 : v.amount;
        console.log(`  ↳ ${etichetta(v)}\n    riga d'ordine «${r.titolo}» ×${pezzi} a ${r.prezzo} € → vendita ${importo} € × ${pezzi}`);
        if (APPLICA) {
          await prisma.sale.update({ where: { id: v.id }, data: { quantity: pezzi, amount: importo } });
          await sales.registra(v.id, 'modifica', `Pezzi e importo riallineati alla riga d'ordine: ${pezzi} × ${r.prezzo} € = ${importo} € (era ${v.amount} € × ${v.quantity})`, ufficio);
          v.quantity = pezzi; v.amount = importo;
        }
        corrette++;
      }
    }

    // 1. Manca qualcosa di obbligatorio? Si dice, non si inventa.
    const manca = [!prima.partnerId && 'partner', !prima.deliveryDate && 'data', (!prima.recipientFirstName || !prima.recipientLastName) && 'destinatario', !prima.recipientAddress && 'indirizzo'].filter(Boolean);
    if (manca.length) {
      for (const v of gruppo) console.log(`✗ ${etichetta(v)} — manca: ${manca.join(', ')}`);
      saltate += gruppo.length;
      continue;
    }

    // 2. Una consegna c'è GIÀ? (DDT = numero d'ordine; oppure partner + data + cognome)
    const numero = prima.externalOrderNumber?.trim() || null;
    const esistente = await prisma.delivery.findFirst({
      where: {
        deletedAt: null,
        partnerId: prima.partnerId!,
        OR: [
          ...(numero ? [{ ddtNumber: numero }] : []),
          { date: prima.deliveryDate!, recipientLastName: { equals: prima.recipientLastName!, mode: 'insensitive' as const } },
        ],
      },
      select: { id: true, code: true, date: true, ddtNumber: true, status: true },
      orderBy: { code: 'desc' },
    });
    if (esistente) {
      const altra = await prisma.sale.findFirst({ where: { deliveryId: esistente.id, id: { notIn: gruppo.map((v) => v.id) } }, select: { id: true, externalOrderNumber: true } });
      const giaLegata = Boolean(altra);
      console.log(`≡ ${etichetta(prima)} — consegna GIÀ ESISTENTE #${esistente.code} (${esistente.status}, ${gg(esistente.date)}${esistente.ddtNumber ? ', DDT ' + esistente.ddtNumber : ''})${giaLegata ? ' — già legata a un\'altra vendita: NON tocco' : ''}`);
      for (const v of gruppo.slice(1)) console.log(`≡   ${etichetta(v)} — stesso ordine, stessa consegna`);
      if (!giaLegata && APPLICA) {
        await prisma.sale.update({ where: { id: prima.id }, data: { deliveryId: esistente.id, historyAt: new Date() } });
        await sales.registra(prima.id, 'stato', `Agganciata alla consegna #${esistente.code}, già inserita dall'ufficio (nessun doppione)`, ufficio);
        for (const v of gruppo.slice(1)) await sales.registra(v.id, 'nota', `Stesso ordine: la consegna è la #${esistente.code} (righe non toccate)`, ufficio);
      }
      agganciate += gruppo.length;
      continue;
    }

    // 3. Nasce la consegna dalla prima vendita; le altre aggiungono la loro riga.
    if (!APPLICA) {
      console.log(`✓ ${etichetta(prima)} — la consegna nascerebbe (Vendita Deluxy)`);
      for (const v of gruppo.slice(1)) console.log(`✓   ${etichetta(v)} — riga aggiunta alla stessa consegna`);
      create++; righeAggiunte += gruppo.length - 1;
      continue;
    }
    const esito = await sales.creaConsegnaMancante(prima.id, ufficio);
    if (!esito.creata || !esito.consegna) { console.log(`✗ ${etichetta(prima)} — ${esito.motivo}`); saltate += gruppo.length; continue; }
    console.log(`✓ ${etichetta(prima)} → consegna #${esito.consegna.code}`);
    create++;
    for (const v of gruppo.slice(1)) {
      const pezzi = Math.max(1, v.quantity || 1);
      const listino = v.productVariant?.price ?? v.productVariant?.publicPrice ?? v.product?.publicPrice ?? null;
      const alPartner = (v.amount ?? 0) * (1 - (v.discountPercent ?? 0) / 100);
      await prisma.deliveryProduct.create({
        data: {
          deliveryId: esito.consegna.id,
          productId: v.productId,
          productName: v.product?.name ?? v.productName ?? null,
          productSku: v.product?.sku ?? v.productSku ?? null,
          productVariantId: v.productVariantId ?? null,
          variantName: v.variantName ?? v.productVariant?.name ?? null,
          quantity: pezzi,
          price: listino ?? (alPartner > 0 ? Math.round((alPartner / pezzi) * 100) / 100 : null),
        },
      });
      await prisma.sale.update({ where: { id: v.id }, data: { serviceTypeId: prima.serviceTypeId ?? undefined, historyAt: new Date() } });
      await sales.registra(v.id, 'nota', `Stesso ordine dello stesso partner: riga prodotto aggiunta alla consegna #${esito.consegna.code} (una consegna, non due)`, ufficio);
      console.log(`✓   ${etichetta(v)} → riga aggiunta alla #${esito.consegna.code}`);
      righeAggiunte++;
    }
  }
  console.log(`\n${APPLICA ? 'Create' : 'Nascerebbero'}: ${create} (+${righeAggiunte} righe) · agganciate a consegne esistenti: ${agganciate} · saltate: ${saltate} · quantità corrette: ${corrette}`);
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
