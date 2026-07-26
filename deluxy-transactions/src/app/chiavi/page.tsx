import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { quando } from "@/components/Etichette";
import { revocaChiaveApi } from "@/app/actions";
import { ModuloChiave } from "@/components/ModuloChiave";

// Le chiavi con cui le altre app Deluxy chiedono un pagamento. Ogni app ha la
// sua: si revoca una senza toccare le altre, e nel registro si vede da chi è
// arrivata ogni richiesta.

export const dynamic = "force-dynamic";

export default async function Chiavi() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  if (operatore.ruolo !== "admin") redirect("/");

  const chiavi = await prisma.chiaveApi.findMany({
    orderBy: [{ attiva: "desc" }, { creataIl: "desc" }],
    include: { _count: { select: { richieste: true } } },
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Chiavi delle app</h1>
          <p className="page-sub">Una chiave per app. Ogni chiamata va firmata: la chiave da sola non basta.</p>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Nuova chiave</div>
        <ModuloChiave />
      </div>

      {chiavi.length === 0 ? (
        <div className="vuoto">Nessuna chiave. Finché non ne crei una, nessuna app può chiedere pagamenti.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>App</th>
                <th>Prefisso</th>
                <th className="num">Tetto per richiesta</th>
                <th className="num">Tetto giornaliero</th>
                <th>IP consentiti</th>
                <th>Ultimo uso</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chiavi.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="cella-nome">{c.nome}</div>
                    <div className="cella-sub">{c._count.richieste} richieste inviate</div>
                  </td>
                  <td className="impronta">{c.prefisso}…</td>
                  <td className="cella-num">{c.tettoRichiesta ? euro(c.tettoRichiesta) : "—"}</td>
                  <td className="cella-num">{c.tettoGiornaliero ? euro(c.tettoGiornaliero) : "—"}</td>
                  <td className="cella-muta">{c.ipConsentiti || "tutti"}</td>
                  <td className="cella-muta">{quando(c.ultimoUso)}</td>
                  <td>
                    <span className={`badge ${c.attiva ? "ok" : "grave"}`}>
                      <span className="dot" />
                      {c.attiva ? "attiva" : "revocata"}
                    </span>
                  </td>
                  <td>
                    {c.attiva && (
                      <form action={revocaChiaveApi}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn btn-secondario small" type="submit">
                          Revoca
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="scheda" style={{ marginTop: 24 }}>
        <div className="scheda-titolo">Come si integra un&apos;app</div>
        <p className="testo-guida">
          La guida completa, con l&apos;esempio di codice da copiare, è in <code className="inline">docs/API.md</code>. In
          breve: ogni chiamata porta <code className="inline">x-api-key</code>, una marca temporale, un nonce usa-e-getta
          e la firma HMAC-SHA256 del corpo calcolata con il segreto mostrato al momento della creazione.
        </p>
      </div>
    </main>
  );
}
