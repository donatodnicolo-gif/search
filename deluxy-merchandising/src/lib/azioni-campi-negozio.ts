"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";
import { campoDi, perShopify, type TipoScheda } from "./campi-negozio";

/**
 * **Salva un campo del negozio: prima su Shopify, poi qui.**
 *
 * L'ordine non è un dettaglio. Se si scrivesse prima in locale e Shopify
 * rifiutasse, l'app mostrerebbe un valore che il negozio non ha — e il primo
 * import lo cancellerebbe senza spiegazioni. Così invece o cambiano tutti e due,
 * o non cambia niente.
 *
 * Il campo arriva per **chiave**, non per nome di colonna, e viene cercato in un
 * elenco chiuso (`campi-negozio.ts`): una funzione che scrive «il campo che le
 * dici» sarebbe un endpoint per modificare qualunque cosa del negozio.
 */
export async function salvaCampoNegozio(tipo: TipoScheda, id: string, chiave: string, fd: FormData) {
  const dove = tipo === "prodotto" ? `/prodotti/${id}` : `/collezioni/shopify/${id}`;
  const errore = (m: string) => redirect(`${dove}?esito=errore&messaggio=${encodeURIComponent(m)}`);

  const campo = campoDi(tipo, chiave);
  if (!campo) errore("Campo non modificabile da qui.");

  const valore = String(fd.get("valore") ?? "").trim();
  if (!valore && campo!.chiave === "titolo") {
    errore("Il titolo non può restare vuoto: sul sito è quello che il cliente legge.");
  }

  // — Su quale negozio vive questa scheda —
  const nomeNegozio =
    tipo === "collezione"
      ? (await prisma.collezioneShopify.findUnique({ where: { id }, select: { negozio: true } }))?.negozio
      : (
          await prisma.prodottoInCollezioneShopify.findFirst({
            where: { prodottoId: id },
            select: { collezione: { select: { negozio: true } } },
          })
        )?.collezione.negozio;
  if (!nomeNegozio) errore("Questa scheda non risulta su nessun negozio collegato.");

  const gid =
    tipo === "collezione"
      ? (await prisma.collezioneShopify.findUnique({ where: { id }, select: { shopifyId: true } }))?.shopifyId
      : (await prisma.prodotto.findUnique({ where: { id }, select: { shopifyId: true } }))?.shopifyId;
  if (!gid) errore("Di questa scheda non conosciamo l'id su Shopify: rilancia l'import e riprova.");

  const negozio = await prisma.negozioShopify.findFirst({
    where: { nome: nomeNegozio },
    select: { id: true, permessi: true },
  });
  if (!negozio || !(negozio.permessi ?? "").includes("write_products")) {
    errore(`Il negozio «${nomeNegozio}» non ha un token con write_products: si collega in Impostazioni.`);
  }
  const accesso = await tokenDi(negozio!.id);
  if (!accesso) errore(`Il negozio «${nomeNegozio}» non è collegato.`);

  const campoRisposta = tipo === "prodotto" ? "productUpdate" : "collectionUpdate";
  const mutazione =
    tipo === "prodotto"
      ? `mutation($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }`
      : `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`;

  const r = await graphqlNegozio(accesso!.dominio, accesso!.token, mutazione, {
    input: { id: gid, [campo!.campoShopify]: perShopify(campo!, valore) },
  });
  const err = erroriDi(r, campoRisposta);
  if (err.length) errore(`Shopify ha rifiutato: ${err.join(" · ")}`);

  // Solo adesso la copia locale. Si salva il **testo in chiaro** e non l'HTML
  // che è stato mandato: in tutta l'app la descrizione si legge senza tag, ed è
  // quello che l'import stesso salva.
  const dati = { [campo!.colonna]: valore || null };
  if (tipo === "prodotto") await prisma.prodotto.update({ where: { id }, data: dati });
  else await prisma.collezioneShopify.update({ where: { id }, data: dati });

  revalidatePath(dove);
  redirect(
    `${dove}?esito=ok&messaggio=${encodeURIComponent(
      `«${campo!.etichetta}» aggiornato sul negozio. Il sito lo mostra in pochi istanti.`,
    )}`,
  );
}
