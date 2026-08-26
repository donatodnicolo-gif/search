// Applica le regole ALLE CONSEGNE ESISTENTI (27/08, chiesto dall'utente):
//
//  1. REGOLE VALET: la consegna del valet assegnato a una regola attiva
//     riceve `valetDeliveryRuleId` dove manca. Sicuro: la regola appartiene
//     al VALET (ValetDeliveryRuleValet), il conteggio stipendi la usava gia'
//     come ripiego — qui la si materializza sul record.
//
//  2. REGOLE CARNET: la consegna senza `deliveryRuleId` riceve la regola se
//     combacia TUTTO: partner della regola, data nel periodo, orario di
//     consegna nella finestra, modello di servizio (legacyPricingModel), e
//     giorno della settimana AMMESSO IN ENTRAMBE le letture della maschera
//     (dom..sab e lun..dom — l'ordine dei bit del legacy non e' documentato:
//     nel dubbio si accetta solo cio' che vale comunque). La maschera
//     «0000000» vale «nessun vincolo» (le regole sempre-attive del legacy
//     sono scritte cosi'). Km: si controlla solo se la consegna ha una
//     distanza scritta. Se PIU' regole combaciano, non si tocca e si conta.
//
// Prova a secco di default; --scrivi per applicare (backup su file).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PrismaClient } = require(path.join(RADICE, 'node_modules', '@prisma/client'));
const SCRIVI = process.argv.includes('--scrivi');

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

// ── 1) REGOLE VALET ─────────────────────────────────────────────────────────
const assegnazioni = await db.valetDeliveryRuleValet.findMany({
  where: { valetDeliveryRule: { active: true } },
  select: { valetId: true, valetDeliveryRuleId: true },
});
const regolaDelValet = new Map();
for (const a of assegnazioni) if (!regolaDelValet.has(a.valetId)) regolaDelValet.set(a.valetId, a.valetDeliveryRuleId);

let valetDaScrivere = 0;
const perValet = [];
for (const [valetId, ruleId] of regolaDelValet) {
  const n = await db.delivery.count({ where: { valetId, valetDeliveryRuleId: null, deletedAt: null } });
  if (n) { valetDaScrivere += n; perValet.push({ valetId, ruleId, n }); }
}
console.log(`REGOLE VALET: ${regolaDelValet.size} valet assegnati · consegne senza il campo: ${valetDaScrivere}`);

// ── 2) REGOLE CARNET ────────────────────────────────────────────────────────
const regole = await db.deliveryRule.findMany({
  where: { active: true },
  include: { partners: { select: { partnerId: true } } },
});

const minuti = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// Giorno ammesso in ENTRAMBE le letture della maschera (o maschera senza vincoli).
const giornoOk = (mask, data) => {
  if (!mask || !/[1]/.test(mask)) return true; // '0000000' o vuota = nessun vincolo
  const dow = new Date(data).getUTCDay(); // 0=domenica … 6=sabato
  const comeDom0 = mask[dow] === '1';
  const comeLun0 = mask[(dow + 6) % 7] === '1';
  return comeDom0 && comeLun0;
};

let carnetDaScrivere = 0, ambigue = 0;
const perRegola = new Map();
const scritture = []; // {deliveryId, ruleId}
// Le consegne candidate: dei partner con almeno una regola, senza regola.
const partnerConRegole = [...new Set(regole.flatMap((r) => r.partners.map((p) => p.partnerId)))];
const candidate = await db.delivery.findMany({
  where: { deletedAt: null, deliveryRuleId: null, partnerId: { in: partnerConRegole } },
  select: { id: true, code: true, date: true, partnerId: true, deliveryTimeFrom: true, extraKm: true,
    serviceType: { select: { pricingModel: true } } },
});
console.log(`REGOLE CARNET: ${regole.length} attive · consegne candidate (partner con regole, senza regola): ${candidate.length}`);

const MODELLO = { 'prezzo fisso': 'PREZZO_FISSO', 'a ora': 'A_ORA' };
for (const d of candidate) {
  const combacianti = regole.filter((r) => {
    if (!r.partners.some((p) => p.partnerId === d.partnerId)) return false;
    if (r.periodStart && d.date < r.periodStart) return false;
    if (r.periodEnd && d.date > r.periodEnd) return false;
    const modello = MODELLO[(r.legacyPricingModel ?? '').trim()] ?? null;
    if (modello && d.serviceType?.pricingModel !== modello) return false;
    if (!giornoOk(r.days, d.date)) return false;
    const da = minuti(r.timeFrom), a = minuti(r.timeTo), ora = minuti(d.deliveryTimeFrom);
    if (da != null && a != null && !(da === 0 && a >= 1439)) {
      if (ora == null) return false;
      if (ora < da || ora > a) return false;
    }
    // km: la consegna non ha una distanza propria affidabile (extraKm e un extra, non la distanza): non si usa per escludere.
    return true;
  });
  if (combacianti.length === 1) {
    const r = combacianti[0];
    scritture.push({ deliveryId: d.id, ruleId: r.id });
    carnetDaScrivere++;
    perRegola.set(r.name, (perRegola.get(r.name) ?? 0) + 1);
  } else if (combacianti.length > 1) ambigue++;
}
console.log(`  da agganciare: ${carnetDaScrivere} · ambigue (piu' regole combaciano, non toccate): ${ambigue}`);
for (const [nome, n] of [...perRegola.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${nome}: ${n}`);

if (!SCRIVI) {
  console.log('\nPROVA A SECCO: nessuna scrittura. Rilanciare con --scrivi.');
} else {
  const file = path.join(RADICE, 'legacy', `backup-applica-regole-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ perValet, carnet: scritture }, null, 1));
  console.log(`\nBackup in ${file}`);
  for (const { valetId, ruleId } of perValet.map((x) => ({ valetId: x.valetId, ruleId: x.ruleId }))) {
    await db.delivery.updateMany({ where: { valetId, valetDeliveryRuleId: null, deletedAt: null }, data: { valetDeliveryRuleId: ruleId } });
  }
  console.log(`Regole VALET scritte su ${valetDaScrivere} consegne.`);
  let fatti = 0;
  for (let i = 0; i < scritture.length; i += 500) {
    const blocco = scritture.slice(i, i + 500);
    // gruppi per regola dentro il blocco
    const perRule = new Map();
    for (const s of blocco) (perRule.get(s.ruleId) ?? perRule.set(s.ruleId, []).get(s.ruleId)).push(s.deliveryId);
    for (const [ruleId, ids] of perRule) {
      await db.delivery.updateMany({ where: { id: { in: ids } }, data: { deliveryRuleId: ruleId } });
      fatti += ids.length;
    }
    process.stdout.write(`  carnet ${fatti}/${scritture.length}…`);
  }
  console.log(`\nRegole CARNET scritte su ${fatti} consegne.`);
}
await db.$disconnect();
