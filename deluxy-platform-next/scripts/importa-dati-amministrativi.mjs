// Porta in piattaforma i dati amministrativi dei partner presenti nel registro
// Anagrafiche: IBAN, intestatario del conto, codice SDI, PEC, referente
// amministrazione, stato finanziario.
//
// ⚠️ NON SOVRASCRIVE. Riempie solo i campi VUOTI in piattaforma. Dove i due
// sistemi dicono cose diverse lo segnala e lascia com'e': quale dei due abbia
// ragione non e' una decisione da prendere in automatico.
//
// Legge il registro dalle API con la chiave configurata in Impostazioni, cosi'
// prova anche che la configurazione funzioni davvero.
//
// Uso:
//   node .../importa-dati-amministrativi.mjs --prova   # simula, non scrive
//   node .../importa-dati-amministrativi.mjs           # scrive

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const PROVA = process.argv.includes('--prova');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();

const testo = (v) => { const t = v == null ? '' : String(v).trim(); return t === '' ? null : t; };

/**
 * Verifica un IBAN col suo codice di controllo (ISO 13616, mod-97).
 *
 * Serve a non lasciare all'occhio la scelta fra due IBAN diversi: uno dei due
 * spesso e' semplicemente SBAGLIATO, e il codice di controllo lo dimostra.
 * Nel primo giro e' emerso `IT7IF…` contro `IT71F…` — la I maiuscola al posto
 * dell'uno: le cifre di controllo devono essere numeri, quindi il primo non e'
 * nemmeno un IBAN valido.
 */
function ibanValido(v) {
  const s = String(v).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s) || s.length < 15 || s.length > 34) return false;
  const riordinato = s.slice(4) + s.slice(0, 4);
  const numerico = [...riordinato].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('');
  // Resto per 97 a pezzi, perche' il numero non entra in un intero.
  let resto = 0;
  for (const c of numerico) resto = (resto * 10 + Number(c)) % 97;
  return resto === 1;
}

// --- chiave e indirizzo dalle impostazioni dell'app -------------------------
const impostazioni = Object.fromEntries(
  (await db.appSetting.findMany()).map((x) => [x.key, x.value]),
);
const base = (impostazioni.anagraficheUrl || 'https://deluxy-anagrafiche.vercel.app').replace(/\/+$/, '');
const chiave = impostazioni.anagraficheApiKey;
if (!chiave) { console.log('Chiave del registro non configurata in Impostazioni.'); process.exit(1); }

// --- lettura del registro ---------------------------------------------------
const registro = [];
for (let page = 1; page <= 50; page++) {
  const res = await fetch(`${base}/api/v1/partners?attivo=tutti&perPage=200&page=${page}`, {
    headers: { 'x-api-key': chiave },
  });
  if (!res.ok) { console.log(`Registro: HTTP ${res.status} alla pagina ${page}`); break; }
  const body = await res.json();
  const dati = body.dati ?? [];
  registro.push(...dati);
  if (dati.length < 200) break;
}
console.log(`registro letto: ${registro.length} anagrafiche`);

// ⚠️ Le API del registro non espongono i campi amministrativi (serializzaPartner
// restituisce solo l'anagrafica di base). Si leggono quindi dal database, che
// sta sullo stesso cluster.
const dbReg = new PrismaClient({
  datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=anagrafiche&pgbouncer=true&connection_limit=1` } },
});
const amministrativi = await dbReg.$queryRawUnsafe(`
  select id, "platformId", "pIva", email, iban, "intestatarioConto", "codiceSdi", pec,
         "amministrazioneNome", "amministrazioneEmail", "amministrazioneTelefono", "statoFinanziario"
  from "anagrafiche"."Partner"
  where iban is not null or "codiceSdi" is not null or pec is not null
     or "amministrazioneEmail" is not null or "amministrazioneNome" is not null
     or ("statoFinanziario" is not null and "statoFinanziario" <> 'da_verificare')`);
await dbReg.$disconnect();
console.log(`anagrafiche con qualcosa di amministrativo: ${amministrativi.length}\n`);

// --- abbinamento ------------------------------------------------------------
const partners = await db.partner.findMany();
const perId = new Map(partners.map((p) => [p.id, p]));
const perPiva = new Map(partners.filter((p) => p.vatNumber).map((p) => [p.vatNumber.trim().toUpperCase(), p]));
const perEmail = new Map(partners.filter((p) => p.email).map((p) => [p.email.trim().toLowerCase(), p]));

// registro -> piattaforma
const CAMPI = [
  ['iban', 'bankAccount', 'IBAN'],
  ['intestatarioConto', 'bankAccountName', 'Intestatario conto'],
  ['codiceSdi', 'sdiCode', 'Codice SDI'],
  ['pec', 'certifiedEmail', 'PEC'],
  ['amministrazioneNome', 'adminName', 'Referente amministrazione'],
  ['amministrazioneEmail', 'adminEmail', 'Email amministrazione'],
  ['amministrazioneTelefono', 'adminPhone', 'Telefono amministrazione'],
  ['statoFinanziario', 'financialStatus', 'Stato finanziario'],
];

let abbinati = 0, nonAbbinati = 0, aggiornati = 0;
const riempiti = {}, conflitti = [];

for (const a of amministrativi) {
  const p = (a.platformId && perId.get(a.platformId))
    ?? (a.pIva && perPiva.get(String(a.pIva).trim().toUpperCase()))
    ?? (a.email && perEmail.get(String(a.email).trim().toLowerCase()));
  if (!p) { nonAbbinati++; continue; }
  abbinati++;

  const dati = {};
  for (const [daReg, aPiatt, etichetta] of CAMPI) {
    const valore = testo(a[daReg]);
    if (!valore) continue;
    // Lo stato finanziario predefinito non porta informazione: si ignora.
    if (daReg === 'statoFinanziario' && valore === 'da_verificare') continue;
    const attuale = testo(p[aPiatt]);
    if (!attuale) { dati[aPiatt] = valore; riempiti[etichetta] = (riempiti[etichetta] ?? 0) + 1; continue; }
    if (attuale !== valore) {
      // Se e' un IBAN, il codice di controllo dice quale dei due e' valido:
      // meglio un verdetto che una scelta a occhio.
      const nota = daReg === 'iban'
        ? ` [qui ${ibanValido(attuale) ? 'valido' : 'NON VALIDO'} · registro ${ibanValido(valore) ? 'valido' : 'NON VALIDO'}]`
        : '';
      conflitti.push({ partner: p.insegna, campo: etichetta, piattaforma: attuale, registro: valore, nota });
    }
  }
  if (Object.keys(dati).length && !PROVA) {
    await db.partner.update({ where: { id: p.id }, data: dati });
    aggiornati++;
  } else if (Object.keys(dati).length) aggiornati++;
}

console.log('RESOCONTO');
console.log(`  anagrafiche abbinate a un partner   ${String(abbinati).padStart(5)}`);
console.log(`  non abbinate (partner non in piattaforma) ${String(nonAbbinati).padStart(3)}`);
console.log(`  partner aggiornati                  ${String(aggiornati).padStart(5)}`);
console.log('\n  campi riempiti (erano vuoti):');
for (const [k, v] of Object.entries(riempiti).sort((a, b) => b[1] - a[1]))
  console.log(`    ${k.padEnd(28)} ${String(v).padStart(4)}`);
if (!Object.keys(riempiti).length) console.log('    (nessuno)');

if (conflitti.length) {
  console.log(`\n  ⚠️ DIVERGENZE lasciate com'erano (${conflitti.length}): decidere a mano`);
  for (const c of conflitti.slice(0, 15))
    console.log(`    ${c.partner.slice(0, 22).padEnd(24)} ${c.campo.padEnd(24)} qui="${c.piattaforma}" registro="${c.registro}"${c.nota ?? ''}`);
  if (conflitti.length > 15) console.log(`    … e altre ${conflitti.length - 15}`);
}
if (PROVA) console.log('\n(era una prova: nulla e\' stato scritto)');
await db.$disconnect();
