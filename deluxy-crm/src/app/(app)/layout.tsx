import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authAttiva } from "@/lib/auth";
import { sessioneCorrente } from "@/lib/sessione-server";

// La shell dell'app (sidebar + contenuto). Il login vive fuori da questo
// gruppo: niente sidebar prima di essere entrati. La sessione si legge QUI
// lato Node, con la revoca: se la password del team è cambiata dopo
// l'accesso, il cookie (firmato ma vecchio) non basta più e si torna al login.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessione = await sessioneCorrente();
  if (authAttiva() && !sessione) redirect("/logout");

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
