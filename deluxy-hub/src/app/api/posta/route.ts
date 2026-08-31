import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { autenticaToken, erroreApi } from "@/lib/token-api";
import { configPosta, emailValida, mandaEmail } from "@/lib/posta";

// POST /api/posta — la casella del portale, prestata alle altre app Deluxy.
//
// Perché esiste: le credenziali SMTP hanno UNA casa sola, la cassaforte del Hub
// (Standard §7). Senza questa rotta ogni app che deve mandare un'email — a
// cominciare dal proprio recupero password — dovrebbe avere una copia della
// password della casella: cinque copie di un segreto sono cinque modi di
// perderlo, e cambiarlo diventerebbe un giro per cinque progetti.
//
// Auth: token di servizio (x-api-key o Bearer), come /api/chiavi e /api/presenze.
// Se il token è limitato per progetti, deve comprendere «posta»: un token nato
// per LEGGERE le chiavi non deve poter anche spedire a nome di Deluxy.
//
// Corpo: { a, oggetto, testo, html? } — un destinatario per chiamata.
// Header facoltativo: Idempotency-Key (una ripetizione non rispedisce).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Il freno a mano. Non è una preferenza: un endpoint che spedisce, senza tetto,
// è un relay per lo spam il giorno che un token gira. Se qualcosa impazzisce,
// meglio cento mail sbagliate che diecimila.
const TETTO_PER_TOKEN_ORA = 100;
const TETTO_TOTALE_ORA = 300;

const MAX_OGGETTO = 200;
const MAX_TESTO = 50_000;
const MAX_HTML = 200_000;

// Le caselle automatiche non ricevono posta automatica: scrivere a un
// «noreply» significa, nel migliore dei casi, un messaggio che nessuno leggerà;
// nel peggiore, un giro di rimbalzi fra due macchine. Elenco di prefissi: è un
// ripiego, non un rilevamento vero (le intestazioni Auto-Submitted non le
// abbiamo), e va trattato come tale.
const PREFISSI_AUTOMATICI = ["noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster", "bounce", "bounces"];

function mascheraEmail(a: string): string {
  const [locale, dominio] = a.split("@");
  if (!dominio) return "***";
  const testa = locale.slice(0, 2);
  return `${testa}${"*".repeat(Math.max(1, locale.length - 2))}@${dominio}`;
}

function hashEmail(a: string): string {
  return createHash("sha256").update(a.toLowerCase()).digest("hex");
}

async function registra(dati: {
  tokenNome: string;
  a: string;
  oggetto: string;
  esito: "inviata" | "rifiutata" | "errore";
  motivo?: string;
  chiaveIdempotenza?: string | null;
}) {
  try {
    await prisma.invioPosta.create({
      data: {
        tokenNome: dati.tokenNome,
        destinatarioMascherato: mascheraEmail(dati.a),
        destinatarioHash: hashEmail(dati.a),
        oggetto: dati.oggetto.slice(0, MAX_OGGETTO),
        esito: dati.esito,
        motivo: (dati.motivo ?? "").slice(0, 200),
        chiaveIdempotenza: dati.chiaveIdempotenza ?? null,
      },
    });
  } catch {
    // Il registro non deve far fallire un invio riuscito. Se salta la scrittura
    // (es. chiave di idempotenza in corsa), l'email è comunque partita.
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticaToken(req);
  if (auth instanceof NextResponse) return auth; // 401

  if (auth.progetti.length > 0 && !auth.progetti.includes("posta")) {
    return erroreApi(403, "Questo token non può mandare email (serve lo scope 'posta')");
  }

  // Fail-closed: se la posta non è configurata si dice 503, non «ok». Un 200
  // senza invio è la bugia peggiore: l'app chiamante crede di aver avvisato
  // qualcuno che non è stato avvisato.
  const config = await configPosta();
  if (!config) {
    return erroreApi(503, "La posta del portale non è configurata: impostala in /chiavi, progetto 'hub'");
  }

  let corpo: { a?: string; oggetto?: string; testo?: string; html?: string };
  try {
    corpo = await req.json();
  } catch {
    return erroreApi(400, "Corpo non valido: serve JSON { a, oggetto, testo, html? }");
  }

  const a = String(corpo.a ?? "").trim().toLowerCase();
  const oggetto = String(corpo.oggetto ?? "").trim();
  const testo = String(corpo.testo ?? "");
  const html = corpo.html ? String(corpo.html) : undefined;
  const chiaveIdempotenza = req.headers.get("idempotency-key")?.slice(0, 200) || null;

  if (!emailValida(a)) return erroreApi(400, "Destinatario non valido");
  if (!oggetto || oggetto.length > MAX_OGGETTO) return erroreApi(400, `Oggetto mancante o oltre ${MAX_OGGETTO} caratteri`);
  if (!testo || testo.length > MAX_TESTO) return erroreApi(400, `Testo mancante o oltre ${MAX_TESTO} caratteri`);
  if (html && html.length > MAX_HTML) return erroreApi(400, `HTML oltre ${MAX_HTML} caratteri`);

  const locale = a.split("@")[0];
  if (PREFISSI_AUTOMATICI.some((p) => locale === p || locale.startsWith(p + "+") || locale.startsWith(p + "."))) {
    await registra({ tokenNome: auth.nome, a, oggetto, esito: "rifiutata", motivo: "casella automatica", chiaveIdempotenza });
    return erroreApi(422, "Non si manda posta a una casella automatica");
  }

  // Ripetizione della stessa richiesta (retry dopo un errore di rete): si
  // risponde con l'esito della prima senza rispedire.
  if (chiaveIdempotenza) {
    const gia = await prisma.invioPosta.findUnique({ where: { chiaveIdempotenza } });
    if (gia) {
      return NextResponse.json(
        { ok: gia.esito === "inviata", ripetuta: true, esito: gia.esito, quando: gia.creatoIl },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const unOraFa = new Date(Date.now() - 60 * 60 * 1000);
  const [perToken, totale] = await Promise.all([
    prisma.invioPosta.count({ where: { tokenNome: auth.nome, esito: "inviata", creatoIl: { gte: unOraFa } } }),
    prisma.invioPosta.count({ where: { esito: "inviata", creatoIl: { gte: unOraFa } } }),
  ]);
  if (perToken >= TETTO_PER_TOKEN_ORA || totale >= TETTO_TOTALE_ORA) {
    await registra({ tokenNome: auth.nome, a, oggetto, esito: "rifiutata", motivo: "tetto orario raggiunto", chiaveIdempotenza });
    return erroreApi(429, "Tetto orario raggiunto: riprova più tardi");
  }

  try {
    await mandaEmail({ a, oggetto, testo, html });
  } catch (e) {
    const motivo = e instanceof Error ? e.message.slice(0, 200) : "errore sconosciuto";
    await registra({ tokenNome: auth.nome, a, oggetto, esito: "errore", motivo, chiaveIdempotenza });
    // Il motivo torna al chiamante: è un'app nostra, e «non è partita» senza
    // spiegazione manda a indovinare. Non contiene segreti (mai la password).
    return erroreApi(502, `Il server di posta ha rifiutato: ${motivo}`);
  }

  await registra({ tokenNome: auth.nome, a, oggetto, esito: "inviata", chiaveIdempotenza });
  return NextResponse.json(
    { ok: true, mittente: config.mittente },
    { headers: { "Cache-Control": "no-store" } },
  );
}
