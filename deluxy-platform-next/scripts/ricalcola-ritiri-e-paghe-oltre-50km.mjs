// ============================================================
// Ritiri e paghe delle consegne oltre i 50 km — MAGAZZINO e ARTISTA LOCALE
// ------------------------------------------------------------
// Regola decisa dall'utente il 25/08/2026:
//   «imposta consegne con magazzino o artista locale con distanza più di 50 km:
//    il luogo di ritiro è la città del luogo di consegna, aggiorna il pagamento
//    del valet col valore della consegna ricalcolato così»
//
// DA DOVE VIENE IL GUASTO. Il ritiro di queste consegne è il magazzino di
// «Via Varesina, 60, 20156 Milano» mentre la consegna è a Roma: la distanza
// risulta di 619 km, e dove la paga si calcola sui chilometri quel numero
// diventa euro. La firma è inconfondibile: su 337 consegne la paga e i km
// coincidono al centesimo.
//
// ⚠️ NON è un difetto dell'import: confrontate una a una col legacy, 11.941 su
// 12.247 sono identiche (97,50%), e nel legacy stesso 536 righe su 4.869 hanno
// `expertSalary == distance`. Il guasto è nella sorgente.
//
// COME SI RICALCOLA (stessa strada di api/scripts/ricalcola-paghe-artista-locale.mjs,
// per non avere due regole diverse per la stessa cosa)
//   - ritiro    = la CITTÀ della consegna;
//   - distanza  = dal centro di quella città all'indirizzo del destinatario, in
//     LINEA D'ARIA (emisenoverso). ⚠️ Non sono km stradali: la chiave Google
//     Maps della piattaforma è vuota. In città la strada è il 20-30% in più.
//   - paga base = tariffa «Consegna Standard» DEL VALET:
//     `salary + extraKmPrice × max(0, km − minimumKmIncluded)`.
//
// ⭐ E LE REGOLE CARNET DEL VALET, che esistono in tabella e vanno applicate
// (`ValetDeliveryRule`, segnalate dall'utente): quando la STESSA VENDITA ha più
// consegne, la prima si paga per intero e le altre prendono solo il PLUS dello
// scaglione — «Regola valet 1»: 2 ritiri +3 €, più di 2 +4 €; «Regola valet 4»:
// più di 1 ritiro +0 €, cioè le altre non si pagano affatto.
// Senza questa parte si pagherebbero due o tre consegne intere dove l'accordo
// ne paga una sola.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi. Con --disfa=<file> si torna
// indietro (ritiro, distanza e paga come stavano).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const argomenti = process.argv.slice(2);
const SCRIVI = argomenti.includes('--scrivi');
const DISFA = (argomenti.find((a) => a.startsWith('--disfa=')) ?? '').slice('--disfa='.length);
const SOGLIA_KM = 50;

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();

/**
 * Centri delle città toccate: coordinate del centro cittadino, non di un
 * indirizzo. Sono fatti geografici stabili, non dati da indovinare — e una
 * città che non è qui dentro viene SCARTATA e dichiarata, mai approssimata.
 */
const CENTRI = {
  Roma: [41.8931, 12.4828],
  Firenze: [43.7714, 11.2542],
  Milano: [45.4642, 9.19],
  Fiumicino: [41.7714, 12.24],
  Ciampino: [41.8, 12.6],
  Frascati: [41.8092, 12.68],
  'Campagnano di Roma': [42.1333, 12.3833],
  'Lido di Ostia': [41.73, 12.277],
  Bologna: [44.4949, 11.3426],
  Padova: [45.4064, 11.8768],
  "Palazzolo sull'Oglio": [45.5989, 9.8878],
  "Spino d'Adda": [45.4, 9.4833],
};

/** La città dentro un indirizzo italiano: «…, 00187 Roma RM, Italia». */
function cittaDi(indirizzo, provinciaCodice) {
  const a = String(indirizzo ?? '');
  const conCap = a.match(/\b\d{5}\s+([^,]+?)(?:\s+[A-Z]{2})?\s*(?:,|$)/);
  if (conCap) {
    const c = conCap[1].trim();
    if (CENTRI[c]) return c;
    // «35030 PD» non è una città, è la provincia: si guarda il codice.
    if (/^[A-Z]{2}$/.test(c)) return provinciaCodice === 'PD' ? 'Padova' : null;
  }
  for (const nome of Object.keys(CENTRI)) if (a.includes(nome)) return nome;
  return null;
}

/** Distanza in linea d'aria fra due punti (km). */
function kmInLineaDAria(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const r2 = (x) => Math.round(x * 100) / 100;
const eu = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Il plus dello scaglione per un dato numero di consegne sulla stessa vendita. */
function plusDaScaglioni(tiersJson, quante) {
  let plus = null;
  try {
    for (const t of JSON.parse(tiersJson ?? '[]')) {
      const n = Number(t.pickUps);
      const p = Number(t.plusSalary);
      if (!Number.isFinite(n) || !Number.isFinite(p)) continue;
      if (t.operator === 'equal' && quante === n) plus = p;
      if (t.operator === 'moreThan' && quante > n && plus === null) plus = p;
    }
  } catch { /* scaglioni illeggibili: si lascia null e si dichiara */ }
  return plus;
}

try {
  if (DISFA) {
    const backup = JSON.parse(fs.readFileSync(DISFA, 'utf8'));
    console.log(`disfo ${backup.length} consegne da ${DISFA}`);
    if (!SCRIVI) { console.log('prova a vuoto: aggiungi --scrivi'); process.exit(0); }
    for (const b of backup) {
      await db.delivery.update({ where: { id: b.id },
        data: { pickupAddress: b.pickupAddress, distanceKm: b.distanceKm, valetSalary: b.valetSalary } });
    }
    console.log('rimesse come prima.'); process.exit(0);
  }

  const partners = await db.partner.findMany({
    where: { OR: [{ insegna: { contains: 'Magazzino', mode: 'insensitive' } },
      { insegna: { contains: 'Artista Locale', mode: 'insensitive' } }] },
    select: { id: true, insegna: true },
  });
  console.log('partner: ' + partners.map((p) => p.insegna).join(' · '));

  const standard = await db.serviceType.findFirst({ where: { name: 'Consegna Standard' }, select: { id: true } });
  if (!standard) { console.error('Servizio «Consegna Standard» non trovato: non tocco niente.'); process.exit(1); }

  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, partnerId: { in: partners.map((p) => p.id) }, distanceKm: { gt: SOGLIA_KM } },
    select: { id: true, code: true, date: true, pickupAddress: true, recipientAddress: true,
      latitude: true, longitude: true, distanceKm: true, valetSalary: true, valetAdditionalPrice: true,
      payable: true, valetId: true, legacyOrderId: true, legacySaleId: true,
      partner: { select: { insegna: true } },
      valet: { select: { firstName: true, lastName: true, minimumKmIncluded: true } },
      province: { select: { code: true } } },
    orderBy: { valetSalary: 'desc' },
  });
  console.log(`consegne oltre ${SOGLIA_KM} km: ${consegne.length}`);

  // Quante consegne ha la stessa VENDITA (serve agli scaglioni). Si conta su
  // TUTTE le consegne di quella vendita, non solo su quelle oltre i 50 km.
  //
  // ⚠️⚠️ `legacyOrderId = 0` NON E' UNA VENDITA: e' il segnaposto di chi non ne
  // ha, e ci stanno sotto **10.272 consegne**. Alla prima prova le ho trattate
  // come un gruppo solo e la regola «piu' di 1 ritiro» ha azzerato 54 paghe a
  // torto. Un identificatore che vale zero su meta' tabella non identifica
  // niente: `filter(Boolean)` non basta se il valore falso e' il numero 0
  // scritto apposta.
  const vendite = [...new Set(consegne.map((c) => c.legacyOrderId).filter((x) => x != null && x !== 0))];
  const fratelli = await db.delivery.groupBy({
    by: ['legacyOrderId'], where: { deletedAt: null, legacyOrderId: { in: vendite } }, _count: { _all: true },
  });
  const quanteSullaVendita = new Map(fratelli.map((f) => [f.legacyOrderId, f._count._all]));

  // ⚠️ «Si paga UNA sola consegna»: il plus vale per le ALTRE, non per quella
  // che porta la paga. Quindi lo scaglione si applica solo se un'altra consegna
  // della stessa vendita e' GIA' pagata. Misurato: su 62 vendite toccate, 54
  // hanno gia' un'altra consegna pagata (li' il plus e' giusto) e **8 no** —
  // azzerare anche quelle lascerebbe il valet senza niente per quella vendita.
  const altrePagate = new Map();
  for (const v of vendite) {
    const inScope = new Set(consegne.filter((c) => c.legacyOrderId === v).map((c) => c.id));
    const sorelle = await db.delivery.findMany({
      where: { deletedAt: null, legacyOrderId: v, id: { notIn: [...inScope] } },
      select: { valetSalary: true, valetAdditionalPrice: true },
    });
    altrePagate.set(v, sorelle.some((x) => ((x.valetSalary ?? 0) + (x.valetAdditionalPrice ?? 0)) > 0));
  }

  const lavori = [], scartate = [];
  for (const d of consegne) {
    const citta = cittaDi(d.recipientAddress, d.province?.code);
    if (!citta) { scartate.push({ code: d.code, perche: `città non riconosciuta: ${d.recipientAddress}` }); continue; }
    if (d.latitude == null || d.longitude == null) { scartate.push({ code: d.code, perche: 'consegna senza coordinate' }); continue; }
    const km = r2(kmInLineaDAria(CENTRI[citta][0], CENTRI[citta][1], d.latitude, d.longitude));

    let paga = null, base = null, nota = '';
    if (!d.valetId) { nota = 'nessun valet: ritiro e distanza sì, paga no'; }
    else {
      const tariffa = await db.valetService.findFirst({
        where: { valetId: d.valetId, serviceTypeId: standard.id }, select: { salary: true, extraKmPrice: true } });
      if (!tariffa || tariffa.salary == null) { nota = 'il valet non ha la tariffa «Consegna Standard»'; }
      else {
        const inclusi = d.valet?.minimumKmIncluded ?? 0;
        base = r2(tariffa.salary + (tariffa.extraKmPrice ?? 0) * Math.max(0, km - inclusi));
        paga = base;
        // ⭐ Le regole carnet: se la vendita ha più consegne, questa non è la
        // prima e prende solo il plus dello scaglione.
        const quante = (d.legacyOrderId && d.legacyOrderId !== 0)
          ? (quanteSullaVendita.get(d.legacyOrderId) ?? 1)
          : 1;   // senza vendita non c'e' carnet: paga piena
        const giaPagataAltrove = d.legacyOrderId ? (altrePagate.get(d.legacyOrderId) ?? false) : false;
        if (quante > 1 && giaPagataAltrove) {
          const regola = await db.valetDeliveryRule.findFirst({
            where: { active: true, valets: { some: { valetId: d.valetId } } }, select: { name: true, tiers: true } });
          if (regola) {
            const plus = plusDaScaglioni(regola.tiers, quante);
            if (plus !== null) { paga = r2(plus); nota = `${quante} consegne sulla vendita, un'altra e' gia' pagata → «${regola.name}»: solo il plus`; }
            else nota = `${quante} consegne sulla vendita, ma nessuno scaglione combacia: paga intera`;
          } else nota = `${quante} consegne sulla vendita, ma il valet non ha regola carnet: paga intera`;
        } else if (quante > 1) {
          nota = `${quante} consegne sulla vendita, ma NESSUN'ALTRA e' pagata: questa porta la paga intera`;
        }
      }
    }
    lavori.push({ id: d.id, code: d.code, data: d.date.toISOString().slice(0, 10),
      partner: d.partner?.insegna, valet: d.valet ? `${d.valet.firstName} ${d.valet.lastName}` : '—',
      citta, ritiroPrima: d.pickupAddress, kmPrima: d.distanceKm, kmDopo: km,
      pagaPrima: r2((d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0)), pagaDopo: paga, base,
      payable: d.payable, nota,
      backup: { id: d.id, pickupAddress: d.pickupAddress, distanceKm: d.distanceKm, valetSalary: d.valetSalary } });
  }

  const conPaga = lavori.filter((l) => l.pagaDopo != null);
  console.log(`\nricalcolabili: ${lavori.length}  ·  con paga nuova: ${conPaga.length}  ·  scartate: ${scartate.length}`);
  for (const s of scartate) console.log(`   ✗ #${s.code}: ${s.perche}`);
  console.log(`\npaga di adesso ...... ${eu(lavori.reduce((s, l) => s + l.pagaPrima, 0))}`);
  console.log(`paga ricalcolata .... ${eu(conPaga.reduce((s, l) => s + l.pagaDopo, 0))}`);
  console.log(`differenza .......... ${eu(conPaga.reduce((s, l) => s + l.pagaDopo - l.pagaPrima, 0))}`);
  const conRegola = lavori.filter((l) => l.nota.includes('solo il plus'));
  console.log(`di cui ridotte dalle regole carnet: ${conRegola.length}`);

  console.log('\nle prime 15:');
  console.log('| consegna | data | partner | città | km prima → dopo | paga prima → dopo | nota |');
  console.log('|---|---|---|---|---|---|---|');
  for (const l of lavori.slice(0, 15)) {
    console.log(`| ${l.code} | ${l.data} | ${String(l.partner).slice(0, 16)} | ${l.citta} | ${l.kmPrima} → ${l.kmDopo} | ${eu(l.pagaPrima)} → ${l.pagaDopo == null ? '(invariata)' : eu(l.pagaDopo)} | ${l.nota} |`);
  }

  if (!SCRIVI) { console.log('\nPROVA A VUOTO — non ho scritto niente. Rilancia con --scrivi.'); process.exit(0); }

  const nomeBackup = path.join(process.cwd(), 'scripts', 'backup-ritiri-paghe-oltre-50km.json');
  fs.writeFileSync(nomeBackup, JSON.stringify(lavori.map((l) => l.backup), null, 1));
  console.log(`\nbackup: ${nomeBackup}`);
  for (const l of lavori) {
    await db.$transaction([
      db.delivery.update({ where: { id: l.id },
        data: { pickupAddress: l.citta, distanceKm: l.kmDopo, ...(l.pagaDopo != null ? { valetSalary: l.pagaDopo } : {}) } }),
      db.deliveryLog.create({ data: { deliveryId: l.id, type: 'ritiro-e-paga-ricalcolati',
        message: `Ritiro portato alla città di consegna (${l.ritiroPrima ?? '—'} → ${l.citta}). `
          + `Distanza ${l.kmPrima} → ${l.kmDopo} km, dal centro città all'indirizzo, IN LINEA D'ARIA (la chiave mappe non è configurata). `
          + (l.pagaDopo != null ? `Paga ${l.pagaPrima} € → ${l.pagaDopo} €${l.base != null && l.base !== l.pagaDopo ? ` (tariffa piena ${l.base} €)` : ''}. ${l.nota}` : `Paga invariata: ${l.nota}`) } }),
    ]);
  }
  console.log(`\nfatto: ${lavori.length} consegne, ognuna con la sua riga nel registro.`);
} finally {
  await db.$disconnect();
}
