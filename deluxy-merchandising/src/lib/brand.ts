// L'ambito dell'app: si guarda tutto insieme (Globale) oppure un brand solo.
//
// Deluxy vende su più negozi — Flowers, deluxy.it, Cake Design — e mescolarli
// in un'unica classifica non dice niente a nessuno: chi lavora sui fiori non
// deve vedere le torte in mezzo. L'ambito è UNO per tutta l'app, sta in un
// cookie e vale in ogni pagina, così non c'è mai il dubbio "questi numeri di
// chi sono": è scritto in alto, sempre.
//
// Il brand non è una proprietà del prodotto: è del venduto (`Vendita.canale`,
// che arriva dal negozio Shopify tramite Orders). Un prodotto può essere
// venduto su più brand, e infatti succede. Perciò "prodotti del brand X"
// significa sempre **prodotti venduti sul brand X**, non un'etichetta messa a
// mano su una scheda.

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./db";

export const COOKIE_BRAND = "mrc_brand";

/**
 * I brand fra cui si può scegliere: quelli che **hanno venduto** più i **negozi
 * collegati**, anche se non hanno ancora venduto niente. Nessun elenco a mano.
 *
 * ⚠️ **Perché non basta il venduto (07/09/2026).** Fino a oggi questa funzione
 * leggeva solo i canali di `Vendita`, e un negozio appena collegato non
 * compariva: «Business Deluxy», aggiunto stamattina con 1.715 prodotti e 1.508
 * schede nelle sue collezioni, **non era selezionabile** — l'utente lo aveva
 * collegato e l'app faceva finta di niente. Un negozio comincia a esistere
 * quando lo si collega, non quando arriva il primo ordine; e il primo ordine su
 * un negozio nuovo può tardare settimane, cioè proprio il periodo in cui ci si
 * lavora sopra per prepararlo.
 *
 * Il nome del brand di un negozio è il suo `canaleVendite` (il nome che il
 * venduto avrà, quando arriverà) e in mancanza il nome del negozio: così quando
 * le vendite arrivano si fondono con la voce già presente invece di aprirne una
 * seconda.
 *
 * Avvolta in `cache()` di React: pagina, Sidebar e barra dell'ambito la chiedono
 * tutte nello stesso rendering. È una deduplica **per richiesta**, non una cache
 * a tempo: il dato resta sempre quello vero del momento.
 */
export const brandDisponibili = cache(async (): Promise<string[]> => {
  const [venduto, negozi] = await Promise.all([
    prisma.vendita.findMany({ distinct: ["canale"], select: { canale: true } }),
    prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true, canaleVendite: true } }),
  ]);
  const tutti = new Set<string>();
  for (const r of venduto) if (r.canale) tutti.add(r.canale);
  for (const n of negozi) {
    const nome = n.canaleVendite?.trim() || n.nome.trim();
    if (nome) tutti.add(nome);
  }
  return [...tutti].sort((a, b) => a.localeCompare(b, "it"));
});

/**
 * I negozi il cui brand è quello dato — il ponte all'incontrario di
 * `negoziDelBrand`, usato dal filtro sui prodotti. Un brand può essere il
 * `canaleVendite` di un negozio oppure, per un negozio senza canale ancora
 * dichiarato, il suo nome.
 */
const negoziConBrand = cache(async (brand: string): Promise<string[]> => {
  const negozi = await prisma.negozioShopify.findMany({
    where: { attivo: true, OR: [{ canaleVendite: brand }, { nome: brand }] },
    select: { nome: true, canaleVendite: true },
  });
  // Un negozio che ha un `canaleVendite` diverso non si prende per il nome:
  // sarebbe un'omonimia, non un legame.
  return negozi.filter((n) => (n.canaleVendite?.trim() || n.nome.trim()) === brand).map((n) => n.nome);
});

/**
 * Il brand scelto, o null per "Globale".
 * Se il cookie contiene un brand che non esiste più nel venduto si torna al
 * globale: meglio la vista completa che una pagina vuota senza spiegazione.
 *
 * Anche questa è deduplicata per richiesta (vedi sopra): la chiamano quasi tutte
 * le pagine **e** la Sidebar.
 */
export const brandCorrente = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  const scelto = jar.get(COOKIE_BRAND)?.value?.trim();
  if (!scelto) return null;
  const disponibili = await brandDisponibili();
  return disponibili.includes(scelto) ? scelto : null;
});

/** Filtro sulle vendite: {} in globale, altrimenti il canale scelto. */
export function filtroVendite(brand: string | null) {
  return brand ? { canale: brand } : {};
}

/**
 * Filtro sui prodotti: in globale tutti, altrimenti quelli di quel brand —
 * cioè **venduti su quel canale** *oppure* **presenti nelle collezioni del suo
 * negozio**.
 *
 * ⚠️ **Il secondo ramo è nuovo del 07/09/2026 e serve a non mentire.** Prima
 * c'era solo il venduto: per un negozio appena collegato, che non ha ancora
 * venduto niente, ogni pagina del catalogo usciva **vuota** — non «nessun
 * prodotto ancora venduto qui», proprio vuota, come se il negozio non esistesse.
 * Con «Business Deluxy» sarebbero state 1.508 schede invisibili. Il venduto
 * resta la fonte del brand per i *numeri* (`filtroVendite` non è cambiata: le
 * classifiche e i trend continuano a contare solo vendite vere), ma il
 * *catalogo* di un brand è quello che sta sul suo negozio.
 *
 * È `async` da oggi, per il ponte brand → negozi: i chiamanti sono tutti
 * componenti server, che la aspettano.
 */
export async function filtroProdotti(brand: string | null) {
  if (!brand) return {};
  const negozi = await negoziConBrand(brand);
  if (negozi.length === 0) return { vendite: { some: { canale: brand } } };
  return {
    OR: [
      { vendite: { some: { canale: brand } } },
      { collezioniShopify: { some: { collezione: { negozio: { in: negozi } } } } },
    ],
  };
}

export function etichettaAmbito(brand: string | null): string {
  return brand ?? "Globale";
}

/**
 * I **negozi Shopify** che corrispondono al brand scelto. Il brand è un *canale
 * di vendita* (`deluxy.it`, `Flowers`, `cakedesign.me`), mentre le collezioni
 * appartengono a un *negozio* (`Gifts`, `Flowers`, `Cake`): il ponte è
 * `NegozioShopify.canaleVendite`. Ritorna `null` in globale (nessun filtro).
 * Ritorna `[]` se il brand non è mappato a nessun negozio: chi filtra deve
 * dichiararlo invece di mostrare tutto come se il filtro non esistesse.
 */
export async function negoziDelBrand(brand: string | null): Promise<string[] | null> {
  if (!brand) return null;
  const negozi = await prisma.negozioShopify.findMany({
    where: { canaleVendite: brand },
    select: { nome: true },
  });
  return negozi.map((n) => n.nome);
}
