// Importa i dati del database originario (MySQL, export in legacy/tabelle/) nel
// nuovo ambiente.
//
// Principi, tutti pagati sul campo:
//  - RIPETIBILE: ogni record si aggancia al suo `legacyId`, quindi rilanciare
//    l'import aggiorna invece di duplicare.
//  - NIENTE INVENZIONI: dove il legacy non dice, si lascia vuoto. Mai un valore
//    plausibile al posto di un dato mancante.
//  - A FASI: le anagrafiche prima, perche' tutto il resto si aggancia a loro.
//
// Uso:
//   node .../importa-legacy.mjs --fase anagrafiche --prova    # simula, non scrive
//   node .../importa-legacy.mjs --fase anagrafiche            # scrive davvero

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
const opzione = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PROVA = args.includes('--prova');
const FASE = opzione('fase', 'anagrafiche');
const TABELLE = opzione('tabelle', 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle');

// Offset per i legacyId del catalogo servizi lato VALET: vedi il commento
// sulla collisione di id sopra la fase `listini`.
const OFFSET_VALET = 900000;

// ---------------------------------------------------------------- lettura CSV

/** CSV con virgolette doppie e campi multiriga. */
function leggi(nome) {
  const file = path.join(TABELLE, `${nome}.csv`);
  if (!fs.existsSync(file)) return [];
  const testo = fs.readFileSync(file, 'utf8');
  const righe = []; let riga = [], campo = '', inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStr = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe[0].map((x) => x.trim());
  return righe.slice(1)
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(testa.map((c, i) => [c, r[i]])));
}

// ------------------------------------------------------------ conversioni

/**
 * ⚠️ Nell'export phpMyAdmin il vuoto e' la STRINGA "NULL", non un campo vuoto.
 * Senza questa conversione si scriverebbe la parola «NULL» dentro i campi —
 * e su una password significherebbe migliaia di account con lo stesso valore.
 */
const testo = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' || t === 'NULL' ? null : t;
};

/**
 * ⚠️ MySQL ammette la data zero `0000-00-00 00:00:00`, Postgres no: passarla
 * fa fallire l'intera riga. Vale anche per `provinces`, dove la meta' delle
 * date e' zero.
 */
const data = (v) => {
  const t = testo(v);
  if (!t || t.startsWith('0000-00-00')) return null;
  const d = new Date(t.replace(' ', 'T') + (/[Z+]/.test(t) ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d;
};

const numero = (v) => { const t = testo(v); if (t === null) return null; const n = Number(t); return Number.isNaN(n) ? null : n; };
const intero = (v) => { const n = numero(v); return n === null ? null : Math.trunc(n); };
const bool = (v) => { const t = testo(v); return t === null ? null : t === '1' || t.toLowerCase() === 'true'; };

/** `active` del legacy -> `status` del nuovo. 0 si tratta come -1 (decisione utente 23/08). */
const stato = (v, deletedAt) => {
  if (data(deletedAt)) return 'archived';        // il soft delete vince su tutto
  const t = testo(v);
  if (t === '1') return 'active';
  return 'invited';                              // -1 e 0 = «non attivato»
};

/**
 * Salva un record agganciandolo in tre modi, in quest'ordine:
 *   1. per `legacyId` — l'import e' gia' passato di qui, si aggiorna;
 *   2. per CHIAVE NATURALE (codice provincia, email…) — il record esiste gia'
 *      ma senza legacyId: e' il caso dei dati creati dal seed. Si aggiorna e
 *      gli si attacca il legacyId, cosi' dalla volta dopo basta il punto 1;
 *   3. altrimenti si crea.
 *
 * Senza il punto 2 l'import esplode contro gli indici unici del seed
 * (province MI/MB, utenti demo @deluxy.it) invece di fondersi con essi.
 */
async function salva(modello, legacyId, chiaveNaturale, dati) {
  const tabella = db[modello];
  if (legacyId !== null && legacyId !== undefined) {
    const esistente = await tabella.findUnique({ where: { legacyId } });
    if (esistente) return tabella.update({ where: { id: esistente.id }, data: dati });
  }
  if (chiaveNaturale) {
    const gia = await tabella.findUnique({ where: chiaveNaturale });
    if (gia) {
      segna(`${modello}: fusi col record esistente`);
      return tabella.update({ where: { id: gia.id }, data: { ...dati, legacyId } });
    }
  }
  return tabella.create({ data: { legacyId, ...dati } });
}

// ------------------------------------------------------------------ resoconto

const conto = {};
const segna = (chiave, n = 1) => { conto[chiave] = (conto[chiave] ?? 0) + n; };
const avvisi = [];

// ------------------------------------------------------------------ esecuzione

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;

const db = new PrismaClient();

console.log(`Fase: ${FASE}${PROVA ? '  (PROVA — non scrive niente)' : ''}`);
console.log(`Sorgente: ${TABELLE}\n`);

try {
  if (FASE === 'anagrafiche') await anagrafiche();
  else if (FASE === 'servizi') await servizi();
  else if (FASE === 'listini') await listini();
  else if (FASE === 'regole') await regole();
  else { console.log(`Fase sconosciuta: ${FASE}`); process.exit(1); }
} finally {
  await db.$disconnect();
}

console.log('\nRESOCONTO');
for (const [k, v] of Object.entries(conto)) console.log(`  ${k.padEnd(38)} ${String(v).padStart(6)}`);
if (avvisi.length) {
  console.log('\nAVVISI');
  for (const a of avvisi.slice(0, 20)) console.log(`  · ${a}`);
  if (avvisi.length > 20) console.log(`  … e altri ${avvisi.length - 20}`);
}
if (PROVA) console.log('\n(era una prova: nulla e\' stato scritto)');

// ------------------------------------------------- fase 2: tipologie servizio

/**
 * I 32 servizi veri del legacy, piu' un «Non indicato».
 *
 * Va fatta PRIMA delle consegne: nel nuovo schema `Delivery.serviceTypeId` e'
 * obbligatorio, e senza queste righe 62.376 consegne non avrebbero dove
 * agganciarsi.
 *
 * ⚠️ Le 17.669 consegne (28,3%) che nel legacy non hanno servizio finiscono su
 * «Non indicato»: e' una scelta esplicita per non inventare un dato che il
 * legacy non ha mai avuto, e le lascia riconoscibili a colpo d'occhio.
 */
async function servizi() {
  // pricingModel del legacy -> quello del nuovo schema.
  const MODELLO = {
    sales: 'VENDITA',
    fixedprice: 'PREZZO_FISSO',
    hourlyrate: 'A_ORA',
    warehouseservice: 'MAGAZZINO',
    corporate: 'CORPORATE',
  };

  // `code` e' unico e nel legacy non esiste: si ricava dal nome. I 5 codici del
  // seed (CONSEGNA_FISSA, SERVIZIO_ORARIO, VENDITA, CORPORATE, MAGAZZINO) sono
  // gia' occupati, quindi si parte da quelli per non collidere.
  const presi = new Set((await db.serviceType.findMany({ select: { code: true } })).map((x) => x.code));
  const codice = (nome, legacyId) => {
    let base = String(nome).toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || `SERVIZIO_${legacyId}`;
    let c = base, n = 2;
    while (presi.has(c)) c = `${base}_${n++}`;   // il nome si ripete: si numera
    presi.add(c);
    return c;
  };

  for (const s of leggi('service')) {
    const nome = testo(s.serviceName);
    const modello = MODELLO[testo(s.pricingModel)];
    if (!nome || !modello) {
      avvisi.push(`servizio ${s.id}: nome o pricingModel non riconosciuto (${testo(s.pricingModel)}), saltato`);
      segna('servizi saltati'); continue;
    }
    const legacyId = intero(s.id);
    // Se c'e' gia' (secondo giro), si tiene il codice suo invece di generarne
    // uno nuovo: cambiare il `code` a un servizio in uso e' un danno.
    const gia = await db.serviceType.findUnique({ where: { legacyId } });
    const dati = {
      name: nome,
      code: gia?.code ?? codice(nome, legacyId),
      pricingModel: modello,
      notes: testo(s.notes),
      hideCustomerInfo: bool(s.hideCustomerInformation) ?? false,
      active: !data(s.deletedAt),
    };
    if (!PROVA) await salva('serviceType', legacyId, null, dati);
    segna(`servizi ${modello}`);
    segna('servizi');
  }

  // Il contenitore delle consegne senza servizio.
  const NON_INDICATO = 'NON_INDICATO';
  if (!PROVA) {
    const gia = await db.serviceType.findUnique({ where: { code: NON_INDICATO } });
    if (!gia) {
      await db.serviceType.create({ data: {
        name: 'Non indicato',
        code: NON_INDICATO,
        pricingModel: 'PREZZO_FISSO',
        notes: 'Le consegne che nel database originario non avevano un tipo di servizio. '
             + 'Non e\' un servizio vero: serve a non inventare un dato mancante.',
        active: false,
      } });
      segna('creato il servizio «Non indicato»');
    } else segna('«Non indicato» gia presente');
  }
}

// ------------------------------------------------------ fase 3: listini
//
// 🔴 LA COLLISIONE DI ID, da tenere a mente per sempre.
//
// Nel legacy i cataloghi dei servizi sono DUE, con due spazi di id che si
// SOVRAPPONGONO:
//   · `service`      32 righe, id 5-39  -> lato PARTNER, usato da partner-service
//   · `tabella-38`    8 righe, id 3-10  -> lato VALET,   usato da expert-service
//
// Le 240 righe di `expert-service` usano i serviceId 3, 5 e 8. Tutti e tre
// esistono ANCHE in `service`: agganciandole al catalogo sbagliato, 112 listini
// valet su 240 finirebbero su un servizio che non c'entra nulla — e senza
// nessun errore, perche' l'id esiste davvero.
//
// Nel nuovo schema il catalogo e' UNO SOLO con un `scope`. Per non perdere la
// tracciabilita' e restare ripetibili, i servizi valet prendono
// `legacyId = OFFSET_VALET + id`.

async function listini() {
  // --- catalogo lato valet ------------------------------------------------
  const MODELLO_VALET = {
    fixedpricesalary: 'PREZZO_FISSO',
    hourlyratesalary: 'A_ORA',
    warehousesalary: 'MAGAZZINO',
  };
  const presi = new Set((await db.serviceType.findMany({ select: { code: true } })).map((x) => x.code));

  for (const s of leggi('tabella-38')) {
    const nome = testo(s.serviceName);
    const modello = MODELLO_VALET[testo(s.serviceType)];
    if (!nome || !modello) { avvisi.push(`servizio valet ${s.id}: tipo "${testo(s.serviceType)}" non riconosciuto`); continue; }
    const legacyId = OFFSET_VALET + intero(s.id);
    const gia = await db.serviceType.findUnique({ where: { legacyId } });
    let code = gia?.code;
    if (!code) {
      const base = 'VALET_' + nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
      code = base; let n = 2;
      while (presi.has(code)) code = `${base}_${n++}`;
      presi.add(code);
    }
    if (!PROVA) await salva('serviceType', legacyId, null, {
      name: nome, code, pricingModel: modello, scope: 'valet', active: !data(s.deletedAt),
    });
    segna('servizi lato valet');
  }

  // I 32 gia' importati sono lato partner: lo si dichiara.
  if (!PROVA) {
    const r = await db.serviceType.updateMany({
      where: { legacyId: { lt: OFFSET_VALET, not: null } }, data: { scope: 'partner' },
    });
    segna('servizi marcati «partner»', r.count);
  }

  // --- indici -------------------------------------------------------------
  const idServizio = new Map((await db.serviceType.findMany({
    where: { legacyId: { not: null } }, select: { id: true, legacyId: true },
  })).map((x) => [x.legacyId, x.id]));
  const idPartner = new Map((await db.partner.findMany({
    where: { legacyId: { not: null } }, select: { id: true, legacyId: true },
  })).map((x) => [x.legacyId, x.id]));
  const idValet = new Map((await db.valet.findMany({
    where: { legacyId: { not: null } }, select: { id: true, legacyId: true },
  })).map((x) => [x.legacyId, x.id]));

  // --- listino partner ----------------------------------------------------
  // @@unique([partnerId, serviceTypeId]): se il legacy ha la stessa coppia due
  // volte vince la riga con id piu' alto, cioe' la piu' recente.
  const perPartner = new Map();
  for (const r of leggi('partner-service')) {
    const p = idPartner.get(intero(r.partnerId));
    const s = idServizio.get(intero(r.serviceId));
    if (!p || !s) { segna('listino partner: riga orfana'); continue; }
    const chiave = `${p}|${s}`;
    const precedente = perPartner.get(chiave);
    if (precedente && intero(precedente.id) > intero(r.id)) continue;
    if (precedente) segna('listino partner: coppia doppia, tenuta la piu recente');
    perPartner.set(chiave, r);
    // ⚠️ `pricePerItem` (6 righe valorizzate) non ha destinazione: PartnerService
    // non ha un prezzo a pezzo. Si segnala invece di buttarlo in silenzio.
    if (testo(r.pricePerItem)) segna('listino partner: pricePerItem senza destinazione');
  }
  if (!PROVA) {
    const gia = new Set((await db.partnerService.findMany({ select: { partnerId: true, serviceTypeId: true } }))
      .map((x) => `${x.partnerId}|${x.serviceTypeId}`));
    const nuovi = [...perPartner.entries()].filter(([k]) => !gia.has(k)).map(([k, r]) => {
      const [partnerId, serviceTypeId] = k.split('|');
      return { partnerId, serviceTypeId, price: numero(r.price) ?? 0, extraKmPrice: numero(r.extraKmPrice) ?? 0 };
    });
    for (let i = 0; i < nuovi.length; i += 500)
      await db.partnerService.createMany({ data: nuovi.slice(i, i + 500), skipDuplicates: true });
    segna('listino partner', nuovi.length);
    segna('listino partner gia presenti', perPartner.size - nuovi.length);
  } else segna('listino partner', perPartner.size);

  // --- listino valet ------------------------------------------------------
  const perValet = new Map();
  for (const r of leggi('expert-service')) {
    const v = idValet.get(intero(r.expertId));
    // 🔴 Qui si aggancia al catalogo VALET (con l'offset), non a `service`.
    const s = idServizio.get(OFFSET_VALET + intero(r.serviceId));
    if (!v || !s) { segna('listino valet: riga orfana'); continue; }
    const chiave = `${v}|${s}`;
    const precedente = perValet.get(chiave);
    if (precedente && intero(precedente.id) > intero(r.id)) continue;
    if (precedente) segna('listino valet: coppia doppia, tenuta la piu recente');
    perValet.set(chiave, r);
  }
  if (!PROVA) {
    const gia = new Set((await db.valetService.findMany({ select: { valetId: true, serviceTypeId: true } }))
      .map((x) => `${x.valetId}|${x.serviceTypeId}`));
    const nuovi = [...perValet.entries()].filter(([k]) => !gia.has(k)).map(([k, r]) => {
      const [valetId, serviceTypeId] = k.split('|');
      return {
        valetId, serviceTypeId,
        salary: numero(r.salary) ?? 0,
        salaryPerItem: numero(r.salaryPerItem),
        // ⚠️ ASSUNZIONE: `minimumKmPrice` del legacy = `extraKmPrice` qui. I nomi
        //    differiscono ma i valori sono gli stessi del lato partner
        //    (0, 0.2, 0.5, 1, 1.5, 2…). Da confermare con l'utente.
        extraKmPrice: numero(r.minimumKmPrice),
      };
    });
    for (let i = 0; i < nuovi.length; i += 500)
      await db.valetService.createMany({ data: nuovi.slice(i, i + 500), skipDuplicates: true });
    segna('listino valet', nuovi.length);
    segna('listino valet gia presenti', perValet.size - nuovi.length);
  } else segna('listino valet', perValet.size);
}

// ------------------------------------------------- fase 4: regole carnet

/**
 * Le 28 regole carnet, piu' l'estensione ad altri partner (8 righe).
 *
 * Due cose del legacy NON hanno destinazione nel nuovo schema, e vengono
 * segnalate invece di essere buttate in silenzio:
 *
 *  · `days` — un JSON con i giorni della settimana in cui la regola vale.
 *    `DeliveryRule` non ha un campo per i giorni.
 *  · `serviceType` — nel legacy e' un MODELLO DI PREZZO (`fixedprice`,
 *    `hourlyrate`), non un servizio precise. Nel nuovo schema `serviceTypeId`
 *    punta a UN servizio, e di PREZZO_FISSO ce ne sono 10: sceglierne uno
 *    sarebbe inventare. Resta `null`, e il modello di prezzo finisce nel NOME
 *    della regola, dove almeno si vede.
 *
 * ⚠️ `DeliveryRule.name` e' obbligatorio e nel legacy non esiste: si compone
 * («Regola 8 · prezzo fisso»). E' un'etichetta, non un dato inventato.
 */
async function regole() {
  const MODELLO = { fixedprice: 'prezzo fisso', hourlyrate: 'a ora' };

  const idPartner = new Map((await db.partner.findMany({
    where: { legacyId: { not: null } }, select: { id: true, legacyId: true },
  })).map((x) => [x.legacyId, x.id]));

  for (const r of leggi('delivery-rules')) {
    const legacyId = intero(r.id);
    const modello = MODELLO[testo(r.serviceType)] ?? testo(r.serviceType);
    const dati = {
      name: `Regola ${legacyId}${modello ? ` · ${modello}` : ''}`,
      dailyRule: bool(r.perDayDeliveryRule) ?? false,
      dailyCount: intero(r.perDayDeliveryLimit) ?? 0,
      totalRule: bool(r.totalDeliveryRule) ?? false,
      totalCount: intero(r.totalDeliveryLimit) ?? 0,
      periodStart: data(r.validFrom),
      periodEnd: data(r.validTill),
      // Le ore arrivano come "08:00:00": il nuovo schema le vuole "HH:mm".
      timeFrom: testo(r.startTimeRange)?.slice(0, 5) ?? null,
      timeTo: testo(r.endTimeRange)?.slice(0, 5) ?? null,
      kmDistance: numero(r.kmLimit),
      partnerBillingAdjustment: numero(r.additionalPrice) ?? 0,
      valetPayAdjustment: numero(r.valetAdditionalPrice) ?? 0,
      toBill: bool(r.billable) ?? true,
      toPay: bool(r.payable) ?? true,
      active: !data(r.deletedAt),
    };
    if (testo(r.days)) segna('regole: campo «days» senza destinazione');
    if (testo(r.serviceType)) segna('regole: serviceType finito nel nome');

    if (!PROVA) {
      const rec = await salva('deliveryRule', legacyId, null, dati);
      // Il partner proprietario della regola.
      const p = idPartner.get(intero(r.partnerId));
      if (p) {
        const gia = await db.deliveryRulePartner.findFirst({ where: { deliveryRuleId: rec.id, partnerId: p } });
        if (!gia) { await db.deliveryRulePartner.create({ data: { deliveryRuleId: rec.id, partnerId: p } }); segna('regole: partner collegati'); }
      } else segna('regole: partner proprietario non trovato');
    }
    segna('regole carnet');
  }

  // Estensione della stessa regola ad altri partner.
  if (!PROVA) {
    const idRegola = new Map((await db.deliveryRule.findMany({
      where: { legacyId: { not: null } }, select: { id: true, legacyId: true },
    })).map((x) => [x.legacyId, x.id]));
    for (const e of leggi('tabella-3')) {
      const rid = idRegola.get(intero(e.deliveryRuleId));
      const pid = idPartner.get(intero(e.partnerId));
      if (!rid || !pid) { segna('regole: estensione orfana'); continue; }
      const gia = await db.deliveryRulePartner.findFirst({ where: { deliveryRuleId: rid, partnerId: pid } });
      if (gia) { segna('regole: estensione gia presente'); continue; }
      await db.deliveryRulePartner.create({ data: { deliveryRuleId: rid, partnerId: pid } });
      segna('regole: partner aggiunti per estensione');
    }
  }

  // Le regole lato VALET (7 righe + 44 di collegamento) non hanno destinazione:
  // `DeliveryRule` e' legata ai partner, non ai valet, e il loro campo `rules`
  // e' un JSON di scaglioni (pickUps -> plusSalary) che qui non esiste.
  const regoleValet = leggi('tabella-34').length;
  if (regoleValet) {
    segna('regole VALET senza destinazione', regoleValet);
    avvisi.push(`${regoleValet} regole lato valet (tabella-34) + ${leggi('tabella-2').length} collegamenti `
      + 'non importate: nel nuovo schema le regole carnet sono solo dei partner, e il loro JSON di '
      + 'scaglioni pickUps→plusSalary non ha un campo corrispondente.');
  }
}

// ---------------------------------------------------------------- fase 1

async function anagrafiche() {
  // --- province -----------------------------------------------------------
  const province = leggi('provinces');
  const perCodice = new Map();
  for (const p of province) {
    const codice = testo(p.provinceCode);
    const nome = testo(p.province);
    if (!codice || !nome) { avvisi.push(`provincia ${p.id} senza codice o nome: saltata`); continue; }
    // ⚠️ 108 righe ma 107 codici: uno e' duplicato. Vince la prima, la seconda
    // si segnala invece di far esplodere l'indice unico.
    if (perCodice.has(codice)) {
      avvisi.push(`codice provincia duplicato "${codice}" (${nome} e ${perCodice.get(codice).nome}): tenuta la prima`);
      segna('province scartate (codice doppio)');
      continue;
    }
    perCodice.set(codice, { legacyId: intero(p.id), nome, codice });
  }
  for (const p of perCodice.values()) {
    if (!PROVA) await salva('province', p.legacyId, { code: p.codice }, { name: p.nome, code: p.codice });
    segna('province');
  }

  // In prova non si legge il database: l'indice si costruisce dai dati appena
  // letti, altrimenti la simulazione scarterebbe tutte le citta' per finta.
  const idProvincia = PROVA
    ? new Map([...perCodice.values()].map((p) => [p.legacyId, `prova-${p.legacyId}`]))
    : new Map((await db.province.findMany({ select: { id: true, legacyId: true } }))
        .map((p) => [p.legacyId, p.id]));

  // --- citta' -------------------------------------------------------------
  for (const c of leggi('province-cities')) {
    const nome = testo(c.cityName);
    const prov = idProvincia.get(intero(c.provinceId));
    if (!nome || !prov) { avvisi.push(`citta' ${c.id} senza nome o provincia: saltata`); continue; }
    if (!PROVA) await salva('city', intero(c.id), null, { name: nome, provinceId: prov });
    segna('citta');
  }

  // --- utenti: indice per id, serve a tutte le anagrafiche -----------------
  const utenti = new Map(leggi('user').map((x) => [testo(x.id), x]));
  console.log(`utenti nel legacy: ${utenti.size}`);

  /** Dati di accesso a partire dal record utente collegato. */
  const accesso = (userId) => {
    const x = utenti.get(testo(userId));
    if (!x) return null;
    return {
      legacyId: intero(x.id),
      email: testo(x.email)?.toLowerCase() ?? null,
      firstName: testo(x.name) ?? '',
      lastName: testo(x.surname) ?? '',
      // ✅ Gli hash bcrypt del legacy sono $2a$10$/$2b$10$, gli stessi che usa
      //    bcryptjs qui: si copiano tali e quali e le persone tengono la password.
      passwordHash: testo(x.password),
      status: stato(x.active, x.deletedAt),
      createdAt: data(x.createdAt),
    };
  };

  // --- partner ------------------------------------------------------------
  for (const p of leggi('partner')) {
    const a = accesso(p.userId);
    if (!a?.email) { avvisi.push(`partner ${p.id}: nessun utente collegato, saltato`); segna('partner saltati'); continue; }
    const dati = {
      insegna: testo(p.businessName) ?? a.email,
      businessName: testo(p.businessName),
      email: a.email,
      vatNumber: testo(p.vatCode),
      fiscalCode: testo(p.fiscalCode),
      address: testo(p.address),
      phone: testo(p.phone),
      notes: testo(p.notes),
      bankAccount: testo(p.bankAccount),
      bankAccountName: testo(p.bankAccountName),
      sdiCode: testo(p.sdiCode),
      invoiceEmail: testo(p.billingEmail),
      invoicingEnabled: bool(p.billingAccess) ?? false,
      paymentStatus: testo(p.partnerPaymentStatus) ?? 'active',
      paymentMethod: testo(p.partnerPaymentMethod),
      whatsappNotifications: bool(p.receiveWhatsappMsg) ?? false,
      mailNotifications: bool(p.receiveEmailMsg) ?? false,
      woocommerceApiKey: testo(p.wooCommerceApiKey),
      active: (testo(utenti.get(testo(p.userId))?.active) === '1'),
    };
    if (!PROVA) {
      const rec = await salva('partner', intero(p.id), { email: dati.email }, dati);
      await utente(a, 'PARTNER', { partnerId: rec.id });
    }
    segna('partner');
  }

  // --- valet (nel legacy: expert) ----------------------------------------
  for (const e of leggi('expert')) {
    const a = accesso(e.userId);
    if (!a?.email) { avvisi.push(`expert ${e.id}: nessun utente collegato, saltato`); segna('valet saltati'); continue; }
    const dati = {
      firstName: a.firstName, lastName: a.lastName, email: a.email,
      phone: testo(e.phone), address: testo(e.address), notes: testo(e.notes),
      hasVat: bool(e.isVatCode) ?? false,
      vatNumber: testo(e.vatCode),
      fiscalCode: testo(e.fiscalCode),
      birthPlace: testo(e.birthPlace),
      birthDate: data(e.dateOfBirth),
      iban: testo(e.bankAccountData),
      isTeamLeader: bool(e.isTeamLeader) ?? false,
      withholdingPercent: numero(e.holdingPercentage) ?? 0,
      salaryFrequency: testo(e.salaryFrequency) ?? 'monthly',
      minimumKmIncluded: numero(e.minimumKmIncluded),
      extraOutOfCityPrice: numero(e.extraOutSideCityKmPrice),
      notifyByEmail: bool(e.receiveEmailMsg) ?? true,
      notifyByWhatsapp: bool(e.receiveWhatsappMsg) ?? false,
      active: (testo(utenti.get(testo(e.userId))?.active) === '1'),
    };
    if (!PROVA) {
      const rec = await salva('valet', intero(e.id), { email: dati.email }, dati);
      await utente(a, 'VALET', { valetId: rec.id });
    }
    segna('valet');
  }

  // --- operatori ----------------------------------------------------------
  for (const o of leggi('operation')) {
    const a = accesso(o.userId);
    if (!a?.email) { avvisi.push(`operation ${o.id}: nessun utente collegato, saltato`); segna('operatori saltati'); continue; }
    const dati = {
      firstName: a.firstName, lastName: a.lastName, email: a.email,
      phone: testo(o.phone), address: testo(o.address),
      // ⚠️ In una riga il campo `notes` contiene una password in chiaro:
      //    non si migra il campo note degli operatori.
      notes: null,
      notifyWhatsapp: bool(o.receiveWhatsappMsg) ?? false,
      notifyMail: bool(o.receiveEmailMsg) ?? true,
      operationRole: bool(o.isProjectManager) ? 'project_manager' : 'operation',
      active: (testo(utenti.get(testo(o.userId))?.active) === '1'),
    };
    if (!PROVA) {
      const rec = await salva('operation', intero(o.id), { email: dati.email }, dati);
      await utente(a, bool(o.isProjectManager) ? 'PROJECT_MANAGER' : 'OPERATION', { operationId: rec.id });
    }
    segna('operatori');
  }

  // --- clienti ------------------------------------------------------------
  const idPartner = PROVA
    ? new Map(leggi('partner').map((p) => [intero(p.id), `prova-${p.id}`]))
    : new Map((await db.partner.findMany({ select: { id: true, legacyId: true } }))
        .map((p) => [p.legacyId, p.id]));

  // ⚠️ I clienti sono 4.512: uno alla volta attraverso il pooler l'import si
  // impianta (misurato: ~5 righe al minuto dopo le prime migliaia, e il primo
  // tentativo e' morto a meta' strada). Si lavora a BLOCCHI — poche query invece
  // di ventimila andate e ritorno verso Francoforte.
  const clienti = [];
  for (const c of leggi('customer')) {
    const a = accesso(c.userId);
    const dati = {
      legacyId: intero(c.id),
      firstName: a?.firstName || testo(c.firstName) || '',
      lastName: a?.lastName || testo(c.lastName) || '',
      email: a?.email ?? null,
      phone: testo(c.phone),
      address: testo(c.address),
      notes: testo(c.notes),
      partnerId: idPartner.get(intero(c.partnerId)) ?? null,
    };
    if (!dati.firstName && !dati.lastName) { avvisi.push(`customer ${c.id} senza nome: saltato`); segna('clienti saltati'); continue; }
    clienti.push({ dati, accesso: a });
  }

  if (PROVA) { segna('clienti', clienti.length); }
  else {
    // Chi c'e' gia' si salta: e' cosi' che l'import resta ripetibile.
    const gia = new Set((await db.customer.findMany({
      where: { legacyId: { not: null } }, select: { legacyId: true },
    })).map((x) => x.legacyId));
    const nuovi = clienti.filter((c) => !gia.has(c.dati.legacyId));
    segna('clienti gia presenti', clienti.length - nuovi.length);

    for (let i = 0; i < nuovi.length; i += 500) {
      const blocco = nuovi.slice(i, i + 500);
      await db.customer.createMany({ data: blocco.map((c) => c.dati), skipDuplicates: true });
      segna('clienti', blocco.length);
      process.stdout.write(`\r  clienti: ${Math.min(i + 500, nuovi.length)}/${nuovi.length}`);
    }
    if (nuovi.length) process.stdout.write('\n');

    // Ora che i clienti esistono, si ricavano gli id in UNA query e si creano
    // gli account. Password casuale e diversa per ciascuno, stato `invited`:
    // nessuno la conosce, l'accesso passa dal flusso di invito gia' presente.
    // Una password di default uguale per tutti sarebbe stata 4.512 account con
    // la stessa chiave nota su un indirizzo pubblico.
    const idCliente = new Map((await db.customer.findMany({
      where: { legacyId: { not: null } }, select: { id: true, legacyId: true },
    })).map((x) => [x.legacyId, x.id]));
    const utentiGia = new Set((await db.user.findMany({
      where: { legacyId: { not: null } }, select: { legacyId: true },
    })).map((x) => x.legacyId));
    const emailGia = new Set((await db.user.findMany({ select: { email: true } })).map((x) => x.email));

    const daCreare = [];
    for (const c of clienti) {
      const a = c.accesso;
      if (!a?.email) { segna('clienti senza account (nessuna email)'); continue; }
      if (utentiGia.has(a.legacyId) || emailGia.has(a.email)) { segna('account cliente gia presenti'); continue; }
      const cid = idCliente.get(c.dati.legacyId);
      if (!cid) { avvisi.push(`cliente legacy ${c.dati.legacyId}: non ritrovato dopo l'inserimento`); continue; }
      daCreare.push({
        legacyId: a.legacyId, email: a.email,
        firstName: a.firstName, lastName: a.lastName,
        role: 'CUSTOMER', status: 'invited',
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10),
        customerId: cid,
      });
      if (daCreare.length % 250 === 0) process.stdout.write(`\r  account: ${daCreare.length}`);
    }
    if (daCreare.length) process.stdout.write(`\r  account: ${daCreare.length}\n`);
    for (let i = 0; i < daCreare.length; i += 500) {
      await db.user.createMany({ data: daCreare.slice(i, i + 500), skipDuplicates: true });
      segna('account cliente', Math.min(500, daCreare.length - i));
    }
  }

  // --- admin storico ------------------------------------------------------
  // Gli utenti senza extraType sono 11: l'admin storico, un account dello
  // sviluppatore esterno e 9 prove di collaudo del 2020-2021 (5 su indirizzi
  // usa-e-getta). Si importa solo chi e' superadmin.
  for (const x of utenti.values()) {
    if (testo(x.extraType)) continue;
    if (testo(x.isSuperAdmin) !== '1') { segna('utenti orfani non importati'); continue; }
    const a = accesso(x.id);
    if (!PROVA) await utente(a, 'ADMIN', {});
    segna('admin');
  }
}

/**
 * Crea o aggiorna l'utente di accesso.
 * `passwordCasuale`: nessuno conosce la password, l'accesso passa dall'invito.
 */
async function utente(a, ruolo, legami, passwordCasuale = false) {
  if (!a?.email) return null;
  const hash = passwordCasuale
    ? await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10)
    : a.passwordHash;
  const dati = {
    email: a.email, firstName: a.firstName, lastName: a.lastName,
    role: ruolo, passwordHash: hash, status: a.status, ...legami,
  };
  return salva('user', a.legacyId, { email: a.email }, dati);
}
