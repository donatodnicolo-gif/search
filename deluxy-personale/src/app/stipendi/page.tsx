import { prisma } from "@/lib/db";
import { dataIt, euro, numero } from "@/lib/formato";
import { compensoCorrente, costoAziendaAnnuo, nomeMotivoCompenso, prossimaDecorrenza } from "@/lib/organico";

// Il quadro delle retribuzioni CORRENTI delle persone attive. I totali sommano
// solo ciò che c'è, e dichiarano chi manca: un totale che ingloba zeri
// silenziosi è un totale che mente.

export const dynamic = "force-dynamic";

export default async function PaginaStipendi() {
  const persone = await prisma.persona.findMany({
    where: { stato: "attivo" },
    include: { funzione: true, compensi: true },
    orderBy: { nome: "asc" },
  });

  const righe = persone.map((p) => {
    const compenso = compensoCorrente(p.compensi);
    return {
      p,
      compenso,
      costo: costoAziendaAnnuo(compenso),
      futuro: compenso ? null : prossimaDecorrenza(p.compensi),
    };
  });

  const conRal = righe.filter((r) => r.compenso != null);
  const senzaRal = righe.filter((r) => r.compenso == null);
  const conCosto = righe.filter((r) => r.costo != null);
  const totaleRal = conRal.reduce((s, r) => s + Number(r.compenso!.ral), 0);
  const totaleCosto = conCosto.reduce((s, r) => s + (r.costo ?? 0), 0);

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Stipendi</h1>
          <p className="page-sub">
            La retribuzione corrente di ogni persona attiva. Si registra e si corregge dalla scheda
            della persona; qui si guarda il quadro.
          </p>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-nome">Monte RAL annuo</div>
          <div className="kpi-valore">{conRal.length > 0 ? euro(totaleRal) : "—"}</div>
          <div className="kpi-nota">
            {conRal.length === 0
              ? "nessuna retribuzione registrata"
              : senzaRal.length > 0
                ? `su ${conRal.length} persone: ${senzaRal.length} senza retribuzione`
                : conRal.length === 1
                  ? "l'unica persona attiva"
                  : `tutte le ${conRal.length} persone attive`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-nome">Costo azienda annuo</div>
          <div className="kpi-valore">{conCosto.length > 0 ? euro(totaleCosto) : "—"}</div>
          <div className="kpi-nota">
            {conCosto.length === 0
              ? "serve la % contributi per calcolarlo"
              : conCosto.length < righe.length
                ? `su ${conCosto.length} persone: ${righe.length - conCosto.length} senza dati`
                : conCosto.length === 1
                  ? "l'unica persona attiva"
                  : `tutte le ${conCosto.length} persone attive`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-nome">Costo medio mensile</div>
          <div className="kpi-valore">{conCosto.length > 0 ? euro(totaleCosto / 12) : "—"}</div>
          <div className="kpi-nota">{conCosto.length > 0 ? "costo annuo ÷ 12" : " "}</div>
        </div>
      </div>

      {senzaRal.length > 0 && (
        <div className="avviso-nota">
          Fuori dai totali:{" "}
          {senzaRal.map((r, i) => (
            <span key={r.p.id}>
              {i > 0 && ", "}
              <a href={`/persone/${r.p.id}`} style={{ textDecoration: "underline" }}>
                {r.p.nome}
              </a>
              {r.futuro ? ` (decorre dal ${dataIt(r.futuro.decorrenza)})` : " (senza retribuzione registrata)"}
            </span>
          ))}
          .
        </div>
      )}

      {righe.length === 0 ? (
        <div className="card vuoto">
          <div className="vuoto-icona">💶</div>
          <div className="vuoto-titolo">Nessuna persona attiva</div>
          <div className="vuoto-testo">Aggiungi le persone, poi registra le loro retribuzioni dalle schede.</div>
        </div>
      ) : (
        <div className="tabella-card">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Funzione</th>
                <th>Dal</th>
                <th>Motivo</th>
                <th className="num">RAL</th>
                <th className="num">Mensilità</th>
                <th className="num">Lordo mensile</th>
                <th className="num">Netto mensile</th>
                <th className="num">Contributi</th>
                <th className="num">Costo azienda</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(({ p, compenso, costo, futuro }) => (
                <tr key={p.id}>
                  <td>
                    <a className="link-nome" href={`/persone/${p.id}`}>
                      {p.nome}
                    </a>
                    <div className="sotto-nome">{p.ruolo || " "}</div>
                  </td>
                  <td>{p.funzione?.nome ?? <span className="cella-vuota">—</span>}</td>
                  {compenso ? (
                    <>
                      <td>{dataIt(compenso.decorrenza)}</td>
                      <td>{nomeMotivoCompenso(compenso.motivo)}</td>
                      <td className="num">{euro(Number(compenso.ral))}</td>
                      <td className="num">{compenso.mensilita}</td>
                      <td className="num">{euro(Number(compenso.ral) / compenso.mensilita)}</td>
                      <td className="num">
                        {compenso.nettoMensile != null ? (
                          euro(Number(compenso.nettoMensile))
                        ) : (
                          <span className="cella-vuota">non indicato</span>
                        )}
                      </td>
                      <td className="num">
                        {compenso.contributiPct != null ? (
                          `${numero(Number(compenso.contributiPct))}%`
                        ) : (
                          <span className="cella-vuota">—</span>
                        )}
                      </td>
                      <td className="num">
                        {costo != null ? euro(costo) : <span className="cella-vuota">non calcolabile</span>}
                      </td>
                    </>
                  ) : futuro ? (
                    <td colSpan={8}>
                      <span className="badge blu">
                        <span className="dot" />
                        RAL {euro(Number(futuro.ral))} · decorre dal {dataIt(futuro.decorrenza)}
                      </span>
                    </td>
                  ) : (
                    <td colSpan={8} className="cella-vuota">
                      nessuna retribuzione registrata
                    </td>
                  )}
                </tr>
              ))}
              {conRal.length > 0 && (
                <tr className="riga-totale">
                  <td colSpan={4}>
                    Totale ({conRal.length} person{conRal.length === 1 ? "a" : "e"}
                    {senzaRal.length > 0 ? `, ${senzaRal.length} escluse` : ""})
                  </td>
                  <td className="num">{euro(totaleRal)}</td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num" />
                  <td className="num" />
                  <td className="num">{conCosto.length > 0 ? euro(totaleCosto) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
