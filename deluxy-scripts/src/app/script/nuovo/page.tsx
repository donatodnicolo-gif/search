import { creaScript } from "@/app/actions";
import { EditorCorpo } from "@/components/EditorCorpo";
import { CANALI, CATEGORIE } from "@/lib/variabili";

export const dynamic = "force-dynamic";

export default function NuovoScript() {
  return (
    <main className="main">
      <a className="ritorno" href="/">← Tutti i testi</a>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuovo testo</h1>
          <p className="page-sub">
            Scrivilo come lo manderesti davvero. Dove va il dato di chi lo riceve, mettici una variabile:{" "}
            <code className="inline">{"{{NOME_CLIENTE}}"}</code> — vengono create da sole al salvataggio.
          </p>
        </div>
      </div>

      <form action={creaScript}>
        <div className="scheda">
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nome">Titolo</label>
              <input id="nome" name="nome" required placeholder="Es. Invito alla presentazione della collezione" />
            </div>
            <div className="campo-modulo">
              <label htmlFor="categoria">Categoria</label>
              <select id="categoria" name="categoria" defaultValue="vendite">
                {CATEGORIE.map((c) => (
                  <option key={c.valore} value={c.valore}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label htmlFor="canale">Canale</label>
              <select id="canale" name="canale" defaultValue="email">
                {CANALI.map((c) => (
                  <option key={c.valore} value={c.valore}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label htmlFor="descrizione">Quando si usa</label>
              <input id="descrizione" name="descrizione" placeholder="Una riga: a chi si manda e in che momento" />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="oggetto">Oggetto (per le email)</label>
              <input id="oggetto" name="oggetto" placeholder="Anche qui valgono le variabili: {{AZIENDA}}, la aspettiamo" />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="corpo">Testo</label>
              <EditorCorpo valoreIniziale="" dichiarate={[]} />
            </div>
          </div>
          <div className="azioni-modulo">
            <a className="btn btn-secondario" href="/">Annulla</a>
            <button className="btn" type="submit">Crea il testo</button>
          </div>
        </div>
      </form>
    </main>
  );
}
