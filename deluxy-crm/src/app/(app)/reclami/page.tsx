import { dentroOppureFuori } from "@/lib/sessione-server";
import { baseCS, gravitaReclamo, reclami, statoReclamo, type Reclamo } from "@/lib/reclami";
import { dataIt } from "@/lib/etichette";
import DettaglioReclamo from "@/components/DettaglioReclamo";

export const dynamic = "force-dynamic";

type Params = {
  q?: string;
  stato?: string;
  colpa?: string;
  gravita?: string;
  periodo?: string;
  page?: string;
};

const PER_PAGINA = 50;

// RECLAMI — quello che è andato storto, letto dal Customer Service (11/09/2026,
// richiesta dell'utente: «aggiungi sezione reclami all'app e fatti passare i
// reclami dall'app customer service»).
//
// ⚠️ Qui NON si apre e NON si chiude un reclamo: la sua casa è il Customer
// Service, e due posti che cambiano lo stesso stato darebbero due verità
// (Standard §7). Questa sezione serve alla RELAZIONE: chi telefona a un
// cliente deve sapere che tre settimane fa gli è arrivato un bouquet
// appassito. Dal dettaglio si salta alla scheda vera, là.
export default async function Reclami({ searchParams }: { searchParams: Promise<Params> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  // Di suo si guarda il lavoro aperto: un elenco che si apre sui reclami
  // chiusi di due anni fa non risponde a nessuna domanda.
  const stato = sp.stato ?? "aperti";
  const colpa = sp.colpa ?? "";
  const gravita = sp.gravita ?? "";
  const periodo = sp.periodo ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const [esito, cs] = await Promise.all([
    reclami({ q, stato, colpa, gravita, periodo, page, limit: PER_PAGINA }),
    baseCS(),
  ]);

  const link = (p: Partial<Params>) => {
    const u = new URLSearchParams({ q, stato, colpa, gravita, periodo, page: String(page) });
    for (const [k, v] of Object.entries(p)) v === "" ? u.delete(k) : u.set(k, String(v));
    if (u.get("stato") === "aperti") u.delete("stato");
    if (u.get("page") === "1") u.delete("page");
    const s = u.toString();
    return s ? `/reclami?${s}` : "/reclami";
  };
  const filtriAttivi = [colpa, gravita, periodo].filter(Boolean).length;

  const intestazione = (
    <div className="intestazione">
      <div>
        <h1 className="page-title">Reclami</h1>
        <p className="page-sub">
          Quello che è andato storto, letto dal Customer Service: prima di telefonare a un cliente si guarda qui. I
          reclami si aprono e si chiudono là — questa è la lettura, con il salto alla scheda vera.
        </p>
      </div>
      <div className="azioni">
        <a className="btn ghost" href={`${cs}/reclami`} target="_blank" rel="noreferrer">
          Apri il Customer Service
        </a>
      </div>
    </div>
  );

  if (!esito.ok) {
    return (
      <>
        {intestazione}
        <div className="errore-card">{esito.errore}</div>
      </>
    );
  }

  const { reclami: righe, totale, pagine, perStato, etichette } = esito.dati;
  const aperti = (perStato.aperto ?? 0) + (perStato.in_lavorazione ?? 0);
  const conDomande = righe.filter((r) => r.domandeAperte > 0).length;
  const gravi = righe.filter((r) => r.gravita === 3).length;

  const Riga = ({ r }: { r: Reclamo }) => {
    const st = statoReclamo(r.stato, etichette);
    const gr = gravitaReclamo(r.gravita, etichette);
    const titolo = `${r.casistica || "Reclamo"}${r.ordineNumero ? ` · ordine ${r.ordineNumero}` : ""}`;
    return (
      <tr>
        <td>
          {/* La riga apre il dettaglio (Libro §8): la storia sta in finestra,
              non in un'altra pagina che perderebbe i filtri. */}
          <DettaglioReclamo
            id={r.id}
            titolo={titolo}
            sotto={r.clienteNome || r.email || r.telefono || undefined}
            baseCS={cs}
            className="riga-apri"
            bottone={
              <>
                <span className="cella-principale">{r.casistica || "Reclamo"}</span>
                <span className="cella-sotto">
                  {r.descrizione ? r.descrizione.slice(0, 90) : "senza descrizione"}
                  {r.descrizione.length > 90 ? "…" : ""}
                </span>
              </>
            }
          />
        </td>
        <td>
          <div className="cella-principale">{r.clienteNome || "—"}</div>
          <div className="cella-sotto">{r.email || r.telefono || ""}</div>
        </td>
        <td>{r.ordineNumero || "—"}</td>
        <td>
          <span className="badge colorato" style={{ ["--badge-colore" as string]: gr.colore }}>
            <span className="dot" />
            {gr.nome}
          </span>
        </td>
        <td>{r.colpaNome || (r.colpaTipo === "nessuno" || !r.colpaTipo ? "Da attribuire" : r.colpaTipo)}</td>
        <td>
          <span className="badge colorato" style={{ ["--badge-colore" as string]: st.colore }}>
            <span className="dot" />
            {st.nome}
          </span>
          {r.domandeAperte > 0 ? (
            <div className="cella-sotto">
              {r.domandeAperte} {r.domandeAperte === 1 ? "domanda aperta" : "domande aperte"}
            </div>
          ) : null}
        </td>
        <td>{dataIt(r.creatoIl)}</td>
      </tr>
    );
  };

  return (
    <>
      {intestazione}

      <div className="griglia quattro" style={{ marginBottom: 16 }}>
        <div className="card stretta stat">
          <span className="valore">{aperti}</span>
          <span className="etichetta">Da lavorare</span>
          <span className="nota">aperti o in lavorazione, in questo filtro</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{totale}</span>
          <span className="etichetta">In elenco</span>
          <span className="nota">{pagine > 1 ? `${pagine} pagine da ${PER_PAGINA}` : "tutti in questa pagina"}</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{gravi}</span>
          <span className="etichetta">Gravi</span>
          <span className="nota">in questa pagina</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{conDomande}</span>
          <span className="etichetta">Aspettano una risposta</span>
          <span className="nota">qualcuno ha chiesto e nessuno ha risposto</span>
        </div>
      </div>

      {/* Le pillole: la vista di lavoro per prima (§8.9). */}
      <div className="filtri riga-chips-scorri">
        {[
          { v: "aperti", l: "Da lavorare" },
          { v: "aperto", l: "Aperti" },
          { v: "in_lavorazione", l: "In lavorazione" },
          { v: "risolto", l: "Risolti" },
          { v: "chiuso", l: "Chiusi" },
          { v: "tutti", l: "Tutti" },
        ].map((s) => (
          <a
            key={s.v}
            className={`filtro-pillola${stato === s.v || (s.v === "tutti" && stato === "") ? " attivo" : ""}`}
            href={link({ stato: s.v === "tutti" ? "" : s.v, page: "" })}
          >
            {s.l}
          </a>
        ))}
      </div>

      <form className="filtri-form" method="get" action="/reclami">
        {stato && stato !== "aperti" ? <input type="hidden" name="stato" value={stato} /> : null}
        <div className="filtri-riga">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cerca per cliente, ordine, casistica, negozio…"
            aria-label="Cerca fra i reclami"
          />
          <details className="filtri-altri" open={filtriAttivi > 0}>
            <summary className="btn ghost">Filtri{filtriAttivi ? ` (${filtriAttivi})` : ""}</summary>
            <div className="filtri-pannello">
              <div className="campo">
                <label>Di chi è la colpa</label>
                <select name="colpa" defaultValue={colpa}>
                  <option value="">Chiunque</option>
                  {etichette.colpe.map((c) => (
                    <option key={c.chiave} value={c.chiave}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label>Gravità</label>
                <select name="gravita" defaultValue={gravita}>
                  <option value="">Qualunque</option>
                  {etichette.gravita.map((g) => (
                    <option key={g.livello} value={String(g.livello)}>{g.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label>Aperto quando</label>
                <select name="periodo" defaultValue={periodo}>
                  <option value="">Sempre</option>
                  <option value="mese">Mese in corso</option>
                  <option value="scorso">Mese scorso</option>
                  <option value="trimestre">Trimestre</option>
                  <option value="anno">Anno</option>
                </select>
              </div>
            </div>
          </details>
          <button className="btn" type="submit">Filtra</button>
          {q || filtriAttivi ? (
            <a className="link-quieto" href={link({ q: "", colpa: "", gravita: "", periodo: "", page: "" })}>Azzera</a>
          ) : null}
        </div>
      </form>

      {righe.length === 0 ? (
        <div className="card vuoto">
          <div className="quadratino">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 8v5M12 16.5v.01M10.3 3.9 2.6 17.4A1.6 1.6 0 0 0 4 19.8h16a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a1.6 1.6 0 0 0-2.8 0z" />
            </svg>
          </div>
          <h3>Nessun reclamo{stato === "aperti" ? " da lavorare" : ""}</h3>
          <p>
            {q || filtriAttivi
              ? "Nessun reclamo con questi filtri: prova ad azzerarli."
              : "Nel Customer Service non risulta nessun reclamo con questi criteri. È una buona notizia."}
          </p>
        </div>
      ) : (
        <div className="card tabella-card">
          <div className="tabella-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reclamo</th>
                  <th>Cliente</th>
                  <th>Ordine</th>
                  <th>Gravità</th>
                  <th>Colpa</th>
                  <th>Stato</th>
                  <th>Aperto il</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <Riga key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pagine > 1 ? (
        <div className="paginazione">
          {page > 1 ? <a className="btn ghost" href={link({ page: String(page - 1) })}>← Precedenti</a> : <span />}
          <span className="terziario piccolo">Pagina {page} di {pagine}</span>
          {page < pagine ? <a className="btn ghost" href={link({ page: String(page + 1) })}>Successivi →</a> : <span />}
        </div>
      ) : null}
    </>
  );
}
