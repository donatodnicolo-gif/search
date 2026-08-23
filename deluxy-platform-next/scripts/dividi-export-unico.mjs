// Divide un export phpMyAdmin che contiene PIU' TABELLE in un unico file CSV.
//
// Esportando piu' tabelle insieme, phpMyAdmin le scrive una dopo l'altra nello
// stesso file, ognuna preceduta dalla propria riga di intestazione. Il risultato
// non e' un CSV valido: e' una pila di CSV. Va diviso prima di poterlo profilare.
//
// Lavora in STREAMING: il file puo' pesare centinaia di MB e non deve mai stare
// in memoria tutto insieme. Il parser tiene conto delle virgolette, quindi
// regge i campi che contengono virgole e a capo (le note di consegna li hanno).
//
// Uso:
//   node .../dividi-export-unico.mjs                    # analizza e basta
//   node .../dividi-export-unico.mjs --scrivi           # scrive un file per tabella
//   node .../dividi-export-unico.mjs --file altro.csv --scrivi

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opzione = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SCRIVI = args.includes('--scrivi');

const CARTELLA = opzione('cartella', 'C:/Users/nicol/app/deluxy-platform-next/legacy');
const FILE = path.join(CARTELLA, opzione('file', 'deluxy.csv'));
const USCITA = path.join(CARTELLA, 'tabelle');

// phpMyAdmin non scrive il nome della tabella nel CSV: si riconoscono dalle
// colonne. Ogni voce e' [nome, colonne che devono esserci tutte]. L'ordine conta:
// vince la prima che combacia, quindi le firme piu' specifiche stanno prima.
// Le tabelle non riconosciute restano `tabella-N` col loro elenco di colonne:
// meglio un nome onesto che un nome sbagliato.
const FIRME = [
  ['user',                      ['email', 'password', 'extraType', 'groupId']],
  ['customer',                  ['intercom', 'dob', 'userId', 'partnerId']],
  ['expert',                    ['isTeamLeader', 'minimumKmIncluded', 'userId']],
  ['partner',                   ['businessName', 'vatCode', 'fiscalCode', 'userId']],
  ['operation',                 ['isProjectManager', 'userId']],
  ['delivery',                  ['status', 'deliveryDate', 'partnerId', 'expertId', 'fromTime', 'toTime']],
  ['delivery-product',          ['deliveryId', 'productId', 'quantity', 'price']],
  ['delivery-complaint',        ['message', 'deliveryId', 'expertId', 'partnerId']],
  ['delivery-invoices',         ['paymentIntentId', 'invoiceStatus', 'invoiceUrl']],
  ['delivery-updates',          ['deliveryId', 'userId', 'createdAt', 'id']],
  ['valet-activities',          ['activityType', 'ddtNumber', 'deliveryId', 'expertId']],
  ['product',                   ['name', 'price', 'sku', 'priceHistory']],
  ['products-variants',         ['variantName', 'variantSku', 'variantPrice']],
  ['product-category',          ['categoryName', 'aiPrompt']],
  ['product-category-province-discount', ['discount', 'productCategoryId', 'provinceId']],
  ['provinces',                 ['province', 'provinceCode']],
  ['province-cities',           ['cityName', 'provinceId']],
  ['service',                   ['serviceName', 'pricingModel']],
  ['expert-service',            ['salary', 'minimumKmPrice', 'expertId', 'serviceId']],
  ['partner-service',           ['price', 'extraKmPrice', 'partnerId', 'serviceId']],
  ['expert-receipts',           ['totalAmount', 'receiptStatus', 'expertId']],
  ['expert-time-availability',  ['date', 'startTime', 'endTime', 'available', 'expertId']],
  ['partner-time-availability', ['date', 'startTime', 'endTime', 'available', 'partnerId']],
  ['expert-contracts',          ['contractUrl', 'signedContractUrl', 'expertId']],
  ['expert-vehicle',            ['expertId', 'vehicleId']],
  ['team-leader-province',      ['expertId', 'teamLeaderId', 'provinceId']],
  ['delivery-rules',            ['billable', 'additionalPrice', 'kmLimit', 'serviceType']],
  ['refund-requests',           ['plusValue', 'requestText', 'requestStatus', 'expertId']],
  ['email-template',            ['subject', 'html', 'placeholders', 'ln']],
  ['emails-webhook',            ['senderDetails', 'extractedData', 'htmlBody']],
  ['web-push-subscription',     ['endpoint', 'p256dh', 'auth', 'userId']],
  ['web-push-history',          ['messageSeen', 'intendUrl', 'notificationData', 'userId']],
  ['shop-collection',           ['collectionName', 'handle', 'shopifyCollectionId']],
  ['stripe-customer',           ['stripeCustId', 'partnerId']],
  ['stripe-card',               ['cardId', 'stripeCustomerId']],
  ['custom-payments',           ['stripeSessionId', 'paymentStatus', 'platform']],
  ['offer',                     ['timeOffer', 'tryAndBuy', 'fromDate', 'toDate']],
  ['partner-invoice',           ['partnerId', 'invoice']],
  ['partner-reminder',          ['partnerId', 'reminderDate', 'errorMessage']],
  // Le sei tabelle di vendita hanno 69 colonne quasi identiche e si distinguono
  // solo per il numero di righe: restano `tabella-N`, si nominano a mano.
];

/** Cerca il nome dalla firma delle colonne. */
function nomeDaColonne(colonne) {
  const insieme = new Set(colonne);
  for (const [nome, richieste] of FIRME)
    if (richieste.every((c) => insieme.has(c))) return nome;
  return null;
}

/** Una riga e' un'INTESTAZIONE se tutti i campi sono nomi di colonna plausibili. */
function eIntestazione(campi) {
  if (campi.length < 2) return false;
  return campi.every((c) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(c));
}

/**
 * Legge il file record per record rispettando le virgolette.
 * Richiama `onRecord(campi)` per ogni riga logica.
 */
async function scorri(file, onRecord) {
  const flusso = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let campi = [], campo = '', inStringa = false, precedenteVirgoletta = false;

  for await (const pezzo of flusso) {
    for (let i = 0; i < pezzo.length; i++) {
      const c = pezzo[i];
      if (precedenteVirgoletta) {          // virgoletta appena chiusa: era escape?
        precedenteVirgoletta = false;
        if (c === '"') { campo += '"'; continue; }
        inStringa = false;
        // prosegue col carattere corrente
      }
      if (inStringa) {
        if (c === '"') { precedenteVirgoletta = true; continue; }
        campo += c; continue;
      }
      if (c === '"') { inStringa = true; continue; }
      if (c === ',') { campi.push(campo); campo = ''; continue; }
      if (c === '\n') { campi.push(campo); onRecord(campi); campi = []; campo = ''; continue; }
      if (c === '\r') continue;
      campo += c;
    }
  }
  if (campo !== '' || campi.length) { campi.push(campo); onRecord(campi); }
}

/** Rimette in forma CSV un record. */
const csv = (campi) => campi
  .map((v) => (v === 'NULL' ? 'NULL' : `"${String(v).replace(/"/g, '""')}"`))
  .join(',') + '\n';

if (!fs.existsSync(FILE)) { console.log(`Non trovo ${FILE}`); process.exit(1); }
console.log(`File: ${FILE}  (${(fs.statSync(FILE).size / 1024 / 1024).toFixed(0)} MB)`);
console.log(SCRIVI ? `Scrivo le tabelle in ${USCITA}\n` : 'Solo analisi (aggiungi --scrivi per dividere davvero)\n');

if (SCRIVI) fs.mkdirSync(USCITA, { recursive: true });

const tabelle = [];      // { colonne, righe, nome, flusso }
let corrente = null;
let totale = 0;

await scorri(FILE, (campi) => {
  totale++;
  // Nuova tabella: intestazione, e diversa da quella in corso.
  if (eIntestazione(campi) && (!corrente || campi.join() !== corrente.colonne.join())) {
    if (corrente?.flusso) corrente.flusso.end();
    corrente = { colonne: campi, righe: 0, nome: null, flusso: null };
    tabelle.push(corrente);
    return;
  }
  if (!corrente) return;                      // dati prima di qualsiasi intestazione
  corrente.righe++;
  if (SCRIVI) {
    if (!corrente.flusso) {
      const indovinato = nomeDaColonne(corrente.colonne);
      // Se due tabelle hanno la stessa firma (capita fra le vendite), la seconda
      // prende un suffisso invece di sovrascrivere la prima.
      let nome = indovinato ?? `tabella-${tabelle.indexOf(corrente) + 1}`;
      if (indovinato && tabelle.some((t) => t !== corrente && t.nome === indovinato))
        nome = `${indovinato}-${tabelle.indexOf(corrente) + 1}`;
      corrente.nome = nome;
      corrente.flusso = fs.createWriteStream(path.join(USCITA, `${corrente.nome}.csv`));
      corrente.flusso.write(csv(corrente.colonne));
    }
    corrente.flusso.write(csv(campi));
  }
});
if (corrente?.flusso) corrente.flusso.end();

console.log(`Record letti: ${totale.toLocaleString('it-IT')}`);
console.log(`Tabelle riconosciute: ${tabelle.length}\n`);

for (const [i, t] of tabelle.entries()) {
  console.log(`${String(i + 1).padStart(2)}. ${String(t.righe).padStart(9)} righe · ${String(t.colonne.length).padStart(3)} col · ${nomeDaColonne(t.colonne) ?? "(da nominare)"}`);
  console.log(`    ${t.colonne.join(', ').slice(0, 150)}${t.colonne.join(', ').length > 150 ? '…' : ''}`);
}

if (!SCRIVI) {
  console.log('\nLe tabelle non hanno un nome: phpMyAdmin non lo scrive nel CSV.');
  console.log('Si riconoscono dalle colonne. Con --scrivi vengono salvate come tabella-1, tabella-2, …');
  console.log('e poi si rinominano.');
}
