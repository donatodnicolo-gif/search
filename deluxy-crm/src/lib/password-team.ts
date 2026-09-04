import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { verificaPasswordTeam as verificaPasswordDiNascita } from "./auth";

// La password di squadra del CRM: dove vive, come si verifica, come si
// cambia, come si recupera. Solo runtime Node (crypto + Prisma): il
// middleware (Edge) non deve importare questo file.
//
// Le regole (Libro della Sicurezza §1-2, stesso giro del Hub):
// 1. Nasce nell'ambiente (CRM_APP_PASSWORD). La prima volta che qualcuno la
//    cambia dall'app, si sposta nel database come hash scrypt e da lì in poi
//    l'ambiente non conta più: una sola fonte, mai due password valide.
// 2. Ogni cambio alza `versione`: le sessioni nate con la versione vecchia
//    muoiono (chi era dentro con la password vecchia, o con un cookie
//    rubato, esce). È la revoca che al CRM mancava.
// 3. Il recupero è un link monouso a tempo, mandato SEMPRE alla stessa
//    casella di amministrazione (non c'è un utente da riconoscere): a
//    database c'è solo l'hash del token, e la risposta al modulo è sempre la
//    stessa, che il link sia partito o no.

export const DURATA_TOKEN_MIN = 60; // un'ora: il tempo di leggere una mail
export const MIN_PASSWORD = 12; // NIST 800-63B: la lunghezza conta più delle regole
const ID_TEAM = "team";

// Freni sul modulo pubblico: senza, «Password dimenticata?» diventa un modo
// per bombardare la casella di amministrazione (e far spendere un invio a
// ogni click). C'è UNA password, quindi il conteggio globale è quello che
// conta; quello per IP ferma il singolo molesto prima.
const MAX_RICHIESTE_ORA = 3;
const MAX_PER_IP_ORA = 5;

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function verificaHash(password: string, salvata: string): Promise<boolean> {
  const [saltHex, hashHex] = salvata.split(":");
  if (!saltHex || !hashHex) return false;
  const atteso = Buffer.from(hashHex, "hex");
  if (atteso.length !== KEY_LEN) return false;
  const calcolato = await scryptAsync(password, Buffer.from(saltHex, "hex"), KEY_LEN);
  return timingSafeEqual(atteso, calcolato);
}

export type StatoPasswordTeam = {
  inDatabase: boolean; // false = vale ancora la password di nascita (env)
  versione: number;
  cambiataIl: Date | null;
  cambiataDa: string;
  // Richieste «password dimenticata» nelle ultime 24 ore: il tetto globale è
  // esauribile da chiunque (revisione ostile 04/09, a3), quindi il fenomeno
  // deve VEDERSI in Impostazioni invece di essere indovinato.
  richieste24h: number;
};

export async function statoPasswordTeam(): Promise<StatoPasswordTeam> {
  const [riga, richieste24h] = await Promise.all([
    prisma.passwordTeam.findUnique({ where: { id: ID_TEAM } }),
    prisma.tokenResetPassword.count({ where: { creatoIl: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);
  if (!riga) return { inDatabase: false, versione: 0, cambiataIl: null, cambiataDa: "", richieste24h };
  return {
    inDatabase: true,
    versione: riga.versione,
    cambiataIl: riga.cambiataIl,
    cambiataDa: riga.cambiataDa,
    richieste24h,
  };
}

// La versione corrente della password: la portano le sessioni nuove, e la
// ricontrolla chi legge la sessione lato Node (sessione-server.ts).
export async function generazionePassword(): Promise<number> {
  const riga = await prisma.passwordTeam.findUnique({ where: { id: ID_TEAM }, select: { versione: true } });
  return riga?.versione ?? 0;
}

// Password digitata al login: quella nel database se c'è, altrimenti quella
// di nascita. Mai tutte e due: quando la riga esiste, l'env è morta.
export async function verificaPasswordSquadra(digitata: string): Promise<boolean> {
  if (!digitata) return false;
  const riga = await prisma.passwordTeam.findUnique({ where: { id: ID_TEAM }, select: { hash: true } });
  if (riga) return verificaHash(digitata, riga.hash);
  return verificaPasswordDiNascita(digitata);
}

// Password nuova: nessuna regola di composizione (producono «Password1!»),
// ma lunghezza vera e blocklist dei valori in cima a ogni dizionario.
const BLOCKLIST = [
  "password", "passw0rd", "123456", "12345678", "123456789", "1234567890",
  "qwerty", "qwertyuiop", "abc123", "iloveyou", "admin", "welcome", "letmein",
  "monkey", "dragon", "football", "baseball", "sunshine", "princess",
  "deluxy", "deluxy2026", "deluxy2025", "deluxycrm", "cambiami", "changeme", "segreto",
];

export type ProblemaPassword = "corta" | "comune";

export function problemaPassword(password: string): ProblemaPassword | null {
  if (password.length < MIN_PASSWORD) return "corta";
  const bassa = password.toLowerCase();
  if (BLOCKLIST.some((v) => bassa === v || bassa.startsWith(v))) return "comune";
  return null;
}

// Scrive la password nuova e alza la versione: TUTTE le sessioni aperte
// (anche quella di chi la cambia) escono al prossimo click.
function scriviPassword(tx: Prisma.TransactionClient, hash: string, autore: string, adesso: Date) {
  return tx.passwordTeam.upsert({
    where: { id: ID_TEAM },
    create: { id: ID_TEAM, hash, versione: 1, cambiataDa: autore, cambiataIl: adesso },
    update: { hash, versione: { increment: 1 }, cambiataDa: autore, cambiataIl: adesso },
  });
}

// Cambio dall'interno (Impostazioni). Con la password di squadra serve quella
// attuale, così un cookie lasciato aperto su un computer non basta a chiudere
// fuori il team. `attuale` è null per l'admin del Hub (SSO): la sua identità
// vale più del segreto condiviso, e così il proprietario può sempre espellere
// chi ha la password anche se la posta del CRM è spenta (ostile 04/09, d3).
export async function cambiaPasswordSquadra(
  attuale: string | null,
  nuova: string,
  autore: string,
): Promise<"ok" | "attuale" | ProblemaPassword> {
  if (attuale !== null && !(await verificaPasswordSquadra(attuale))) return "attuale";
  const problema = problemaPassword(nuova);
  if (problema) return problema;
  const hash = await hashPassword(nuova);
  await prisma.$transaction((tx) => scriviPassword(tx, hash, autore, new Date()));
  return "ok";
}

// ----------------------------------------------------------------- recupero

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Dell'IP si conserva solo l'hash col segreto dell'app come sale: serve a
// dire «è di nuovo lo stesso», non a sapere chi è.
export function hashIp(ip: string): string {
  if (!ip) return "";
  return createHash("sha256")
    .update((process.env.CRM_SESSION_SECRET ?? "deluxy") + ":" + ip)
    .digest("hex");
}

// Crea il token. Ritorna il valore IN CHIARO (l'unico momento in cui
// esiste: da qui va dritto nella mail) oppure null se il freno è scattato.
export async function creaTokenReset(ipHash: string): Promise<string | null> {
  const unOraFa = new Date(Date.now() - 60 * 60 * 1000);
  const [totali, perIp] = await Promise.all([
    prisma.tokenResetPassword.count({ where: { creatoIl: { gte: unOraFa } } }),
    ipHash ? prisma.tokenResetPassword.count({ where: { ipHash, creatoIl: { gte: unOraFa } } }) : Promise.resolve(0),
  ]);
  if (totali >= MAX_RICHIESTE_ORA || perIp >= MAX_PER_IP_ORA) return null;

  const token = randomBytes(32).toString("base64url"); // 256 bit: non si indovina
  await prisma.tokenResetPassword.create({
    data: { hash: hashToken(token), scadeIl: new Date(Date.now() + DURATA_TOKEN_MIN * 60 * 1000), ipHash },
  });
  return token;
}

export type EsitoToken = { valido: true; tokenId: string } | { valido: false };

// Si cerca PER HASH (indice unico), poi confronto a tempo costante: mai un
// oracolo temporale su un segreto (Libro §1).
export async function leggiTokenReset(token: string): Promise<EsitoToken> {
  if (!token || token.length < 20) return { valido: false };
  const riga = await prisma.tokenResetPassword.findUnique({ where: { hash: hashToken(token) } });
  if (!riga || riga.usatoIl || riga.scadeIl < new Date()) return { valido: false };
  const atteso = Buffer.from(riga.hash, "hex");
  const calcolato = Buffer.from(hashToken(token), "hex");
  if (atteso.length !== calcolato.length || !timingSafeEqual(atteso, calcolato)) return { valido: false };
  return { valido: true, tokenId: riga.id };
}

// Il secondo tempo del recupero: token bruciato + password nuova + gli altri
// link non ancora usati spenti, in UNA transazione. Il token si brucia con
// un updateMany condizionato (`usatoIl: null`) e si prosegue solo se ha
// toccato UNA riga: due invii concorrenti dello stesso link non scrivono due
// password (ostile 04/09, b4).
export async function reimpostaConToken(
  tokenId: string,
  nuova: string,
): Promise<"ok" | "token" | ProblemaPassword> {
  const problema = problemaPassword(nuova);
  if (problema) return problema;
  const hash = await hashPassword(nuova);
  const adesso = new Date();
  return prisma.$transaction(async (tx) => {
    const bruciato = await tx.tokenResetPassword.updateMany({
      where: { id: tokenId, usatoIl: null, scadeIl: { gt: adesso } },
      data: { usatoIl: adesso },
    });
    if (bruciato.count !== 1) return "token" as const;
    await scriviPassword(tx, hash, "link di recupero", adesso);
    await tx.tokenResetPassword.updateMany({ where: { usatoIl: null }, data: { usatoIl: adesso } });
    return "ok" as const;
  });
}

// Il testo della mail: dice cosa fare, quanto dura, e cosa fare se non sei
// stato tu. Testo semplice: passa da AI Mail come ogni mail del CRM.
export function mailReset(link: string): { oggetto: string; corpo: string } {
  return {
    oggetto: "Deluxy CRM — reimposta la password del team",
    corpo: [
      "Qualcuno ha chiesto di reimpostare la password di squadra del Deluxy CRM.",
      "",
      "Per sceglierne una nuova apri questo indirizzo entro un'ora:",
      "",
      link,
      "",
      "Il link si usa una volta sola. Salvando la password nuova, ogni accesso già aperto al CRM viene chiuso:",
      "chi lavora nel CRM dovrà rientrare con la password nuova.",
      "",
      "Se non sei stato tu, non devi fare niente: senza questo link la password non cambia.",
      "",
      "Deluxy CRM — deluxy-crm.vercel.app",
    ].join("\n"),
  };
}
