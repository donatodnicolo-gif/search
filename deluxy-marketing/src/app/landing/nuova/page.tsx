import { Sidebar } from "@/components/Sidebar";
import { creaLanding } from "@/lib/azioni";
import { BRANDS, ETICHETTA_BRAND, ETICHETTA_STATO_LANDING, STATI_LANDING } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default function NuovaLanding() {
  return (
    <div className="layout">
      <Sidebar attiva="landing" />
      <main className="main">
        <a className="ritorno" href="/landing">← Landing page</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Registra una landing</h1>
            <p className="page-sub">L&apos;URL è la chiave: se esiste già, la scheda viene aggiornata.</p>
          </div>
        </div>
        <section className="scheda">
          <form className="modulo" action={creaLanding}>
            <div className="campo-modulo largo">
              <label>URL <span className="obbligatorio">*</span></label>
              <input name="url" required placeholder="deluxyflowers.com/pages/…" />
            </div>
            <div className="campo-modulo">
              <label>Brand</label>
              <select name="brand" defaultValue="flowers">
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Lingua</label>
              <select name="lingua" defaultValue="it">
                <option value="it">Italiano</option>
                <option value="en">Inglese</option>
                <option value="fr">Francese</option>
                <option value="es">Spagnolo</option>
              </select>
            </div>
            <div className="campo-modulo">
              <label>Tipo</label>
              <select name="tipo" defaultValue="dedicata">
                <option value="dedicata">Landing dedicata</option>
                <option value="collection">Collection</option>
                <option value="pdp">Pagina prodotto</option>
                <option value="home">Home</option>
                <option value="lead">Lead</option>
              </select>
            </div>
            <div className="campo-modulo">
              <label>Stato</label>
              <select name="stato" defaultValue="attiva">
                {STATI_LANDING.map((s) => (
                  <option key={s} value={s}>{ETICHETTA_STATO_LANDING[s]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Scopo</label>
              <input name="scopo" placeholder="A cosa serve questa pagina" />
            </div>
            <div className="campo-modulo largo">
              <label>URL gemella (IT ↔ EN)</label>
              <input name="gemellaUrl" />
            </div>
            <div className="campo-modulo largo">
              <label>Note</label>
              <textarea name="note" rows={2} />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <a className="btn btn-secondario" href="/landing">Annulla</a>
              <button className="btn" type="submit">Registra</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
