// **Che ogni prodotto pubblicato abbia le sue traduzioni**, anche quello che
// non è nato dal modulo dell'app.
//
// Chiesto dall'utente l'08/09/2026: «dobbiamo fare anche le traduzioni usando
// l'AI ed essere sicuri ci siano poi per ogni prodotto che carico». Il modulo
// traduce già ciò che crea; **l'import no** — legge e basta. Quindi un prodotto
// caricato dall'admin di Shopify, o arrivato con un negozio nuovo, resta senza
// traduzioni e nessuno se ne accorge. Questo modulo è il rastrello che passa
// dopo: lo usano il cron notturno e `scripts/traduci-mancanti.ts`.
//
// ⚠️ **Si scrive solo nelle lingue che il negozio ha davvero.** Misurato
// l'08/09: attive `en` su tutti e quattro, più `fr` su Flowers e `ru` su Gifts.
// Le altre Shopify le rifiuta con «Locale is not a valid locale for the shop»,
// e il rifiuto **fa cadere tutto il lotto**, comprese le lingue buone. Finché
// manca lo scope `read_locales` le lingue attive si deducono da quelle che
// hanno già traduzioni: un locale spento non può averne.

import { LINGUE_NEGOZIO, traduciScheda } from "./ai-traduzioni";
import { graphqlNegozio } from "./shopify-scrittura";
import { registraTraduzioniProdotto } from "./shopify-traduzioni-scrittura";

type Negozio = { nome: string; dominio: string; token: string };

const alias = (codice: string) => "t_" + codice.replace(/[^a-zA-Z0-9]/g, "_");
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le lingue davvero attive sul negozio, dedotte da chi ha già traduzioni. */
export async function lingueAttiveDi(n: Negozio): Promise<string[]> {
  const codici = LINGUE_NEGOZIO.map((l) => l.codice);
  const campi = codici.map((l) => `${alias(l)}: translations(locale:"${l}"){ value }`).join(" ");
  const r = await graphqlNegozio(n.dominio, n.token, `{ products(first: 50, query:"status:active"){ nodes{ ${campi} } } }`, {});
  const nodi = ((r.corpo.data as unknown as { products?: { nodes: Record<string, unknown>[] } })?.products?.nodes) ?? [];
  return codici.filter((l) =>
    nodi.some((p) => ((p[alias(l)] as { value: string | null }[] | undefined) ?? []).some((x) => x.value && x.value.trim()))
  );
}

export type EsitoTraduzioniNegozio = {
  negozio: string;
  lingueAttive: string[];
  esaminati: number;
  daTradurre: number;
  tradotti: number;
  falliti: number;
  messaggi: string[];
};

/**
 * Trova i prodotti pubblicati a cui manca una lingua **attiva** e li traduce,
 * fino a `max` per giro.
 *
 * Il tetto non è timidezza: è un cron con un budget: qui si spende a ogni riga
 * e si scrive su un negozio vero, quindi meglio un arretrato che cala ogni
 * notte che una corsa che finisce i soldi o il tempo della funzione a metà.
 */
export async function completaTraduzioniDelNegozio(n: Negozio, max = 20): Promise<EsitoTraduzioniNegozio> {
  const esito: EsitoTraduzioniNegozio = { negozio: n.nome, lingueAttive: [], esaminati: 0, daTradurre: 0, tradotti: 0, falliti: 0, messaggi: [] };
  const attive = await lingueAttiveDi(n);
  esito.lingueAttive = attive;
  if (attive.length === 0) {
    esito.messaggi.push("Nessuna lingua attiva riconosciuta su questo negozio: niente da tradurre.");
    return esito;
  }

  const campi = attive.map((l) => `${alias(l)}: translations(locale:"${l}"){ key value }`).join(" ");
  const daFare: { id: string; titolo: string; descrizione: string; mancanti: string[] }[] = [];
  let cursore: string | null = null;
  // Si scorre finché non si è riempito il lotto: i prodotti senza traduzione
  // possono stare in fondo al catalogo, e fermarsi alla prima pagina vorrebbe
  // dire non trovarli mai.
  for (let pagina = 0; pagina < 40 && daFare.length < max; pagina++) {
    const r = await graphqlNegozio(n.dominio, n.token,
      `query($c:String){ products(first: 25, after: $c, query: "status:active"){
         pageInfo { hasNextPage endCursor }
         nodes { id title descriptionHtml ${campi} }
       } }`, { c: cursore });
    const errori = r.corpo.errors?.map((e) => e.message) ?? [];
    if (errori.length) { esito.messaggi.push(`Lettura interrotta: ${errori.join("; ")}`); break; }
    const d = r.corpo.data?.products as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Record<string, unknown>[] };
    for (const p of d.nodes) {
      esito.esaminati++;
      const mancanti = attive.filter((l) => {
        const t = (p[alias(l)] as { key: string; value: string | null }[] | undefined) ?? [];
        return !t.some((x) => x.key === "title" && x.value && x.value.trim());
      });
      if (mancanti.length === 0) continue;
      if (daFare.length < max) {
        daFare.push({
          id: p.id as string,
          titolo: p.title as string,
          descrizione: ((p.descriptionHtml as string) ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          mancanti,
        });
      }
    }
    if (!d.pageInfo.hasNextPage) break;
    cursore = d.pageInfo.endCursor;
  }
  esito.daTradurre = daFare.length;

  for (const p of daFare) {
    const t = await traduciScheda({ titolo: p.titolo, descrizione: p.descrizione }, p.mancanti);
    if (!t.ok) {
      esito.falliti++;
      esito.messaggi.push(`«${p.titolo}»: ${t.errore}`);
      // Chiave rifiutata o quota finita non si risolvono insistendo.
      if (/401|quota|rate/i.test(t.errore)) { esito.messaggi.push("Interrotto: problema di chiave o quota."); break; }
      continue;
    }
    const w = await registraTraduzioniProdotto({ dominio: n.dominio, token: n.token }, p.id, t.traduzioni);
    if (w.errori.length) { esito.falliti++; esito.messaggi.push(`«${p.titolo}»: ${w.errori.join("; ")}`); }
    else esito.tradotti++;
    await attendi(400);
  }
  return esito;
}
