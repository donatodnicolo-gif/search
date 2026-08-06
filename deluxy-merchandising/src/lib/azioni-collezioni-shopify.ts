"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";
import { tokenDi, VERSIONE_API } from "./negozi";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Le proprietà che decidiamo noi: dove si usa la collezione e se va in campagna. */
export async function salvaProprietaCollezione(id: string, fd: FormData) {
  const posizioni = fd.getAll("posizioni").filter((v) => typeof v === "string") as string[];
  await prisma.collezioneShopify.update({
    where: { id },
    data: {
      posizioni: posizioni.join(",") || null,
      inCampagne: fd.get("inCampagne") != null,
      stato: testo(fd, "stato") === "sospesa" ? "sospesa" : "attiva",
      note: testo(fd, "note") || null,
    },
  });
  revalidatePath(`/collezioni/shopify/${id}`);
  revalidatePath("/collezioni");
}

/**
 * Mette o toglie la collezione dalla **vetrina**, dal Visual merchandising.
 *
 * La vetrina è una delle «posizioni» (dove usiamo la collezione): si tiene
 * insieme alle altre invece di avere un flag a parte, altrimenti la stessa cosa
 * finirebbe scritta in due punti che possono dire il contrario. Le altre
 * posizioni già impostate non si toccano.
 */
export async function cambiaVetrina(collezioneId: string) {
  const c = await prisma.collezioneShopify.findUnique({
    where: { id: collezioneId },
    select: { posizioni: true },
  });
  if (!c) return;
  const attuali = (c.posizioni ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const dentro = attuali.includes("vetrina");
  const nuove = dentro ? attuali.filter((p) => p !== "vetrina") : [...attuali, "vetrina"];
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { posizioni: nuove.join(",") || null },
  });
  revalidatePath("/visual");
  revalidatePath(`/visual/${collezioneId}`);
  revalidatePath("/collezioni");
}

/**
 * Elimina una collezione.
 *
 * Due gesti diversi, mai confusi:
 * - **solo qui**: sparisce da Merchandising, sul negozio resta. Serve a
 *   ripulire l'elenco da collezioni che non ci interessano.
 * - **anche su Shopify**: la collezione viene cancellata dal negozio con
 *   `collectionDelete`. È irreversibile e i clienti smettono di vederla: si
 *   fa solo se chi clicca sa cosa sta facendo, e infatti va scelto a parte.
 *
 * In nessuno dei due casi si toccano i **prodotti**: una collezione è un
 * raggruppamento, cancellarla non cancella la merce.
 */
export async function eliminaCollezioneShopify(id: string, fd: FormData) {
  const ancheSuShopify = fd.get("ancheSuShopify") != null;
  const c = await prisma.collezioneShopify.findUnique({ where: { id } });
  if (!c) redirect("/collezioni?errore=" + encodeURIComponent("Collezione non trovata."));

  if (ancheSuShopify) {
    const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c.negozio }, select: { id: true } });
    const accesso = negozio ? await tokenDi(negozio.id) : null;
    if (!accesso) {
      redirect(
        "/collezioni?esito=errore&messaggio=" +
          encodeURIComponent(
            `Il negozio «${c.negozio}» non è collegato: non posso cancellare su Shopify. Qui non ho toccato niente.`
          )
      );
    }
    const res = await fetch(`https://${accesso.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accesso.token },
      body: JSON.stringify({
        query: `mutation eliminaCollezione($input: CollectionDeleteInput!) {
           collectionDelete(input: $input) { deletedCollectionId userErrors { field message } }
         }`,
        variables: { input: { id: c.shopifyId } },
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    const corpo = (await res.json().catch(() => ({}))) as {
      data?: { collectionDelete?: { deletedCollectionId?: string | null; userErrors?: { message: string }[] } };
      errors?: { message: string }[];
    };
    const errori = [
      ...(corpo.errors ?? []).map((e) => e.message),
      ...(corpo.data?.collectionDelete?.userErrors ?? []).map((e) => e.message),
    ];
    if (errori.length || !corpo.data?.collectionDelete?.deletedCollectionId) {
      // Se Shopify non l'ha cancellata, qui non si cancella niente: due
      // sistemi che dicono cose diverse sono peggio di un errore.
      redirect(
        "/collezioni?esito=errore&messaggio=" +
          encodeURIComponent(
            `Shopify non ha cancellato «${c.titolo}»: ${errori.join(" · ") || "risposta inattesa"}. Qui è rimasta.`
          )
      );
    }
  }

  await prisma.collezioneShopify.delete({ where: { id } });
  revalidatePath("/collezioni");
  revalidatePath("/assortimento");
  redirect(
    `/collezioni?esito=ok&messaggio=${encodeURIComponent(
      ancheSuShopify
        ? `«${c.titolo}» eliminata qui e sul negozio ${c.negozio}. I prodotti restano.`
        : `«${c.titolo}» tolta da Merchandising. Su ${c.negozio} è ancora lì: torna al prossimo import.`
    )}`
  );
}

/**
 * **Quanti prodotti per riga**, scelto qui e mandato al negozio.
 *
 * Su Shopify non esiste un campo per la disposizione: la decide il tema. L'unico
 * posto per-collezione dove il valore puo' stare e' un **metafield**, quindi si
 * scrive `custom.prodotti_per_riga` (number_integer). Il negozio lo conserva
 * comunque; **cambia qualcosa sul sito solo se il tema lo legge** — ed e' detto
 * in pagina, perche' promettere un effetto che dipende dal tema sarebbe una
 * bugia.
 *
 * Prima su Shopify, poi qui: se il negozio rifiuta, l'app non racconta un
 * valore che il negozio non ha.
 */
export async function salvaProdottiPerRiga(collezioneId: string, fd: FormData) {
  const grezzo = String(fd.get('prodottiPerRiga') ?? '').trim();
  const n = grezzo === '' ? null : Number.parseInt(grezzo, 10);
  if (n != null && (!Number.isFinite(n) || n < 1 || n > 12)) return;

  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) return;

  // Svuotando il campo si toglie la scelta **solo qui**: cancellare un metafield
  // e' un'altra azione, e non la si fa per svista lasciando una casella vuota.
  if (n == null) {
    await prisma.collezioneShopify.update({ where: { id: collezioneId }, data: { prodottiPerRiga: null } });
    revalidatePath('/visual/' + collezioneId);
    return;
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c.negozio }, select: { id: true, permessi: true } });
  const accesso = negozio && (negozio.permessi ?? '').includes('write_products') ? await tokenDi(negozio.id) : null;
  if (!accesso) {
    redirect('/visual/' + collezioneId + '?esito=errore&messaggio=' + encodeURIComponent('Serve un token con write_products sul negozio «' + c.negozio + '» per scrivere il metafield.'));
  }

  const r = await graphqlNegozio(
    accesso!.dominio,
    accesso!.token,
    'mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { key value } userErrors { field message } } }',
    { m: [{ ownerId: c.shopifyId, namespace: 'custom', key: 'prodotti_per_riga', type: 'number_integer', value: String(n) }] },
  );
  const err = erroriDi(r, 'metafieldsSet');
  if (err.length) {
    redirect('/visual/' + collezioneId + '?esito=errore&messaggio=' + encodeURIComponent('Shopify ha rifiutato: ' + err.join(' · ')));
  }

  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { prodottiPerRiga: n, prodottiPerRigaSpintoIl: new Date() },
  });
  revalidatePath('/visual/' + collezioneId);
  revalidatePath('/collezioni/shopify/' + collezioneId);
}
