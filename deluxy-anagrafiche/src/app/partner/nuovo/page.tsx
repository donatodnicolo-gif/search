import { Sidebar } from "@/components/Sidebar";
import { creaPartner } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { ETICHETTE_STATO, STATI } from "@/lib/stati";

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
  const categorie = await prisma.partner.groupBy({
    by: ["categoria"],
    where: { attivo: true },
    orderBy: { categoria: "asc" },
  });

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
                <>
                  <input
                    id="categoria"
                    name="categoria"
                    type="text"
                    required
                    list="lista-categorie"
                    defaultValue={sp.categoria ?? ""}
                    placeholder="es. FIORISTA"
                  />
                  <datalist id="lista-categorie">
                    {categorie.map((c) => (
                      <option key={c.categoria} value={c.categoria} />
                    ))}
                  </datalist>
                </>
              </Campo>
              <Campo etichetta="Stato" nome="stato">
                <select id="stato" name="stato" defaultValue="prospect">
                  {STATI.map((s) => (
                    <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
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
