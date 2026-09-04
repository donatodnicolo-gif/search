import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authAttiva, leggiSessione, SESSION_COOKIE, type Sessione } from "./auth";
import { generazionePassword } from "./password-team";

// La sessione letta lato Node, con la REVOCA: il cookie porta la versione
// della password con cui è nato (`gen`); se nel frattempo la password è
// stata cambiata, la versione nel database è più alta e la sessione non vale
// più. Il middleware (Edge, senza Prisma) controlla solo firma e scadenza:
// questo è il punto che ogni pagina e ogni action devono passare (Libro
// Sicurezza §1: la revoca vive in un choke-point Node, mai al gate Edge).
//
// Le sessioni nate prima di questa versione dell'app non hanno `gen`: valgono
// come versione 0, cioè restano buone finché nessuno cambia la password.
export async function sessioneCorrente(): Promise<Sessione | null> {
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (!sessione) return null;
  if ((sessione.gen ?? 0) !== (await generazionePassword())) return null;
  return sessione;
}

// Per pagine e action: in sviluppo senza segreto la porta è aperta (null),
// in produzione senza sessione valida si esce (il cookie morto va tolto:
// /logout lo cancella e rimanda al login).
export async function sessioneOppureFuori(): Promise<Sessione | null> {
  if (!authAttiva()) return null;
  return sessioneCorrente();
}

// In testa a OGNI pagina sotto (app): il layout non basta, perché nelle
// navigazioni RSC Next non lo ri-renderizza (revisione ostile 04/09, c5).
// Sessione revocata = cookie da cancellare: /logout lo toglie e rimanda al login.
export async function dentroOppureFuori(): Promise<Sessione | null> {
  if (!authAttiva()) return null;
  const sessione = await sessioneCorrente();
  if (!sessione) redirect("/logout");
  return sessione;
}

// Per le rotte /api/interno/*: il middleware (Edge) vede solo firma e
// scadenza; qui si ricontrolla la versione della password (revoca).
export async function sessioneApiValida(): Promise<boolean> {
  if (!authAttiva()) return true;
  return (await sessioneCorrente()) !== null;
}
