// I negozi Shopify che Merchandising può interrogare.
//
// Il token è per negozio (Shopify non ne ha uno che li apra tutti) e lo imposta
// una persona da Impostazioni: qui non si indovina niente e non si eredita
// nulla da altre app. Nel database sta cifrato; in pagina non si rimostra mai.
//
// Prima di usarlo si può **verificare**: l'app chiede a Shopify quali permessi
// ha davvero quel token e prova a leggere una collezione. Meglio scoprirlo con
// un bottone che con un import che muore a metà.

import { cifra, cifraturaConfigurata, decifra, impronta } from "./crypto";
import { prisma } from "./db";

export const VERSIONE_API = "2024-10";

export type Permesso = {
  scope: string;
  cosaSblocca: string;
  livello: "obbligatorio" | "consigliato" | "opzionale";
};

// Il catalogo dei permessi da chiedere nell'app Shopify. È anche la lista con
// cui la verifica dice che cosa manca: sta scritto qui una volta sola.
export const PERMESSI: Permesso[] = [
  {
    scope: "read_products",
    cosaSblocca:
      "Leggere prodotti, varianti, SKU, prezzi, immagini, tag, tipo — e le collezioni con i prodotti che contengono.",
    livello: "obbligatorio",
  },
  {
    scope: "write_products",
    cosaSblocca:
      "Creare e modificare prodotti e collezioni, cambiare l'ordine dei prodotti dentro una collezione, aggiungere o togliere prodotti da una collezione.",
    livello: "obbligatorio",
  },
  {
    scope: "read_inventory",
    cosaSblocca: "Leggere le giacenze per magazzino: è il dato che oggi manca alle ipotesi di ordinativo.",
    livello: "consigliato",
  },
  {
    scope: "write_inventory",
    cosaSblocca: "Correggere le giacenze da qui invece che dall'admin Shopify.",
    livello: "consigliato",
  },
  {
    scope: "read_publications",
    cosaSblocca: "Sapere su quali canali (Negozio online, Google, Meta) un prodotto è pubblicato.",
    livello: "consigliato",
  },
  {
    scope: "write_publications",
    cosaSblocca: "Pubblicare o togliere dalla vetrina un prodotto: senza, un prodotto creato resta invisibile sul sito.",
    livello: "consigliato",
  },
  {
    scope: "read_files",
    cosaSblocca: "Leggere le immagini e i media della libreria del negozio.",
    livello: "consigliato",
  },
  {
    scope: "write_files",
    cosaSblocca: "Caricare gli still-life dei prodotti su Shopify.",
    livello: "consigliato",
  },
  {
    scope: "read_translations",
    cosaSblocca: "Leggere le schede prodotto nelle altre lingue del negozio.",
    livello: "opzionale",
  },
  {
    scope: "write_translations",
    cosaSblocca: "Scrivere le traduzioni delle schede prodotto.",
    livello: "opzionale",
  },
  {
    scope: "read_metaobjects",
    cosaSblocca: "Leggere i metaobject che i temi usano per i contenuti di prodotto.",
    livello: "opzionale",
  },
  {
    scope: "write_metaobjects",
    cosaSblocca: "Scrivere quei metaobject.",
    livello: "opzionale",
  },
];

export const PERMESSI_OBBLIGATORI = PERMESSI.filter((p) => p.livello === "obbligatorio").map((p) => p.scope);

export type NegozioInElenco = {
  id: string;
  nome: string;
  dominio: string;
  attivo: boolean;
  // "credenziali" = Client ID + Secret (l'app si conia il token da sola);
  // "token" = token statico incollato a mano.
  modo: "credenziali" | "token" | "nessuno";
  tokenScadeIl: Date | null;
  tokenImpronta: string;
  verificatoIl: Date | null;
  permessi: string[];
  permessiMancanti: string[];
  esitoVerifica: string | null;
  messaggio: string | null;
};

/** Elenco dei negozi, senza mai toccare i segreti. */
export async function elencoNegozi(): Promise<NegozioInElenco[]> {
  const righe = await prisma.negozioShopify.findMany({ orderBy: { nome: "asc" } });
  return righe.map((n) => {
    const permessi = (n.permessi ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return {
      id: n.id,
      nome: n.nome,
      dominio: n.dominio,
      attivo: n.attivo,
      modo: n.clientIdCifrato && n.clientSecretCifrato ? "credenziali" : n.tokenCifrato ? "token" : "nessuno",
      tokenScadeIl: n.tokenScadeIl,
      tokenImpronta: n.tokenImpronta,
      verificatoIl: n.verificatoIl,
      permessi,
      permessiMancanti: n.verificatoIl ? PERMESSI_OBBLIGATORI.filter((p) => !permessi.includes(p)) : [],
      esitoVerifica: n.esitoVerifica,
      messaggio: n.messaggio,
    };
  });
}

/**
 * Conia un token Admin con il **client credentials grant**: è il flusso delle
 * app della Dev Dashboard, quelle che hanno Client ID e Secret invece di un
 * token da incollare. Nessun redirect, nessun segreto che vive per sempre: il
 * token dura circa 24 ore e si rifà quando serve.
 */
export async function coniaToken(
  dominio: string,
  clientId: string,
  clientSecret: string
): Promise<{ token: string; scadeIl: Date }> {
  const res = await fetch(`https://${dominio}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const corpo = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !corpo.access_token) {
    throw new Error(
      corpo.error_description ||
        corpo.error ||
        `Il negozio ha rifiutato Client ID e Secret (HTTP ${res.status}). Controlla che l'app sia installata su questo negozio.`
    );
  }
  // Si rinnova cinque minuti prima della scadenza vera: un token che scade in
  // mezzo a un import è il modo peggiore di scoprire che era ora.
  const durata = Math.max(60, (corpo.expires_in ?? 86400) - 300);
  return { token: corpo.access_token, scadeIl: new Date(Date.now() + durata * 1000) };
}

/**
 * Il token valido di un negozio: coniato al volo se ci sono le credenziali e
 * quello in cassa è scaduto, altrimenti il token statico.
 * Solo per le chiamate, mai per la UI.
 */
export async function tokenDi(id: string): Promise<{ dominio: string; token: string } | null> {
  const n = await prisma.negozioShopify.findUnique({ where: { id } });
  if (!n) return null;
  return { dominio: n.dominio, token: await tokenValido(n) };
}

type RigaNegozio = {
  id: string;
  dominio: string;
  clientIdCifrato: string | null;
  clientSecretCifrato: string | null;
  tokenCifrato: string | null;
  tokenScadeIl: Date | null;
};

async function tokenValido(n: RigaNegozio): Promise<string> {
  if (n.clientIdCifrato && n.clientSecretCifrato) {
    const ancoraBuono = n.tokenCifrato && n.tokenScadeIl && n.tokenScadeIl.getTime() > Date.now();
    if (ancoraBuono) return decifra(n.tokenCifrato as string);
    const { token, scadeIl } = await coniaToken(
      n.dominio,
      decifra(n.clientIdCifrato),
      decifra(n.clientSecretCifrato)
    );
    await prisma.negozioShopify.update({
      where: { id: n.id },
      data: { tokenCifrato: cifra(token), tokenImpronta: impronta(token), tokenScadeIl: scadeIl },
    });
    return token;
  }
  if (n.tokenCifrato) return decifra(n.tokenCifrato);
  throw new Error("Negozio senza credenziali: né Client ID/Secret né token statico.");
}

/** I negozi utilizzabili per un import (attivi e con un modo di autenticarsi). */
export async function negoziAttivi(): Promise<{ id: string; nome: string; dominio: string; token: string }[]> {
  const righe = await prisma.negozioShopify.findMany({ where: { attivo: true }, orderBy: { nome: "asc" } });
  const fuori: { id: string; nome: string; dominio: string; token: string }[] = [];
  for (const n of righe) {
    try {
      fuori.push({ id: n.id, nome: n.nome, dominio: n.dominio, token: await tokenValido(n) });
    } catch {
      // Un negozio che non sa autenticarsi non blocca gli altri: sparisce dalla
      // lista e il suo stato si vede in Impostazioni.
    }
  }
  return fuori;
}

function normalizzaDominio(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export type EsitoSalvataggio = { ok: true; id: string } | { ok: false; errore: string };

/**
 * Crea o aggiorna un negozio. Il token è facoltativo in aggiornamento: chi
 * cambia solo il dominio non deve ricopiarlo (e non potrebbe, non si rilegge).
 */
export async function salvaNegozio(dati: {
  id?: string | null;
  nome: string;
  dominio: string;
  token?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
}): Promise<EsitoSalvataggio> {
  const nome = dati.nome.trim();
  const dominio = normalizzaDominio(dati.dominio);
  const token = dati.token?.trim() || null;
  const clientId = dati.clientId?.trim() || null;
  const clientSecret = dati.clientSecret?.trim() || null;

  if (clientId && !clientSecret) return { ok: false, errore: "C'è il Client ID ma manca il Client Secret." };
  if (clientSecret && !clientId) return { ok: false, errore: "C'è il Client Secret ma manca il Client ID." };
  if (!nome) return { ok: false, errore: "Serve un nome per il negozio." };
  if (!/^[a-z0-9][a-z0-9.-]*\.myshopify\.com$/.test(dominio))
    return {
      ok: false,
      errore: `Dominio non valido: «${dominio}». Va usato quello tecnico del negozio, del tipo nome-negozio.myshopify.com (non il dominio del sito).`,
    };
  if (!cifraturaConfigurata())
    return {
      ok: false,
      errore: "APP_SECRET non è impostata: senza, il token non può essere cifrato e non lo salvo in chiaro.",
    };
  if (!dati.id && !token && !clientId)
    return {
      ok: false,
      errore: "Per un negozio nuovo servono il Client ID + Secret dell'app, oppure un token Admin API statico.",
    };

  // Cambiando modo di autenticarsi si azzera la verifica: quello che valeva per
  // il token vecchio non dice niente sulle credenziali nuove.
  const azzeraVerifica = { verificatoIl: null, permessi: null, esitoVerifica: null, messaggio: null };

  try {
    if (dati.id) {
      await prisma.negozioShopify.update({
        where: { id: dati.id },
        data: {
          nome,
          dominio,
          ...(clientId
            ? {
                clientIdCifrato: cifra(clientId),
                clientSecretCifrato: cifra(clientSecret as string),
                // Il token coniato col vecchio Client ID non serve più.
                tokenCifrato: null,
                tokenScadeIl: null,
                tokenImpronta: "",
                ...azzeraVerifica,
              }
            : {}),
          ...(token
            ? {
                tokenCifrato: cifra(token),
                tokenImpronta: impronta(token),
                tokenScadeIl: null,
                clientIdCifrato: null,
                clientSecretCifrato: null,
                ...azzeraVerifica,
              }
            : {}),
        },
      });
      return { ok: true, id: dati.id };
    }
    const creato = await prisma.negozioShopify.create({
      data: {
        nome,
        dominio,
        ...(clientId
          ? { clientIdCifrato: cifra(clientId), clientSecretCifrato: cifra(clientSecret as string) }
          : { tokenCifrato: cifra(token as string), tokenImpronta: impronta(token as string) }),
      },
    });
    return { ok: true, id: creato.id };
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : "Errore sconosciuto";
    if (messaggio.includes("Unique constraint")) return { ok: false, errore: `Esiste già un negozio chiamato «${nome}».` };
    return { ok: false, errore: messaggio };
  }
}

/**
 * Chiede a Shopify che permessi ha il token e prova a leggere una collezione e
 * un prodotto. Salva l'esito sul negozio, così in pagina si vede sempre lo
 * stato reale invece dell'intenzione.
 */
export async function verificaNegozio(id: string): Promise<void> {
  const n = await prisma.negozioShopify.findUnique({ where: { id } });
  if (!n) return;

  let permessi: string[] = [];
  let esito = "ok";
  let messaggio = "";

  try {
    // Se il negozio va a Client ID + Secret, questa è anche la prova che il
    // grant funziona: senza token coniato non si arriva nemmeno agli scope.
    const token = await tokenValido(n);

    const rScope = await fetch(`https://${n.dominio}/admin/oauth/access_scopes.json`, {
      headers: { "X-Shopify-Access-Token": token },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (rScope.status === 401 || rScope.status === 403) {
      throw new Error("Token rifiutato dal negozio (401/403): controlla di aver copiato il token Admin API giusto.");
    }
    if (!rScope.ok) throw new Error(`Il negozio ha risposto ${rScope.status} alla richiesta dei permessi.`);
    const corpoScope = (await rScope.json()) as { access_scopes?: { handle: string }[] };
    permessi = (corpoScope.access_scopes ?? []).map((s) => s.handle).sort();

    // Prova sul campo, non solo sulla dichiarazione: i permessi possono esserci
    // e la chiamata fallire lo stesso (app non installata, negozio in pausa).
    const rProva = await fetch(`https://${n.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({
        // Si chiedono anche i metafield di un prodotto: sulla carta stanno dentro
        // read_products, ma è il tipo di cosa che si dichiara e poi non funziona.
        // Meglio provarla qui che scoprirlo a import avviato.
        query: `{
          collections(first: 1) { nodes { id title } }
          productsCount { count }
          products(first: 1) { nodes { id metafields(first: 5) { nodes { namespace key } } } }
        }`,
      }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const corpoProva = (await rProva.json().catch(() => ({}))) as {
      data?: {
        collections?: { nodes?: unknown[] };
        productsCount?: { count?: number };
        products?: { nodes?: { metafields?: { nodes?: { namespace: string; key: string }[] } }[] };
      };
      errors?: { message: string }[];
    };
    if (corpoProva.errors?.length) {
      esito = "errore";
      messaggio = corpoProva.errors.map((e) => e.message).join(" · ");
    } else {
      const quanti = corpoProva.data?.productsCount?.count;
      const metafield = corpoProva.data?.products?.nodes?.[0]?.metafields?.nodes;
      messaggio =
        `Collezioni e prodotti leggibili${quanti != null ? ` (${quanti} prodotti sul negozio)` : ""}.` +
        (metafield
          ? ` Metafield leggibili${metafield.length ? ` (es. ${metafield.slice(0, 3).map((m) => `${m.namespace}.${m.key}`).join(", ")})` : " (il primo prodotto non ne ha)"}.`
          : "");
    }

    const mancanti = PERMESSI_OBBLIGATORI.filter((p) => !permessi.includes(p));
    if (mancanti.length > 0) {
      esito = "errore";
      messaggio = `Permessi mancanti: ${mancanti.join(", ")}. ${messaggio}`.trim();
    }
  } catch (e) {
    esito = "errore";
    messaggio = e instanceof Error ? e.message : "Errore sconosciuto durante la verifica.";
  }

  await prisma.negozioShopify.update({
    where: { id },
    data: { verificatoIl: new Date(), permessi: permessi.join(","), esitoVerifica: esito, messaggio },
  });
}
