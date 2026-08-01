// Importa i CONSUMERS (le persone che comprano su Shopify) da Orders.
//
// Orders possiede gli ordini: qui se ne tiene lo specchio, con la data della
// fotografia. Rilanciare lo script aggiorna i numeri di chi c'è già e aggiunge
// chi è comparso — non cancella nessuno, nemmeno chi da Orders sparisce (un
// cliente non «smette di essere esistito»: al massimo smette di comprare).
//
//   node scripts/importa-consumers.mjs --prova   → legge e non scrive
//   node scripts/importa-consumers.mjs           → importa
//
// Serve `ORDERS_API_KEY` (chiave di sola lettura creata in Orders) nel `.env`.
// Facoltativa `ORDERS_URL` (default: produzione).
//
// L'aggancio all'anagrafica B2B si fa per EMAIL e TELEFONO, mai per nome:
// misurato il 31/07/2026 su dati veri, il nome trovava 2 casi su 61 e portava
// falsi positivi (le omonimie fra insegne e cognomi sono la norma).

import { Prisma, PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

// Il .env non è caricato in automatico da `node`: lo si legge a mano, come
// negli altri script di questa cartella.
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const riga of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const prova = process.argv.includes("--prova");
const BASE = (process.env.ORDERS_URL ?? "https://deluxy-orders.vercel.app").replace(/\/$/, "");
const KEY = process.env.ORDERS_API_KEY?.replace(/^﻿/, "").trim();

const norm = (v) => (v ?? "").trim().toLowerCase();
const soloCifre = (v) => (v ?? "").replace(/\D/g, "").replace(/^0039/, "").replace(/^39/, "");
const data = (v) => (v ? new Date(v) : null);

async function pagina(page) {
  const res = await fetch(`${BASE}/api/v1/clienti?page=${page}&limit=500`, { headers: { "x-api-key": KEY } });
  if (!res.ok) throw new Error(`Orders ha risposto ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}


// Un solo statement per blocco. `ON CONFLICT (chiave)` aggiorna chi c'è già;
// l'aggancio scritto A MANO non si tocca (`agganciatoCome = 'manuale'` vince
// su quello dedotto, altrimenti ogni sincronizzazione cancellerebbe il lavoro
// di una persona).
async function scriviLotto(righe) {
  let creati = 0;
  for (let i = 0; i < righe.length; i += 200) {
    const blocco = righe.slice(i, i + 200);
    const prima = await prisma.consumer.count();
    const valori = blocco.map((r) => Prisma.sql`(
      gen_random_uuid()::text, ${r.chiave}, ${r.nome}, ${r.email}, ${r.telefono}, ${r.citta},
      ${r.ordini}, ${r.annullati}, ${r.speso}, ${r.ordineMedio},
      ${r.primoOrdine}::timestamp, ${r.ultimoOrdine}::timestamp, ${r.giorniDallUltimo},
      ${r.brand}::text[], ${r.segmento}, ${r.tipologia},
      ${r.acquisizioneCanale}, ${r.acquisizionePrimo}::timestamp,
      ${r.riassunto}, ${r.gusti}, ${r.riepilogoOrdini},
      ${r.partnerId}, ${r.come}, ${r.sincronizzatoIl}::timestamp, now()
    )`);
    await prisma.$executeRaw`
      INSERT INTO "anagrafiche"."Consumer" (
        "id", "chiave", "nome", "email", "telefono", "citta",
        "ordini", "annullati", "speso", "ordineMedio",
        "primoOrdine", "ultimoOrdine", "giorniDallUltimo",
        "brand", "segmento", "tipologia",
        "acquisizioneCanale", "acquisizionePrimo",
        "riassunto", "gusti", "riepilogoOrdini",
        "partnerId", "agganciatoCome", "sincronizzatoIl", "creatoIl"
      ) VALUES ${Prisma.join(valori)}
      ON CONFLICT ("chiave") DO UPDATE SET
        "nome" = EXCLUDED."nome", "email" = EXCLUDED."email", "telefono" = EXCLUDED."telefono",
        "citta" = EXCLUDED."citta", "ordini" = EXCLUDED."ordini", "annullati" = EXCLUDED."annullati",
        "speso" = EXCLUDED."speso", "ordineMedio" = EXCLUDED."ordineMedio",
        "primoOrdine" = EXCLUDED."primoOrdine", "ultimoOrdine" = EXCLUDED."ultimoOrdine",
        "giorniDallUltimo" = EXCLUDED."giorniDallUltimo", "brand" = EXCLUDED."brand",
        "segmento" = EXCLUDED."segmento", "tipologia" = EXCLUDED."tipologia",
        "acquisizioneCanale" = EXCLUDED."acquisizioneCanale", "acquisizionePrimo" = EXCLUDED."acquisizionePrimo",
        "riassunto" = EXCLUDED."riassunto", "gusti" = EXCLUDED."gusti",
        "riepilogoOrdini" = EXCLUDED."riepilogoOrdini",
        "partnerId" = CASE WHEN "Consumer"."agganciatoCome" = 'manuale' THEN "Consumer"."partnerId" ELSE EXCLUDED."partnerId" END,
        "agganciatoCome" = CASE WHEN "Consumer"."agganciatoCome" = 'manuale' THEN 'manuale' ELSE EXCLUDED."agganciatoCome" END,
        "sincronizzatoIl" = EXCLUDED."sincronizzatoIl"
    `;
    creati += (await prisma.consumer.count()) - prima;
  }
  return [creati, righe.length - creati];
}

async function main() {
  if (!KEY) {
    console.error("Manca ORDERS_API_KEY nel .env: senza chiave Orders non risponde.");
    process.exitCode = 1;
    return;
  }

  // Indice delle anagrafiche B2B per email e telefono (azienda + referenti).
  const partner = await prisma.$queryRawUnsafe(`
    SELECT p."id", p."nome", p."email", p."telefono",
           (SELECT string_agg(coalesce(c."email",''), '|') FROM "anagrafiche"."Contatto" c WHERE c."partnerId" = p."id") AS email_ref,
           (SELECT string_agg(coalesce(c."telefono",''), '|') FROM "anagrafiche"."Contatto" c WHERE c."partnerId" = p."id") AS tel_ref
    FROM "anagrafiche"."Partner" p WHERE p."attivo"
  `);
  const perEmail = new Map();
  const perTel = new Map();
  for (const p of partner) {
    for (const e of [p.email, ...(p.email_ref ?? "").split("|")].map(norm).filter(Boolean)) {
      if (!perEmail.has(e)) perEmail.set(e, p);
    }
    for (const t of [p.telefono, ...(p.tel_ref ?? "").split("|")].map(soloCifre).filter((x) => x.length >= 8)) {
      if (!perTel.has(t)) perTel.set(t, p);
    }
  }
  console.log(`indice B2B: ${perEmail.size} email, ${perTel.size} telefoni da ${partner.length} anagrafiche`);

  const prima = await pagina(1);
  console.log(`Orders ha ${prima.totale} clienti (${prima.pagine} pagine da 500)`);
  if (prova) console.log("--prova: leggo e non scrivo.\n");

  let letti = 0, creati = 0, aggiornati = 0, agganciati = 0;
  const esempi = [];
  const lotto = [];

  for (let page = 1; page <= prima.pagine; page++) {
    const p = page === 1 ? prima : await pagina(page);
    for (const c of p.clienti) {
      letti++;
      // ⚠️ La chiave è quella di ORDERS, decodificata dal codice che ci manda
      // (email → telefono → nome). Ricalcolarla qui sembrava equivalente e non
      // lo era: normalizzando il telefono a modo mio, due clienti distinti di
      // Orders finivano sulla stessa chiave e l'INSERT moriva con «ON CONFLICT
      // DO UPDATE cannot affect row a second time». La chiave la decide chi
      // possiede il dato.
      const chiave = c.cliente ? Buffer.from(c.cliente, "base64url").toString("utf8") : "";
      if (!chiave) continue;

      let partnerId = null;
      let come = null;
      const e = norm(c.email);
      if (e && perEmail.has(e)) { partnerId = perEmail.get(e).id; come = "email"; }
      if (!partnerId) {
        const t = soloCifre(c.telefono);
        if (t.length >= 8 && perTel.has(t)) { partnerId = perTel.get(t).id; come = "telefono"; }
      }
      if (partnerId) {
        agganciati++;
        if (esempi.length < 8) esempi.push(`  ${c.nome ?? c.email} → ${perEmail.get(e)?.nome ?? perTel.get(soloCifre(c.telefono))?.nome} (via ${come})`);
      }

      const dati = {
        nome: c.nome ?? null,
        email: c.email ?? null,
        telefono: c.telefono ?? null,
        citta: c.citta ?? null,
        ordini: c.ordini ?? 0,
        annullati: c.annullati ?? 0,
        speso: c.speso ?? 0,
        ordineMedio: c.ordineMedio ?? 0,
        primoOrdine: data(c.acquisizione?.primoOrdine ?? c.primoOrdine),
        ultimoOrdine: data(c.ultimoOrdine),
        giorniDallUltimo: c.giorniDallUltimo ?? null,
        brand: Array.isArray(c.brand) ? c.brand : [],
        segmento: c.segmento ?? null,
        tipologia: c.tipologia ?? null,
        acquisizioneCanale: c.acquisizione?.canale ?? null,
        acquisizionePrimo: data(c.acquisizione?.primoOrdine),
        riassunto: c.riepilogo?.riassunto ?? null,
        gusti: c.riepilogo?.gusti ?? null,
        riepilogoOrdini: c.riepilogo?.ordiniConsiderati ?? null,
        sincronizzatoIl: new Date(),
      };

      if (prova) continue;
      lotto.push({ chiave, partnerId, come, ...dati });
    }

    // ⚠️ Si scrive A BLOCCHI, non un record alla volta. Con 10.285 clienti il
    // giro «leggi-poi-scrivi» faceva 20.000 andate e ritorni su un pooler con
    // connection_limit=5, e il server chiudeva la connessione a metà import
    // (successo davvero, al 140° record). Un solo INSERT ... ON CONFLICT per
    // blocco: una andata e ritorno ogni 200 persone.
    if (!prova && lotto.length > 0) {
      const [n, m] = await scriviLotto(lotto);
      creati += n;
      aggiornati += m;
      lotto.length = 0;
    }
    if (page % 5 === 0 || page === prima.pagine) console.log(`  …pagina ${page}/${prima.pagine} — letti ${letti}`);
  }

  console.log(`\nletti ${letti} · creati ${creati} · aggiornati ${aggiornati} · agganciati a un'anagrafica B2B ${agganciati}`);
  if (esempi.length) console.log("esempi di aggancio:\n" + esempi.join("\n"));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
