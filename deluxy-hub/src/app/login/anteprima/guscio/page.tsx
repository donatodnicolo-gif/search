// TEMPORANEO — anteprima del guscio (barra + sidebar). NON COMMITTARE.
import { Sidebar } from "@/components/Sidebar";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import type { Sessione } from "@/lib/session";

export const dynamic = "force-dynamic";

const finta: Sessione = { uid: "x", nome: "Maria Rossi", ruolo: "admin", exp: 0 };

export default function AnteprimaGuscio() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-sx">
          <ToggleSidebar />
          <a className="brand" href="/">
            <div className="brand-logo">D</div>
            <div>
              <div className="brand-name">Deluxy Hub</div>
              <div className="brand-sub">La porta d&rsquo;ingresso</div>
            </div>
          </a>
        </div>
      </header>
      <div className="layout">
        <Sidebar sessione={finta} cartellino={{ dentro: true, da: "09:12" }} />
        <main className="main">
          <div className="page-head">
            <h1 className="page-title">Anteprima del guscio</h1>
            <p className="page-sub">Barra sottile in alto, sidebar a sinistra, contenuto qui.</p>
          </div>
          <div className="card">Contenuto d&rsquo;esempio.</div>
        </main>
      </div>
    </>
  );
}
