import { Sidebar } from "@/components/Sidebar";
import { creaCampagna } from "@/lib/azioni";
import {
  BRANDS,
  CANALI,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_CAMPAGNA,
  STATI_CAMPAGNA,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default function NuovaCampagna() {
  return (
    <div className="layout">
      <Sidebar attiva="campagne" />
      <main className="main">
        <a className="ritorno" href="/campagne">← Campagne</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Nuova campagna</h1>
            <p className="page-sub">Registra una campagna esistente o in lancio: le metriche arriveranno via API o a mano dalla sua scheda.</p>
          </div>
        </div>

        <section className="scheda">
          <form className="modulo" action={creaCampagna}>
            <div className="campo-modulo largo">
              <label>Nome <span className="obbligatorio">*</span></label>
              <input name="nome" required placeholder="Es. PMax Flowers — Milano" />
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
              <label>Canale</label>
              <select name="canale" defaultValue="google_ads">
                {CANALI.map((c) => (
                  <option key={c} value={c}>{ETICHETTA_CANALE[c]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Stato</label>
              <select name="stato" defaultValue="attiva">
                {STATI_CAMPAGNA.map((s) => (
                  <option key={s} value={s}>{ETICHETTA_STATO_CAMPAGNA[s]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Budget giornaliero (€)</label>
              <input name="budgetGiornaliero" type="number" step="0.01" min="0" />
            </div>
            <div className="campo-modulo">
              <label>Inizio</label>
              <input name="inizio" type="date" />
            </div>
            <div className="campo-modulo">
              <label>Fine</label>
              <input name="fine" type="date" />
            </div>
            <div className="campo-modulo">
              <label>Id sulla piattaforma (Google/Meta)</label>
              <input name="idEsterno" placeholder="Es. 21489…" />
            </div>
            <div className="campo-modulo largo">
              <label>Obiettivo</label>
              <input name="obiettivo" placeholder="Es. ROAS ≥ 4 sulle consegne Milano" />
            </div>
            <div className="campo-modulo largo">
              <label>Note</label>
              <textarea name="note" rows={2} />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <a className="btn btn-secondario" href="/campagne">Annulla</a>
              <button className="btn" type="submit">Registra campagna</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
