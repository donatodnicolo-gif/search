import { prisma } from "@/lib/db";
import { dataIt, euro } from "@/lib/formato";
import {
  compensoCorrente,
  costoAziendaAnnuo,
  eAutonomo,
  inquadramentoCorrente,
  nomeTipoContratto,
  prossimaDecorrenza,
  statoScadenza,
} from "@/lib/organico";
import { RigaLink } from "@/components/RigaLink";

// Elenco dell'organico con i numeri che contano in testa. Il costo azienda si
// somma SOLO su chi ha i contributi dichiarati: chi manca viene contato e
// dichiarato, non sommato a zero.

export const dynamic = "force-dynamic";

export default async function PaginaPersone({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; funzione?: string; q?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const filtroStato = sp.stato === "cessati" ? "cessato" : sp.stato === "tutti" ? null : "attivo";

  // ⚠️ NIENTE scorciatoie di periodo qui (valutato 28/08/2026, Libro v1.9
  // §8-bis): l'organico non è un registro di movimenti — una persona non
  // «appartiene» a un mese, c'è o non c'è. Le tre gambe della regola si
  // chiudono con ricerca + stato + funzione; il tempo, dove conta (contratti
  // in scadenza), è già un KPI in testa.

  // ⭐ I KPI di testa parlano dell'AZIENDA, non della lista filtrata (verificato
  // il 29/08/2026: cliccando «Cessate» la pagina dichiarava «Persone attive 0» e
  // «nessun compenso con contributi dichiarati» mentre i dati c'erano). Quindi
  // si leggono da una query PROPRIA, senza filtri — l'organico è di una decina
  // di righe, costa nulla — e la lista filtrata dichiara sé stessa col «N di M».
  const [persone, funzioni, tuttoOrganico] = await Promise.all([
    prisma.persona.findMany({
      where: {
        ...(filtroStato ? { stato: filtroStato } : {}),
        ...(sp.funzione ? { funzioneId: sp.funzione } : {}),
        // La ricerca (Libro v1.9 §8-bis): come si riconosce la persona — il
        // nome o il ruolo scritto sul cartellino.
        ...(sp.q
          ? {
              OR: [
                { nome: { contains: sp.q, mode: "insensitive" as const } },
                { ruolo: { contains: sp.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        funzione: true,
        compensi: true,
        inquadramenti: true,
        assegnazioni: { include: { mansione: true } },
        benefit: { include: { tipo: true }, orderBy: { creatoIl: "asc" } },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.funzione.findMany({ where: { attiva: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.persona.findMany({ include: { compensi: true, inquadramenti: true } }),
  ]);

  const righe = persone.map((p) => {
    const compenso = compensoCorrente(p.compensi);
    const inquadramento = inquadramentoCorrente(p.inquadramenti);
    const autonomo = eAutonomo((inquadramento ?? prossimaDecorrenza(p.inquadramenti))?.tipoContratto);
    return {
      p,
      compenso,
      compensoFuturo: compenso ? null : prossimaDecorrenza(p.compensi),
      inquadramentoFuturo: inquadramento ? null : prossimaDecorrenza(p.inquadramenti),
      inquadramento,
      costo: costoAziendaAnnuo(compenso, { autonomo }),
      principale:
        p.assegnazioni.find((a) => a.principale)?.mansione.nome ??
        p.assegnazioni[0]?.mansione.nome ??
        null,
      scadenza: inquadramento ? statoScadenza(inquadramento.scadenza) : null,
    };
  });

  // I numeri di testa: sempre sull'organico intero (vedi il commento sopra).
  const organicoAttivo = tuttoOrganico.filter((p) => p.stato === "attivo");
  const costiAttivi = organicoAttivo.map((p) => {
    const compenso = compensoCorrente(p.compensi);
    const inquadramento = inquadramentoCorrente(p.inquadramenti);
    const autonomo = eAutonomo((inquadramento ?? prossimaDecorrenza(p.inquadramenti))?.tipoContratto);
    return {
      costo: costoAziendaAnnuo(compenso, { autonomo }),
      scadenza: inquadramento ? statoScadenza(inquadramento.scadenza) : null,
    };
  });
  const conCosto = costiAttivi.filter((r) => r.costo != null);
  const costoTotale = conCosto.reduce((somma, r) => somma + (r.costo ?? 0), 0);
  const inScadenza = costiAttivi.filter((r) => r.scadenza === "in_scadenza" || r.scadenza === "scaduto").length;
  const cessateInOrganico = tuttoOrganico.length - organicoAttivo.length;

  // «N di M · filtro attivo» (Libro §8 punto 5): UNA fonte sola, sopra la lista.
  const filtroAttivo = Boolean(sp.q || sp.funzione || filtroStato !== "attivo");
  const nomeFunzioneFiltrata = sp.funzione ? funzioni.find((f) => f.id === sp.funzione)?.nome : null;

  const linkStato = (chiave: string) => {
    const parametri = new URLSearchParams();
    if (chiave !== "attivi") parametri.set("stato", chiave);
    if (sp.funzione) parametri.set("funzione", sp.funzione);
    if (sp.q) parametri.set("q", sp.q);
    const s = parametri.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Persone</h1>
          <p className="page-sub">
            L&apos;organico Deluxy: chi c&apos;è, in quale funzione, con quale mansione e quale contratto.
          </p>
        </div>
        <div className="page-azioni">
          <a className="btn" href="/persone/nuova">
            Nuova persona
          </a>
        </div>
      </div>

      {sp.err && <div className="avviso-errore">{sp.err}</div>}

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-nome">Persone attive</div>
          <div className="kpi-valore">{organicoAttivo.length}</div>
          <div className="kpi-nota">{cessateInOrganico > 0 ? `${cessateInOrganico} cessate` : " "}</div>
        </div>
        <div className="kpi">
          <div className="kpi-nome">Funzioni</div>
          <div className="kpi-valore">{funzioni.length}</div>
          <div className="kpi-nota">{" "}</div>
        </div>
        <div className="kpi">
          <div className="kpi-nome">Costo azienda annuo</div>
          <div className="kpi-valore">{conCosto.length > 0 ? euro(costoTotale) : "—"}</div>
          <div className="kpi-nota">
            {conCosto.length === 0
              ? "nessun compenso con contributi dichiarati"
              : conCosto.length < organicoAttivo.length
                ? `su ${conCosto.length} persone: ${organicoAttivo.length - conCosto.length} senza dati`
                : conCosto.length === 1
                  ? "l'unica persona attiva"
                  : `tutte le ${conCosto.length} persone attive`}
          </div>
        </div>
        {/* Il KPI dichiarava un allarme e non portava da nessuna parte: chi lo
            leggeva doveva scendere nel menu e indovinare che «Contratti in
            scadenza» si apre sotto «Inquadramenti». Ora è un link — un click
            risparmiato ogni volta che il numero è sopra zero (custode, 30/08/2026). */}
        <a className="kpi kpi-link" href="/inquadramenti">
          <div className="kpi-nome">Contratti in scadenza</div>
          <div className="kpi-valore">{inScadenza}</div>
          <div className="kpi-nota">
            {inScadenza > 0 ? "entro 60 giorni o già scaduti" : "vedi gli inquadramenti"}
          </div>
        </a>
      </div>

      <div className="filtri">
        <a className={`chip${filtroStato === "attivo" ? " attivo" : ""}`} href={linkStato("attivi")}>
          Attive
        </a>
        <a className={`chip${filtroStato === "cessato" ? " attivo" : ""}`} href={linkStato("cessati")}>
          Cessate
        </a>
        <a className={`chip${filtroStato === null ? " attivo" : ""}`} href={linkStato("tutti")}>
          Tutte
        </a>
        {/* ⭐ UN SOLO form GET (Libro §8 punto 7). Prima erano due: quello del
            bottone «Filtra» portava la `q` DELL'URL, non quella digitata — chi
            scriveva un nome e cliccava il bottone visibile otteneva la ricerca
            precedente, con l'aria di essere quella giusta (29/08/2026). */}
        <form className="filtri-form" action="/">
          {sp.stato && <input type="hidden" name="stato" value={sp.stato} />}
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            aria-label="Cerca una persona"
            placeholder="Cerca per nome o ruolo…"
            style={{ borderRadius: "var(--radius-pill)", maxWidth: 280 }}
          />
          {funzioni.length > 0 && (
            <select
              name="funzione"
              defaultValue={sp.funzione ?? ""}
              aria-label="Filtra per funzione"
              style={{ borderRadius: "var(--radius-pill)", width: "auto" }}
            >
              <option value="">Tutte le funzioni</option>
              {funzioni.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          )}
          <button className="btn ghost mini" type="submit">
            Filtra
          </button>
          {filtroAttivo && (
            <a className="btn ghost mini" href="/">
              Azzera
            </a>
          )}
        </form>
      </div>

      {/* «N di M · filtro attivo» (Libro §8 punto 5): la lista dichiara perché
          è ridotta, così i KPI di testa restano quelli dell'azienda. */}
      {filtroAttivo && (
        <div className="conto-righe">
          {righe.length} di {tuttoOrganico.length}
          {filtroStato === "attivo" ? " · solo attive" : filtroStato === "cessato" ? " · solo cessate" : ""}
          {nomeFunzioneFiltrata ? ` · ${nomeFunzioneFiltrata}` : ""}
          {sp.q ? ` · «${sp.q}»` : ""}
        </div>
      )}

      {righe.length === 0 ? (
        <div className="card vuoto">
          <div className="vuoto-icona">👤</div>
          <div className="vuoto-titolo">{filtroAttivo ? "Nessuna persona con questi filtri" : "Nessuna persona qui"}</div>
          <div className="vuoto-testo">
            {filtroAttivo
              ? `0 di ${tuttoOrganico.length}: nessuno risponde a questi filtri.`
              : "Comincia aggiungendo le persone dell'organico."}
          </div>
          <div style={{ marginTop: 14 }}>
            {/* Il vuoto DA FILTRO offre l'uscita dal filtro, non la creazione di
                una persona che con ogni probabilità esiste già (Libro §6.2). */}
            {filtroAttivo ? (
              <a className="btn" href="/">
                Azzera i filtri
              </a>
            ) : (
              <a className="btn" href="/persone/nuova">
                Nuova persona
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="tabella-card">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Funzione</th>
                <th>Mansione principale</th>
                <th>Contratto</th>
                <th>Dal</th>
                <th>Benefit</th>
                <th className="num">RAL / compenso</th>
                <th className="num">Costo azienda</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(({ p, compenso, compensoFuturo, inquadramento, inquadramentoFuturo, costo, principale, scadenza }) => (
                // La riga è la persona: tutta la riga apre la sua scheda (Libro §8).
                <RigaLink key={p.id} href={`/persone/${p.id}`}>
                  <td data-label="Nome">
                    <a className="link-nome" href={`/persone/${p.id}`}>
                      {p.nome}
                    </a>
                    <div className="sotto-nome">{p.ruolo || " "}</div>
                  </td>
                  <td data-label="Funzione">{p.funzione?.nome ?? <span className="cella-vuota">—</span>}</td>
                  <td data-label="Mansione principale">{principale ?? <span className="cella-vuota">—</span>}</td>
                  <td data-label="Contratto">
                    {p.stato === "cessato" ? (
                      <span className="badge rosso">
                        <span className="dot" />
                        cessata {dataIt(p.dataCessazione)}
                      </span>
                    ) : inquadramento ? (
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <span className="badge verde">
                          <span className="dot" />
                          {nomeTipoContratto(inquadramento.tipoContratto)}
                          {inquadramento.partTimePct < 100 ? ` · ${inquadramento.partTimePct}%` : ""}
                        </span>
                        {scadenza === "in_scadenza" && (
                          <span className="badge arancio">
                            <span className="dot" />
                            scade {dataIt(inquadramento.scadenza)}
                          </span>
                        )}
                        {scadenza === "scaduto" && (
                          <span className="badge rosso">
                            <span className="dot" />
                            scaduto {dataIt(inquadramento.scadenza)}
                          </span>
                        )}
                      </span>
                    ) : inquadramentoFuturo ? (
                      // Due pillole invece di una lunga: «Stage / tirocinio dal
                      // 01/09/2026» in `nowrap` teneva la colonna a 232px e
                      // spingeva «Costo azienda» fuori dalla card a 1366×768
                      // (misurato 29/08/2026: 35px su 50 di ogni importo tagliati).
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <span className="badge blu">
                          <span className="dot" />
                          {nomeTipoContratto(inquadramentoFuturo.tipoContratto)}
                        </span>
                        <span className="badge">dal {dataIt(inquadramentoFuturo.decorrenza)}</span>
                      </span>
                    ) : (
                      <span className="badge">
                        <span className="dot" />
                        da inquadrare
                      </span>
                    )}
                  </td>
                  <td data-label="Dal">{dataIt(p.dataAssunzione)}</td>
                  <td data-label="Benefit">
                    {p.benefit.length === 0 ? (
                      <span className="cella-vuota">—</span>
                    ) : (
                      p.benefit.map((b) => (
                        <div key={b.id} style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                          {b.tipo.nome}
                          {b.dettaglio && (
                            <span style={{ color: "var(--text-tertiary)" }}> · {b.dettaglio}</span>
                          )}
                        </div>
                      ))
                    )}
                  </td>
                  <td data-label="RAL / compenso" className="num">
                    {compenso ? (
                      euro(Number(compenso.ral))
                    ) : compensoFuturo ? (
                      <span className="cella-vuota">
                        {euro(Number(compensoFuturo.ral))} dal {dataIt(compensoFuturo.decorrenza)}
                      </span>
                    ) : (
                      <span className="cella-vuota">—</span>
                    )}
                  </td>
                  <td data-label="Costo azienda" className="num">
                    {costo != null ? euro(costo) : <span className="cella-vuota">non calcolabile</span>}
                  </td>
                </RigaLink>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
