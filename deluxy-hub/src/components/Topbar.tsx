import Link from "next/link";
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
            <Link href="/stato" className="btn ghost">
              Stato
            </Link>
          </>
        )}

        {/* Il cartellino si usa solo da computer: da schermo stretto il bottone
            non compare (e il server rifiuta comunque le richieste da telefono). */}
        <Link href="/cartellino" className="btn solo-da-desktop" title="Presenze, ferie, malattia">
          <span className={`dot-stato ${cartellino?.aperto ? "dentro" : "fuori"}`} />
          Cartellino
          {cartellino?.aperto && cartellino.dalle && (
            <span className="topbar-ora">dalle {oraDi(cartellino.dalle)}</span>
          )}
        </Link>

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
