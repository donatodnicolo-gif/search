/**
 * Banco di prova della sezione RICHIESTE (28/08/2026).
 *
 * ⚠️ Le prove che contano non sono «la rotta risponde 200»: sono quelle che
 * dimostrano un DIVIETO. Una chiave di sola lettura che riesce a scrivere, o
 * un rifiuto senza motivo che passa, sono difetti che si vedono solo se li si
 * prova apposta.
 *
 * ⚠️ Scrive sul database VERO: alla fine cancella quello che ha creato.
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const riga = fs
  .readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;

const API = 'http://localhost:3399/api/v1';
const SEGRETO = 'segreto-solo-per-la-prova-locale';
const prisma = new PrismaClient();
const esiti = [];
const ok = (n, c, extra = '') => esiti.push({ n, c, extra });

// Due chiavi usa-e-getta: una che può scrivere e una no.
const nomi = { rw: `prova-richieste-rw-${Date.now()}`, ro: `prova-richieste-ro-${Date.now()}` };
const chiavi = {};
for (const [k, nome] of Object.entries(nomi)) {
  const c = `dlxp_${randomBytes(24).toString('base64url')}`;
  chiavi[k] = c;
  await prisma.appApiKey.create({
    data: {
      nome,
      hash: createHash('sha256').update(c).digest('hex'),
      scrittura: k === 'rw',
      attiva: true,
    },
  });
}

const chiama = async (metodo, url, corpo, intestazioni = {}) => {
  const r = await fetch(`${API}${url}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...intestazioni },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* corpo vuoto */
  }
  return { stato: r.status, j };
};

const RIF = `PROVA-${Date.now()}`;
const TESTO =
  'Domani mattina ritiro da Casati in via Verdi 3 e consegna al Grand Hotel entro le 9, chiedere di Marta.';

// 1. La chiave di SOLA LETTURA non deve poter creare richieste.
{
  const r = await chiama(
    'POST',
    '/app/richieste',
    { testo: TESTO, riferimento: `${RIF}-ro` },
    { 'x-api-key': chiavi.ro },
  );
  ok('chiave di sola lettura RIFIUTATA in scrittura', r.stato === 401, `stato ${r.stato}`);
}
// 2. Senza chiave non si entra.
{
  const r = await chiama('POST', '/app/richieste', { testo: TESTO });
  ok('senza chiave RIFIUTATO', r.stato === 401, `stato ${r.stato}`);
}
// 3. Un testo troppo corto non è una richiesta.
{
  const r = await chiama('POST', '/app/richieste', { testo: 'ok' }, { 'x-api-key': chiavi.rw });
  ok('testo di 2 caratteri RIFIUTATO', r.stato === 400, `stato ${r.stato}`);
}
// 4. La creazione vera.
let id = null;
{
  const r = await chiama(
    'POST',
    '/app/richieste',
    { testo: TESTO, riferimento: RIF, contatto: 'marta@esempio.it' },
    { 'x-api-key': chiavi.rw },
  );
  id = r.j?.id;
  ok(
    'richiesta creata',
    r.stato === 201 && !!id && r.j?.stato === 'nuova' && r.j?.giaEsistente === false,
    `stato ${r.stato}, ${r.j?.stato}`,
  );
  ok("l'origine è il NOME della chiave, non «app»", r.j?.origine === nomi.rw, `origine=${r.j?.origine}`);
}
// 5. Idempotenza: la stessa app che riprova lo stesso riferimento non duplica.
{
  const r = await chiama(
    'POST',
    '/app/richieste',
    { testo: `${TESTO} (ritentata)`, riferimento: RIF },
    { 'x-api-key': chiavi.rw },
  );
  const quante = await prisma.richiestaConsegna.count({
    where: { origine: nomi.rw, riferimento: RIF },
  });
  ok(
    'ritentando lo stesso riferimento NON nasce un doppione',
    r.j?.giaEsistente === true && r.j?.id === id && quante === 1,
    `giaEsistente=${r.j?.giaEsistente}, righe=${quante}`,
  );
}
// 6. Una richiesta NON è una consegna.
{
  const collegata = await prisma.richiestaConsegna.findUnique({
    where: { id },
    select: { deliveryId: true },
  });
  ok('una richiesta NON crea una consegna', collegata?.deliveryId === null, `deliveryId=${collegata?.deliveryId}`);
}
// 7. L'app legge l'esito col SUO riferimento…
{
  const r = await chiama('GET', `/app/richieste/${RIF}`, null, { 'x-api-key': chiavi.rw });
  ok("chi ha mandato rilegge l'esito", r.stato === 200 && r.j?.id === id, `stato ${r.stato}`);
}
// 8. …ma un'ALTRA app con la stessa stringa non lo vede.
{
  const r = await chiama('GET', `/app/richieste/${RIF}`, null, { 'x-api-key': chiavi.ro });
  ok("un'altra app NON legge la richiesta indovinando il riferimento", r.stato === 404, `stato ${r.stato}`);
}

// ---- Le rotte d'ufficio, con un token vero.
const jwt = await import('jsonwebtoken');
const admin = await prisma.user.findFirst({
  where: { role: 'ADMIN', status: 'active' },
  select: { id: true, email: true },
});
const valet = await prisma.user.findFirst({
  where: { role: 'VALET', status: 'active' },
  select: { id: true, email: true },
});
const token = (x) => jwt.default.sign({ sub: x.id }, SEGRETO, { expiresIn: '1h' });
const comeAdmin = { authorization: `Bearer ${token(admin)}` };

// 9. Un VALET non deve vedere la posta dell'ufficio.
{
  const r = await chiama('GET', '/richieste', null, { authorization: `Bearer ${token(valet)}` });
  ok('un VALET non vede le richieste', r.stato === 403, `stato ${r.stato}, valet=${valet.email}`);
}
// 10. L'admin la trova in elenco, e il contatore delle nuove la conta.
{
  const r = await chiama('GET', '/richieste?stato=nuova', null, comeAdmin);
  const c = r.j?.richieste?.find((x) => x.id === id);
  ok(
    "l'admin la trova fra le nuove",
    r.stato === 200 && !!c && r.j.daLeggere >= 1,
    `stato ${r.stato}, daLeggere=${r.j?.daLeggere}`,
  );
}
// 10-bis. La rotta che usa il MODULO CONSEGNA quando si arriva da «Crea
// consegna»: se torna vuota, il pannello dell'AI si apre senza testo e il
// difetto e' muto — si vede solo provandola.
{
  const r = await chiama('GET', `/richieste/${id}`, null, comeAdmin);
  ok('il modulo consegna rilegge la richiesta per id', r.stato === 200 && r.j?.testo === TESTO, `stato ${r.stato}, testo=${(r.j?.testo ?? '').slice(0, 20)}…`);
}
// 11. Rifiutare SENZA MOTIVO si rifiuta.
{
  const r = await chiama('PATCH', `/richieste/${id}`, { stato: 'rifiutata' }, comeAdmin);
  ok('rifiuto senza motivo RIFIUTATO', r.stato === 400, `stato ${r.stato}`);
}
// 12. Uno stato inventato si rifiuta.
{
  const r = await chiama('PATCH', `/richieste/${id}`, { stato: 'archiviata' }, comeAdmin);
  ok('stato inventato RIFIUTATO', r.stato === 400, `stato ${r.stato}`);
}
// 13. Collegare una consegna che non esiste si rifiuta.
{
  const r = await chiama(
    'PATCH',
    `/richieste/${id}`,
    { stato: 'accettata', deliveryId: 'non-esiste' },
    comeAdmin,
  );
  ok('consegna inesistente RIFIUTATA', r.stato === 400, `stato ${r.stato}`);
}
// 14. Accettare collegando una consegna VERA funziona, e chi ha mandato lo rilegge.
{
  const c = await prisma.delivery.findFirst({
    where: { deletedAt: null },
    select: { id: true, code: true },
  });
  const r = await chiama(
    'PATCH',
    `/richieste/${id}`,
    { stato: 'accettata', deliveryId: c.id },
    comeAdmin,
  );
  ok(
    'accettata e collegata',
    r.stato === 200 && r.j?.stato === 'accettata' && r.j?.delivery?.code === c.code,
    `stato ${r.stato}`,
  );
  const rilettura = await chiama('GET', `/app/richieste/${RIF}`, null, { 'x-api-key': chiavi.rw });
  ok(
    "chi l'ha mandata legge il NUMERO della consegna nata",
    rilettura.j?.delivery?.code === c.code,
    `code=${rilettura.j?.delivery?.code}`,
  );
  ok('resta scritto CHI ha deciso', rilettura.j?.decisaDa === admin.email, `decisaDa=${rilettura.j?.decisaDa}`);
}

// 15. Un OPERATION deve entrare.
//
// ⚠️ Il Customer Service NON è un ruolo a parte: è un OPERATION con
// `operationRole = 'customer_service'` — e quel campo, oggi, non filtra nessuna
// rotta né voce di menu (misurato: nessun controllo su operationRole in
// app.routes.ts né in shell.component.ts). Quindi provare un OPERATION
// qualunque prova anche il CS. In banca dati oggi ci sono 13 «operation» e 3
// «project_manager», nessun «customer_service»: provare a cercarne uno darebbe
// solo una prova a vuoto.
{
  const op = await prisma.user.findFirst({
    where: { role: 'OPERATION', status: 'active' },
    select: { id: true, email: true },
  });
  const r = await chiama('GET', '/richieste', null, { authorization: `Bearer ${token(op)}` });
  ok('un OPERATION (quindi anche il CS) vede le richieste', r.stato === 200, `stato ${r.stato}, op=${op.email}`);
}
// 16. Un PARTNER non deve vedere la posta dell'ufficio.
{
  const partner = await prisma.user.findFirst({
    where: { role: 'PARTNER', status: 'active' },
    select: { id: true, email: true },
  });
  const r = await chiama('GET', '/richieste', null, { authorization: `Bearer ${token(partner)}` });
  ok('un PARTNER non vede le richieste', r.stato === 403, `stato ${r.stato}, partner=${partner.email}`);
}

// ---- Pulizia: si toglie solo quello che questa prova ha creato.
await prisma.richiestaConsegna.deleteMany({ where: { origine: { in: Object.values(nomi) } } });
await prisma.appApiKey.deleteMany({ where: { nome: { in: Object.values(nomi) } } });
await prisma.$disconnect();

let falliti = 0;
for (const e of esiti) {
  if (!e.c) falliti++;
  console.log(`${e.c ? '\u2714' : '\u2718'} ${e.n}${e.extra ? `  (${e.extra})` : ''}`);
}
console.log(`\n${esiti.length - falliti}/${esiti.length} prove passate`);
process.exit(falliti ? 1 : 0);
