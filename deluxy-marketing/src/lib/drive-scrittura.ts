import { createSign } from "crypto";
import { prisma } from "@/lib/db";
import { segreto } from "@/lib/segreti";
import { idCartellaDrive, driveDir } from "@/lib/drive";

// SCRITTURA su Google Drive: il ponte `ads/App Azioni/OUT - dall'app`.
//
// PERCHÉ SERVE UNA CREDENZIALE DIVERSA DA QUELLA CHE GIÀ C'È. L'app legge la
// cartella con una chiave API (`drive.apikey`), e per leggere basta. Ma una
// chiave API identifica l'applicazione, non una persona: Drive la accetta solo
// per file pubblici e in SOLA LETTURA. Provando a scrivere risponde
//   401 "API keys are not supported by this API. Expected OAuth2 access token"
// Non è un limite dell'app: è il tipo di credenziale. Per scrivere serve un
// ACCOUNT DI SERVIZIO — un utente Google non umano, con la sua email — e la
// cartella va condivisa con quella email come Editor.
//
// REGOLE DEL PROTOCOLLO, applicate qui e non lasciate alla buona volontà:
//   · si scrive SOLO dentro "OUT - dall'app", mai altrove nella cartella;
//   · solo file NUOVI: se il nome esiste già ci si ferma (append-only);
//   · solo .md;
//   · nessuna cartella nuova.
// Sono vincoli scritti nel codice perché un protocollo che vive solo in un
// documento lo rispetta chi se lo ricorda.

export const IMP_SERVICE_ACCOUNT = "drive.service_account";
// Per conto di CHI scrive l'app.
//
// Un account di servizio non ha spazio su Drive — è un utente senza cassetto:
// Google risponde "Service Accounts do not have storage quota" e il file non
// si crea, anche con la cartella condivisa e i permessi giusti. Le uscite sono
// due: un Drive condiviso (i file appartengono al drive, non a una persona),
// oppure l'IMPERSONAZIONE — l'account di servizio agisce per conto di una
// persona vera, e il file nasce nel cassetto di quella persona.
export const IMP_IMPERSONA = "drive.impersona";

// COLLEGAMENTO COME UTENTE (OAuth).
//
// Serve quando la cartella appartiene a un account Gmail normale, non a un
// dominio Workspace: lì l'impersonazione non esiste — non c'è nessun
// amministratore che possa autorizzarla — e i Drive condivisi nemmeno.
// L'unica via è che una persona dia il consenso una volta sola: da quel
// momento l'app scrive COME quella persona, nel suo spazio, sulla sua cartella.
export const IMP_OAUTH_ID = "drive.oauth_client_id";
export const IMP_OAUTH_SEGRETO = "drive.oauth_client_secret";
export const IMP_OAUTH_REFRESH = "drive.oauth_refresh";
export const IMP_OAUTH_EMAIL = "drive.oauth_email";

// Ambito richiesto: "drive.file" dà accesso ai soli file creati dall'app, che
// è esattamente quello che serve per depositare nel ponte e non un grammo di
// più. Se Google dovesse rifiutare la creazione dentro una cartella altrui si
// passa a "drive" pieno, ma si parte dal minimo: un permesso che non serve è
// un permesso che prima o poi fa danno.
export const AMBITO_DRIVE = "https://www.googleapis.com/auth/drive.file";

export async function oauthConfigurato(): Promise<{ id: string | null; segreto: string | null; refresh: string | null; email: string | null }> {
  const righe = await prisma.impostazione
    .findMany({ where: { chiave: { in: [IMP_OAUTH_ID, IMP_OAUTH_SEGRETO, IMP_OAUTH_REFRESH, IMP_OAUTH_EMAIL] } } })
    .catch(() => []);
  const v = (k: string) => righe.find((r) => r.chiave === k)?.valore.trim() || null;
  return { id: v(IMP_OAUTH_ID), segreto: v(IMP_OAUTH_SEGRETO), refresh: v(IMP_OAUTH_REFRESH), email: v(IMP_OAUTH_EMAIL) };
}

// Un token d'accesso a partire dal consenso già dato.
async function tokenDaRefresh(): Promise<{ token: string | null; errore: string | null }> {
  const o = await oauthConfigurato();
  if (!o.id || !o.segreto || !o.refresh) return { token: null, errore: null };
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: o.id,
        client_secret: o.segreto,
        refresh_token: o.refresh,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    const d = (await r.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!r.ok || !d.access_token) {
      // Il consenso può decadere: succede se l'app OAuth è in "Test", dove
      // Google fa scadere il collegamento dopo 7 giorni. Va detto così, o
      // sembra un guasto invece di una scadenza prevista.
      return {
        token: null,
        errore: `Il collegamento a Drive non è più valido (${d.error ?? r.status}): premi di nuovo «Collega Drive». Se succede ogni settimana, l'app OAuth è in stato "Test" — pubblicala per non ripetere il consenso.`,
      };
    }
    return { token: d.access_token, errore: null };
  } catch (e) {
    return { token: null, errore: `Rinnovo del collegamento fallito: ${String(e).slice(0, 140)}` };
  }
}
const PERCORSO_OUT = ["ads", "App Azioni", "OUT - dall'app"];

type Credenziali = { client_email: string; private_key: string };

async function credenziali(): Promise<Credenziali | null> {
  // ⚠️ L'AMBIENTE COMANDA (vedi `lib/segreti.ts`). Qui il ripiego c'era già,
  // ma nell'ordine sbagliato: il valore del database vinceva, quindi una
  // chiave privata messa fra le variabili lasciava comunque quella vecchia
  // attiva e leggibile in chiaro.
  const grezzo = (await segreto(IMP_SERVICE_ACCOUNT)) ?? "";
  if (!grezzo) return null;
  try {
    const j = JSON.parse(grezzo) as Partial<Credenziali>;
    if (!j.client_email || !j.private_key) return null;
    // Le chiavi incollate da un campo di testo arrivano spesso con "\n"
    // letterali al posto degli a capo: senza questo la firma non parte.
    return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

export async function emailServizio(): Promise<string | null> {
  return (await credenziali())?.client_email ?? null;
}

export async function emailImpersonata(): Promise<string | null> {
  const r = await prisma.impostazione.findUnique({ where: { chiave: IMP_IMPERSONA } }).catch(() => null);
  const v = (r?.valore ?? "").trim();
  return v || null;
}

// Il token dura un'ora: si tiene finché vale, altrimenti ogni scrittura
// pagherebbe una chiamata in più solo per farsi riconoscere.
let cache: { token: string; scade: number; perConto: string | null } | null = null;

async function token(): Promise<{ token: string | null; errore: string | null }> {
  // Il collegamento come utente viene PRIMA: se c'è, è quello che funziona
  // anche su un account Gmail, dove l'account di servizio non può possedere
  // file. Non si tiene in cache perché Google lo rinnova già da sé a ogni
  // scambio ed è una chiamata sola.
  const daUtente = await tokenDaRefresh();
  if (daUtente.token) return daUtente;
  if (daUtente.errore) return daUtente;

  const perContoOra = await emailImpersonata();
  if (cache && cache.scade > Date.now() + 60_000 && cache.perConto === perContoOra) {
    return { token: cache.token, errore: null };
  }
  const c = await credenziali();
  if (!c) {
    return {
      token: null,
      errore:
        "Drive non è collegato: premi «Collega Drive» in Impostazioni (oppure incolla la chiave di un account di servizio, se la cartella è su un dominio Workspace).",
    };
  }

  const adesso = Math.floor(Date.now() / 1000);
  const intestazione = { alg: "RS256", typ: "JWT" };
  const perConto = await emailImpersonata();
  const corpo = {
    iss: c.client_email,
    // "sub" = per conto di chi. Con questo il file nasce nel Drive di quella
    // persona e usa il suo spazio; senza, l'account di servizio prova a
    // possederlo lui e Google rifiuta perché non ha spazio.
    ...(perConto ? { sub: perConto } : {}),
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: adesso,
    exp: adesso + 3600,
  };
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const daFirmare = `${b64(intestazione)}.${b64(corpo)}`;

  let firma: string;
  try {
    const s = createSign("RSA-SHA256");
    s.update(daFirmare);
    firma = s.sign(c.private_key, "base64url");
  } catch (e) {
    return { token: null, errore: `Chiave privata non valida: ${String(e).slice(0, 140)}` };
  }

  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${daFirmare}.${firma}`,
      }),
      cache: "no-store",
    });
    const d = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!r.ok || !d.access_token) {
      return { token: null, errore: `Google ha rifiutato la credenziale: ${d.error_description ?? d.error ?? r.status}` };
    }
    cache = { token: d.access_token, scade: Date.now() + (d.expires_in ?? 3600) * 1000, perConto: perContoOra };
    return { token: d.access_token, errore: null };
  } catch (e) {
    return { token: null, errore: `Chiamata a Google fallita: ${String(e).slice(0, 140)}` };
  }
}

async function figlia(idPadre: string, nome: string, t: string): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  // Il nome va fra apici singoli e gli apici interni raddoppiati: "OUT - dall'app"
  // ne contiene uno, e senza questo la query è malformata.
  const nomeQuery = nome.replace(/'/g, "\\'");
  url.searchParams.set(
    "q",
    `'${idPadre}' in parents and name = '${nomeQuery}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
  if (!r.ok) return null;
  const d = (await r.json()) as { files?: { id: string }[] };
  return d.files?.[0]?.id ?? null;
}

export type StatoDrive = {
  configurato: boolean;
  // "utente" = consenso OAuth · "servizio" = account di servizio
  via: "utente" | "servizio" | null;
  email: string | null;
  cartellaOut: string | null;
  errore: string | null;
};

/** Dove siamo: credenziale a posto? cartella OUT raggiungibile? */
export async function statoScritturaDrive(): Promise<StatoDrive> {
  const o = await oauthConfigurato();
  const c = await credenziali();
  const via = o.refresh ? "utente" : c ? "servizio" : null;
  const chi = o.refresh ? o.email : c?.client_email ?? null;
  if (!via) return { configurato: false, via: null, email: null, cartellaOut: null, errore: null };

  const { token: t, errore } = await token();
  if (!t) return { configurato: true, via, email: chi, cartellaOut: null, errore };

  const radice = idCartellaDrive(await driveDir());
  if (!radice) {
    return {
      configurato: true,
      via,
      email: chi,
      cartellaOut: null,
      errore:
        "La cartella impostata è un percorso su disco, non un link di Google Drive: la scrittura ha bisogno del link della cartella condivisa.",
    };
  }

  let corrente = radice;
  for (const passo of PERCORSO_OUT) {
    const trovata = await figlia(corrente, passo, t);
    if (!trovata) {
      return {
        configurato: true,
        via,
        email: chi,
        cartellaOut: null,
        errore:
          via === "utente"
            ? `Non trovo la cartella "${passo}". Il percorso atteso è ads/App Azioni/OUT - dall'app dentro la cartella impostata, e ${chi ?? "l'account collegato"} deve poterla vedere.`
            : `Non trovo la cartella "${passo}". O il percorso ads/App Azioni/OUT - dall'app non esiste, o la cartella non è condivisa con ${chi} come Editor.`,
      };
    }
    corrente = trovata;
  }
  return { configurato: true, via, email: chi, cartellaOut: corrente, errore: null };
}

export type EsitoScrittura =
  | { ok: true; id: string; nome: string }
  | { ok: false; errore: string };

/**
 * Deposita un file NUOVO in `OUT - dall'app`.
 *
 * Non sovrascrive e non modifica niente: se il nome esiste già si ferma. Il
 * protocollo è append-only, e "append-only" applicato davvero vuol dire che un
 * secondo invio con lo stesso nome deve fallire, non sostituire il primo.
 */
export async function scriviInOut(nome: string, contenuto: string): Promise<EsitoScrittura> {
  if (!nome.endsWith(".md")) return { ok: false, errore: "Si scrivono solo file .md." };
  if (/[\\/]/.test(nome)) return { ok: false, errore: "Il nome non può contenere percorsi: si scrive solo dentro OUT - dall'app." };
  if (!contenuto.trim()) return { ok: false, errore: "Contenuto vuoto: non si deposita un file senza testo." };

  const stato = await statoScritturaDrive();
  if (!stato.cartellaOut) {
    return { ok: false, errore: stato.errore ?? "Scrittura su Drive non configurata." };
  }
  const { token: t } = await token();
  if (!t) return { ok: false, errore: "Credenziale non valida." };

  // Esiste già? Append-only: ci si ferma, non si sovrascrive.
  const cerca = new URL("https://www.googleapis.com/drive/v3/files");
  cerca.searchParams.set("q", `'${stato.cartellaOut}' in parents and name = '${nome.replace(/'/g, "\\'")}' and trashed = false`);
  cerca.searchParams.set("fields", "files(id,name)");
  cerca.searchParams.set("supportsAllDrives", "true");
  cerca.searchParams.set("includeItemsFromAllDrives", "true");
  const rc = await fetch(cerca, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
  if (rc.ok) {
    const d = (await rc.json()) as { files?: { id: string }[] };
    if (d.files && d.files.length > 0) {
      return {
        ok: false,
        errore: `Esiste già un file chiamato "${nome}": il protocollo è append-only, un evento nuovo vuole un nome nuovo (di solito basta l'ora).`,
      };
    }
  }

  const confine = "-".repeat(24) + Date.now().toString(36);
  const corpo =
    `--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: nome, parents: [stato.cartellaOut], mimeType: "text/markdown" }) +
    `\r\n--${confine}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n` +
    contenuto +
    `\r\n--${confine}--`;

  try {
    const r = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": `multipart/related; boundary=${confine}` },
        body: corpo,
      }
    );
    const d = (await r.json()) as { id?: string; name?: string; error?: { message?: string } };
    if (!r.ok || !d.id) {
      const msg = d.error?.message ?? "errore sconosciuto";
      if (/storage quota/i.test(msg)) {
        return {
          ok: false,
          errore:
            "Un account di servizio non ha spazio su Drive e non può possedere file. Due uscite: (a) scrivere PER CONTO DI una persona — compila «Agisci per conto di» qui sotto e autorizza la delega nella Console di amministrazione; (b) spostare la cartella in un Drive condiviso, dove i file appartengono al drive e non a una persona.",
        };
      }
      return { ok: false, errore: `Drive ha risposto ${r.status}: ${msg}` };
    }
    return { ok: true, id: d.id, nome: d.name ?? nome };
  } catch (e) {
    return { ok: false, errore: `Scrittura fallita: ${String(e).slice(0, 160)}` };
  }
}
