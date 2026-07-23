import Link from "next/link";
import { esci } from "@/lib/actions";
import { RUOLO_INFO } from "@/lib/ruoli";
import type { Sessione } from "@/lib/session";

export function Topbar({ sessione }: { sessione: Sessione }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <div className="brand-logo">D</div>
        <div>
          <div className="brand-name">Deluxy Hub</div>
          <div className="brand-sub">Le app del gruppo</div>
        </div>
      </Link>

      <div className="topbar-actions">
        <span className="badge gold">
          <span className="dot" />
          {RUOLO_INFO[sessione.ruolo].etichetta}
        </span>
        {sessione.ruolo === "admin" && (
          <>
            <Link href="/utenti" className="btn ghost">
              Utenti
            </Link>
            <Link href="/chiavi" className="btn ghost">
              Chiavi
            </Link>
          </>
        )}
        <Link href="/profilo" className="btn ghost">
          {sessione.nome}
        </Link>
        <form action={esci}>
          <button type="submit" className="btn">
            Esci
          </button>
        </form>
      </div>
    </header>
  );
}
