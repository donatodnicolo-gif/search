import { notFound } from "next/navigation";
import { MenuInteressi } from "@/components/MenuInteressi";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Sidebar } from "@/components/Sidebar";
import { impostaArchiviato } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { linkContattoHubspot } from "@/lib/hubspot-link";
import { ETICHETTE_STATO, isStato } from "@/lib/stati";

export const dynamic = "force-dynamic";

function Campo({ etichetta, valore, largo }: { etichetta: string; valore?: string | null; largo?: boolean }) {
  if (!valore) return null;
  return (
    <div className={largo ? "campo campo-largo" : "campo"}>
      <dt>{etichetta}</dt>
      <dd>{valore}</dd>
    </div>
  );
}

export default async function Dettaglio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.partner.findUnique({
    where: { id },
    include: { contatti: true, passaggi: { orderBy: { creatoIl: "desc" } } },
  });
  if (!p) notFound();

  const extra: Record<string, unknown> = p.datiExtra ? JSON.parse(p.datiExtra) : {};

  const ETICHETTE_FONTE: Record<string, string> = {
    excel: "dal tracker Excel",
    platform: "da app.deluxy.it",
    manuale: "via API",
    ui: "dal registro",
    hubspot: "da HubSpot",
  };
  const nomeStato = (s: string) =>
    s === "archiviata" ? "Archiviata" : isStato(s) ? ETICHETTE_STATO[s] : s;
  const dataOra = (d: Date) =>
    d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={p.categoria} />
      <main className="main">
      <a className="ritorno" href={`/?categoria=${encodeURIComponent(p.categoria)}`}>
        ← Tutte le anagrafiche {p.categoria.toLowerCase()}
      </a>

      <div className="page-head">
        <div>
          <h1 className="page-title">{p.nome}</h1>
          <p className="page-sub">
            {[p.categoria, p.citta, p.regione].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {p.attivo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="etichetta-interessi">Interessi</span>
              <MenuInteressi partnerId={p.id} interessi={p.interessi} />
            </div>
          )}
          {p.attivo ? (
            <SelettoreStato partnerId={p.id} statoAttuale={p.stato} />
          ) : (
            <span className="badge" style={{ color: "var(--text-tertiary)" }}>
              <span className="dot" />
              <span style={{ color: "var(--text)" }}>Archiviata</span>
            </span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <a className="btn btn-secondario" href={`/partner/${p.id}/modifica`} style={{ fontSize: 12.5, padding: "6px 14px" }}>
              ✎ Modifica
            </a>
            <form action={impostaArchiviato.bind(null, p.id, p.attivo)}>
              <button type="submit" className="btn btn-secondario" style={{ fontSize: 12.5, padding: "6px 14px" }}>
                {p.attivo ? "⌫ Archivia" : "↩ Ripristina"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <section className="scheda">
        <h2 className="scheda-titolo">Anagrafica</h2>
        <dl className="griglia-campi">
          <Campo etichetta="Ragione sociale" valore={p.ragioneSociale} />
          <Campo etichetta="P. IVA" valore={p.pIva} />
          <Campo etichetta="Codice fiscale" valore={p.codiceFiscale} />
          <Campo etichetta="Indirizzo" valore={p.indirizzo} />
          <Campo etichetta="Città" valore={p.citta} />
          <Campo etichetta="Provincia" valore={p.provincia} />
          <Campo etichetta="Regione" valore={p.regione} />
          <Campo etichetta="Email" valore={p.email} />
          <Campo etichetta="Telefono" valore={p.telefono} />
          <Campo etichetta="Account commerciale" valore={p.account} />
          <Campo etichetta="Tipo prospect" valore={p.tipoProspect} />
          <Campo
            etichetta="Ultima visita"
            valore={p.ultimaVisita ? p.ultimaVisita.toLocaleDateString("it-IT") : null}
          />
          <Campo etichetta="Fonte" valore={p.fonte} />
          <Campo
            etichetta="Collegamento piattaforma"
            valore={p.platformId ? `app.deluxy.it · ${p.platformId}` : null}
          />
        </dl>
      </section>

      {p.contatti.length > 0 && (
        <section className="scheda">
          <h2 className="scheda-titolo">
            Contatti <span className="scheda-sub">{p.contatti.length} persone di riferimento</span>
          </h2>
          <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
            <table>
              <thead>
                <tr>
                  <th>Ruolo</th>
                  <th>Nome</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {p.contatti.map((c) => (
                  <tr key={c.id}>
                    <td className="cella-muta">{c.ruolo ?? "—"}</td>
                    <td>
                      {c.hubspotId ? (
                        <a href={linkContattoHubspot(c.hubspotId)} target="_blank" rel="noreferrer" title="Apri il contatto in HubSpot">
                          {c.nome ?? "—"} ↗
                        </a>
                      ) : (
                        c.nome ?? "—"
                      )}
                    </td>
                    <td className="cella-muta">{c.telefono ?? "—"}</td>
                    <td className="cella-muta">{c.email ?? "—"}</td>
                    <td className="cella-muta">{c.fonte === "hubspot" ? "HubSpot" : c.fonte ? c.fonte : "Excel"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(p.note || p.contattiRaw) && (
        <section className="scheda">
          <h2 className="scheda-titolo">Note</h2>
          <dl className="griglia-campi">
            <Campo etichetta="Note" valore={p.note} largo />
            <Campo etichetta="Contatti (testo originale)" valore={p.contattiRaw} largo />
          </dl>
        </section>
      )}

      {Object.keys(extra).length > 0 && (
        <section className="scheda">
          <h2 className="scheda-titolo">Dati del tracker</h2>
          <dl className="griglia-campi">
            {Object.entries(extra).map(([k, v]) => (
              <Campo key={k} etichetta={k} valore={String(v)} />
            ))}
          </dl>
        </section>
      )}

      <section className="scheda">
        <h2 className="scheda-titolo">Storia</h2>
        <ol className="storia">
          {p.passaggi.map((ev) => (
            <li key={ev.id}>
              <span className="storia-data">{dataOra(ev.creatoIl)}</span>
              <span>
                {nomeStato(ev.da)} <span className="storia-freccia">→</span> <strong>{nomeStato(ev.a)}</strong>
              </span>
              <span className="storia-origine">{ev.origine === "ui" ? "dal registro" : ev.origine}</span>
            </li>
          ))}
          <li>
            <span className="storia-data">{dataOra(p.creatoIl)}</span>
            <span><strong>Creata</strong></span>
            <span className="storia-origine">{ETICHETTE_FONTE[p.fonte] ?? p.fonte}</span>
          </li>
        </ol>
      </section>
      </main>
    </div>
  );
}
