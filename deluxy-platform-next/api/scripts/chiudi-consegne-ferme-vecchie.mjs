/**
 * LE CONSEGNE «CREATED/ASSIGNED» VECCHIE DI ANNI VANNO CHIUSE (10/09/2026, richiesta utente).
 *
 *   node api/scripts/chiudi-consegne-ferme-vecchie.mjs                                   (anteprima, tutti i partner)
 *   node api/scripts/chiudi-consegne-ferme-vecchie.mjs --partner "Basara Tortona"        (anteprima, un partner)
 *   node api/scripts/chiudi-consegne-ferme-vecchie.mjs --partner "Basara Tortona" --stato approved --applica
 *   node api/scripts/chiudi-consegne-ferme-vecchie.mjs --partner "Martesana Ecommerce" --partner "BAR Nicol" --stato delivered --applica
 *
 * COSA VEDE L'UFFICIO OGGI. Misurato il 10/09/2026 sull'elenco «Attive» (2.159 righe):
 * 1.125 sono consegne del VECCHIO gestionale rimaste `created`/`assigned` con date
 * 2012-2024 — Basara Tortona 582 (nov-dic 2024), Martesana Ecommerce 390 (2012→03/2026),
 * Basara Corso Italia 104, DR Vranjes 49 — più i blocchi piccoli di Artista Locale,
 * BAR Nicol, Deluxy Flowers. Nel csv legacy stanno ESATTAMENTE nello stesso stato
 * (Basara Tortona: 582/582 `created`; Martesana Ecommerce: 387 con stato VUOTO):
 * il vecchio gestionale non le ha mai chiuse, quindi non c'è uno stato «vero» da
 * travasare. Lo stato di chiusura lo decide l'utente (`--stato`).
 *
 * COSA FA. Scrive `status = <stato>` e UNA riga di registro per consegna
 * («Chiusa d'ufficio … era <stato precedente>»), così è reversibile una per una:
 * lo stato di prima è scritto nel registro. NON tocca prezzi, paghe, fatturazione,
 * valet, date. NON cancella niente.
 *
 * ⚠️ Tocca SOLO consegne: vive (deletedAt null), in stato `created`/`assigned`/`accepted`
 * /`in_preparation`, con DATA più vecchia della soglia (default 30 giorni), dei partner
 * indicati (o di tutti, senza --partner). Le consegne di oggi e future non le sfiora.
 * Con `--solo-legacy` prende solo quelle importate (legacyId valorizzato).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const SOLO_LEGACY = process.argv.includes('--solo-legacy');
// ⭐ 10/09 (decisione utente «metti già fatturate»): con --fatturate le consegne chiuse escono anche dal «Da fatturare».
const FATTURATE = process.argv.includes('--fatturate');
const argVal = (k, def) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : def; };
const GIORNI = Number(argVal('--giorni', 30));
const STATO = argVal('--stato', 'approved');
const PARTNER = process.argv.map((a, i) => (a === '--partner' ? process.argv[i + 1] : null)).filter(Boolean);
const STATI_AMMESSI = ['approved', 'delivered', 'cancelled', 'invalidated'];
if (!STATI_AMMESSI.includes(STATO)) { console.error(`--stato deve essere uno di: ${STATI_AMMESSI.join(', ')}`); process.exit(1); }

const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const soglia = new Date(Date.now() - GIORNI * 24 * 3600 * 1000);
const where = {
  deletedAt: null,
  status: { in: ['created', 'assigned', 'accepted', 'in_preparation'] },
  date: { lt: soglia },
  ...(SOLO_LEGACY ? { legacyId: { not: null } } : {}),
  ...(PARTNER.length ? { partner: { insegna: { in: PARTNER } } } : {}),
};
const rows = await db.delivery.findMany({
  where,
  orderBy: [{ partnerId: 'asc' }, { date: 'asc' }],
  select: { id: true, code: true, date: true, status: true, legacyId: true, partner: { select: { insegna: true } }, serviceType: { select: { name: true } } },
});
console.log(`fatturate: ${FATTURATE ? 'sì' : 'no'} · soglia: data ≤ ${soglia.toISOString().slice(0, 10)} (${GIORNI} giorni) · stato di chiusura: ${STATO} · partner: ${PARTNER.length ? PARTNER.join(', ') : 'TUTTI'}${SOLO_LEGACY ? ' · solo legacy' : ''}`);
console.log(`consegne trovate: ${rows.length}`);
const perPartner = {};
for (const r of rows) {
  const k = r.partner.insegna;
  const g = (perPartner[k] ??= { n: 0, dal: r.date, al: r.date, stati: {}, legacy: 0, servizi: new Set() });
  g.n++; if (r.date < g.dal) g.dal = r.date; if (r.date > g.al) g.al = r.date;
  g.stati[r.status] = (g.stati[r.status] ?? 0) + 1; if (r.legacyId) g.legacy++; g.servizi.add(r.serviceType.name);
}
for (const [k, g] of Object.entries(perPartner).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${k}: ${g.n} (${Object.entries(g.stati).map(([s, n]) => `${s} ${n}`).join(', ')}) · ${g.dal.toISOString().slice(0, 10)} → ${g.al.toISOString().slice(0, 10)} · legacy ${g.legacy} · ${[...g.servizi].join(', ')}`);
}
if (!APPLICA) { console.log('\nANTEPRIMA: nessuna scrittura. Aggiungi --applica per chiudere.'); await db.$disconnect(); process.exit(0); }
if (!PARTNER.length) { console.error('\nPer scrivere serve almeno un --partner: chiudere TUTTI i partner in un colpo non è previsto.'); await db.$disconnect(); process.exit(1); }

let fatte = 0;
const oggi = new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
for (const r of rows) {
  await db.$transaction([
    db.delivery.update({ where: { id: r.id }, data: { status: STATO, ...(FATTURATE ? { invoiced: true } : {}) } }),
    db.deliveryLog.create({ data: { deliveryId: r.id, type: 'status_change', message: `Chiusa d'ufficio il ${oggi} (script chiudi-consegne-ferme-vecchie): era «${r.status}» dal ${r.date.toISOString().slice(0, 10)}, mai lavorata${r.legacyId ? ', importata dal vecchio gestionale' : ''} → «${STATO}»${FATTURATE ? ' e segnata già fatturata (non entra nel Da fatturare)' : ''}` } }),
  ]);
  fatte++;
  if (fatte % 100 === 0) console.log(`  … ${fatte}/${rows.length}`);
}
const rimaste = await db.delivery.count({ where });
console.log(`\nFATTO: ${fatte} consegne chiuse come «${STATO}». Con lo stesso filtro ne restano: ${rimaste}.`);
await db.$disconnect();
