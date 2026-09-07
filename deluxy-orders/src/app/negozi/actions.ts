"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizzaDominio, provaCollegamento, tokenDaClientCredentials, tokenNegozio } from "@/lib/shopify";

// Le azioni della pagina Negozi. Le altre (colore, nome in Ricerca fornitori,
// specialità, sospendi, elimina) restano in app/actions.ts, dove sono nate.

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

function torna(chiave: "esito" | "errore", messaggio: string): never {
  redirect(`/negozi?${chiave}=${encodeURIComponent(messaggio)}`);
}

// Salva un negozio E PROVA SUBITO se il collegamento funziona.
//
// ⚠️ Il salvataggio non è la prova: un token sbagliato si salva benissimo, e
// poi il negozio resta lì «attivo» senza portare un ordine. Qui si salva e si
// chiede a Shopify chi risponde, e il risultato lo dice la pagina — anche
// quando è un no.
export async function salvaNegozio(fd: FormData) {
  const brand = s(fd, "brand");
  const dominioGrezzo = s(fd, "dominio");
  if (!brand || !dominioGrezzo) torna("errore", "Servono il nome del brand e il dominio myshopify");

  const { dominio, motivo } = normalizzaDominio(dominioGrezzo);
  if (!dominio) torna("errore", `«${dominioGrezzo}» non va bene: ${motivo}`);

  const token = s(fd, "token");
  const clientId = s(fd, "clientId");
  const clientSecret = s(fd, "clientSecret");
  if (!token && !(clientId && clientSecret)) {
    torna("errore", "Serve un modo per entrare: o il token statico (shpat_…), o Client ID **e** Client Secret insieme");
  }
  if (token && !token.startsWith("shpat_")) {
    torna("errore", "Il token statico di Shopify comincia sempre per «shpat_»: quello incollato no — forse è il Client Secret, che va nel campo suo");
  }

  // Se ci sono le credenziali dell'app, il token si conia subito: così
  // l'errore di credenziali si vede ORA e non fra sei ore, alla prima sync.
  let tokenInUso = token ?? "";
  let scadeIl: Date | null = null;
  if (clientId && clientSecret) {
    try {
      const coniato = await tokenDaClientCredentials(dominio, clientId, clientSecret);
      tokenInUso = coniato.token;
      scadeIl = new Date(Date.now() + Math.max(60, coniato.expiresIn - 300) * 1000);
    } catch (e) {
      torna("errore", `Client ID/Secret non accettati da ${dominio}: ${(e as Error).message}`);
    }
  }

  const prova = await provaCollegamento(dominio, tokenInUso);

  const esistente = await prisma.negozioShopify.findUnique({ where: { brand } });
  await prisma.negozioShopify.upsert({
    where: { brand },
    create: { brand, dominio, token: tokenInUso, clientId, clientSecret, tokenScadeIl: scadeIl },
    // ⚠️ In aggiornamento il token si riscrive solo se ne è arrivato uno nuovo:
    // chi cambia soltanto il dominio o il colore non deve restare scollegato.
    update: {
      dominio,
      clientId,
      clientSecret,
      attivo: true,
      ...(tokenInUso ? { token: tokenInUso, tokenScadeIl: scadeIl } : {}),
    },
  });

  revalidatePath("/negozi");
  revalidatePath("/impostazioni");

  const verbo = esistente ? "aggiornato" : "aggiunto";
  if (prova.ok) torna("esito", `Negozio ${verbo}: ${prova.messaggio}. La prossima sincronizzazione porterà i suoi ordini.`);
  torna(
    "errore",
    `Negozio ${verbo}, ma NON è collegato: ${prova.messaggio}. Resta salvato — correggi le credenziali e premi «Prova il collegamento».`,
  );
}

// Prova un negozio già salvato: conia il token se serve, poi chiede a Shopify.
export async function provaNegozio(fd: FormData) {
  const id = s(fd, "id");
  if (!id) torna("errore", "Negozio non indicato");
  const neg = await prisma.negozioShopify.findUnique({ where: { id } });
  if (!neg) torna("errore", "Negozio non trovato");

  let token: string;
  try {
    token = await tokenNegozio(neg);
  } catch (e) {
    torna("errore", `${neg.brand}: ${(e as Error).message}`);
  }

  const prova = await provaCollegamento(neg.dominio, token);
  revalidatePath("/negozi");
  if (prova.ok) torna("esito", `${neg.brand} — ${prova.messaggio}`);
  torna("errore", `${neg.brand} non risponde: ${prova.messaggio}`);
}
