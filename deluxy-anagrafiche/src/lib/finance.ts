import { prisma } from "./db";
import { leggiSoggetto } from "./soggetto-fiscale";

// Quando un'azienda diventa ATTIVA nel registro è un cliente vero: da lì in poi
// le si fanno fatture, si incassa e la si paga — cose che vivono in FINANCE
// (deluxy-partner). Finché qualcuno non la creava lì a mano, il partner
// semplicemente non esisteva e il primo che cercava di fatturarlo non lo
// trovava. Questo è il richiamo che lo fa nascere.
//
// ⚠️ SERVE L'ALTRA META'. FINANCE oggi espone solo API in **lettura**
// (`/api/clienti/stato`, `/api/v1/movimenti`, `/api/riepilogo-finanziario`):
// l'endpoint chiamato qui — `POST /api/v1/partners` — **va ancora scritto in
// `deluxy-partner`**. Finché non c'è (o finché mancano le due variabili), questa
// funzione è **inerte**: registra il motivo e non tocca niente. Non fa fallire
// il cambio di stato: diventare cliente non può dipendere dal fatto che
// un'altra app risponda.
//
// Contratto atteso dall'endpoint (idempotente, va bene richiamarlo mille volte):
//   1. se esiste già un partner con quell'`anagraficaId` → aggiorna e basta;
//   2. altrimenti, se ne esiste uno con lo **stesso nome** → gli attacca
//      l'`anagraficaId` (NON ne crea un doppione: in FINANCE `nome` è @unique
//      e i clienti storici ci sono già, senza id del registro);
//   3. solo se non c'è nessuno dei due → lo crea.
// Risposta attesa: `{ esito: "creato" | "collegato" | "aggiornato", id }`.

type Esito =
  | { ok: true; esito: string; id?: string }
  | { ok: false; motivo: "non_configurato" | "errore"; dettaglio?: string };

function url(): string | null {
  const v = (process.env.FINANCE_URL ?? "https://deluxy-partner.vercel.app").trim();
  return v || null;
}

function chiave(): string | null {
  // BOM e a-capo invisibili incollati nelle env fanno fallire l'header con un
  // errore illeggibile (ByteString ... 65279): si puliscono qui.
  const v = process.env.FINANCE_API_KEY?.replace(/^﻿/, "").trim();
  return v || null;
}

export async function creaPartnerInFinance(partnerId: string): Promise<Esito> {
  const base = url();
  const key = chiave();
  if (!base || !key) {
    return { ok: false, motivo: "non_configurato", dettaglio: "manca FINANCE_API_KEY" };
  }

  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: { capogruppo: { select: { nome: true } }, soggettoFiscale: true },
  });
  if (!p) return { ok: false, motivo: "errore", dettaglio: "anagrafica non trovata" };

  // ⚠️ I dati di fatturazione sono della SOCIETÀ collegata a questa sede, non
  // dell'insegna: due negozi con la stessa insegna possono fatturare con due
  // società diverse, e mandare a FINANCE quella dell'altro negozio vuol dire
  // fatturare — o pagare — il soggetto sbagliato.
  const fin = leggiSoggetto(p);

  const corpo = {
    anagraficaId: p.id,
    // In FINANCE il nome è la chiave: si manda quello del registro così come è
    // scritto, città inclusa quando c'è, perché «CHANEL» e «CHANEL ROMA» sono
    // due schede diverse e unirle vorrebbe dire fatturare la sede sbagliata.
    nome: [p.nome, p.citta].filter(Boolean).join(" "),
    // La ragione sociale che conta per fatturare è quella di CHI FATTURA.
    ragioneSociale: fin.ragioneSociale ?? p.ragioneSociale,
    categoria: p.categoria,
    citta: p.citta,
    email: p.email,
    telefono: p.telefono,
    pIva: fin.pIva,
    codiceFiscale: fin.codiceFiscale,
    iban: fin.iban,
    intestatarioConto: fin.intestatarioConto,
    ammNome: fin.amministrazioneNome,
    ammEmail: fin.amministrazioneEmail,
    ammTelefono: fin.amministrazioneTelefono,
    // Se paga una centrale per tutte le sedi, FINANCE deve saperlo prima di
    // mandare un sollecito alla sede sbagliata.
    gruppo: fin.gruppoPagamento,
  };

  try {
    const res = await fetch(`${base}/api/v1/partners`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "x-app": "anagrafiche" },
      body: JSON.stringify(corpo),
      // FINANCE che ci mette troppo non deve tenere in ostaggio il click.
      signal: AbortSignal.timeout(8000),
    });
    const testo = await res.text();
    if (!res.ok) return { ok: false, motivo: "errore", dettaglio: `HTTP ${res.status} ${testo.slice(0, 200)}` };
    const dati = testo ? JSON.parse(testo) : {};
    return { ok: true, esito: dati.esito ?? "ok", id: dati.id };
  } catch (e) {
    return { ok: false, motivo: "errore", dettaglio: e instanceof Error ? e.message : String(e) };
  }
}

// Da chiamare dentro `after()`: qualunque cosa vada storta finisce nei log del
// server, mai addosso a chi ha cliccato.
export async function segnalaClienteAFinance(partnerId: string, nome: string): Promise<void> {
  const esito = await creaPartnerInFinance(partnerId);
  if (esito.ok) {
    console.log(`[finance] «${nome}» → ${esito.esito}${esito.id ? ` (${esito.id})` : ""}`);
  } else if (esito.motivo === "non_configurato") {
    console.warn(`[finance] «${nome}» non inviato a FINANCE: ${esito.dettaglio}`);
  } else {
    console.error(`[finance] «${nome}» NON creato in FINANCE: ${esito.dettaglio}`);
  }
}
