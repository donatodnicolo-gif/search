// Gli utenti dell'app: una persona, una password, un ruolo.
//
// Prima si entrava con **una password sola, condivisa**. In queste pagine ci
// sono stipendi, premi e margini: una password che gira in chat non si revoca —
// si cambia per tutti, e chi non c'entra resta fuori. Con un utente per persona
// si sa **chi** è entrato e si toglie l'accesso a uno solo.
//
// Il ruolo che ha fatto nascere tutto questo è **lettura**: il commercialista
// deve vedere tutto e non toccare niente. Non basta nascondergli i bottoni —
// quello è un cartello, non una serratura: il blocco vero è nel middleware, che
// per quel ruolo rifiuta **qualunque richiesta che non sia una lettura**.

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./db";
import { ruoloValido, type UtenteEsposto } from "./ruoli";

export { RUOLI, ruoloValido, type RuoloUtente, type UtenteEsposto } from "./ruoli";

const derive = promisify(scrypt) as (p: string, s: string, l: number) => Promise<Buffer>;


// scrypt con sale casuale: sale e derivata nello stesso campo, separati da ":".
// La password non viene mai salvata, nemmeno cifrata — di una password non
// serve poter tornare indietro.
export async function hashPassword(password: string): Promise<string> {
  const sale = randomBytes(16).toString("hex");
  const buf = await derive(password, sale, 64);
  return `${sale}:${buf.toString("hex")}`;
}

export async function verificaPassword(password: string, hash: string): Promise<boolean> {
  const [sale, atteso] = hash.split(":");
  if (!sale || !atteso) return false;
  const buf = await derive(password, sale, 64);
  const a = Buffer.from(atteso, "hex");
  // Confronto a tempo costante: un confronto normale rivela quanti caratteri
  // iniziali sono giusti, e da lì una password si indovina un pezzo alla volta.
  return a.length === buf.length && timingSafeEqual(a, buf);
}


export async function elencoUtenti(): Promise<UtenteEsposto[]> {
  const u = await prisma.utenteBudgets.findMany({ orderBy: [{ attivo: "desc" }, { nome: "asc" }] });
  // L'hash non esce mai da qui, nemmeno verso una pagina di amministrazione.
  return u.map(({ id, email, nome, ruolo, attivo, ultimoAccesso }) => ({ id, email, nome, ruolo, attivo, ultimoAccesso }));
}

export async function creaUtente(input: { email: string; nome: string; password: string; ruolo: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Email non valida.");
  if (input.password.length < 10) {
    // Dieci caratteri non è una regola arbitraria: è il minimo sotto cui una
    // password condivisa per posta si indovina in tempi che non consolano.
    throw new Error("La password deve avere almeno 10 caratteri.");
  }
  if (!ruoloValido(input.ruolo)) throw new Error("Ruolo non riconosciuto.");
  const esiste = await prisma.utenteBudgets.findUnique({ where: { email } });
  if (esiste) throw new Error("Esiste già un utente con questa email.");
  return prisma.utenteBudgets.create({
    data: { email, nome: input.nome.trim() || email, hash: await hashPassword(input.password), ruolo: input.ruolo },
  });
}

// Chi entra: `null` se l'email non c'è, se è disattivato o se la password non
// torna. Sempre lo stesso `null`, di proposito — distinguere «utente
// inesistente» da «password sbagliata» dice a chi prova quali email esistono.
export async function autentica(email: string, password: string) {
  const u = await prisma.utenteBudgets.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!u || !u.attivo) return null;
  if (!(await verificaPassword(password, u.hash))) return null;
  await prisma.utenteBudgets.update({ where: { id: u.id }, data: { ultimoAccesso: new Date() } });
  return { id: u.id, email: u.email, nome: u.nome, ruolo: u.ruolo };
}

export async function aggiornaUtente(
  id: string,
  patch: { nome?: string; ruolo?: string; attivo?: boolean; password?: string }
) {
  const data: Record<string, unknown> = {};
  if (patch.nome !== undefined) data.nome = patch.nome.trim();
  if (patch.ruolo !== undefined) {
    if (!ruoloValido(patch.ruolo)) throw new Error("Ruolo non riconosciuto.");
    data.ruolo = patch.ruolo;
  }
  if (patch.attivo !== undefined) data.attivo = patch.attivo;
  if (patch.password) {
    if (patch.password.length < 10) throw new Error("La password deve avere almeno 10 caratteri.");
    data.hash = await hashPassword(patch.password);
  }
  return prisma.utenteBudgets.update({ where: { id }, data });
}

// **Non ci si può chiudere fuori**: l'ultimo amministratore attivo non si
// disattiva e non si degrada. È la stessa regola del secondo fattore — una app
// in cui nessuno può più entrare non è più sicura, è solo rotta.
export async function ultimoAdmin(id: string): Promise<boolean> {
  const admin = await prisma.utenteBudgets.findMany({ where: { ruolo: "admin", attivo: true }, select: { id: true } });
  return admin.length === 1 && admin[0].id === id;
}
