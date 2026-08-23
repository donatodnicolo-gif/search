import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { tokenApiConfigurato } from '@/lib/apiAuth'
import { db } from '@/lib/db'
import { cifra } from '@/lib/crypto'
import { hashPassword } from '@/lib/password'
import { provaConnessione } from '@/lib/imap'

// GET  /api/v1/caselle → le caselle collegate (SENZA segreti)
// POST /api/v1/caselle → collega una casella nuova (utente + IMAP/SMTP cifrati)
//
// PERCHÉ ESISTE. Deluxy Scout legge da qui la posta delle «Richieste Web»
// (`/api/v1/messaggi?casella=1`, header `x-utente` = email della casella), ma
// se quella casella in AI Mail non c'è l'import risponde 404 e l'unica strada
// era venire qui a crearla a mano. Richiesta dell'utente il 21/08/2026:
// «consentimi di impostare le credenziali mail direttamente da qui».
//
// ⚠️ LE CREDENZIALI RESTANO QUI, cifrate (AES-256-GCM con APP_SECRET, come
// quelle inserite dall'interfaccia). Scout le raccoglie e le inoltra, non le
// conserva: due app che custodiscono la stessa password sono due posti da cui
// può uscire, e due posti da aggiornare quando cambia.
//
// AUTENTICAZIONE: **solo** `x-api-key`. Le altre rotte v1 vogliono anche
// `x-utente` (l'utente su cui operare), ma qui l'utente è proprio ciò che si
// sta creando: chiederlo renderebbe la rotta inutilizzabile al primo uso.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Confronto a tempo costante: su una chiave, `!==` esce al primo byte diverso. */
function uguali(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

async function autorizza(
  req: Request,
): Promise<{ ok: true } | { ok: false; errore: string; status: number }> {
  const { token } = await tokenApiConfigurato()
  if (!token) {
    return {
      ok: false,
      status: 503,
      errore: 'API non configurata: nessun token (generalo in Impostazioni App o imposta API_TOKEN).',
    }
  }
  const data = (
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
  if (!data || !uguali(data, token)) {
    return { ok: false, status: 401, errore: 'Non autorizzato: chiave API errata o mancante.' }
  }
  return { ok: true }
}

export async function GET(request: Request) {
  const auth = await autorizza(request)
  if (!auth.ok) return NextResponse.json({ ok: false, errore: auth.errore }, { status: auth.status })

  const righe = await db.account.findMany({
    select: {
      email: true,
      nome: true,
      imapHost: true,
      cartella: true,
      utente: { select: { email: true, attivo: true } },
    },
    orderBy: { email: 'asc' },
  })

  // Chi legge deve sapere quale valore mettere in `x-utente`: è l'email
  // dell'UTENTE, non quella della casella — spesso coincidono, ma non sempre
  // (info@deluxyflowers.com, per dire, è una casella dell'utente cs@deluxy.it).
  return NextResponse.json({
    ok: true,
    caselle: righe.map((r) => ({
      email: r.email,
      nome: r.nome,
      imapHost: r.imapHost,
      cartella: r.cartella,
      utente: r.utente?.email ?? null,
      attivo: r.utente?.attivo ?? false,
    })),
  })
}

export async function POST(request: Request) {
  const auth = await autorizza(request)
  if (!auth.ok) return NextResponse.json({ ok: false, errore: auth.errore }, { status: auth.status })

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const testo = (k: string) => String(b[k] ?? '').trim()

  const email = testo('email').toLowerCase()
  const imapHost = testo('imapHost')
  const imapPassword = testo('imapPassword')
  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, errore: 'Manca l’indirizzo della casella.' }, { status: 400 })
  }
  if (!imapHost || !imapPassword) {
    return NextResponse.json(
      { ok: false, errore: 'Servono almeno il server IMAP e la password della casella.' },
      { status: 400 },
    )
  }

  const dati = {
    nome: testo('nome') || email,
    email,
    imapHost,
    imapPort: Number(testo('imapPort') || 993),
    imapSicuro: b.imapSicuro === undefined ? true : Boolean(b.imapSicuro),
    imapUtente: testo('imapUtente') || email,
    imapPassword,
    // Chi manda e chi riceve stanno quasi sempre sullo stesso provider: se lo
    // SMTP non è indicato si riusa l'IMAP invece di lasciare la casella monca.
    smtpHost: testo('smtpHost') || imapHost.replace(/^(imap|pop)\./i, 'smtp.'),
    smtpPort: Number(testo('smtpPort') || 465),
    smtpSicuro: b.smtpSicuro === undefined ? true : Boolean(b.smtpSicuro),
    smtpUtente: testo('smtpUtente') || testo('imapUtente') || email,
    smtpPassword: testo('smtpPassword') || imapPassword,
    cartella: testo('cartella') || 'INBOX',
    // Register.it presenta un certificato per *.securemail.pro: senza questo
    // flag la connessione fallisce sul nome del certificato, non sui dati.
    ignoraCertTls: Boolean(b.ignoraCertTls),
  }

  // ⚠️ SI PROVA PRIMA DI SCRIVERE. Meglio scoprire adesso che host o password
  // sono sbagliati, non al primo sync — e soprattutto senza lasciare in giro un
  // utente creato a metà per una password che non funziona.
  try {
    await provaConnessione({
      ...dati,
      imapPassword: cifra(dati.imapPassword),
      id: '',
      ultimoUid: 0,
    } as never)
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        errore: `La casella non risponde: ${e instanceof Error ? e.message : 'errore di connessione'}`,
        suggerimento:
          'Controlla server, porta e password. Con Register.it il server è pop.securemail.pro e serve «ignora certificato TLS».',
      },
      { status: 400 },
    )
  }

  // L'utente di AI Mail su cui vive la casella. Se non c'è si crea: è lui che
  // Scout indicherà come `x-utente` quando legge la posta.
  let utente = await db.utente.findUnique({ where: { email }, select: { id: true, attivo: true } })
  let utenteCreato = false
  if (!utente) {
    utente = await db.utente.create({
      data: {
        email,
        nome: testo('nome') || email.split('@')[0],
        // Nessuno entra in AI Mail come questa casella: è una casella di
        // servizio, letta via API. Password casuale e non comunicata — se
        // servisse l'accesso si reimposta dalla schermata Utenti.
        passwordHash: hashPassword(testo('passwordAccesso') || crypto.randomBytes(24).toString('hex')),
        ruolo: 'utente',
      },
      select: { id: true, attivo: true },
    })
    utenteCreato = true
  } else if (!utente.attivo) {
    await db.utente.update({ where: { id: utente.id }, data: { attivo: true } })
  }

  const esistente = await db.account.findFirst({
    where: { utenteId: utente.id, email },
    select: { id: true },
  })
  const daScrivere = {
    ...dati,
    imapPassword: cifra(dati.imapPassword),
    smtpPassword: cifra(dati.smtpPassword),
  }
  const account = esistente
    ? await db.account.update({ where: { id: esistente.id }, data: daScrivere, select: { id: true } })
    : await db.account.create({ data: { ...daScrivere, utenteId: utente.id }, select: { id: true } })

  return NextResponse.json({
    ok: true,
    casella: email,
    utente: email,
    accountId: account.id,
    creato: !esistente,
    utenteCreato,
  })
}
