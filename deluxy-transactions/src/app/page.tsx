import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { redirect } from "next/navigation";
import { euro } from "@/lib/denaro";
import { formattaIban } from "@/lib/iban";
import { motiviDa } from "@/lib/richieste";
import { BadgeRischio, BadgeStato, Firme, quando } from "@/components/Etichette";
import { leggiRegole } from "@/lib/impostazioni";
import { cifraturaPronta } from "@/lib/crypto";

// La coda di lavoro: le richieste che aspettano una firma. È la prima cosa che
// si vede entrando, perché è l'unica che richiede una persona.

export const dynamic = "force-dynamic";

export default async function Coda() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");

  const [richieste, approvate, pagateOggi, regole] = await Promise.all([
    prisma.richiesta.findMany({
      where: { stato: { in: ["in_attesa", "sospesa"] } },
      orderBy: [{ rischio: "desc" }, { creataIl: "asc" }],
      include: { approvazioni: { select: { esito: true, operatoreId: true } } },
      take: 200,
    }),
    prisma.richiesta.aggregate({ where: { stato: "approvata" }, _sum: { importoCent: true }, _count: true }),
    prisma.richiesta.aggregate({
      where: { pagataIl: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      _sum: { importoCent: true },
      _count: true,
    }),
    leggiRegole(),
  ]);

  const totaleInAttesa = richieste.reduce((s, r) => s + r.importoCent, 0);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Da autorizzare</h1>
          <p className="page-sub">
            Le richieste arrivate dalle altre app Deluxy. Nessun pagamento parte da solo: parte da una firma.
          </p>
        </div>
        <a className="btn btn-secondario" href="/richieste/nuova">
          Nuova richiesta
        </a>
      </div>

      {!cifraturaPronta() && (
        <div className="avviso-errore">
          TRANSACTIONS_ENC_KEY non è configurata: senza non si leggono i segreti di firma né i secondi fattori.
        </div>
      )}
      {!regole.ordinanteIban && (
        <div className="avviso-attenzione">
          Manca l&apos;IBAN aziendale ordinante in <a href="/impostazioni">Impostazioni</a>: senza, le distinte SEPA non si
          generano.
        </div>
      )}

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{richieste.length}</div>
          <div className="kpi-etichetta">in attesa di firma</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(totaleInAttesa)}</div>
          <div className="kpi-etichetta">importo in attesa</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{approvate._count}</div>
          <div className="kpi-etichetta">approvate, pronte per la distinta</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(pagateOggi._sum.importoCent ?? 0)}</div>
          <div className="kpi-etichetta">pagate oggi ({pagateOggi._count})</div>
        </div>
      </div>

      {richieste.length === 0 ? (
        <div className="vuoto">Nessuna richiesta in attesa. Tutto autorizzato.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Riferimento</th>
                <th>Beneficiario</th>
                <th className="num">Importo</th>
                <th>Origine</th>
                <th>Stato</th>
                <th>Firme</th>
                <th>Arrivata</th>
              </tr>
            </thead>
            <tbody>
              {richieste.map((r) => {
                const firme = r.approvazioni.filter((a) => a.esito === "approvata").length;
                const tuaFirma = r.approvazioni.some((a) => a.operatoreId === operatore.id);
                const motivi = motiviDa(r.motiviRischio);
                return (
                  <tr key={r.id}>
                    <td>
                      <a href={`/richieste/${r.id}`} className="cella-nome">
                        {r.riferimento}
                      </a>
                      <div className="cella-sub">{r.causale}</div>
                    </td>
                    <td>
                      <div>{r.beneficiario}</div>
                      <div className="cella-sub iban">{formattaIban(r.iban)}</div>
                      {motivi.length > 0 && <BadgeRischio punteggio={r.rischio} />}
                    </td>
                    <td className="cella-num importo">{euro(r.importoCent)}</td>
                    <td className="cella-muta">{r.origine}</td>
                    <td>
                      <BadgeStato stato={r.stato} />
                    </td>
                    <td>
                      <Firme raccolte={firme} necessarie={r.doppiaFirma ? 2 : 1} />
                      {tuaFirma && <div className="cella-sub">hai già votato</div>}
                    </td>
                    <td className="cella-muta">{quando(r.creataIl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
