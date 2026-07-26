import { redirect } from "next/navigation";
import { operatoreCorrente } from "@/lib/sessione";
import { ModuloNuovaRichiesta } from "@/components/ModuloNuovaRichiesta";

// Richiesta creata a mano: serve per i casi che non passano da un'altra app.
// Chi la crea non la potrà approvare — è scritto anche nella pagina, così non
// è una sorpresa al momento della firma.

export const dynamic = "force-dynamic";

export default async function Nuova() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  if (operatore.ruolo === "osservatore") redirect("/");

  return (
    <main className="main">
      <a className="ritorno" href="/richieste">
        ← Torna alle richieste
      </a>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuova richiesta</h1>
          <p className="page-sub">La firmerà un altro operatore: chi crea non approva.</p>
        </div>
      </div>
      <div className="scheda">
        <ModuloNuovaRichiesta />
      </div>
    </main>
  );
}
