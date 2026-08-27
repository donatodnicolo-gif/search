import { GrigliaApp } from "@/components/GrigliaApp";
import { RUOLO_INFO } from "@/lib/ruoli";
import { appVisibili } from "@/lib/permessi";
import { richiediSessione } from "@/lib/sessione-server";

export default async function HomePage() {
  const sessione = await richiediSessione();
  const app = await appVisibili(sessione);
  const nome = sessione.nome.split(" ")[0];

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Ciao {nome}</h1>
        <p className="page-sub">{RUOLO_INFO[sessione.ruolo].descrizione}</p>
      </div>

      <div className="section-label">Le tue app</div>

      {app.length === 0 ? (
        <div className="vuoto">
          Nessuna app abilitata per il tuo profilo. Scrivi a un amministratore.
        </div>
      ) : (
        // La griglia è client perché ci vive dentro il campo di ricerca; le app
        // arrivano già risolte dal server (catalogoApp legge process.env).
        <GrigliaApp app={[...app]} />
      )}
    </main>
  );
}
