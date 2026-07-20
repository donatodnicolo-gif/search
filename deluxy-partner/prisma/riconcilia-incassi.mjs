// Riconciliazione una-tantum dei pagamenti registrati due volte nell'Excel.
//
// Nel foglio, l'incasso di una fattura poteva essere segnato in due modi:
// con la spunta "Saldo Avvenuto" sulla fattura, oppure come "Bonifico
// Ricevuto" negativo del mese (o entrambi). Per i partner SENZA compensazione
// la fonte di verita' e' la spunta sulla fattura: dove esiste un incasso che
// copre le fatture del mese ma la spunta manca, la mettiamo (con la data del
// pagamento). Nessun importo viene modificato.
//
// Esegue in modalita' anteprima; passare --applica per scrivere davvero.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLICA = process.argv.includes("--applica");
const TOLLERANZA = 1; // euro

async function main() {
  const partners = await prisma.partner.findMany({ where: { compensazione: false } });
  let toccate = 0;
  const righe = [];

  for (const p of partners) {
    const saldi = await prisma.saldoMensile.findMany({
      where: { partnerId: p.id, bonificoImporto: { lt: 0 } },
    });
    for (const s of saldi) {
      const fatture = await prisma.fatturaServizio.findMany({
        where: { partnerId: p.id, anno: s.anno, mese: s.mese },
      });
      const aperte = fatture.filter((f) => !f.pagata);
      if (aperte.length === 0) continue;
      const incasso = -s.bonificoImporto;
      const ivatoAperte = aperte.reduce((a, f) => a + f.imponibile * (1 + f.aliquotaIva / 100), 0);
      // solo se l'incasso copre esattamente le fatture aperte del mese
      if (Math.abs(incasso - ivatoAperte) > TOLLERANZA) continue;

      const data = s.bonificoData ?? s.dataPagamento ?? null;
      righe.push(
        `${p.nome} — ${s.anno}/${String(s.mese).padStart(2, "0")}: ${aperte.length} fattura/e ` +
          `(${aperte.map((f) => f.numero ?? "s.n.").join(", ")}) ${ivatoAperte.toFixed(2)}€ IVATI ` +
          `= incasso ${incasso.toFixed(2)}€ → segnate saldate${data ? ` il ${data.toISOString().slice(0, 10)}` : ""}`
      );
      toccate += aperte.length;
      if (APPLICA) {
        await prisma.fatturaServizio.updateMany({
          where: { id: { in: aperte.map((f) => f.id) } },
          data: { pagata: true, dataPagamento: data },
        });
      }
    }
  }

  righe.forEach((r) => console.log(" ", r));
  console.log(
    APPLICA
      ? `\nApplicato: ${toccate} fatture segnate saldate.`
      : `\nAnteprima: ${toccate} fatture da segnare saldate. Rilanciare con --applica per scrivere.`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
