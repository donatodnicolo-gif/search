import { notFound } from "next/navigation";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";

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
  const p = await prisma.partner.findUnique({ where: { id }, include: { contatti: true } });
  if (!p) notFound();

  const extra: Record<string, unknown> = p.datiExtra ? JSON.parse(p.datiExtra) : {};

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
        <SelettoreStato partnerId={p.id} statoAttuale={p.stato} />
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
          <h2 className="scheda-titolo">Persone di riferimento</h2>
          <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
            <table>
              <thead>
                <tr>
                  <th>Ruolo</th>
                  <th>Nome</th>
                  <th>Telefono</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {p.contatti.map((c) => (
                  <tr key={c.id}>
                    <td className="cella-muta">{c.ruolo ?? "—"}</td>
                    <td>{c.nome ?? "—"}</td>
                    <td className="cella-muta">{c.telefono ?? "—"}</td>
                    <td className="cella-muta">{c.email ?? "—"}</td>
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
      </main>
    </div>
  );
}
