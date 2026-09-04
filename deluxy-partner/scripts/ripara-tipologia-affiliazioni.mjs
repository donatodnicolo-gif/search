// RIPARAZIONE 04/09/2026 — «se nella fattura è scritto affiliazione, la
// tipologia deve essere Affiliazioni» (regola dell'utente).
//
// Caso che l'ha fatta nascere: GIADA CAKE, luglio 2026, «Fee affiliazione
// Deluxy» 450 € archiviata sotto «Consegne». La tipologia non è un'etichetta
// interna: è quella con cui Budgets legge il fatturato per tipologia
// (`GET /api/v1/fatturato`), quindi una fee di affiliazione classificata
// «Consegne» sposta 450 € da una voce all'altra del conto economico.
//
// Cosa fa: cerca le righe `FatturaServizio` che nominano l'affiliazione nella
// descrizione e NON stanno già su «Affiliazioni», e le sposta. Ogni riga
// spostata lascia una traccia nel registro modifiche, con la tipologia di
// partenza (per poter tornare indietro).
//
// Uso: node --env-file=.env scripts/ripara-tipologia-affiliazioni.mjs [--esegui]
// Senza --esegui stampa soltanto cosa farebbe.
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const ESEGUI = process.argv.includes("--esegui");

const affiliazioni = await p.tipologiaServizio.findFirst({ where: { nome: "Affiliazioni" }, select: { id: true, nome: true } });
if (!affiliazioni) {
  console.error("Non esiste la tipologia «Affiliazioni»: mi fermo senza toccare niente.");
  process.exit(1);
}

// «affiliazion» prende affiliazione, affiliazioni, affiliazione annuale…
const righe = await p.fatturaServizio.findMany({
  where: { descrizione: { contains: "affiliazion", mode: "insensitive" }, tipologiaId: { not: affiliazioni.id } },
  include: { tipologia: { select: { nome: true } }, partner: { select: { nome: true } } },
  orderBy: [{ anno: "asc" }, { mese: "asc" }],
});

console.log(`Fatture che nominano l'affiliazione e NON sono su «Affiliazioni»: ${righe.length}`);
for (const f of righe) {
  console.log(
    `  ${f.partner.nome} ${f.anno}-${String(f.mese).padStart(2, "0")} n.${f.numero ?? "s.n."} ` +
      `${f.imponibile} € · «${f.descrizione}» · ${f.tipologia?.nome} → ${affiliazioni.nome}`
  );
}

if (!ESEGUI) {
  console.log("\n(prova: niente scritto — rilancia con --esegui)");
  await p.$disconnect();
  process.exit(0);
}

for (const f of righe) {
  await p.fatturaServizio.update({ where: { id: f.id }, data: { tipologiaId: affiliazioni.id } });
  await p.registroModifica.create({
    data: {
      utente: "correzione tipologie 04/09/2026",
      azione: `Modificata fattura servizi ${f.numero ?? "s.n."} (${f.imponibile.toFixed(2)} €): tipologia «${f.tipologia?.nome}» → «${affiliazioni.nome}»`,
      categoria: "fatture",
      entita: "fattura",
      entitaId: f.id,
      partner: f.partner.nome,
      dettaglio:
        `La descrizione dice «${f.descrizione}»: una fee di affiliazione va sotto Affiliazioni, ` +
        `altrimenti il fatturato per tipologia che legge Budgets la conta nella voce sbagliata. ` +
        `Tipologia di partenza: ${f.tipologia?.nome} (per tornare indietro).`,
    },
  });
}
console.log(`\nFATTO: ${righe.length} righe spostate su «${affiliazioni.nome}».`);
await p.$disconnect();
