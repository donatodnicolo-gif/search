import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { ModuloRiparazione } from "@/components/ModuloRiparazione";

// Riparazione della coda: chiudere in blocco richieste che risultano già pagate
// da un'altra parte.
//
// ⚠️ NON è una pagina dove si mettono le chiavi delle altre app, e la
// distinzione è il motivo per cui questa pagina esiste in questa forma
// (12/09/2026). Transactions **ha già** il segreto HMAC di ogni app — è lei che
// lo ha generato quando ha creato la chiave, e senza non potrebbe verificarne
// le firme. Custodire anche le loro chiavi in chiaro le permetterebbe di
// FINGERSI un'altra app: da quel momento `origine` e `dichiaratoDa` nel
// registro smetterebbero di significare «lo ha fatto quell'app». Qui invece
// l'attore è l'operatore che ripara — che è la verità — e il perché sta nel
// motivo di ogni riga, obbligatorio.

export const dynamic = "force-dynamic";

export default async function Manutenzione() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  if (operatore.ruolo !== "admin") redirect("/");

  // Quante righe aperte ha ogni app: è la domanda che porta qui.
  const aperte = await prisma.richiesta.groupBy({
    by: ["origine"],
    where: { stato: { in: ["in_attesa", "sospesa"] } },
    _count: true,
    _sum: { importoCent: true },
    orderBy: { _count: { origine: "desc" } },
  });
  const totale = aperte.reduce((s, a) => s + (a._sum.importoCent ?? 0), 0);

  // Un esempio con riferimenti VERI presi dalla coda: un esempio finto si
  // incolla per sbaglio, e chiuderebbe richieste che non esistono.
  const prime = await prisma.richiesta.findMany({
    where: { stato: { in: ["in_attesa", "sospesa"] } },
    orderBy: { creataIl: "asc" },
    take: 2,
    select: { riferimento: true },
  });
  const esempio =
    prime.length > 0
      ? prime.map((r) => `${r.riferimento}  2026-08-28  già pagata nel Customer Service`).join("\n") +
        "\n# le righe che cominciano con # si saltano"
      : "TRX-2026-000018  2026-08-28  già pagata nel Customer Service";

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Riparazione della coda</h1>
          <p className="page-sub">
            Chiudere in blocco richieste già pagate da un&apos;altra parte, quando l&apos;app di origine non è riuscita a
            dirlo da sé
          </p>
        </div>
      </div>

      <div className="avviso-attenzione" style={{ marginBottom: 16 }}>
        <p>
          <strong>Da qui non esce un euro.</strong> Questa pagina <strong>registra</strong> denaro già uscito per
          un&apos;altra strada: non genera distinte, non chiama la banca, non passa dal PIN del pagatore. Serve quando
          un&apos;app ha pagato un fornitore per conto suo e la richiesta è rimasta aperta qui — pagarla di nuovo la
          pagherebbe due volte.
        </p>
        <p>
          Ogni riga passa dalla stessa strada della chiusura singola: stesso sigillo, stesso evento nel registro col tuo
          nome, stesso avviso all&apos;app di origine. <strong>Non si riapre</strong>: una richiesta chiusa per sbaglio
          si rifà.
        </p>
      </div>

      {aperte.length > 0 && (
        <div className="tabella-wrap" style={{ marginBottom: 18 }}>
          <table>
            <thead>
              <tr>
                <th>App di origine</th>
                <th className="num">Richieste aperte</th>
                <th className="num">Importo fermo</th>
              </tr>
            </thead>
            <tbody>
              {aperte.map((a) => (
                <tr key={a.origine}>
                  <td className="cella-nome">{a.origine}</td>
                  <td className="cella-num">{a._count}</td>
                  <td className="cella-num importo">{euro(a._sum.importoCent ?? 0)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>totale</strong>
                </td>
                <td className="cella-num">
                  <strong>{aperte.reduce((s, a) => s + a._count, 0)}</strong>
                </td>
                <td className="cella-num importo">
                  <strong>{euro(totale)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <ModuloRiparazione esempio={esempio} />
    </main>
  );
}
