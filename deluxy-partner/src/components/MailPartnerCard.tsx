import { mailDelCliente, linkMessaggio, urlAiMail, riferimentoCliente } from "@/lib/aimail";

// Card "Posta con il cliente": mostra nella scheda partner le mail scambiate con
// quell'azienda, riconosciute da AI Mail con la sua associazione mail↔cliente
// (email esatte + domini non generici del registro Anagrafiche). Qui non si
// ricostruisce nessuna regola: si chiede ad AI Mail "la posta di questo cliente".
// La casella di ricerca filtra lato AI Mail (oggetto, anteprima, mittente).

function quando(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
}

export async function MailPartnerCard({
  partnerId,
  nomePartner,
  anagraficaId,
  q,
}: {
  partnerId: string;
  nomePartner: string;
  anagraficaId?: string | null;
  q?: string;
}) {
  const esito = await mailDelCliente(riferimentoCliente(nomePartner, anagraficaId), { q });

  const Testata = (
    <div className="page-head" style={{ marginBottom: 8 }}>
      <h2 className="section-title" style={{ margin: 0 }}>
        Posta con il cliente
      </h2>
      {esito.stato === "ok" && (
        <form
          method="get"
          action={`/partner/${partnerId}`}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            type="search"
            name="mail"
            defaultValue={q ?? ""}
            placeholder="cerca nelle mail…"
            style={{ minWidth: 220 }}
          />
          <button type="submit" className="btn secondary">
            Cerca
          </button>
        </form>
      )}
    </div>
  );

  if (esito.stato === "non-configurato") return null;

  return (
    <>
      {Testata}
      <div className="card" id="mail">
        {esito.stato === "non-cliente" ? (
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
            AI Mail non riconosce <strong>{nomePartner}</strong> come cliente: nel registro
            Anagrafiche l&apos;azienda non ha nessuna email associata (o non è in stato «attivo»).
            Aggiungi il contatto in Anagrafiche e la posta comparirà qui.
          </p>
        ) : esito.stato === "errore" ? (
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
            Posta non disponibile: {esito.messaggio}
          </p>
        ) : esito.messaggi.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
            {q
              ? `Nessuna mail con «${q}» negli ultimi 12 mesi.`
              : "Nessuna mail negli ultimi 12 mesi con gli indirizzi di questo cliente."}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="mini-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Data</th>
                    <th style={{ width: 60 }}></th>
                    <th>Da / oggetto</th>
                  </tr>
                </thead>
                <tbody>
                  {esito.messaggi.map((m) => (
                    <tr key={m.id}>
                      <td>{quando(m.data)}</td>
                      <td>
                        <span className={`badge ${m.direzione === "uscita" ? "neutral" : "blue"}`}>
                          <span className="dot" />
                          {m.direzione === "uscita" ? "inviata" : "ricevuta"}
                        </span>
                      </td>
                      <td>
                        <a
                          href={linkMessaggio(m.id)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--blue)" }}
                        >
                          {m.oggetto || "(senza oggetto)"}
                        </a>
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                          {m.da}
                          {m.allegati > 0 && ` · ${m.allegati} allegat${m.allegati === 1 ? "o" : "i"}`}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>
              Ultimi 12 mesi, riconosciute da AI Mail come posta di{" "}
              <strong>{esito.cliente?.nome ?? nomePartner}</strong>.{" "}
              <a href={`${urlAiMail()}/clienti`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
                Apri in AI Mail
              </a>
            </p>
          </>
        )}
      </div>
    </>
  );
}
