/**
 * LA PAGA DOPPIA SULLE COPPIE CORPORATE (28/08/2026).
 *
 * Un ordine aziendale è UN viaggio scritto su DUE consegne: la riga
 * «aziendale» intestata a chi ordina e la sua gemella di «vendita» intestata a
 * chi fornisce. Stessa data, stesso ritiro, stessa consegna, stesso valet.
 *
 * ⚠️ Ma **tutte e due portano `payable = true` e una paga**, e
 * `SalariesService.DA_PAGARE` filtra proprio su `payable` senza escludere la
 * gemella: il valet verrebbe pagato **due volte per lo stesso giro**.
 *
 * ⚠️ **Si spegne la riga di VENDITA, non quella aziendale**: la riga aziendale
 * è quella che porta i dati del viaggio (la distanza, e quindi la paga a km);
 * sulla gemella la distanza è vuota. Spegnere quella sbagliata lascerebbe in
 * piedi la riga che non sa quanto si è percorso.
 *
 * ⚠️ Si tocca **solo** dove il valet è LO STESSO su entrambe: se sono due
 * persone diverse, sono due viaggi e si pagano tutti e due.
 *
 * ⚠️ Si usa `payable = false`, non un filtro dentro il calcolo: un flag si vede
 * aprendo la consegna e si può rimettere; un filtro nascosto nel conto lo
 * troverebbe solo chi legge il codice. E resta una riga nel registro della
 * consegna, se no fra un mese nessuno saprebbe perché quella non si paga.
 *
 * Sola lettura di default. `--applica` per scrivere: prima salva i valori
 * vecchi in `scripts/backup-paga-doppia-corporate.json`.
 */
import fs from 'node:fs';

const APPLICA = process.argv.includes('--applica');

const riga = fs
  .readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

// ⚠️ Prima di toccare qualunque paga: se ci fossero stipendi già emessi,
// spegnere una riga cambierebbe un documento consegnato al valet.
const emessi = await p.salary.count();
if (emessi > 0) {
  console.error(`Ci sono ${emessi} stipendi emessi: fermarsi e guardare quali righe ci sono dentro prima di toccare \`payable\`.`);
  process.exit(1);
}

const coppie = await p.$queryRawUnsafe(`
  SELECT c.id AS corp_id, c.code AS corp_code, c."valetSalary" AS corp_paga,
         d.id AS ven_id, d.code AS ven_code, d."valetSalary" AS ven_paga,
         d.payable AS ven_payable, d.status AS ven_stato, d.date
  FROM platform."Delivery" d
  JOIN platform."ServiceType" sv ON sv.id = d."serviceTypeId" AND sv."pricingModel" = 'VENDITA'
  JOIN platform."Delivery" c ON c."legacyId" = d."legacyCorrespondDeliveryId" AND c."deletedAt" IS NULL
  JOIN platform."ServiceType" sc ON sc.id = c."serviceTypeId" AND sc."pricingModel" = 'CORPORATE'
  WHERE d."deletedAt" IS NULL
    AND d."valetId" IS NOT NULL AND d."valetId" = c."valetId"
    AND d.payable = true
  ORDER BY d.date DESC`);

const PAGABILI = ['delivered', 'approved', 'delivered_time_to_approve', 'not_delivered'];
const daSpegnere = coppie.filter((x) => Number(x.ven_paga ?? 0) > 0 && Number(x.corp_paga ?? 0) > 0);
const cheContano = daSpegnere.filter((x) => PAGABILI.includes(x.ven_stato));
const euro = cheContano.reduce((s, x) => s + Number(x.ven_paga ?? 0), 0);

console.log(`coppie con lo stesso valet e la gemella ancora pagabile : ${coppie.length}`);
console.log(`  …e una paga su TUTTE E DUE le righe                   : ${daSpegnere.length}`);
console.log(`  …di cui in uno stato che oggi entra nello stipendio   : ${cheContano.length}  →  ${euro.toFixed(2)} €`);
console.log('\nEsempi:');
for (const x of daSpegnere.slice(0, 8)) {
  console.log(`  #${x.corp_code} (aziendale, ${x.corp_paga} €)  +  #${x.ven_code} (vendita, ${x.ven_paga} €)  ${new Date(x.date).toISOString().slice(0, 10)}  [${x.ven_stato}]`);
}

if (!APPLICA) {
  console.log(`\nProva a vuoto: non ho scritto niente. Con --applica spengo \`payable\` su ${daSpegnere.length} righe di VENDITA.`);
  await p.$disconnect();
  process.exit(0);
}

// Il backup: senza, non si può disfare.
const backup = daSpegnere.map((x) => ({
  venId: x.ven_id, venCode: x.ven_code, payableVecchio: x.ven_payable,
  pagaVendita: Number(x.ven_paga), corpCode: x.corp_code, pagaAziendale: Number(x.corp_paga),
}));
fs.writeFileSync('scripts/backup-paga-doppia-corporate.json', JSON.stringify(backup, null, 1), 'utf8');
console.log(`\nbackup salvato: scripts/backup-paga-doppia-corporate.json (${backup.length} righe)`);

let scritte = 0;
for (const x of daSpegnere) {
  await p.$transaction([
    p.delivery.update({ where: { id: x.ven_id }, data: { payable: false } }),
    p.deliveryLog.create({
      data: {
        deliveryId: x.ven_id,
        type: 'note',
        message:
          `Non si paga: è la riga di vendita gemella dell'ordine aziendale #${x.corp_code}, ` +
          `un viaggio solo con lo stesso valet. La paga di ${Number(x.corp_paga).toFixed(2)} € resta sulla #${x.corp_code}.`,
      },
    }),
  ]);
  scritte++;
}
console.log(`spente ${scritte} righe. Rilanciare senza --applica per il controllo.`);
await p.$disconnect();
