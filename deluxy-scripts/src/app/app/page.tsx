import { creaApp, eliminaApp, salvaApp } from "@/app/actions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Il registro delle destinazioni per cui uno script può essere abilitato: le
// app Deluxy, ma anche ambienti esterni (Google Ads, un negozio Shopify, una
// macchina). La `chiave` è quella che l'app usa nelle API: ?app=<chiave>.
export default async function AppCollegate() {
  const app = await prisma.appCollegata.findMany({
    orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    include: { abilitazioni: { where: { attiva: true }, select: { id: true } } },
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">App collegate</h1>
          <p className="page-sub">
            Chi può ricevere gli script. Ogni app legge i suoi con la propria chiave API e il parametro{" "}
            <code className="inline">?app=chiave</code>.
          </p>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Aggiungi un&apos;app</div>
        <form action={creaApp} className="modulo">
          <div className="campo-modulo">
            <label htmlFor="nome">Nome</label>
            <input id="nome" name="nome" required placeholder="Es. Marketing" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="chiave">Chiave (facoltativa)</label>
            <input id="chiave" name="chiave" placeholder="deluxy-marketing" />
            <span className="campo-aiuto">Se la lasci vuota la ricaviamo dal nome. Non si cambia più: la usano le API.</span>
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="descrizione">A cosa serve</label>
            <input id="descrizione" name="descrizione" placeholder="Facoltativo" />
          </div>
          <div className="azioni-modulo largo" style={{ gridColumn: "1 / -1" }}>
            <button className="btn" type="submit">Aggiungi</button>
          </div>
        </form>
      </div>

      {app.length === 0 ? (
        <div className="vuoto">Nessuna app collegata: aggiungi la prima qui sopra.</div>
      ) : (
        app.map((a) => (
          <div className={`app-riga${a.attiva ? "" : " spenta"}`} key={a.id}>
            <form
              action={salvaApp}
              // come nel dettaglio script: la key cambia a ogni salvataggio,
              // altrimenti i defaultValue restano quelli di prima
              key={a.aggiornataIl.toISOString()}
              style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", flexWrap: "wrap" }}
            >
              <input type="hidden" name="id" value={a.id} />
              <input
                type="color"
                name="colore"
                defaultValue={a.colore}
                aria-label="Colore"
                style={{ width: 34, height: 34, border: "none", background: "none", padding: 0, cursor: "pointer" }}
              />
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <input
                  name="nome"
                  defaultValue={a.nome}
                  aria-label="Nome"
                  style={{
                    font: "inherit", fontWeight: 600, fontSize: 14, width: "100%",
                    background: "var(--fill)", border: "1px solid transparent",
                    borderRadius: "var(--radius-s)", padding: "7px 10px",
                  }}
                />
                <div className="app-chiave" style={{ marginTop: 4 }}>
                  {a.chiave} · {a.abilitazioni.length} script abilitati
                </div>
              </div>
              <input
                name="descrizione"
                defaultValue={a.descrizione ?? ""}
                placeholder="Descrizione"
                aria-label="Descrizione"
                style={{
                  flex: "1 1 220px", font: "inherit", fontSize: 13,
                  background: "var(--fill)", border: "1px solid transparent",
                  borderRadius: "var(--radius-s)", padding: "7px 10px",
                }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
                <input type="checkbox" name="attiva" defaultChecked={a.attiva} />
                attiva
              </label>
              <button className="btn btn-secondario small" type="submit">Salva</button>
              <button className="btn btn-pericolo small" type="submit" formAction={eliminaApp}>Elimina</button>
            </form>
          </div>
        ))
      )}
      <p className="campo-aiuto" style={{ marginTop: 10 }}>
        Eliminare un&apos;app cancella anche le sue abilitazioni e i valori delle variabili impostati lì. Per toglierla di
        mezzo senza perdere niente, basta disattivarla.
      </p>
    </main>
  );
}
