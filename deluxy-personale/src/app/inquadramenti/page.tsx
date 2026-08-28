import { prisma } from "@/lib/db";
import { dataIt } from "@/lib/formato";
import { inquadramentoCorrente, nomeTipoContratto, prossimaDecorrenza, statoScadenza } from "@/lib/organico";
import { RigaLink } from "@/components/RigaLink";

// Il quadro contrattuale delle persone attive: tipo, CCNL, livello, qualifica,
// part-time e scadenze. Le scadenze vicine stanno in testa: sono la cosa da
// vedere prima.

export const dynamic = "force-dynamic";

export default async function PaginaInquadramenti() {
  const persone = await prisma.persona.findMany({
    where: { stato: "attivo" },
    include: { funzione: true, inquadramenti: true },
    orderBy: { nome: "asc" },
  });

  const righe = persone.map((p) => {
    const inq = inquadramentoCorrente(p.inquadramenti);
    return {
      p,
      inq,
      scadenza: inq ? statoScadenza(inq.scadenza) : null,
      futuro: inq ? null : prossimaDecorrenza(p.inquadramenti),
    };
  });

  const urgenti = righe.filter((r) => r.scadenza === "scaduto" || r.scadenza === "in_scadenza");
  const senza = righe.filter((r) => !r.inq && !r.futuro);

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Inquadramenti</h1>
          <p className="page-sub">
            Il contratto corrente di ogni persona attiva: tipo, CCNL, livello, qualifica e scadenze.
            Si registra dalla scheda della persona.
          </p>
        </div>
      </div>

      {urgenti.length > 0 && (
        <div className="avviso-errore">
          Da guardare:{" "}
          {urgenti.map((r, i) => (
            <span key={r.p.id}>
              {i > 0 && ", "}
              <a href={`/persone/${r.p.id}`} style={{ textDecoration: "underline" }}>
                {r.p.nome}
              </a>{" "}
              ({r.scadenza === "scaduto" ? "contratto scaduto il" : "scade il"} {dataIt(r.inq!.scadenza)})
            </span>
          ))}
          .
        </div>
      )}

      {senza.length > 0 && (
        <div className="avviso-nota">
          Da inquadrare:{" "}
          {senza.map((r, i) => (
            <span key={r.p.id}>
              {i > 0 && ", "}
              <a href={`/persone/${r.p.id}`} style={{ textDecoration: "underline" }}>
                {r.p.nome}
              </a>
            </span>
          ))}
          .
        </div>
      )}

      {righe.length === 0 ? (
        <div className="card vuoto">
          <div className="vuoto-icona">📄</div>
          <div className="vuoto-titolo">Nessuna persona attiva</div>
          <div className="vuoto-testo">Aggiungi le persone, poi registra i loro inquadramenti dalle schede.</div>
        </div>
      ) : (
        <div className="tabella-card">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Funzione</th>
                <th>Contratto</th>
                <th>CCNL</th>
                <th>Livello</th>
                <th>Qualifica</th>
                <th className="num">Part-time</th>
                <th>Decorrenza</th>
                <th>Scadenza</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(({ p, inq, scadenza, futuro }) => (
                // La riga è la persona: tutta la riga apre la sua scheda (Libro §8).
                <RigaLink key={p.id} href={`/persone/${p.id}`}>
                  <td>
                    <a className="link-nome" href={`/persone/${p.id}`}>
                      {p.nome}
                    </a>
                    <div className="sotto-nome">{p.ruolo || " "}</div>
                  </td>
                  <td>{p.funzione?.nome ?? <span className="cella-vuota">—</span>}</td>
                  {inq ? (
                    <>
                      <td>{nomeTipoContratto(inq.tipoContratto)}</td>
                      <td>{inq.ccnl || <span className="cella-vuota">—</span>}</td>
                      <td>{inq.livello || <span className="cella-vuota">—</span>}</td>
                      <td>{inq.qualifica || <span className="cella-vuota">—</span>}</td>
                      <td className="num">{inq.partTimePct < 100 ? `${inq.partTimePct}%` : "pieno"}</td>
                      <td>{dataIt(inq.decorrenza)}</td>
                      <td>
                        {inq.scadenza ? (
                          <span
                            className={`badge ${
                              scadenza === "scaduto" ? "rosso" : scadenza === "in_scadenza" ? "arancio" : ""
                            }`}
                          >
                            <span className="dot" />
                            {dataIt(inq.scadenza)}
                          </span>
                        ) : (
                          <span className="cella-vuota">—</span>
                        )}
                      </td>
                    </>
                  ) : futuro ? (
                    <td colSpan={7}>
                      <span className="badge blu">
                        <span className="dot" />
                        {nomeTipoContratto(futuro.tipoContratto)}
                        {futuro.partTimePct < 100 ? ` · ${futuro.partTimePct}%` : ""} · decorre dal{" "}
                        {dataIt(futuro.decorrenza)}
                      </span>
                    </td>
                  ) : (
                    <td colSpan={7} className="cella-vuota">
                      nessun inquadramento registrato
                    </td>
                  )}
                </RigaLink>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
