/**
 * NOME PER IL PARTNER: dove è vuoto, si riempie col nome attuale del prodotto (10/09/2026,
 * regola utente: «se vuoto nome partner in merchandising importa su nome partner tutti i nomi
 * dei prodotti attuali come nome partner»).
 *
 *   node scripts/nome-partner-da-nome.mjs              (anteprima)
 *   node scripts/nome-partner-da-nome.mjs --applica
 *
 * Scrive `nomePartner = nome` SOLO dove `nomePartner` è vuoto, e accende `nomePartnerAttivo`
 * su tutti i prodotti che hanno un nome partner: da oggi il catalogo del partner (piattaforma
 * consegne) e la proposta di vendita mostrano quel nome. Chi ha già un nome partner scritto a
 * mano (oggi: 1, la Colazione Clivati → «2 Colazioni in Famiglia») non viene toccato.
 * Reversibile: i prodotti riempiti qui hanno nomePartner IDENTICO al nome.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const M = 'C:/Users/nicol/scoutwt/deluxy-merchandising/';
const require = createRequire(M + 'package.json');
const { PrismaClient } = require('@prisma/client');
const l = fs.readFileSync(M + '.env', 'utf8').split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL='));
const u = new URL(l.slice(13).trim().replace(/^"|"$/g, '')); u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
const tot = await db.prodotto.count();
const vuoti = await db.prodotto.findMany({ where: { OR: [{ nomePartner: null }, { nomePartner: '' }] }, select: { id: true, nome: true, fase: true } });
const giaScritti = await db.prodotto.count({ where: { NOT: { OR: [{ nomePartner: null }, { nomePartner: '' }] } } });
const daAttivare = await db.prodotto.count({ where: { nomePartnerAttivo: false, NOT: { OR: [{ nomePartner: null }, { nomePartner: '' }] } } });
console.log(`prodotti: ${tot} · nome partner vuoto: ${vuoti.length} · già scritto a mano: ${giaScritti} (di cui non attivi: ${daAttivare})`);
const perFase = {}; for (const p of vuoti) perFase[p.fase] = (perFase[p.fase] ?? 0) + 1; console.log('vuoti per fase:', JSON.stringify(perFase));
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await db.$disconnect(); process.exit(0); }
let n = 0;
for (let i = 0; i < vuoti.length; i += 200) {
  const lotto = vuoti.slice(i, i + 200);
  await db.$transaction(lotto.map((p) => db.prodotto.update({ where: { id: p.id }, data: { nomePartner: p.nome, nomePartnerAttivo: true } })));
  n += lotto.length;
}
const attivati = await db.prodotto.updateMany({ where: { nomePartnerAttivo: false, NOT: { OR: [{ nomePartner: null }, { nomePartner: '' }] } }, data: { nomePartnerAttivo: true } });
console.log(`FATTO: riempiti ${n}, attivati in più ${attivati.count}. Verifica: vuoti ${await db.prodotto.count({ where: { OR: [{ nomePartner: null }, { nomePartner: '' }] } })}, attivi ${await db.prodotto.count({ where: { nomePartnerAttivo: true } })}`);
await db.$disconnect();
