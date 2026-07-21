import { prisma } from "./db";
import { verificaPassword } from "./password";
import { isRuolo, type Ruolo } from "./ruoli";

// Autenticazione contro gli utenti del Deluxy Hub. Il calendario NON tiene un
// proprio elenco utenti: gira sullo stesso cluster Postgres del Hub e legge la
// tabella `hub."Utente"` (email, passwordHash scrypt, ruolo). Così le credenziali
// sono le stesse del portale e c'è una sola fonte di verità.
//
// Solo runtime Node (usa scrypt). Da non importare nel middleware (Edge).

type RigaUtente = {
  email: string;
  nome: string;
  passwordHash: string;
  ruolo: string;
  attivo: boolean;
};

export type UtenteAutenticato = { email: string; nome: string; ruolo: Ruolo };

// Verifica email + password contro il Hub. Restituisce i dati per la sessione o
// null se l'utente non esiste, è disattivato o la password è errata.
export async function autenticaUtenteHub(
  email: string,
  password: string,
): Promise<UtenteAutenticato | null> {
  const pulita = email.trim().toLowerCase();
  if (!pulita || !password) return null;

  let righe: RigaUtente[];
  try {
    righe = await prisma.$queryRaw<RigaUtente[]>`
      SELECT email, nome, "passwordHash", ruolo, attivo
      FROM hub."Utente"
      WHERE lower(email) = ${pulita}
      LIMIT 1
    `;
  } catch {
    // Schema hub non raggiungibile (DB non configurato): nessun accesso.
    return null;
  }

  const u = righe[0];
  if (!u || !u.attivo) return null;
  if (!(await verificaPassword(password, u.passwordHash))) return null;

  const ruolo: Ruolo = isRuolo(u.ruolo) ? u.ruolo : "commerciale";
  return { email: u.email.toLowerCase(), nome: u.nome, ruolo };
}
