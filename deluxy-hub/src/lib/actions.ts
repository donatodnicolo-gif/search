"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { hashPassword, verificaPassword } from "./password";
import { SESSION_COOKIE, DURATA_SESSIONE_S, creaSessione } from "./session";
import { richiediAdmin, sessioneCorrente } from "./sessione-server";
import { isRuolo, type Ruolo } from "./ruoli";
import { idAppValidi } from "./apps";

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

// Hash fittizio BEN FORMATO (salt hex : 64 byte hex): serve a far girare scrypt
// anche quando l'utente non esiste o è disattivato, così il tempo di risposta
// non distingue «email valida e attiva» dalle altre. Deve avere la forma giusta,
// altrimenti verificaPassword esce prima di scrypt e l'oracolo temporale resta.
// Non è un segreto: è solo un bersaglio che nessuna password può indovinare.
const HASH_FITTIZIO =
  "f44acbe842b152eb7bdaf63c27e68af4:2fe1f00b9d5873433545ab1d73e6c60cb64b3f337a4897d095d1bff1491cef67b3df3e37dc86d810253ce4fdbd4a6a47038875c5a30bf209d3e18794266ba3ea";

// Destinazione interna sicura per il redirect dopo il login. `startsWith("/")`
// da solo NON basta: `//evil.example` e `/\evil.example` iniziano con `/` ma il
// browser li apre come domini esterni (open redirect → phishing dal dominio
// fidato), e un tab «/%09/evil» sfugge a qualunque blacklist di caratteri. Si
// risolve l'URL contro un'origine fittizia: se dopo la normalizzazione punta
// altrove, non è interno → si torna alla home.
function destinazioneSicura(da: string): string {
  if (!da || !da.startsWith("/")) return "/";
  try {
    const u = new URL(da, "http://interno.invalido");
    if (u.origin !== "http://interno.invalido") return "/";
    const dest = u.pathname + u.search + u.hash;
    // NON basta guardare l'origine e restituire il pathname: la normalizzazione
    // dei dot-segment può portare il pathname a iniziare con «//» (es.
    // `/.//host` → `//host`, protocol-relative → dominio esterno). Una seconda
    // risoluzione del risultato lo cattura — se ora l'origine cambia o l'URL è
    // malformato, non è interno. (Bug trovato dal giro ostile sulle patch.)
    if (new URL(dest, "http://interno.invalido").origin !== "http://interno.invalido") return "/";
    return dest;
  } catch {
    return "/";
  }
}

// Le app spuntate nel form arrivano come più campi "app" con lo stesso nome.
// Teniamo solo gli id che corrispondono a un'app reale del catalogo.
function appSelezionate(fd: FormData): string[] {
  return idAppValidi(fd.getAll("app").map((v) => String(v)));
}

export async function accedi(fd: FormData) {
  const email = testo(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const da = testo(fd, "da");

  const utente = await prisma.utente.findUnique({ where: { email } });

  // scrypt gira SEMPRE, anche per email inesistente o utente disattivato: contro
  // l'hash vero se l'account è valido, contro un hash fittizio ben formato
  // altrimenti. Così il tempo di risposta non distingue i tre casi (l'oracolo
  // temporale vanificherebbe il messaggio unico qui sotto).
  const passwordOk = await verificaPassword(
    password,
    utente && utente.attivo ? utente.passwordHash : HASH_FITTIZIO,
  );

  // Messaggio unico per email inesistente, password errata e utente disattivato:
  // non riveliamo quali email esistono.
  const ok = utente !== null && utente.attivo && passwordOk;
  if (!utente || !ok) {
    redirect(`/login?errore=1${da ? `&da=${encodeURIComponent(da)}` : ""}`);
  }

  await prisma.utente.update({
    where: { id: utente.id },
    data: { ultimoAccesso: new Date() },
  });

  const token = await creaSessione({
    uid: utente.id,
    nome: utente.nome,
    ruolo: utente.ruolo as Ruolo,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURATA_SESSIONE_S,
    path: "/",
  });

  redirect(destinazioneSicura(da));
}

export async function esci() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function creaUtente(fd: FormData) {
  await richiediAdmin();

  const email = testo(fd, "email").toLowerCase();
  const nome = testo(fd, "nome");
  const password = String(fd.get("password") ?? "");
  const ruolo = testo(fd, "ruolo");

  if (!email || !nome || password.length < 8 || !isRuolo(ruolo)) {
    redirect("/utenti?errore=dati");
  }
  if (await prisma.utente.findUnique({ where: { email } })) {
    redirect("/utenti?errore=esiste");
  }

  await prisma.utente.create({
    data: {
      email,
      nome,
      ruolo,
      appAbilitate: appSelezionate(fd),
      passwordHash: await hashPassword(password),
    },
  });

  revalidatePath("/utenti");
  redirect("/utenti?ok=creato");
}

export async function aggiornaUtente(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  const ruolo = testo(fd, "ruolo");
  const attivo = fd.get("attivo") === "on";
  const password = String(fd.get("password") ?? "");

  if (!id || !nome || !isRuolo(ruolo)) redirect("/utenti?errore=dati");

  const dati: {
    nome: string;
    ruolo: Ruolo;
    attivo: boolean;
    appAbilitate: string[];
    passwordHash?: string;
    sessioniValideDa?: Date;
  } = {
    nome,
    ruolo,
    attivo,
    appAbilitate: appSelezionate(fd),
  };
  if (password) {
    if (password.length < 8) redirect("/utenti?errore=password");
    dati.passwordHash = await hashPassword(password);
    // Un reset da amministratore serve spesso proprio quando un account è
    // compromesso: deve buttare fuori le sessioni esistenti come fa il cambio
    // password in self-service, altrimenti un cookie rubato resta valido fino
    // alla scadenza (30 giorni). Troncato al secondo, come in cambiaMiaPassword.
    dati.sessioniValideDa = new Date(Math.floor(Date.now() / 1000) * 1000);
  }

  await prisma.utente.update({ where: { id }, data: dati });

  revalidatePath("/utenti");
  redirect("/utenti?ok=aggiornato");
}

export async function eliminaUtente(fd: FormData) {
  const sessione = await richiediAdmin();
  const id = testo(fd, "id");

  // Un admin non può cancellare se stesso: eviterebbe di chiudersi fuori dal portale.
  if (id === sessione.uid) redirect("/utenti?errore=se-stesso");

  await prisma.utente.delete({ where: { id } });

  revalidatePath("/utenti");
  redirect("/utenti?ok=eliminato");
}

export async function cambiaMiaPassword(fd: FormData) {
  const sessione = await sessioneCorrente();
  if (!sessione) redirect("/login");

  const attuale = String(fd.get("attuale") ?? "");
  const nuova = String(fd.get("nuova") ?? "");

  const utente = await prisma.utente.findUnique({ where: { id: sessione.uid } });
  if (!utente || !(await verificaPassword(attuale, utente.passwordHash))) {
    redirect("/profilo?errore=attuale");
  }
  if (nuova.length < 8) redirect("/profilo?errore=corta");

  // Cambiare la password chiude TUTTE le altre sessioni: `sessioniValideDa` a
  // ora invalida ogni cookie emesso prima (compreso uno eventualmente rubato —
  // cancellarlo dal proprio browser con «esci» non lo fermava). Poi si riemette
  // il cookie di CHI sta cambiando la password, con `iat` nuovo, così non si
  // caccia fuori se stesso mentre si buttano fuori gli altri.
  // Troncato al secondo: l'`iat` del cookie è in secondi, e un `sessioniValideDa`
  // coi millisecondi renderebbe il cookie appena riemesso «più vecchio» di se
  // stesso (iat*1000 < data coi ms) e lo invaliderebbe subito.
  const adesso = new Date(Math.floor(Date.now() / 1000) * 1000);
  await prisma.utente.update({
    where: { id: utente.id },
    data: { passwordHash: await hashPassword(nuova), sessioniValideDa: adesso },
  });

  const token = await creaSessione({
    uid: utente.id,
    nome: utente.nome,
    ruolo: utente.ruolo as Ruolo,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURATA_SESSIONE_S,
    path: "/",
  });

  redirect("/profilo?ok=1");
}
