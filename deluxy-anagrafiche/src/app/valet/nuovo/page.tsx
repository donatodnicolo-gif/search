import { FormValet } from "@/components/FormValet";
import { Sidebar } from "@/components/Sidebar";
import { creaValet } from "@/lib/azioni-valet";

export const dynamic = "force-dynamic";

export default async function NuovoValet({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="layout">
      <Sidebar valetAttivo />
      <main className="main">
        <a className="ritorno" href="/valet">← Tutti i valet</a>

        <div className="page-head">
          <div>
            <h1 className="page-title">Nuovo valet</h1>
            <p className="page-sub">
              L&apos;anagrafica della persona. Se il valet esiste già nella piattaforma consegne, questa
              scheda ne è il registro: paghe e stipendi restano lì
            </p>
          </div>
        </div>

        {sp.errore === "nome" && <div className="avviso-errore">Il nome è obbligatorio.</div>}

        <form action={creaValet}>
          <FormValet nuovo />
          <div className="azioni-modulo">
            <a className="btn btn-secondario" href="/valet">Annulla</a>
            <button className="btn" type="submit">Crea valet</button>
          </div>
        </form>
      </main>
    </div>
  );
}
