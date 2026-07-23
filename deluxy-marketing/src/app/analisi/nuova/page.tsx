import { Sidebar } from "@/components/Sidebar";
import { creaAnalisi } from "@/lib/azioni";
import {
  BRANDS,
  CANALI,
  ESITI_ANALISI,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_TIPO_ANALISI,
  TIPI_ANALISI,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function NuovaAnalisi({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  return (
    <div className="layout">
      <Sidebar attiva="analisi" />
      <main className="main">
        <a className="ritorno" href="/analisi">← Analisi &amp; audit</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Deposita un&apos;analisi</h1>
            <p className="page-sub">
              La sintesi operativa resta qui, ricercabile per sempre; il documento completo vive su
              Drive (incolla il percorso relativo dentro “ADV DELUXY SRL”). Le sessioni Claude
              possono farlo in automatico via API.
            </p>
          </div>
        </div>

        <section className="scheda">
          <form className="modulo" action={creaAnalisi}>
            <div className="campo-modulo largo">
              <label>Titolo <span className="obbligatorio">*</span></label>
              <input name="titolo" required placeholder="Es. Audit Google Ads Flowers — luglio 2026" />
            </div>
            <div className="campo-modulo">
              <label>Tipo</label>
              <select name="tipo" defaultValue="analisi">
                {TIPI_ANALISI.map((t) => (
                  <option key={t} value={t}>{ETICHETTA_TIPO_ANALISI[t]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Brand</label>
              <select name="brand" defaultValue={brand ?? "cross"}>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Canale</label>
              <select name="canale" defaultValue="">
                <option value="">—</option>
                {CANALI.map((c) => (
                  <option key={c} value={c}>{ETICHETTA_CANALE[c]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Esito (semaforo)</label>
              <select name="esito" defaultValue="">
                <option value="">—</option>
                {ESITI_ANALISI.map((e) => (
                  <option key={e} value={e}>{ETICHETTA_ESITO[e]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Data dell&apos;analisi</label>
              <input name="dataAnalisi" type="date" />
            </div>
            <div className="campo-modulo">
              <label>File su Drive (percorso relativo)</label>
              <input name="fileDrive" placeholder="ads/Audit/Audit Google Flowers 2026-07.md" />
            </div>
            <div className="campo-modulo largo">
              <label>Sintesi operativa <span className="obbligatorio">*</span></label>
              <textarea name="sintesi" required rows={8} placeholder="Cosa è emerso, in breve: numeri chiave, problemi, raccomandazioni…" />
            </div>
            <div className="campo-modulo largo">
              <label>Note</label>
              <textarea name="note" rows={2} />
            </div>
            <div className="azioni-modulo largo" style={{ gridColumn: "1 / -1" }}>
              <a className="btn btn-secondario" href="/analisi">Annulla</a>
              <button className="btn" type="submit">Deposita</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
