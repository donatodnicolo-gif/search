import { dentroOppureFuori } from "@/lib/sessione-server";
import { elencoClienti } from "@/lib/orders";
import { statoCS } from "@/lib/nuovo-ordine";
import { euro, dataIt, segmento } from "@/lib/etichette";
import { RigaLink } from "@/components/RigaLink";

export const dynamic = "force-dynamic";

type Query = { q?: string };

// NUOVO ORDINE — l'ingresso dal menù (richiesta dell'utente 10/09): si cerca il
// cliente e si apre il modulo del suo ordine, lo stesso che nasce dalla scheda.
// L'ordine si crea PASSANDO dal Customer Service (che ha le credenziali
// Shopify con lo scope giusto): bozza con link di pagamento, o «ha già pagato».
export default async function NuovoOrdine({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const [cs, elenco] = await Promise.all([statoCS(), q ? elencoClienti({ q, limit: 30 }) : Promise.resolve(null)]);

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Nuovo ordine</h1>
          <p className="page-sub">
            Un ordine per un cliente, come dal Customer Service: cerchi la persona, scegli i prodotti dal catalogo del
            negozio, e nasce una bozza con il link di pagamento (o già pagata). Cliente e indirizzo si precompilano
            dall&apos;ultimo ordine.
          </p>
        </div>
      </div>

      {!cs.raggiungibile || !cs.autenticato ? (
        <div className="errore-card">
          Il Customer Service non risponde o la chiave non è valida: l&apos;ordine non si può creare finché non è
          collegato (vedi Impostazioni).
        </div>
      ) : null}

      <div className="filtri">
        <form method="get" action="/nuovo-ordine">
          <input type="search" name="q" aria-label="Cerca il cliente" placeholder="Cerca il cliente: nome, email, telefono…" defaultValue={q} style={{ width: 320 }} autoFocus />
          <button className="btn ghost" type="submit">Cerca</button>
        </form>
      </div>

      {!q ? (
        <div className="card vuoto">
          <div className="quadratino">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 6.5h16l-1.5 9h-13zM9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01" />
            </svg>
          </div>
          <h3>Per chi è l&apos;ordine?</h3>
          <p>Cerca il cliente qui sopra: dalla sua riga si apre il modulo dell&apos;ordine.</p>
          <form
            method="get"
            action="/nuovo-ordine/nuovo"
            style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}
          >
            <input type="email" name="email" placeholder="Cliente nuovo: la sua email" aria-label="Email del cliente nuovo" required style={{ width: 260 }} />
            <button className="btn ghost" type="submit">Ordine per un cliente nuovo</button>
          </form>
        </div>
      ) : elenco && !elenco.ok ? (
        <div className="errore-card">{elenco.errore}</div>
      ) : elenco && elenco.dati.clienti.length === 0 ? (
        <div className="card vuoto">
          <h3>Nessun cliente per «{q}»</h3>
          <p>
            Un cliente nuovo, mai visto negli ordini? Il modulo si apre comunque dalla sua email:{" "}
            <a className="link-quieto" href={`/clienti/${encodeURIComponent(q.toLowerCase())}/nuovo-ordine`}>
              crea l&apos;ordine per {q}
            </a>
            .
          </p>
        </div>
      ) : elenco ? (
        <div className="card tabella-card">
          <div className="tabella-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Città</th>
                  <th>Segmento</th>
                  <th className="num">Ordini</th>
                  <th>Ultimo ordine</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {elenco.dati.clienti.map((c) => {
                  const seg = segmento(c.segmento);
                  const href = `/clienti/${c.cliente}/nuovo-ordine`;
                  return (
                    <RigaLink key={c.cliente} href={href}>
                      <td>
                        <a href={href}>
                          <div className="cella-principale">{c.nome ?? c.email ?? c.telefono ?? "—"}</div>
                          <div className="cella-sotto">{c.email ?? c.telefono ?? ""}</div>
                        </a>
                      </td>
                      <td>{c.citta ?? "—"}</td>
                      <td>
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
                          <span className="dot" />
                          {seg.nome}
                        </span>
                      </td>
                      <td className="num">
                        {c.ordini}
                        <div className="cella-sotto">{euro(c.speso)}</div>
                      </td>
                      <td>{dataIt(c.ultimoOrdine)}</td>
                      <td>
                        <a className="btn ghost mini" href={href}>Crea ordine</a>
                      </td>
                    </RigaLink>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
