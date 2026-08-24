import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import { leggiSessione, SESSION_COOKIE } from "@/lib/auth";

// La shell dell'app (sidebar + contenuto). Il login vive fuori da questo
// gruppo: niente sidebar prima di essere entrati.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);

  return (
    <div className="app">
      <Sidebar
        utente={sessione?.nome ?? null}
        ruolo={sessione ? (sessione.via === "sso" ? sessione.ruolo : "accesso di team") : null}
      />
      <main className="contenuto">{children}</main>
    </div>
  );
}
