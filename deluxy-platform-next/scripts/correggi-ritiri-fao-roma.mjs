// ============================================================
// FAO SCHWARZ — le consegne a Roma ritirano a Stazione Termini
// ------------------------------------------------------------
// Deciso dall'utente il 25/08/2026: «#50411 il ritiro di FAO è stazione termini
// roma, ricalcola anche la paga del valet; verifica se ci sono in passato altri
// FAO con consegna Roma e ritiro Milano e applica la stessa logica».
//
// COSA SUCCEDE. FAO Schwarz ha sede in Via Orefici 15 a Milano, e quel
// indirizzo finisce come luogo di ritiro anche sulle consegne di Roma: la
// distanza diventa ~570-590 km e, dove la paga si calcola sui chilometri, quel
// numero diventa euro (#50411: 572,89 km → 572,89 €; #63040: 593,36 → 593,36).
//
// ⚠️ E SISTEMARE SOLO IL RITIRO NON BASTA. #50411 aveva GIA' il ritiro a
// «Via Marsala, 27, 00185 Roma» — cioe' Termini — e la distanza era rimasta
// 572,89 km: era stata calcolata col ritiro vecchio e non piu' rifatta. Il
// criterio non e' quindi «il ritiro dice Milano» ma «la distanza e' impossibile
// per una consegna dentro Roma».
//
// COME SI RICALCOLA
//   - ritiro   = Stazione Termini, Via Marsala 27, Roma;
//   - distanza = da Termini all'indirizzo di consegna, in LINEA D'ARIA
//     (emisenoverso). ⚠️ Non sono km stradali: la chiave Google Maps della
//     piattaforma e' vuota. In citta' la strada e' il 20-30% in piu';
//   - paga     = listino del VALET per il suo servizio
//     (`salary + extraKmPrice × max(0, km − minimumKmIncluded)`).
//     ⭐ Per FAO il valet Fatima Hmamly ha base 15 € e **0 €/km** oltre 5 km
//     inclusi: la paga e' 15 € fissi, e infatti le consegne FAO sane a Roma
//     pagano 15,00 · 15,48 · 15,49 €.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi, si torna indietro con
// --disfa=<file>.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const argomenti = process.argv.slice(2);
const SCRIVI = argomenti.includes('--scrivi');
const DISFA = (argomenti.find((a) => a.startsWith('--disfa=')) ?? '').slice('--disfa='.length);
/** Sopra questa distanza, dentro Roma, il numero non e' credibile. */
const SOGLIA_KM = 50;
/** Stazione Termini, Roma. */
const TERMINI = [41.901, 12.5017];
const RITIRO = 'Stazione Termini, Via Marsala, 27, 00185 Roma RM, Italia';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();

function kmInLineaDAria(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const r2 = (x) => Math.round(x * 100) / 100;
const eu = (n) => (n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');

try {
  if (DISFA) {
    const backup = JSON.parse(fs.readFileSync(DISFA, 'utf8'));
    console.log(`disfo ${backup.length} consegne da ${DISFA}`);
    if (!SCRIVI) { console.log('prova a vuoto: aggiungi --scrivi'); process.exit(0); }
    for (const b of backup) await db.delivery.update({ where: { id: b.id },
      data: { pickupAddress: b.pickupAddress, distanceKm: b.distanceKm, valetSalary: b.valetSalary } });
    console.log('rimesse come prima.'); process.exit(0);
  }

  const fao = await db.partner.findFirst({ where: { insegna: { contains: 'Fao', mode: 'insensitive' } },
    select: { id: true, insegna: true, address: true } });
  if (!fao) { console.error('Partner FAO non trovato: non tocco niente.'); process.exit(1); }
  console.log(`${fao.insegna} — sede ${fao.address}`);

  const tutte = await db.delivery.findMany({
    where: { deletedAt: null, partnerId: fao.id },
    select: { id: true, code: true, date: true, pickupAddress: true, recipientAddress: true,
      latitude: true, longitude: true, distanceKm: true, valetSalary: true, valetAdditionalPrice: true,
      payable: true, valetId: true, valetServiceId: true,
      valet: { select: { firstName: true, lastName: true, minimumKmIncluded: true } },
      province: { select: { code: true } } },
    orderBy: { date: 'asc' },
  });

  // Consegna dentro Roma + distanza impossibile: e' quello il segno, non la
  // dicitura del ritiro (#50411 aveva gia' Termini e i km sbagliati).
  const inScope = tutte.filter((x) =>
    (x.province?.code === 'RM' || /\bRoma\b/i.test(String(x.recipientAddress ?? '')))
    && (x.distanceKm ?? 0) > SOGLIA_KM);
  console.log(`consegne FAO: ${tutte.length} · a Roma con distanza oltre ${SOGLIA_KM} km: ${inScope.length}`);

  const lavori = [], scartate = [];
  for (const d of inScope) {
    if (d.latitude == null || d.longitude == null) { scartate.push({ code: d.code, perche: 'senza coordinate' }); continue; }
    const km = r2(kmInLineaDAria(TERMINI[0], TERMINI[1], d.latitude, d.longitude));
    let paga = null, listino = '';
    if (d.valetId) {
      // ⚠️ Il listino del valet si raggiunge dal SUO servizio, non da quello del partner.
      const vs = d.valetServiceId
        ? await db.valetService.findUnique({ where: { id: d.valetServiceId },
            select: { salary: true, extraKmPrice: true, serviceType: { select: { name: true } } } })
        : null;
      const t = vs ?? await db.valetService.findFirst({
        where: { valetId: d.valetId, serviceType: { name: 'Consegna Standard' } },
        select: { salary: true, extraKmPrice: true, serviceType: { select: { name: true } } } });
      if (t?.salary != null) {
        const inclusi = d.valet?.minimumKmIncluded ?? 0;
        paga = r2(t.salary + (t.extraKmPrice ?? 0) * Math.max(0, km - inclusi));
        listino = `«${t.serviceType?.name}» ${t.salary} € + ${t.extraKmPrice ?? 0} €/km oltre ${inclusi}`;
      } else listino = 'il valet non ha un listino: paga invariata';
    } else listino = 'nessun valet: paga invariata';
    // ⚠️ SI CORREGGE SOLO IN GIU'. Dove la paga di adesso e' gia' pari o
    // inferiore a quella di listino, qualcuno ha deciso cosi' — una consegna
    // non pagabile, una regola carnet, un accordo — e alzarla sarebbe inventare
    // un aumento. #49566 e #52690 stanno a 0 e ci restano; #50411 e' addirittura
    // `payable = false`.
    const pagaAdesso = r2((d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0));
    if (paga != null && paga >= pagaAdesso) {
      listino = `paga gia' non piu' alta del listino (${pagaAdesso} € ≤ ${paga} €): lasciata com'e'`;
      paga = null;
    }
    lavori.push({ id: d.id, code: d.code, data: d.date.toISOString().slice(0, 10),
      valet: d.valet ? `${d.valet.firstName} ${d.valet.lastName}` : '—',
      ritiroPrima: d.pickupAddress, kmPrima: d.distanceKm, kmDopo: km,
      pagaPrima: r2((d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0)), pagaDopo: paga, listino,
      payable: d.payable, consegna: d.recipientAddress,
      backup: { id: d.id, pickupAddress: d.pickupAddress, distanceKm: d.distanceKm, valetSalary: d.valetSalary } });
  }

  console.log('\n| consegna | data | ritiro prima | km prima → dopo | paga prima → dopo | valet | listino |');
  console.log('|---|---|---|---|---|---|---|');
  for (const l of lavori) {
    console.log(`| ${l.code} | ${l.data} | ${String(l.ritiroPrima ?? '—').slice(0, 30)} | ${l.kmPrima} → ${l.kmDopo} | ${eu(l.pagaPrima)} → ${l.pagaDopo == null ? '(invariata)' : eu(l.pagaDopo)} | ${l.valet} | ${l.listino} |`);
  }
  for (const s of scartate) console.log(`   ✗ #${s.code}: ${s.perche}`);
  const conPaga = lavori.filter((l) => l.pagaDopo != null);
  console.log(`\npaga di adesso ${eu(lavori.reduce((s, l) => s + l.pagaPrima, 0))} → ricalcolata ${eu(conPaga.reduce((s, l) => s + l.pagaDopo, 0))}`);

  if (!SCRIVI) { console.log('\nPROVA A VUOTO — non ho scritto niente. Rilancia con --scrivi.'); process.exit(0); }

  const nomeBackup = path.join(process.cwd(), 'scripts', 'backup-ritiri-fao-roma.json');
  fs.writeFileSync(nomeBackup, JSON.stringify(lavori.map((l) => l.backup), null, 1));
  console.log(`\nbackup: ${nomeBackup}`);
  for (const l of lavori) {
    await db.$transaction([
      db.delivery.update({ where: { id: l.id },
        data: { pickupAddress: RITIRO, distanceKm: l.kmDopo, ...(l.pagaDopo != null ? { valetSalary: l.pagaDopo } : {}) } }),
      db.deliveryLog.create({ data: { deliveryId: l.id, type: 'ritiro-fao-roma',
        message: `Ritiro portato a Stazione Termini (${l.ritiroPrima ?? '—'} → ${RITIRO}), su decisione dell'utente: FAO ritira a Termini per le consegne di Roma. `
          + `Distanza ${l.kmPrima} → ${l.kmDopo} km, in LINEA D'ARIA (la chiave mappe non è configurata: i km stradali sono più alti). `
          + (l.pagaDopo != null ? `Paga ${l.pagaPrima} € → ${l.pagaDopo} €, dal listino ${l.listino}.` : `Paga invariata: ${l.listino}.`) } }),
    ]);
  }
  console.log(`\nfatto: ${lavori.length} consegne, ognuna con la sua riga nel registro.`);
} finally {
  await db.$disconnect();
}
