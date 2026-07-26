import { creaScript } from "@/app/actions";
import { EditorCorpo } from "@/components/EditorCorpo";
import { LINGUAGGI } from "@/lib/variabili";

export const dynamic = "force-dynamic";

export default function NuovoScript() {
  return (
    <main className="main">
      <a className="ritorno" href="/">← Tutti gli script</a>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuovo script</h1>
          <p className="page-sub">
            Bastano nome e testo: le variabili scritte come <code className="inline">{"{{COSÌ}}"}</code> vengono
            create da sole, e poi si decide per quali app è abilitato.
          </p>
        </div>
      </div>

      <form action={creaScript}>
        <div className="scheda">
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nome">Nome</label>
              <input id="nome" name="nome" required placeholder="Es. Import ordini Shopify" />
            </div>
            <div className="campo-modulo">
              <label htmlFor="linguaggio">Linguaggio</label>
              <select id="linguaggio" name="linguaggio" defaultValue="javascript">
                {LINGUAGGI.map((l) => (
                  <option key={l.valore} value={l.valore}>{l.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="descrizione">Cosa fa</label>
              <input id="descrizione" name="descrizione" placeholder="Una riga: a cosa serve questo script" />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="corpo">Testo dello script</label>
              <EditorCorpo valoreIniziale="" dichiarate={[]} />
            </div>
          </div>
          <div className="azioni-modulo">
            <a className="btn btn-secondario" href="/">Annulla</a>
            <button className="btn" type="submit">Crea script</button>
          </div>
        </div>
      </form>
    </main>
  );
}
