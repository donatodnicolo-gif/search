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

import { cookies } from "next/headers";
import { prisma } from "./db";

export const COOKIE_BRAND = "mrc_brand";

/** I brand che compaiono davvero nel venduto (nessun elenco scritto a mano). */
export async function brandDisponibili(): Promise<string[]> {
  const righe = await prisma.vendita.findMany({
    distinct: ["canale"],
    select: { canale: true },
    orderBy: { canale: "asc" },
  });
  return righe.map((r) => r.canale).filter(Boolean);
}

/**
 * Il brand scelto, o null per "Globale".
 * Se il cookie contiene un brand che non esiste più nel venduto si torna al
 * globale: meglio la vista completa che una pagina vuota senza spiegazione.
 */
export async function brandCorrente(): Promise<string | null> {
  const jar = await cookies();
  const scelto = jar.get(COOKIE_BRAND)?.value?.trim();
  if (!scelto) return null;
  const disponibili = await brandDisponibili();
  return disponibili.includes(scelto) ? scelto : null;
}

/** Filtro sulle vendite: {} in globale, altrimenti il canale scelto. */
export function filtroVendite(brand: string | null) {
  return brand ? { canale: brand } : {};
}

/**
 * Filtro sui prodotti: in globale tutti, altrimenti solo quelli **venduti**
 * su quel brand. È una relazione sul venduto, non un campo del prodotto.
 */
export function filtroProdotti(brand: string | null) {
  return brand ? { vendite: { some: { canale: brand } } } : {};
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
