/**
 * NOME PARTNER DEI PRODOTTI: SPECCHIO DA MERCHANDISING (11/09/2026, segnalazione utente: «come mai Clivati
 * non vede il nome aggiornato»). Misurato l'11/09: 0 prodotti su 16.528 avevano un nome partner in
 * piattaforma — «allinea note» in Impostazioni non era mai stato lanciato.
 *
 *   node api/scripts/nomi-partner-da-merchandising.mjs            (anteprima)
 *   node api/scripts/nomi-partner-da-merchandising.mjs --applica
 *
 * Stessa regola di MerchandisingSyncService.allineaNote (solo la parte dei nomi): per CODICE (sku = codice)
 * si copiano `nomePartner` → `alternateName` e `nomePartnerAttivo` → `useAlternateName`.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const M = 'C:/Users/nicol/scoutwt/deluxy-merchandising/'; const P = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const rm = createRequire(M + 'package.json'); const rp = createRequire(P + 'api/package.json');
const env = (f) => { const l = fs.readFileSync(f, 'utf8').split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')); const u = new URL(l.slice(13).trim().replace(/^"|"$/g, '')); u.searchParams.set('connection_limit', '1'); return u; };
const um = env(M + '.env'); const up = env(P + 'api/.env'); up.searchParams.set('schema', 'platform');
const dm = new (rm('@prisma/client').PrismaClient)({ datasources: { db: { url: um.toString() } } });
const dp = new (rp('@prisma/client').PrismaClient)({ datasources: { db: { url: up.toString() } } });
const merch = await dm.prodotto.findMany({ where: { NOT: { nomePartner: null } }, select: { codice: true, nomePartner: true, nomePartnerAttivo: true } });
const daLoro = new Map(merch.map((m) => [String(m.codice ?? '').trim().toUpperCase(), { nome: (m.nomePartner ?? '').trim() || null, attivo: Boolean(m.nomePartnerAttivo) && !!(m.nomePartner ?? '').trim() }]));
const nostri = await dp.product.findMany({ where: { deletedAt: null, NOT: { sku: null }, prodottoApp: false }, select: { id: true, sku: true, name: true, alternateName: true, useAlternateName: true } });
const daCambiare = nostri.filter((x) => { const n = daLoro.get(x.sku.trim().toUpperCase()); return n && ((n.nome ?? null) !== (x.alternateName ?? null) || n.attivo !== x.useAlternateName); });
const diversi = daCambiare.filter((x) => (daLoro.get(x.sku.trim().toUpperCase()).nome ?? '').toLowerCase() !== x.name.trim().toLowerCase());
console.log(`nomi partner in Merchandising: ${merch.length} · nostri con codice: ${nostri.length} · da scrivere: ${daCambiare.length} (di cui con nome diverso dal commerciale: ${diversi.length})`);
for (const p of diversi.slice(0, 15)) console.log(`  ${p.sku}  «${p.name}» → nome partner «${daLoro.get(p.sku.trim().toUpperCase()).nome}»`);
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await dm.$disconnect(); await dp.$disconnect(); process.exit(0); }
let n = 0;
for (let i = 0; i < daCambiare.length; i += 100) {
  const lotto = daCambiare.slice(i, i + 100);
  await dp.$transaction(lotto.map((x) => { const v = daLoro.get(x.sku.trim().toUpperCase()); return dp.product.update({ where: { id: x.id }, data: { alternateName: v.nome, useAlternateName: v.attivo } }); }));
  n += lotto.length;
}
console.log(`FATTO: ${n} nomi partner scritti.`);
await dm.$disconnect(); await dp.$disconnect();
