import { Sidebar } from "@/components/Sidebar";
import { CATEGORIE, isCategoria } from "@/lib/categorie";
import { creaPartner } from "@/lib/azioni";
import {
  DESCRIZIONI_STATO_ANALISI,
  ETICHETTE_STATO,
  ETICHETTE_STATO_FINANZIARIO,
  STATI,
  STATI_ANALISI,
  STATI_FINANZIARI,
  STATO_FINANZIARIO_PREDEFINITO,
} from "@/lib/stati";

export const dynamic = "force-dynamic";

function Campo({
  etichetta,
  nome,
  largo,
  obbligatorio,
  children,
}: {
  etichetta: string;
  nome?: string;
  largo?: boolean;
  obbligatorio?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`campo-modulo${largo ? " largo" : ""}`}>
      <label htmlFor={nome}>
        {etichetta}
        {obbligatorio && <span className="obbligatorio"> *</span>}
      </label>
      {children ?? <input id={nome} name={nome} type="text" />}
    </div>
  );
}

// Form di creazione manuale di un'anagrafica (bottone "Nuovo" delle viste).
// La dedup è la stessa delle API: nome+città già presenti aprono la scheda
// esistente invece di creare un doppione.
export default async function Nuovo({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; categoria?: string }>;
}) {
  const sp = await searchParams;
  const catPreset = sp.categoria && isCategoria(sp.categoria.toUpperCase()) ? sp.categoria.toUpperCase() : "";

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={sp.categoria ?? null} />
      <main className="main">
        <a className="ritorno" href={sp.categoria ? `/?categoria=${encodeURIComponent(sp.categoria)}` : "/"}>
          ← Torna all&apos;elenco
        </a>

        <div className="page-head">
          <div>
            <h1 className="page-title">Nuova anagrafica</h1>
            <p className="page-sub">
              Censimento manuale nel registro. Nome e categoria bastano: il resto si completa quando serve.
            </p>
          </div>
        </div>

        {sp.errore && (
          <div className="avviso-errore">Nome e categoria sono obbligatori.</div>
        )}

        <form action={creaPartner}>
          <section className="scheda">
            <h2 className="scheda-titolo">Anagrafica</h2>
            <div className="modulo">
              <Campo etichetta="Nome / Insegna" nome="nome" obbligatorio>
                <input id="nome" name="nome" type="text" required autoFocus placeholder="es. FIORAIO ROSSI" />
              </Campo>
              <Campo etichetta="Categoria" nome="categoria" obbligatorio>
                <select id="categoria" name="categoria" required defaultValue={catPreset}>
                  <option value="" disabled>Scegli una categoria…</option>
                  {CATEGORIE.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Campo>
              <Campo etichetta="Stato commerciale" nome="stato">
                <select id="stato" name="stato" defaultValue="prospect">
                  {STATI.map((s) => (
                    <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
                  ))}
                </select>
              </Campo>
              <Campo etichetta="Stato finanziario" nome="statoFinanziario">
                <select
                  id="statoFinanziario"
                  name="statoFinanziario"
                  defaultValue={STATO_FINANZIARIO_PREDEFINITO}
                >
                  {STATI_FINANZIARI.map((s) => (
                    <option key={s} value={s}>{ETICHETTE_STATO_FINANZIARIO[s]}</option>
                  ))}
                </select>
              </Campo>
              <Campo etichetta="Stato analisi" nome="statoAnalisi">
                <select id="statoAnalisi" name="statoAnalisi" defaultValue="">
                  <option value="">Non analizzata</option>
                  {STATI_ANALISI.map((s) => (
                    <option key={s} value={s}>{DESCRIZIONI_STATO_ANALISI[s]}</option>
                  ))}
                </select>
              </Campo>
              <Campo etichetta="Ragione sociale" nome="ragioneSociale" />
              <Campo etichetta="Città" nome="citta" />
              <Campo etichetta="Provincia" nome="provincia" />
              <Campo etichetta="Regione" nome="regione" />
              <Campo etichetta="Indirizzo" nome="indirizzo" largo />
              <Campo etichetta="Email" nome="email">
                <input id="email" name="email" type="email" />
              </Campo>
              <Campo etichetta="Telefono" nome="telefono" />
              <Campo etichetta="P. IVA" nome="pIva" />
              <Campo etichetta="Account commerciale" nome="account" />
              <Campo etichetta="Note" nome="note" largo>
                <textarea id="note" name="note" rows={3} />
              </Campo>
            </div>
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Persone di riferimento (facoltative)</h2>
            {[0, 1, 2].map((i) => (
              <div className="modulo modulo-contatto" key={i}>
                <Campo etichetta="Ruolo" nome={`c${i}-ruolo`}>
                  <input id={`c${i}-ruolo`} name={`c${i}-ruolo`} type="text" placeholder="es. TITOLARE" />
                </Campo>
                <Campo etichetta="Nome" nome={`c${i}-nome`} />
                <Campo etichetta="Telefono" nome={`c${i}-telefono`} />
                <Campo etichetta="Email" nome={`c${i}-email`}>
                  <input id={`c${i}-email`} name={`c${i}-email`} type="email" />
                </Campo>
              </div>
            ))}
          </section>

          <div className="azioni-modulo">
            <a className="btn btn-secondario" href={sp.categoria ? `/?categoria=${encodeURIComponent(sp.categoria)}` : "/"}>
              Annulla
            </a>
            <button type="submit" className="btn">Crea anagrafica</button>
          </div>
        </form>
      </main>
    </div>
  );
}
