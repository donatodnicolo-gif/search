import { Sidebar } from "@/components/Sidebar";
import { creaOccasione } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, formattaData } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Calendario occasioni (doc 8.2 §3.1): i picchi del gifting con le finestre
// calde da preparare a T-21/T-14 e ripristinare a T+7.
export default async function PaginaOccasioni() {
  const [occasioni, azioniOccasione] = await Promise.all([
    prisma.occasione.findMany({ orderBy: { data: "asc" } }),
    prisma.azione.findMany({
      where: { titolo: { startsWith: "T" }, eventi: { some: { testo: { contains: "occasione" } } } },
      select: { id: true, titolo: true, stato: true, scadenza: true },
    }),
  ]);
  const oggi = new Date();
  const prossime = occasioni.filter((o) => o.data >= oggi);
  const inFinestra = prossime.filter(
    (o) => o.data.getTime() - oggi.getTime() <= 21 * 86_400_000
  );

  return (
    <div className="layout">
      <Sidebar attiva="occasioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Occasioni</h1>
            <p className="page-sub">
              I picchi del gifting sulla linea del tempo. Per ogni occasione l&apos;app genera i task
              alle scadenze giuste: T-21 alza il budget A e prepara i creativi, T-14 accorcia le
              finestre calde (VC/ATC 30→14g), T+7 ripristina. Niente nuovi tCPA nei picchi.
            </p>
          </div>
        </div>

        {inFinestra.length > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>Finestra calda aperta</b> per: {inFinestra.map((o) => `${o.nome} (${formattaData(o.data)})`).join(" · ")}.
              Controlla che i task T-21/T-14 siano stati eseguiti e che i pubblici siano stati accorciati.
            </span>
          </div>
        )}

        <section className="scheda" style={{ padding: 0 }}>
          <div className="scheda-titolo" style={{ padding: "18px 24px 0" }}>Linea del tempo</div>
          <div style={{ overflowX: "auto", paddingBottom: 6 }}>
            <table>
              <thead>
                <tr>
                  <th>Occasione</th>
                  <th>Data</th>
                  <th>Brand</th>
                  <th>Mancano</th>
                  <th>Preparazione</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {occasioni.map((o) => {
                  const giorni = Math.ceil((o.data.getTime() - oggi.getTime()) / 86_400_000);
                  const taskCollegati = azioniOccasione.filter((a) => a.titolo.includes(o.nome));
                  const fatti = taskCollegati.filter((a) => a.stato === "fatta" || a.stato === "superata").length;
                  return (
                    <tr key={o.id} style={giorni < 0 ? { opacity: 0.55 } : undefined}>
                      <td className="cella-nome">{o.nome}</td>
                      <td className="cella-muta">{formattaData(o.data)}</td>
                      <td>
                        <span className="tag-salute" style={{ color: COLORE_BRAND[o.brand] ?? "var(--text-tertiary)" }}>
                          <span className="dot" />
                          {ETICHETTA_BRAND[o.brand] ?? o.brand}
                        </span>
                      </td>
                      <td className="num">
                        {giorni < 0 ? "passata" : (
                          <b style={giorni <= 21 ? { color: "var(--orange)" } : undefined}>{giorni} giorni</b>
                        )}
                      </td>
                      <td>
                        {taskCollegati.length === 0 ? (
                          <span className="cella-muta">nessun task generato</span>
                        ) : (
                          <span className={fatti === taskCollegati.length ? "" : "cella-muta"}>
                            {fatti}/{taskCollegati.length} task fatti
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <span className="cella-sub" style={{ whiteSpace: "normal" }}>{o.note}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">Aggiungi un&apos;occasione</div>
          <p className="cella-sub" style={{ marginBottom: 14 }}>
            Alla creazione nascono automaticamente i 3 task: T-21 (budget A + creativi), T-14
            (finestre calde) e T+7 (ripristino), assegnati alle sessioni AI.
          </p>
          <form className="modulo" action={creaOccasione}>
            <div className="campo-modulo">
              <label>Nome <span className="obbligatorio">*</span></label>
              <input name="nome" required placeholder="Es. Anniversario collezione" />
            </div>
            <div className="campo-modulo">
              <label>Data <span className="obbligatorio">*</span></label>
              <input name="data" type="date" required />
            </div>
            <div className="campo-modulo">
              <label>Brand</label>
              <select name="brand" defaultValue="cross">
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Note</label>
              <input name="note" />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Crea occasione + task</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
