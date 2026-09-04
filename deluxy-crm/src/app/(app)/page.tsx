import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { catalogoListe, elencoClienti, ricorrenze } from "@/lib/orders";
import { dataIt, euro, giornoMese, quandoLeggibile, segmento, tipoRicorrenza, TIPI_ATTIVITA } from "@/lib/etichette";

export const dynamic = "force-dynamic";

// OGGI — il giro di boa quotidiano del client advisor: chi festeggia, chi va
// richiamato, cosa c'è in agenda. Tutto ciò che riguarda ordini e ricorrenze
// arriva da Deluxy Orders; qui vive solo la relazione (attività, eventi, mail).
export default async function Oggi() {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const oggi = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const [liste, prossime, daRiattivare, eventi, attivita, mailRecenti] = await Promise.all([
    catalogoListe(),
    ricorrenze({ prossimi: 14, limit: 8 }),
    elencoClienti({ lista: "da-riattivare", ordina: "speso", limit: 5 }),
    prisma.evento.findMany({
      where: { stato: { in: ["bozza", "aperto"] }, dataInizio: { gte: new Date(Date.now() - 86_400_000) } },
      orderBy: { dataInizio: "asc" },
      take: 4,
      include: { inviti: { select: { stato: true } } },
    }),
    prisma.attivita.findMany({ orderBy: { quando: "desc" }, take: 6 }),
    prisma.mailInviata.count({ where: { inviataIl: { gte: new Date(Date.now() - 7 * 86_400_000) }, esito: "inviata" } }),
  ]);

  const contatore = (chiave: string) => liste.ok ? liste.dati.liste.find((l) => l.chiave === chiave) : undefined;
  const vip = contatore("vip");
  const fedeli = contatore("fedeli");
  const nuovi = contatore("nuovi");
  const riattivare = contatore("da-riattivare");

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Oggi</h1>
          <p className="page-sub">
            {oggi.charAt(0).toUpperCase() + oggi.slice(1)} — chi festeggia, chi va sentito, cosa c&apos;è in agenda.
          </p>
        </div>
        <div className="azioni">
          <a className="btn ghost" href="/mail/componi">Scrivi una mail</a>
          <a className="btn" href="/clienti">Apri il libro clienti</a>
        </div>
      </div>

      {!liste.ok ? <div className="errore-card">{liste.errore}</div> : null}

      {liste.ok ? (
        <div className="griglia quattro" style={{ marginBottom: 16 }}>
          <div className="card stretta stat">
            <span className="valore">{vip?.clienti ?? "—"}</span>
            <span className="etichetta">Clienti VIP</span>
            <span className="nota">{vip ? `${euro(vip.speso)} di valore` : ""}</span>
          </div>
          <div className="card stretta stat">
            <span className="valore">{fedeli?.clienti ?? "—"}</span>
            <span className="etichetta">Fedeli</span>
            <span className="nota">{fedeli ? `${euro(fedeli.speso)} di valore` : ""}</span>
          </div>
          <div className="card stretta stat">
            <span className="valore">{nuovi?.clienti ?? "—"}</span>
            <span className="etichetta">Nuovi (90 giorni)</span>
            <span className="nota">da conoscere e coltivare</span>
          </div>
          <div className="card stretta stat">
            <span className="valore">{riattivare?.clienti ?? "—"}</span>
            <span className="etichetta">Da riattivare</span>
            <span className="nota">{mailRecenti} mail inviate negli ultimi 7 giorni</span>
          </div>
        </div>
      ) : null}

      <div className="griglia due">
        <div className="card">
          <div className="card-titolo">Ricorrenze nei prossimi 14 giorni</div>
          <div className="card-sub">Compleanni e occasioni lette dagli ordini (fonte: Deluxy Orders). Un gesto puntuale vale una campagna.</div>
          {!prossime.ok ? (
            <p className="secondario piccolo">{prossime.errore}</p>
          ) : prossime.dati.eventi.length === 0 ? (
            <p className="secondario piccolo">Nessuna ricorrenza nelle prossime due settimane.</p>
          ) : (
            <div className="timeline">
              {prossime.dati.eventi.map((r) => {
                const tipo = tipoRicorrenza(r.tipo);
                return (
                  <div className="timeline-voce" key={r.id}>
                    <div className="timeline-icona" style={{ background: "var(--gold-soft)", color: "var(--gold-strong)" }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                        <path d="M12 8v13M5 11h14M6 21h12M6 11V8.5C6 6 9 5.5 12 8c3-2.5 6-2 6 .5V11" />
                      </svg>
                    </div>
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">
                        <a href={`/clienti/${r.cliente}`}>{r.clienteNome}</a>
                        {r.destinatario ? <span className="secondario"> → {r.destinatario}</span> : null}
                      </div>
                      <div className="timeline-dettaglio">
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: tipo.colore }}>
                          <span className="dot" />
                          {r.titolo || tipo.nome}
                        </span>{" "}
                        <span className="terziario piccolo">
                          {giornoMese(r.giorno, r.mese)} · {quandoLeggibile(r.fraGiorni)} · vista {r.ricorrenze}{" "}
                          {r.ricorrenze === 1 ? "volta" : "volte"}
                        </span>
                      </div>
                    </div>
                    {!r.delicato ? (
                      <a
                        className="btn ghost mini"
                        href={`/mail/componi?cliente=${encodeURIComponent(r.cliente)}&occasione=${encodeURIComponent(r.titolo || tipo.nome)}`}
                        style={{ alignSelf: "center" }}
                      >
                        Fai gli auguri
                      </a>
                    ) : (
                      <span className="chip" style={{ alignSelf: "center" }} title="Ricorrenza delicata: niente messaggi di festa">
                        delicata
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <a className="link-quieto" href="/ricorrenze">Tutte le ricorrenze →</a>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo">Eventi in arrivo</div>
            <div className="card-sub">Occasioni speciali organizzate da Deluxy, con lo stato degli inviti.</div>
            {eventi.length === 0 ? (
              <p className="secondario piccolo">
                Nessun evento in programma. <a className="link-quieto" href="/eventi/nuovo">Creane uno →</a>
              </p>
            ) : (
              <div className="timeline">
                {eventi.map((e) => {
                  const confermati = e.inviti.filter((i) => i.stato === "confermato").length;
                  return (
                    <div className="timeline-voce" key={e.id}>
                      <div className="timeline-corpo">
                        <div className="timeline-titolo">
                          <a href={`/eventi/${e.id}`}>{e.titolo}</a>
                        </div>
                        <div className="timeline-quando">
                          {dataIt(e.dataInizio, true)}
                          {e.luogo ? ` · ${e.luogo}` : ""} · {e.inviti.length} invitati, {confermati} confermati
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-titolo">Da riattivare, partendo dai migliori</div>
            <div className="card-sub">Clienti importanti che non ordinano da più di un anno.</div>
            {!daRiattivare.ok ? (
              <p className="secondario piccolo">{daRiattivare.errore}</p>
            ) : daRiattivare.dati.clienti.length === 0 ? (
              <p className="secondario piccolo">Nessuno da riattivare: ottimo segno.</p>
            ) : (
              <div className="timeline">
                {daRiattivare.dati.clienti.map((c) => (
                  <div className="timeline-voce" key={c.cliente}>
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">
                        <a href={`/clienti/${c.cliente}`}>{c.nome ?? c.email ?? "Senza nome"}</a>
                      </div>
                      <div className="timeline-quando">
                        {euro(c.speso)} in {c.ordini} {c.ordini === 1 ? "ordine" : "ordini"} · ultimo {dataIt(c.ultimoOrdine)}
                      </div>
                    </div>
                    <a
                      className="btn ghost mini"
                      href={`/mail/componi?cliente=${encodeURIComponent(c.cliente)}`}
                      style={{ alignSelf: "center" }}
                    >
                      Scrivi
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-titolo">Ultime attività</div>
            <div className="card-sub">Il diario della relazione: chiamate, incontri, note.</div>
            {attivita.length === 0 ? (
              <p className="secondario piccolo">Ancora nessuna attività registrata.</p>
            ) : (
              <div className="timeline">
                {attivita.map((a) => (
                  <div className="timeline-voce" key={a.id}>
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">
                        {a.titolo}{" "}
                        <span className="chip">{TIPI_ATTIVITA[a.tipo] ?? a.tipo}</span>
                      </div>
                      <div className="timeline-quando">
                        <a className="link-quieto" href={`/clienti/${a.chiaveCliente}`}>
                          {a.nomeCliente || "cliente"}
                        </a>{" "}
                        · {dataIt(a.quando, true)}
                        {a.autore ? ` · ${a.autore}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
