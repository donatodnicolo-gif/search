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

  const [persone, funzioni] = await Promise.all([
    prisma.persona.findMany({
      where: {
        ...(filtroStato ? { stato: filtroStato } : {}),
        ...(sp.funzione ? { funzioneId: sp.funzione } : {}),
        ...(sp.q ? { nome: { contains: sp.q, mode: "insensitive" as const } } : {}),
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
  ]);

  const attive = persone.filter((p) => p.stato === "attivo");
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

  const righeAttive = righe.filter((r) => r.p.stato === "attivo");
  const conCosto = righeAttive.filter((r) => r.costo != null);
  const costoTotale = conCosto.reduce((somma, r) => somma + (r.costo ?? 0), 0);
  const inScadenza = righeAttive.filter((r) => r.scadenza === "in_scadenza" || r.scadenza === "scaduto").length;

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
          <div className="kpi-valore">{attive.length}</div>
          <div className="kpi-nota">
            {persone.length - attive.length > 0 && filtroStato === null
              ? `${persone.length - attive.length} cessate`
              : " "}
          </div>
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
              : conCosto.length < righeAttive.length
                ? `su ${conCosto.length} persone: ${righeAttive.length - conCosto.length} senza dati`
                : conCosto.length === 1
                  ? "l'unica persona attiva"
                  : `tutte le ${conCosto.length} persone attive`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-nome">Contratti in scadenza</div>
          <div className="kpi-valore">{inScadenza}</div>
          <div className="kpi-nota">{inScadenza > 0 ? "entro 60 giorni o già scaduti" : " "}</div>
        </div>
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
        <form action="/" style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
          {sp.stato && <input type="hidden" name="stato" value={sp.stato} />}
          {sp.funzione && <input type="hidden" name="funzione" value={sp.funzione} />}
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Cerca per nome…"
            style={{ borderRadius: "var(--radius-pill)", maxWidth: 280 }}
          />
        </form>
        {funzioni.length > 0 && (
          <form action="/" style={{ display: "inline-flex" }}>
            {sp.stato && <input type="hidden" name="stato" value={sp.stato} />}
            {sp.q && <input type="hidden" name="q" value={sp.q} />}
            <select
              name="funzione"
              defaultValue={sp.funzione ?? ""}
              style={{ borderRadius: "var(--radius-pill)", width: "auto" }}
            >
              <option value="">Tutte le funzioni</option>
              {funzioni.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <button className="btn ghost mini" style={{ marginLeft: 8 }} type="submit">
              Filtra
            </button>
          </form>
        )}
      </div>

      {righe.length === 0 ? (
        <div className="card vuoto">
          <div className="vuoto-icona">👤</div>
          <div className="vuoto-titolo">Nessuna persona qui</div>
          <div className="vuoto-testo">
            {sp.q || sp.funzione
              ? "Con questi filtri non c'è nessuno: prova ad allargarli."
              : "Comincia aggiungendo le persone dell'organico."}
          </div>
          <div style={{ marginTop: 14 }}>
            <a className="btn" href="/persone/nuova">
              Nuova persona
            </a>
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
                  <td>
                    <a className="link-nome" href={`/persone/${p.id}`}>
                      {p.nome}
                    </a>
                    <div className="sotto-nome">{p.ruolo || " "}</div>
                  </td>
                  <td>{p.funzione?.nome ?? <span className="cella-vuota">—</span>}</td>
                  <td>{principale ?? <span className="cella-vuota">—</span>}</td>
                  <td>
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
                      <span className="badge blu">
                        <span className="dot" />
                        {nomeTipoContratto(inquadramentoFuturo.tipoContratto)} dal{" "}
                        {dataIt(inquadramentoFuturo.decorrenza)}
                      </span>
                    ) : (
                      <span className="badge">
                        <span className="dot" />
                        da inquadrare
                      </span>
                    )}
                  </td>
                  <td>{dataIt(p.dataAssunzione)}</td>
                  <td>
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
                  <td className="num">
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
                  <td className="num">
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
