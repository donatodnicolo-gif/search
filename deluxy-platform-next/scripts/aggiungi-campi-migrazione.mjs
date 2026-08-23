// Prepara lo schema Prisma a ricevere i dati del legacy. Si esegue una volta sola.
//
// Aggiunge:
//  1. `legacyId Int? @unique` ai modelli che importiamo. Senza, l'import non e'
//     ripetibile (rilanciarlo duplicherebbe tutto) e non si possono ricollegare
//     le relazioni, che nel legacy viaggiano su id numerici.
//  2. L'accesso per i clienti: relazione User <-> Customer. Il modello Customer
//     non aveva ne' password ne' account, e il ruolo CUSTOMER non esisteva.
//
// ⚠️ Il file usa fine riga CRLF: vanno rispettate, o il diff diventa illeggibile.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/aggiungi-campi-migrazione.mjs

import fs from 'node:fs';

const FILE = 'C:/Users/nicol/app/deluxy-platform-next/api/prisma/schema.prisma';
const MODELLI = ['User', 'Customer', 'Partner', 'Valet', 'Province', 'Operation',
  'Product', 'Delivery', 'Category', 'ServiceType', 'City'];

let s = fs.readFileSync(FILE, 'utf8');
const NL = '\r\n';

/** Ritorna [inizioCorpo, fineCorpo) del corpo di un modello, o null. */
function corpoModello(testo, nome) {
  const apre = testo.indexOf(`model ${nome} {`);
  if (apre < 0) return null;
  const dopoGraffa = testo.indexOf('\n', apre) + 1;
  const chiude = testo.indexOf('\n}', dopoGraffa);
  if (chiude < 0) return null;
  return [dopoGraffa, chiude];
}

const aggiunti = [], saltati = [];
for (const m of MODELLI) {
  const punti = corpoModello(s, m);
  if (!punti) { saltati.push(`${m} (non trovato)`); continue; }
  const [da, a] = punti;
  const corpo = s.slice(da, a);
  if (corpo.includes('legacyId')) { saltati.push(`${m} (gia' presente)`); continue; }

  // Si inserisce subito dopo la riga dell'id, cosi' sta in cima al modello.
  const righe = corpo.split('\n');
  const iId = righe.findIndex((r) => /^\s+id\s+String/.test(r));
  if (iId < 0) { saltati.push(`${m} (nessuna riga id)`); continue; }
  righe.splice(iId + 1, 0,
    `  /// id nel database originario MySQL: rende l'import ripetibile e tracciabile\r`,
    `  legacyId             Int?      @unique\r`);
  s = s.slice(0, da) + righe.join('\n') + s.slice(a);
  aggiunti.push(m);
}

console.log('legacyId aggiunto a:', aggiunti.join(', ') || '(nessuno)');
if (saltati.length) console.log('saltati:', saltati.join(' · '));

// --- accesso clienti -------------------------------------------------------
if (/customerId\s+String\?\s+@unique/.test(s)) {
  console.log('User: customerId gia\' presente');
} else {
  const ancora = '  operation    Operation? @relation(fields: [operationId], references: [id])';
  const i = s.indexOf(ancora);
  if (i < 0) console.log('! User: non trovo dove agganciare customerId');
  else {
    const fine = s.indexOf('\n', i) + 1;
    s = s.slice(0, fine) +
      `  /// account di accesso di un cliente (ruolo CUSTOMER)${NL}` +
      `  customerId   String?    @unique${NL}` +
      `  customer     Customer?  @relation(fields: [customerId], references: [id])${NL}` +
      s.slice(fine);
    console.log('User: customerId + relazione aggiunti');
  }
}

const puntiCustomer = corpoModello(s, 'Customer');
if (puntiCustomer && !/\n  user\s+User\?/.test(s.slice(...puntiCustomer))) {
  const [da, a] = puntiCustomer;
  const corpo = s.slice(da, a);
  const righe = corpo.split('\n');
  const iCreated = righe.findIndex((r) => /^\s+createdAt\s/.test(r));
  const dove = iCreated >= 0 ? iCreated : righe.length;
  righe.splice(dove, 0,
    `  /// account di accesso del cliente (facoltativo)\r`,
    `  user       User?\r`);
  s = s.slice(0, da) + righe.join('\n') + s.slice(a);
  console.log('Customer: relazione inversa aggiunta');
}

fs.writeFileSync(FILE, s);
console.log('\nschema.prisma aggiornato.');
