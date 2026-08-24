// «Estingui» un utente: un gesto solo che chiude l'accesso E cancella i dati
// personali, lasciando intatto lo storico.
//
// Perche' un gesto solo e non due (archivia + anonimizza): sono due meta' della
// stessa decisione, e separarle produce quasi sempre il mezzo lavoro — record
// chiusi che continuano a contenere nome, email e telefono di persone che se ne
// sono andate anni fa.
//
// COSA FA, e perche' cosi':
//   - lo stato diventa `extinct`: non entra piu';
//   - i dati personali diventano irriconoscibili (email `estinto-<id>@deluxy.invalid`,
//     nome «Utente», cognome «estinto», password e token invito azzerati);
//   - l'ID NON cambia. E' il punto: le 49.728 consegne che hanno un autore
//     mantengono il legame, i conteggi non si muovono, e sparisce solo la persona.
//     Cancellando la riga, `ON DELETE SET NULL` avrebbe svuotato l'autore su
//     tutto il suo storico, in silenzio;
//   - PRIMA si scrive un UserEvent, che sopravvive perche' l'utente resta:
//     l'atto di estinzione deve lasciare traccia piu' di ogni altro.
//
// CHI: di default gli utenti senza alcuna traccia da oltre 3 anni. «Traccia» =
// consegne create, consegne ricevute come cliente, consegne del proprio partner
// o come valet, eventi, attivazione.
//
// ⚠️ Il PERSONALE INTERNO (admin, operation, project manager) non si estingue
// mai in automatico: la regola misura le consegne, e un collega interno non ne
// crea. Restare chiusi fuori dal proprio sistema per una regola di pulizia
// sarebbe un guasto, non un'igiene.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const ANNI = Number(process.argv.find((a) => a.startsWith('--anni='))?.split('=')[1] ?? 3);

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

/** Ruoli di chi lavora in Deluxy: fuori dall'estinzione automatica. */
const INTERNI = new Set(['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'CUSTOMER_SERVICE']);

const ZERO = new Date('1970-01-01T00:00:00Z');
const soglia = new Date();
soglia.setFullYear(soglia.getFullYear() - ANNI);

// Le ultime tracce, aggregate una volta sola. Con le sottoquery correlate
// (5.082 utenti x 61.836 consegne) la query andava in timeout.
const perChiave = async (campo) => {
  const righe = await db.$queryRawUnsafe(
    `select "${campo}" as k, max(date) as ultima from "platform"."Delivery" where "${campo}" is not null group by 1`);
  return new Map(righe.map((r) => [r.k, r.ultima]));
};
const [creata, cliente, partner, valet] = await Promise.all([
  perChiave('createdByUserId'), perChiave('customerId'), perChiave('partnerId'), perChiave('valetId'),
]);
const eventi = new Map((await db.$queryRawUnsafe(
  `select "userId" k, max("createdAt") ultima from "platform"."UserEvent" group by 1`)).map((r) => [r.k, r.ultima]));

// Chi e' ancora in servizio non si estingue, anche se non ha ancora consegne.
// «Nessuna consegna» non vuol dire «se n'e' andato»: Chanel Corporate e'
// attivo, ha due account di persone vere e zero consegne, e senza questa
// riga sarebbe stato estinto insieme ai doppioni spenti.
const partnerAttivi = new Set((await db.partner.findMany({ where: { active: true }, select: { id: true } })).map((x) => x.id));
const valetAttivi = new Set((await db.valet.findMany({ where: { active: true }, select: { id: true } })).map((x) => x.id));

const utenti = await db.user.findMany({
  select: { id: true, email: true, role: true, status: true, firstName: true, lastName: true,
            partnerId: true, valetId: true, customerId: true, activatedAt: true, createdAt: true },
});

const piuRecente = (...date) => date.filter(Boolean).reduce((a, b) => (a > b ? a : b), ZERO);
const candidati = [], protetti = [], inServizio = [];
for (const x of utenti) {
  if (x.status === 'extinct') continue;
  const ultima = piuRecente(
    creata.get(x.id), x.customerId && cliente.get(x.customerId),
    x.partnerId && partner.get(x.partnerId), x.valetId && valet.get(x.valetId),
    eventi.get(x.id), x.activatedAt,
  );
  if (ultima >= soglia) continue;
  if (x.partnerId && partnerAttivi.has(x.partnerId)) { inServizio.push(x); continue; }
  if (x.valetId && valetAttivi.has(x.valetId)) { inServizio.push(x); continue; }
  // ⚠️ Il PERSONALE INTERNO non si estingue in automatico, mai.
  //
  // Su questa piattaforma «nessuna traccia da 3 anni» per un interno non
  // significa niente: l'ambiente e' partito da poco e NESSUNO di loro ha mai
  // attivato l'account (20 su 20 «mai attivato» il 24/08/2026). La regola
  // misura le consegne, e un project manager non ne crea. Applicandola
  // avrebbe cancellato i dati di colleghi in servizio e li avrebbe chiusi
  // fuori dal proprio sistema.
  //
  // Per un CLIENTE, un PARTNER o un VALET invece la misura ha senso: la
  // relazione con Deluxy passa dalle consegne, e tre anni senza nemmeno una
  // dicono davvero che e' finita.
  if (INTERNI.has(x.role)) { protetti.push(x); continue; }
  candidati.push({ ...x, ultima });
}

const perRuolo = {};
for (const c of candidati) perRuolo[c.role] = (perRuolo[c.role] ?? 0) + 1;
console.log(`soglia: nessuna traccia dal ${soglia.toISOString().slice(0, 10)} (${ANNI} anni)`);
console.log(`utenti in tutto: ${utenti.length} · da estinguere: ${candidati.length}`);
for (const [r, n] of Object.entries(perRuolo).sort((a, b) => b[1] - a[1])) console.log(`   ${r.padEnd(16)} ${n}`);
if (inServizio.length) console.log(`
🔒 saltati perche' l'anagrafica e' ANCORA ATTIVA: ${inServizio.length}`);
if (protetti.length) console.log(`\n🔒 personale interno saltato di proposito: ${protetti.length} (${[...new Set(protetti.map((p) => p.role))].join(', ')})`);
console.log('\nprimi 8:');
for (const c of candidati.slice(0, 8))
  console.log(`   ${String(c.email).slice(0, 40).padEnd(42)} ${c.role.padEnd(14)} ultima traccia: ${c.ultima > ZERO ? c.ultima.toISOString().slice(0, 10) : 'MAI'}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

let fatti = 0;
for (const c of candidati) {
  await db.userEvent.create({
    data: { userId: c.id, action: 'extinguished', actorEmail: 'sistema',
            note: `Nessuna traccia da oltre ${ANNI} anni (ultima: ${c.ultima > ZERO ? c.ultima.toISOString().slice(0, 10) : 'mai'}). Dati personali rimossi, storico conservato.` },
  });
  await db.user.update({
    where: { id: c.id },
    data: {
      status: 'extinct',
      email: `estinto-${c.id}@deluxy.invalid`,
      firstName: 'Utente', lastName: 'estinto',
      passwordHash: null, inviteToken: null, inviteTokenExpiresAt: null,
    },
  });
  fatti++;
  if (fatti % 500 === 0) console.log(`   … ${fatti}/${candidati.length}`);
}
console.log(`\n✅ estinti ${fatti}`);
const g = await db.user.groupBy({ by: ['status'], _count: true });
console.log('   stati ora:', g.map((x) => `${x.status} ${x._count}`).join(' · '));
console.log('   eventi di estinzione registrati:', await db.userEvent.count({ where: { action: 'extinguished' } }));
await db.$disconnect();
