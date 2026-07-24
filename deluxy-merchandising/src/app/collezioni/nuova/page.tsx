import { Sidebar } from "@/components/Sidebar";
import { creaCollezione } from "@/lib/azioni";
import { ETICHETTA_STAGIONE, STAGIONI, STATI_COLLEZIONE, ETICHETTA_STATO_COLLEZIONE } from "@/lib/dominio";

export default function NuovaCollezionePage() {
  const anno = new Date().getFullYear();
  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main" style={{ maxWidth: 760 }}>
        <a className="ritorno" href="/">← Collezioni</a>
        <div className="page-head">
          <h1 className="page-title">Nuova collezione</h1>
        </div>
        <form action={creaCollezione}>
          <div className="scheda">
            <div className="modulo">
              <div className="campo-modulo largo">
                <label>Nome <span className="obbligatorio">*</span></label>
                <input name="nome" required placeholder="Es. Fioritura Notturna" />
              </div>
              <div className="campo-modulo">
                <label>Stagione <span className="obbligatorio">*</span></label>
                <select name="stagione" required defaultValue="">
                  <option value="" disabled>Scegli…</option>
                  {STAGIONI.map((s) => (
                    <option key={s} value={s}>{ETICHETTA_STAGIONE[s]}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo">
                <label>Anno</label>
                <input name="anno" type="number" defaultValue={anno} />
              </div>
              <div className="campo-modulo">
                <label>Stato</label>
                <select name="stato" defaultValue="in_sviluppo">
                  {STATI_COLLEZIONE.map((s) => (
                    <option key={s} value={s}>{ETICHETTA_STATO_COLLEZIONE[s]}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo">
                <label>Margine target (%)</label>
                <input name="margineTarget" type="number" step="1" min="0" max="100" placeholder="Es. 62" />
              </div>
              <div className="campo-modulo largo">
                <label>Tema / concept</label>
                <input name="tema" placeholder="L'ora blu: fiori che si aprono al crepuscolo" />
              </div>
              <div className="campo-modulo largo">
                <label>Descrizione</label>
                <textarea name="descrizione" rows={2} />
              </div>
            </div>
          </div>
          <div className="azioni-modulo">
            <a className="btn btn-secondario" href="/">Annulla</a>
            <button type="submit" className="btn">Crea collezione</button>
          </div>
        </form>
      </main>
    </div>
  );
}
