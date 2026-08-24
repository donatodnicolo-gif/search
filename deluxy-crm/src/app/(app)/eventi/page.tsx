import { prisma } from "@/lib/db";
import { dataIt, statoEvento } from "@/lib/etichette";

export const dynamic = "force-dynamic";

// EVENTI — le occasioni speciali Deluxy (cene, anteprime, presentazioni) con
// la loro lista invitati. Gli eventi con una data finiscono anche nel Deluxy
// Calendario, l'agenda di tutte le app.
export default async function Eventi() {
  const eventi = await prisma.evento.findMany({
    orderBy: { dataInizio: "desc" },
    include: { inviti: { select: { stato: true } } },
  });

  const prossimi = eventi.filter((e) => e.dataInizio >= new Date(Date.now() - 86_400_000) && e.stato !== "annullato");
  const passati = eventi.filter((e) => !prossimi.includes(e));

  const Riga = ({ e }: { e: (typeof eventi)[number] }) => {
    const st = statoEvento(e.stato);
    const confermati = e.inviti.filter((i) => i.stato === "confermato").length;
    const invitati = e.inviti.filter((i) => i.stato !== "da_invitare").length;
    return (
      <tr key={e.id}>
        <td>
          <a href={`/eventi/${e.id}`}>
            <div className="cella-principale">{e.titolo}</div>
            <div className="cella-sotto">{e.luogo || "—"}</div>
          </a>
        </td>
        <td>{dataIt(e.dataInizio, true)}</td>
        <td>
          <span className="badge colorato" style={{ ["--badge-colore" as string]: st.colore }}>
            <span className="dot" />
            {st.nome}
          </span>
        </td>
        <td className="num">{e.inviti.length}</td>
        <td className="num">{invitati}</td>
        <td className="num">
          {confermati}
          {e.capienza ? <span className="terziario"> / {e.capienza}</span> : null}
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Eventi</h1>
          <p className="page-sub">
            Le occasioni speciali per i clienti che contano: si crea l&apos;evento, si sceglie chi invitare dal libro
            clienti, si seguono conferme e presenze.
          </p>
        </div>
        <div className="azioni">
          <a className="btn" href="/eventi/nuovo">Nuovo evento</a>
        </div>
      </div>

      {eventi.length === 0 ? (
        <div className="card vuoto">
          <div className="quadratino">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M7 4h10l-3.6 6.2a5 5 0 1 1-2.8 0zM12 16v4.5M8.5 20.5h7" />
            </svg>
          </div>
          <h3>Nessun evento, per ora</h3>
          <p>Una cena riservata, un&apos;anteprima, un brindisi: il primo evento si crea in un minuto.</p>
          <p style={{ marginTop: 12 }}>
            <a className="btn" href="/eventi/nuovo">Crea il primo evento</a>
          </p>
        </div>
      ) : (
        <>
          {prossimi.length ? (
            <div className="card tabella-card" style={{ marginBottom: 16 }}>
              <div style={{ padding: "20px 20px 8px" }}>
                <div className="card-titolo">In programma</div>
              </div>
              <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th>Quando</th>
                      <th>Stato</th>
                      <th className="num">In lista</th>
                      <th className="num">Invitati</th>
                      <th className="num">Confermati</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prossimi.map((e) => (
                      <Riga e={e} key={e.id} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {passati.length ? (
            <div className="card tabella-card">
              <div style={{ padding: "20px 20px 8px" }}>
                <div className="card-titolo">Passati e annullati</div>
              </div>
              <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th>Quando</th>
                      <th>Stato</th>
                      <th className="num">In lista</th>
                      <th className="num">Invitati</th>
                      <th className="num">Confermati</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passati.map((e) => (
                      <Riga e={e} key={e.id} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
