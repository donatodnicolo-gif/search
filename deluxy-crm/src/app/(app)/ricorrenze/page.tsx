import { ricorrenze } from "@/lib/orders";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { euro, giornoMese, quandoLeggibile, tipoRicorrenza } from "@/lib/etichette";

export const dynamic = "force-dynamic";

type Params = { giorni?: string; page?: string };

// RICORRENZE — il calendario affettivo dei clienti: compleanni, anniversari,
// occasioni lette dagli ordini e confermate da una persona. La fonte è il
// registro di Deluxy Orders; qui si decide CHI sentire e QUANDO.
export default async function Ricorrenze({ searchParams }: { searchParams: Promise<Params> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const giorni = [7, 14, 30, 60, 90].includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const elenco = await ricorrenze({ prossimi: giorni, page, limit: 100 });

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Ricorrenze</h1>
          <p className="page-sub">
            Chi festeggia nei prossimi {giorni} giorni. Le occasioni si leggono dagli ordini (fonte: Deluxy Orders): un
            pensiero puntuale è il gesto che i clienti top ricordano.
          </p>
        </div>
      </div>

      {/* Su mobile le pillole scorrono su UNA riga (Libro §8.9): qui dentro
          ci sono solo chip di filtro. */}
      <div className="filtri riga-chips-scorri">
        {[7, 14, 30, 60, 90].map((g) => (
          <a key={g} className={`filtro-pillola${g === giorni ? " attivo" : ""}`} href={`/ricorrenze?giorni=${g}`}>
            {g} giorni
          </a>
        ))}
      </div>

      {!elenco.ok ? (
        <div className="errore-card">{elenco.errore}</div>
      ) : elenco.dati.eventi.length === 0 ? (
        <div className="card vuoto">
          <div className="quadratino">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 8v13M5 11h14M6 21h12M6 11V8.5C6 6 9 5.5 12 8c3-2.5 6-2 6 .5V11" />
            </svg>
          </div>
          <h3>Nessuna ricorrenza in vista</h3>
          <p>Allarga la finestra, o aggiungi le ricorrenze che conosci dalle schede dei clienti.</p>
        </div>
      ) : (
        <>
          <div className="card tabella-card">
            <div className="tabella-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Cliente</th>
                    <th>Occasione</th>
                    <th>Per chi</th>
                    <th className="num">Ultima spesa</th>
                    <th>Visto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {elenco.dati.eventi.map((r) => {
                    const tipo = tipoRicorrenza(r.tipo);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="cella-principale">{giornoMese(r.giorno, r.mese)}</div>
                          <div className="cella-sotto">{quandoLeggibile(r.fraGiorni)}</div>
                        </td>
                        <td>
                          <a href={`/clienti/${r.cliente}`}>
                            <div className="cella-principale">{r.clienteNome}</div>
                            {r.citta ? <div className="cella-sotto">{r.citta}</div> : null}
                          </a>
                        </td>
                        <td>
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: tipo.colore }}>
                            <span className="dot" />
                            {r.titolo || tipo.nome}
                          </span>
                          {r.stato === "da-confermare" ? <div className="cella-sotto">da confermare</div> : null}
                        </td>
                        <td>{r.destinatario || <span className="terziario">il cliente</span>}</td>
                        <td className="num">{r.ultimaSpesa ? euro(r.ultimaSpesa) : "—"}</td>
                        <td className="secondario piccolo">
                          {r.ricorrenze} {r.ricorrenze === 1 ? "volta" : "volte"}
                          {r.ricorrenze > 1 ? ` (${r.primoAnno}–${r.ultimoAnno})` : ` (${r.ultimoAnno})`}
                        </td>
                        <td>
                          {!r.delicato ? (
                            <a
                              className="btn ghost mini"
                              href={`/mail/componi?cliente=${encodeURIComponent(r.cliente)}&occasione=${encodeURIComponent(r.titolo || tipo.nome)}`}
                            >
                              Fai gli auguri
                            </a>
                          ) : (
                            <span className="chip" title="Ricorrenza delicata: niente messaggi di festa">delicata</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="paginazione">
            <span>
              {elenco.dati.totale} ricorrenze · pagina {elenco.dati.page} di {elenco.dati.pagine}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              {page > 1 ? (
                <a className="btn ghost mini" href={`/ricorrenze?giorni=${giorni}&page=${page - 1}`}>← Precedente</a>
              ) : null}
              {page < elenco.dati.pagine ? (
                <a className="btn ghost mini" href={`/ricorrenze?giorni=${giorni}&page=${page + 1}`}>Successiva →</a>
              ) : null}
            </span>
          </div>
        </>
      )}
    </>
  );
}
