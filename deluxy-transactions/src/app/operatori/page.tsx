import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { quando } from "@/components/Etichette";
import { cambiaStatoOperatore } from "@/app/actions";
import { ModuloOperatore } from "@/components/ModuloOperatore";

export const dynamic = "force-dynamic";

export default async function Operatori() {
  const io = await operatoreCorrente();
  if (!io) redirect("/login");
  if (io.ruolo !== "admin") redirect("/");

  const operatori = await prisma.operatore.findMany({
    orderBy: [{ attivo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { approvazioni: true } } },
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Operatori</h1>
          <p className="page-sub">
            Account nominali con secondo fattore. Nessuna password condivisa: la doppia firma esiste solo se le persone
            sono distinguibili.
          </p>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Nuovo operatore</div>
        <ModuloOperatore />
      </div>

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruolo</th>
              <th className="num">Tetto personale</th>
              <th className="num">Firme</th>
              <th>Ultimo accesso</th>
              <th>Stato</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {operatori.map((o) => (
              <tr key={o.id}>
                <td>
                  <div className="cella-nome">{o.nome}</div>
                  <div className="cella-sub">{o.email}</div>
                </td>
                <td className="cella-muta">{o.ruolo}</td>
                <td className="cella-num">{o.tettoApprovazione ? euro(o.tettoApprovazione) : "nessuno"}</td>
                <td className="cella-num">{o._count.approvazioni}</td>
                <td className="cella-muta">{quando(o.ultimoAccesso)}</td>
                <td>
                  <span className={`badge ${o.attivo ? "ok" : "grave"}`}>
                    <span className="dot" />
                    {o.attivo ? "attivo" : "disattivato"}
                  </span>
                  {!o.totpAttivo && <div className="cella-sub">senza secondo fattore</div>}
                </td>
                <td>
                  {o.id !== io.id && (
                    <form action={cambiaStatoOperatore}>
                      <input type="hidden" name="id" value={o.id} />
                      <button className="btn btn-secondario small" type="submit">
                        {o.attivo ? "Disattiva" : "Riattiva"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
