import Link from "next/link";
import { NavLink } from "./NavLink";
import { esci } from "@/lib/actions";
import { RUOLO_INFO } from "@/lib/ruoli";
import type { Sessione } from "@/lib/session";
import { prisma } from "@/lib/db";
import { giornoDi, minutiLavorati, oraDi } from "@/lib/cartellino";

// Lo stato del cartellino di chi sta guardando: serve a far vedere nella barra
// se è dentro o fuori, senza dover aprire la pagina. Se il database non risponde
// la barra non deve cadere: il portale resta usabile, sparisce solo il pallino.
async function statoCartellino(uid: string) {
  try {
    const adesso = new Date();
    const righe = await prisma.timbratura.findMany({
      where: { utenteId: uid, giorno: giornoDi(adesso) },
      select: { verso: true, istante: true },
      orderBy: { istante: "asc" },
    });
    return minutiLavorati(righe, adesso);
  } catch {
    return null;
  }
}

export async function Topbar({ sessione }: { sessione: Sessione }) {
  const cartellino = await statoCartellino(sessione.uid);

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
        {/* Tre gruppi separati da una distanza: chi sei · dove vai · esci.
            Con un solo gap uniforme i sette elementi erano un blocco unico. */}
        <span className="badge gold">
          <span className="dot" />
          {RUOLO_INFO[sessione.ruolo].etichetta}
        </span>
        <span className="gruppo">
        {sessione.ruolo === "admin" && (
          <>
            <NavLink href="/utenti">Utenti</NavLink>
            <NavLink href="/chiavi">Chiavi</NavLink>
            <NavLink href="/stato">Stato</NavLink>
          </>
        )}

        {/* Il cartellino si usa solo da computer, ma a stabilirlo e' il
            DISPOSITIVO (middleware + server action), non la larghezza della
            finestra: nasconderlo sotto i 900px lasciava senza porta anche il
            portatile con mezzo schermo aperto, ed e' l'unico link che porta li'. */}
        <NavLink href="/cartellino" className="btn" title="Presenze, ferie, malattia">
          <span className={`dot-stato ${cartellino?.aperto ? "dentro" : "fuori"}`} />
          Cartellino
          {cartellino?.aperto && cartellino.dalle && (
            <span className="topbar-ora">dalle {oraDi(cartellino.dalle)}</span>
          )}
        </NavLink>
        </span>

        <span className="gruppo">
        <NavLink href="/profilo">{sessione.nome}</NavLink>
        <form action={esci}>
          <button type="submit" className="btn">
            Esci
          </button>
        </form>
        </span>
      </div>
    </header>
  );
}
