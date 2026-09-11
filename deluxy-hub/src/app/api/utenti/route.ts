import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { isRuolo, type Ruolo } from "@/lib/ruoli";
import { idAppValidi } from "@/lib/apps";
import { autenticaToken, erroreApi } from "@/lib/token-api";

// /api/utenti — gli utenti del Hub visti da UN'ALTRA app (11/09/2026, per il
// CRM: «creare utenti da Impostazioni»). Gli utenti hanno una casa sola, il
// Hub: qui si leggono, si creano e si abilitano/disabilitano PER L'APP che
// chiede, niente di più. Standard §7: chi possiede il dato è l'unico che lo
// scrive — le altre app passano di qui.
//
// Auth: token di servizio (x-api-key / Bearer) generato da /chiavi. Il token
// deve avere nello scope l'app che chiede (`app=crm`) — o nessuno scope
// (= tutti): è lo stesso confine di /api/presenze.
//
//   GET   /api/utenti?app=crm
//         → { app, utenti: [{ id, nome, email, ruolo, attivo, abilitato,
//              creatoIl, ultimoAccesso }] }   (tutti gli utenti, con
//              `abilitato` = può aprire quell'app: admin o app in appAbilitate)
//   POST  /api/utenti?app=crm   { nome, email, password, ruolo? }
//         → 201 { utente }  · crea un utente NON admin (default commerciale)
//              già abilitato all'app che chiede. 409 se l'email esiste.
//   PATCH /api/utenti?app=crm   { id, abilitato: true|false }
//         → { utente }  · aggiunge/toglie SOLO quell'app da appAbilitate.
//              Gli admin non si toccano (vedono tutto per definizione).
//
// Limiti voluti: da qui non si crea un admin, non si cambia il ruolo, non si
// tocca la password di un utente esistente, non si disattiva un account:
// per quello c'è /utenti nel Hub, con un admin loggato.

export const dynamic = "force-dynamic";

const CAMPI = {
  id: true,
  nome: true,
  email: true,
  ruolo: true,
  attivo: true,
  appAbilitate: true,
  creatoIl: true,
  ultimoAccesso: true,
} as const;

type Riga = {
  id: string;
  nome: string;
  email: string;
  ruolo: string;
  attivo: boolean;
  appAbilitate: string[];
  creatoIl: Date;
  ultimoAccesso: Date | null;
};

function pubblico(u: Riga, app: string) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    ruolo: u.ruolo,
    attivo: u.attivo,
    abilitato: u.ruolo === "admin" || u.appAbilitate.includes(app),
    creatoIl: u.creatoIl.toISOString(),
    ultimoAccesso: u.ultimoAccesso?.toISOString() ?? null,
  };
}

// L'app che chiede, validata contro il catalogo e contro lo scope del token.
async function appAutorizzata(req: NextRequest): Promise<string | NextResponse> {
  const auth = await autenticaToken(req);
  if (auth instanceof NextResponse) return auth; // 401

  const app = (req.nextUrl.searchParams.get("app") ?? "").trim().toLowerCase();
  if (!app) return erroreApi(400, "Parametro 'app' mancante (es. app=crm)");
  if (idAppValidi([app]).length === 0) return erroreApi(400, `App '${app}' sconosciuta al catalogo del Hub`);

  // Lo scope del token: vuoto = tutti; altrimenti deve comprendere l'app
  // (accettato anche il nome lungo «deluxy-crm», come nella cassaforte).
  if (auth.progetti.length > 0 && !auth.progetti.includes(app) && !auth.progetti.includes(`deluxy-${app}`)) {
    return erroreApi(403, `Questo token non può gestire gli utenti di '${app}' (serve lo scope '${app}')`);
  }
  return app;
}

function noStore<T>(corpo: T, status = 200) {
  return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const app = await appAutorizzata(req);
  if (app instanceof NextResponse) return app;

  const utenti = await prisma.utente.findMany({ select: CAMPI, orderBy: [{ ruolo: "asc" }, { nome: "asc" }] });
  return noStore({ app, utenti: utenti.map((u) => pubblico(u, app)) });
}

export async function POST(req: NextRequest) {
  const app = await appAutorizzata(req);
  if (app instanceof NextResponse) return app;

  let corpo: { nome?: unknown; email?: unknown; password?: unknown; ruolo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return erroreApi(400, "Corpo JSON non leggibile");
  }
  const nome = String(corpo.nome ?? "").trim();
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const password = String(corpo.password ?? "");
  const ruolo = String(corpo.ruolo ?? "commerciale").trim();

  if (!nome || !email || !email.includes("@")) return erroreApi(400, "Servono nome ed email");
  if (password.length < 8) return erroreApi(400, "La password deve avere almeno 8 caratteri");
  if (!isRuolo(ruolo)) return erroreApi(400, "Ruolo sconosciuto");
  // Un admin del Hub non nasce da un'altra app: si crea da /utenti con un admin loggato.
  if (ruolo === "admin") return erroreApi(403, "Da qui non si crea un amministratore: si fa dal Hub, in /utenti");

  if (await prisma.utente.findUnique({ where: { email }, select: { id: true } })) {
    return erroreApi(409, "Esiste già un utente con questa email: abilitalo all'app invece di crearlo");
  }

  const utente = await prisma.utente.create({
    data: {
      nome,
      email,
      ruolo: ruolo as Ruolo,
      appAbilitate: [app],
      passwordHash: await hashPassword(password),
    },
    select: CAMPI,
  });
  return noStore({ utente: pubblico(utente, app) }, 201);
}

export async function PATCH(req: NextRequest) {
  const app = await appAutorizzata(req);
  if (app instanceof NextResponse) return app;

  let corpo: { id?: unknown; abilitato?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return erroreApi(400, "Corpo JSON non leggibile");
  }
  const id = String(corpo.id ?? "").trim();
  if (!id || typeof corpo.abilitato !== "boolean") return erroreApi(400, "Servono 'id' e 'abilitato' (true/false)");

  const esistente = await prisma.utente.findUnique({ where: { id }, select: CAMPI });
  if (!esistente) return erroreApi(404, "Utente non trovato");
  if (esistente.ruolo === "admin") return erroreApi(403, "Gli amministratori vedono tutte le app: non si abilitano né si tolgono da qui");

  const senza = esistente.appAbilitate.filter((a) => a !== app);
  const appAbilitate = corpo.abilitato ? [...senza, app] : senza;
  const utente = await prisma.utente.update({ where: { id }, data: { appAbilitate }, select: CAMPI });
  return noStore({ utente: pubblico(utente, app) });
}
