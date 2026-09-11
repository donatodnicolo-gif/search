/**
 * METODI DI PAGAMENTO (11/09/2026, richiesta utente: «consentimi su impostazioni
 * di stabilire per ogni metodo che viene elencato le specifiche»): la tabella
 * dei metodi con le loro specifiche — come nasce l'ordine, quando è dovuto il
 * pagamento, che cosa si dice al cliente e a chi consegna.
 *
 * Idempotente e SOLO additiva (CREATE TABLE / ADD COLUMN IF NOT EXISTS): qui non
 * si usa mai `prisma db push`, che proporrebbe di togliere le foreign key.
 *
 * ⚠️ Il primo giro SEMINA i metodi che fino a oggi stavano scritti nel codice
 * del modulo, con le specifiche che il codice applicava davvero: senza, il
 * giorno del rilascio la terza opzione sarebbe una tendina vuota. Semina solo
 * se la tabella è vuota — un secondo giro non ricrea quello che qualcuno ha
 * tolto apposta.
 *
 * Uso: node scripts/applica-metodi-pagamento.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
}
const p = new PrismaClient();
const q = (s) => p.$executeRawUnsafe(s);

await q(`CREATE TABLE IF NOT EXISTS messaging."MetodoPagamento" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "attivo" BOOLEAN NOT NULL DEFAULT true,
  "posizione" INTEGER NOT NULL DEFAULT 0,
  "negozioId" TEXT NULL,
  "comeNasce" TEXT NOT NULL DEFAULT 'da-incassare',
  "quandoDovuto" TEXT NOT NULL DEFAULT 'consegna',
  "istruzioni" TEXT NOT NULL DEFAULT '',
  "notaConsegna" TEXT NOT NULL DEFAULT '',
  "attributo" TEXT NOT NULL DEFAULT '',
  "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetodoPagamento_negozioId_fkey" FOREIGN KEY ("negozioId")
    REFERENCES messaging."NegozioShopify"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
await q(`CREATE INDEX IF NOT EXISTS "MetodoPagamento_attivo_posizione_idx" ON messaging."MetodoPagamento" ("attivo", "posizione")`);

const quanti = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM messaging."MetodoPagamento"`);
if (quanti[0].n === 0) {
  // ⚠️ Le specifiche qui sotto sono quelle che il codice APPLICAVA: «Contanti
  // alla consegna» e «POS alla consegna» erano i due mezzi del contrassegno
  // (ordine da incassare, dovuto alla consegna, attributo per la piattaforma);
  // gli altri erano nomi che finivano solo nella nota di un ordine già pagato.
  await p.metodoPagamento.createMany({
    data: [
      {
        nome: 'Contanti alla consegna',
        posizione: 10,
        comeNasce: 'da-incassare',
        quandoDovuto: 'consegna',
        istruzioni: 'Paga in contanti a chi consegna.',
        notaConsegna: 'DA INCASSARE ALLA CONSEGNA — contanti: l’ordine non è pagato.',
        attributo: 'Pagamento_Alla_Consegna',
      },
      {
        nome: 'POS alla consegna',
        posizione: 20,
        comeNasce: 'da-incassare',
        quandoDovuto: 'consegna',
        istruzioni: 'Paga con carta a chi consegna: porta il POS.',
        notaConsegna: 'DA INCASSARE ALLA CONSEGNA — POS: porta il POS, l’ordine non è pagato.',
        attributo: 'Pagamento_Alla_Consegna',
      },
      {
        nome: 'Bonifico anticipato',
        posizione: 30,
        comeNasce: 'da-incassare',
        quandoDovuto: 'ricevuta',
        // ⚠️ Le coordinate NON si scrivono qui dallo script: le mette
        // l'amministratore in Impostazioni. Un IBAN in un file del repo è un
        // segreto in chiaro, e questa casa non ne tiene.
        istruzioni: 'Bonifico anticipato: scrivi qui le coordinate (Impostazioni → Metodi di pagamento).',
        notaConsegna: '',
        attributo: '',
      },
      {
        nome: 'Bonifico già ricevuto',
        posizione: 40,
        comeNasce: 'pagato',
        istruzioni: '',
        notaConsegna: '',
        attributo: '',
      },
      {
        nome: 'Contanti (già presi)',
        posizione: 50,
        comeNasce: 'pagato',
        istruzioni: '',
        notaConsegna: '',
        attributo: '',
      },
      {
        nome: 'PayPal (già pagato)',
        posizione: 60,
        comeNasce: 'pagato',
        istruzioni: '',
        notaConsegna: '',
        attributo: '',
      },
    ],
  });
  console.log('seminati i 6 metodi di partenza');
} else {
  console.log('tabella già popolata: niente semina');
}

const righe = await p.metodoPagamento.findMany({ orderBy: [{ posizione: 'asc' }, { nome: 'asc' }] });
for (const r of righe) {
  console.log(
    ` · ${r.nome} — ${r.comeNasce}${r.comeNasce === 'da-incassare' ? ` (dovuto: ${r.quandoDovuto})` : ''}` +
      `${r.attributo ? ` · attributo ${r.attributo}` : ''}${r.attivo ? '' : ' · SPENTO'}`
  );
}
await p.$disconnect();
