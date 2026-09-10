import { prisma } from "./db";
import { definizioniInCache } from "./metafield-definizioni";
import { tokenDi } from "./negozi";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";

/**
 * LA DISPONIBILITÀ DEI PRODOTTI UNICI SEGUE IL CALENDARIO DEL PARTNER (10/09/2026, regola
 * utente).
 *
 * Un prodotto unico lo prepara UN partner. Il negozio dice al cliente «da domani» (metafield
 * `prodotto.consegna` = giorni minimi) e «dalle 7» (metafield `custom.minimo_orario`). Ma se
 * domani il partner è chiuso, «da domani» è una promessa falsa. La regola: base 1 → 2 se domani
 * è chiuso → torna 1 quando riapre; chiuso tre giorni → 4, e si aggiorna ogni giorno. L'ora
 * minima è la prima ora piena dopo l'apertura di QUEL giorno; partner senza orari → ore 9.
 * E oggi conta come chiuso se il partner ha già chiuso (lo dice la piattaforma: `origine =
 * 'chiuso-per-oggi'`): «se Clivati oggi chiude alle 15 e sono le 16, acquistabili da domani».
 *
 * Chi sa cosa: la piattaforma consegne conosce il proprietario del prodotto unico e il suo
 * calendario (orari settimanali, fasce del giorno, eccezioni) e ce lo MANDA
 * (`POST /api/v1/prodotti/disponibilita`); qui c'è la BASE (`ggDispMin`, `minimoOrario`), si
 * calcola il valore EFFETTIVO e si scrive sui negozi — perché i metafield sono casa nostra.
 *
 * La base non si tocca mai: è quello che qualcuno ha deciso. Se manca, non si inventa (regola
 * utente: «meglio vuoto che inventato»): il prodotto resta com'è e il motivo lo dice.
 */

export type GiornoCalendario = { data: string; aperto: boolean; dalle: string | null; alle?: string | null; origine?: string };
export type ProdottoCalendario = { codice: string; partner?: string | null; senzaOrari?: boolean; calendario: GiornoCalendario[] };

export const ORA_SENZA_ORARI = 9;

/** «06:30» → 7, «07:00» → 7, «07:30» → 8: la prima ora piena in cui il partner è aperto. */
export function oraMinimaDa(dalle: string | null | undefined): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec((dalle ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return min > 0 ? h + 1 : h;
}

/**
 * Il calcolo, puro: dalla base e dal calendario (indice 0 = oggi) al valore effettivo.
 *  - giorni: il primo n ≥ base in cui il partner è aperto;
 *  - ora: la prima ora piena dopo l'apertura di quel giorno (9 se non ha orari);
 *  - motivo: perché il numero è quello che è, per il registro e per chi legge la scheda.
 */
export function calcolaDisponibilita(
  base: number | null | undefined,
  calendario: GiornoCalendario[],
  senzaOrari = false,
): { giorni: number | null; ora: number | null; motivo: string } {
  if (base == null || !Number.isFinite(base) || base < 0) return { giorni: null, ora: null, motivo: "senza base: gg_disp_min non dichiarato in Merchandising" };
  const b = Math.floor(base);
  if (!calendario.length) return { giorni: b, ora: senzaOrari ? ORA_SENZA_ORARI : null, motivo: "calendario del partner vuoto: resta la base" };
  for (let n = b; n < calendario.length; n++) {
    const g = calendario[n];
    if (!g?.aperto) continue;
    const ora = senzaOrari || !g.dalle ? ORA_SENZA_ORARI : oraMinimaDa(g.dalle) ?? ORA_SENZA_ORARI;
    const chiusi = n - b;
    const motivo = chiusi === 0
      ? `base ${b}: il partner è aperto il ${g.data}`
      : `base ${b} + ${chiusi} giorn${chiusi === 1 ? "o" : "i"} di chiusura del partner → primo giorno aperto ${g.data}`;
    return { giorni: n, ora, motivo: `${motivo}; ora minima ${ora}${senzaOrari ? " (partner senza orari)" : g.dalle ? ` (apre alle ${g.dalle})` : ""}` };
  }
  // Chiuso per tutta la finestra: si dice, e si va al primo giorno DOPO la finestra.
  return { giorni: calendario.length, ora: senzaOrari ? ORA_SENZA_ORARI : null, motivo: `partner chiuso per tutti i ${calendario.length - b} giorni della finestra dopo la base ${b}: chiusura lunga, da gestire (avviso e blocco acquisto: sviluppo futuro)` };
}

const gid = (id: string) => (/^\d+$/.test(id) ? `gid://shopify/Product/${id}` : id);

type EsitoProdotto = { codice: string; stato: "aggiornato" | "invariato" | "saltato" | "errore"; giorni?: number | null; ora?: number | null; motivo: string; negozi?: string[] };

/**
 * Applica il calendario mandato dalla piattaforma: calcola, confronta con l'ultimo valore
 * scritto, e scrive sui negozi SOLO quello che cambia. Idempotente: due giri uguali fanno un
 * giro solo di scritture.
 */
export async function applicaCalendario(prodotti: ProdottoCalendario[], opzioni?: { applica?: boolean }): Promise<{ esiti: EsitoProdotto[]; riepilogo: Record<string, number> }> {
  const applica = opzioni?.applica !== false;
  const esiti: EsitoProdotto[] = [];
  const codici = prodotti.map((p) => String(p.codice ?? "").trim()).filter(Boolean);
  const righe = await prisma.prodotto.findMany({
    where: { codice: { in: codici, mode: "insensitive" } },
    select: {
      id: true, codice: true, fase: true, ggDispMin: true, minimoOrario: true,
      ggDispEffettivo: true, minimoOrarioEffettivo: true,
      pubblicazioni: { select: { negozio: true, shopifyId: true, statoShopify: true } },
    },
  });
  const perCodice = new Map(righe.map((r) => [r.codice.trim().toUpperCase(), r]));
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { id: true, nome: true, permessi: true } });
  const negozioPerNome = new Map(negozi.map((n) => [n.nome, n]));
  const tokenCache = new Map<string, { dominio: string; token: string } | null>();
  const defsCache = new Map<string, Awaited<ReturnType<typeof definizioniInCache>>>();
  const adesso = new Date();

  for (const p of prodotti) {
    const codice = String(p.codice ?? "").trim();
    const r = perCodice.get(codice.toUpperCase());
    if (!r) { esiti.push({ codice, stato: "saltato", motivo: "prodotto non trovato in Merchandising per codice" }); continue; }
    if (r.fase !== "in_vendita") { esiti.push({ codice, stato: "saltato", motivo: `prodotto in fase «${r.fase}», non in vendita` }); continue; }
    const calc = calcolaDisponibilita(r.ggDispMin, Array.isArray(p.calendario) ? p.calendario : [], Boolean(p.senzaOrari));
    if (calc.giorni == null) {
      if (applica) await prisma.prodotto.update({ where: { id: r.id }, data: { disponibilitaMotivo: calc.motivo, disponibilitaCalcolataIl: adesso } });
      esiti.push({ codice, stato: "saltato", motivo: calc.motivo });
      continue;
    }
    const invariato = r.ggDispEffettivo === calc.giorni && r.minimoOrarioEffettivo === calc.ora;
    if (invariato) {
      if (applica) await prisma.prodotto.update({ where: { id: r.id }, data: { disponibilitaMotivo: calc.motivo, disponibilitaCalcolataIl: adesso } });
      esiti.push({ codice, stato: "invariato", giorni: calc.giorni, ora: calc.ora, motivo: calc.motivo });
      continue;
    }
    if (!applica) { esiti.push({ codice, stato: "aggiornato", giorni: calc.giorni, ora: calc.ora, motivo: calc.motivo + " (anteprima)" }); continue; }

    // Scrittura sui negozi dove il prodotto è pubblicato.
    const scritti: string[] = [];
    const errori: string[] = [];
    for (const pub of r.pubblicazioni) {
      if (!pub.shopifyId) continue;
      const negozio = negozioPerNome.get(pub.negozio);
      if (!negozio) { errori.push(`${pub.negozio}: negozio non attivo`); continue; }
      if (!(negozio.permessi ?? "").includes("write_products")) { errori.push(`${pub.negozio}: token senza write_products`); continue; }
      if (!tokenCache.has(negozio.id)) tokenCache.set(negozio.id, await tokenDi(negozio.id).catch(() => null));
      const accesso = tokenCache.get(negozio.id);
      if (!accesso) { errori.push(`${pub.negozio}: token non disponibile`); continue; }
      if (!defsCache.has(negozio.nome)) defsCache.set(negozio.nome, await definizioniInCache(negozio.nome));
      const defs = defsCache.get(negozio.nome)!;
      const tipo = (ns: string, key: string) => defs.find((d) => d.namespace === ns && d.key === key)?.tipo ?? "number_integer";
      const m: { ownerId: string; namespace: string; key: string; type: string; value: string }[] = [
        { ownerId: gid(pub.shopifyId), namespace: "prodotto", key: "consegna", type: tipo("prodotto", "consegna"), value: String(calc.giorni) },
      ];
      if (calc.ora != null) m.push({ ownerId: gid(pub.shopifyId), namespace: "custom", key: "minimo_orario", type: tipo("custom", "minimo_orario"), value: String(calc.ora) });
      try {
        const resp = await graphqlNegozio(accesso.dominio, accesso.token,
          "mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { key value } userErrors { field message } } }", { m });
        const err = erroriDi(resp, "metafieldsSet");
        if (err.length) errori.push(`${pub.negozio}: ${err.join(" · ")}`); else scritti.push(pub.negozio);
      } catch (e) {
        errori.push(`${pub.negozio}: ${(e as Error).message}`);
      }
    }
    if (errori.length && !scritti.length) {
      await prisma.prodotto.update({ where: { id: r.id }, data: { disponibilitaMotivo: `NON scritto: ${errori.join("; ")} — ${calc.motivo}`, disponibilitaCalcolataIl: adesso } });
      esiti.push({ codice, stato: "errore", giorni: calc.giorni, ora: calc.ora, motivo: errori.join("; ") });
      continue;
    }
    await prisma.prodotto.update({
      where: { id: r.id },
      data: { ggDispEffettivo: calc.giorni, minimoOrarioEffettivo: calc.ora, disponibilitaMotivo: (errori.length ? `parziale (${errori.join("; ")}) — ` : "") + calc.motivo, disponibilitaCalcolataIl: adesso },
    });
    esiti.push({ codice, stato: errori.length ? "errore" : "aggiornato", giorni: calc.giorni, ora: calc.ora, motivo: calc.motivo, negozi: scritti });
  }
  const riepilogo: Record<string, number> = {};
  for (const e of esiti) riepilogo[e.stato] = (riepilogo[e.stato] ?? 0) + 1;
  return { esiti, riepilogo };
}
