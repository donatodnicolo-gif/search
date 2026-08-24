// Toglie il nome e l'email del cliente dagli ordini copiati qui, e mette al
// loro posto il solo dato che serviva davvero: quanti ordini aveva il cliente
// PRIMA di questo (`ordiniPrima`), che è Deluxy Orders a dircelo.
//
//   node scripts/ordini-senza-dati-personali.mjs --aggiungi   # 1. la colonna nuova
//   npm run import:ordini-orders                              # 2. il riempimento
//   node scripts/ordini-senza-dati-personali.mjs --togli      # 3. via i personali
//
// ⚠️⚠️ TRE PASSI, NON UNO. Fra l'aggiunta e la rimozione ci deve stare il
// riempimento: se si cancellassero nome ed email prima di avere `ordiniPrima`,
// «clienti nuovi contro clienti di ritorno» resterebbe muto su tutto lo
// storico e non ci sarebbe più modo di ricostruirlo da qui. `--togli` si
// rifiuta di partire finché il riempimento non è arrivato abbastanza avanti.
//
// ⚠️ ALTER mirati, NON `prisma db push`: il Postgres è condiviso fra quattordici
// app e un push confronta l'intero schema.
//
// ⚠️ Non è una perdita di dati: nome ed email delle persone vivono in Deluxy
// Orders, che è il loro posto. Qui erano una copia.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const argomenti = process.argv.slice(2);
const aggiungi = argomenti.includes("--aggiungi");
const togli = argomenti.includes("--togli");
const forza = argomenti.includes("--forza");

if (!aggiungi && !togli) {
  console.error("Uso: --aggiungi | --togli [--forza]");
  process.exit(1);
}

const colonne = async () => {
  const r = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'marketing' AND table_name = 'Ordine'`
  );
  return new Set(r.map((x) => x.column_name));
};

try {
  if (aggiungi) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE marketing."Ordine" ADD COLUMN IF NOT EXISTS "ordiniPrima" INTEGER`
    );
    console.log("Colonna `ordiniPrima` pronta.");
    console.log("Adesso il riempimento:  npm run import:ordini-orders");
  }

  if (togli) {
    const c = await colonne();
    if (!c.has("ordiniPrima")) {
      console.error("Manca `ordiniPrima`: lanciare prima --aggiungi e poi il riempimento.");
      process.exit(1);
    }

    // Quanto è andato avanti il riempimento. La soglia non è un capriccio: con
    // metà degli ordini senza il dato, la pagina direbbe «nuovi 4, di ritorno
    // 1» su un periodo in cui i clienti erano cento — un numero plausibile e
    // falso, che è il modo peggiore di sbagliare.
    const [{ totali, riempiti }] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS totali, count("ordiniPrima")::int AS riempiti
       FROM marketing."Ordine"`
    );
    const quota = totali > 0 ? riempiti / totali : 0;
    console.log(`Riempimento: ${riempiti}/${totali} ordini (${Math.round(quota * 100)}%).`);
    if (quota < 0.95 && !forza) {
      console.error(
        "Sotto il 95%: non tolgo niente. Rilanciare `npm run import:ordini-orders`,\n" +
        "o forzare con --forza sapendo che lo storico resterà senza «nuovo o di ritorno»."
      );
      process.exit(1);
    }

    for (const col of ["cliente", "email"]) {
      if (!c.has(col)) {
        console.log(`  ${col}: già tolta.`);
        continue;
      }
      await prisma.$executeRawUnsafe(`ALTER TABLE marketing."Ordine" DROP COLUMN "${col}"`);
      console.log(`  ${col}: tolta.`);
    }
    const dopo = await colonne();
    console.log(
      `\nFatto. La tabella Ordine ora ha ${dopo.size} colonne, ` +
      `nome ed email non ci sono più: vivono in Deluxy Orders, che è il loro posto.`
    );
  }
} finally {
  await prisma.$disconnect();
}
