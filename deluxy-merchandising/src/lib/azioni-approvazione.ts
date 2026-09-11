"use server";

// **Approvare un prodotto arrivato da un partner.**
//
// Richiesta dell'utente (11/09/2026): «l'utente deve mettere il prodotto come
// approvato se va bene e restituire approvato anche all'app delivery» ·
// «assicurati che per essere approvato ci siano i campi obbligatori come prezzo
// pubblico».
//
// Il giro è: il partner carica il prodotto nella piattaforma consegne → arriva
// qui in **Attesa approvazione** → qualcuno lo guarda, completa quello che
// manca e approva → l'approvazione torna alla piattaforma.
//
// ⚠️ **I controlli non sono un fastidio, sono il motivo della coda.** Approvare
// un prodotto senza prezzo pubblico vuol dire metterlo in vetrina a zero euro o
// non metterlo affatto; senza categoria vuol dire una scheda senza le sue
// sezioni. Quello che manca si dice per nome, con il link per rimediare.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { comunicaApprovazione } from "./piattaforma";
import { mancanzePerApprovare } from "./prodotti-dal-partner";

const CAMPI_CONTROLLO = {
  id: true,
  nome: true,
  codice: true,
  fase: true,
  prezzoVendita: true,
  categoria: true,
  tipologiaVendita: true,
  descrizione: true,
  plusProdotto: true,
  idEsterno: true,
  origine: true,
  // Serve dopo l'approvazione, per sapere dove mandare chi ha approvato:
  // sulla scheda se il prodotto è già sul negozio, al modulo se deve nascerci.
  shopifyId: true,
} as const;

/** Che cosa manca a questo prodotto per essere approvato (vuoto = si può). */
export async function cosaMancaPerApprovare(id: string): Promise<string[]> {
  const p = await prisma.prodotto.findUnique({ where: { id }, select: CAMPI_CONTROLLO });
  return p ? mancanzePerApprovare(p) : ["il prodotto non esiste più"];
}

/**
 * Approva: fase «Approvato», dentro le analisi, e **la piattaforma lo sa**.
 *
 * L'esito della comunicazione viaggia nel messaggio, riuscita o no: un prodotto
 * approvato qui e non comunicato di là è una cosa che va letta, non nascosta.
 */
export async function approvaProdotto(id: string) {
  const p = await prisma.prodotto.findUnique({ where: { id }, select: CAMPI_CONTROLLO });
  if (!p) redirect("/prodotti?errore=" + encodeURIComponent("Prodotto non trovato."));

  const mancanze = mancanzePerApprovare(p);
  if (mancanze.length) {
    redirect(
      `/prodotti/${id}?errore=` +
        encodeURIComponent(`Non si può approvare finché manca ${mancanze.join("; manca ")}. Si completa da «✎ Modifica col modulo».`),
    );
  }

  await prisma.$transaction([
    prisma.prodotto.update({
      where: { id },
      data: {
        fase: "approvato",
        // Approvato vuol dire «fa parte dell'assortimento»: da qui entra nelle
        // classifiche, da cui era tenuto fuori in attesa.
        esclusoDaAnalisi: false,
        motivoEsclusione: null,
      },
    }),
    prisma.tappaSviluppo.create({
      data: { prodottoId: id, da: p.fase, a: "approvato", nota: "Approvato: entra nell'assortimento.", origine: "ui" },
    }),
  ]);

  const esito = await comunicaApprovazione(p.idEsterno, true, {
    codice: p.codice,
    nome: p.nome,
    prezzoVendita: p.prezzoVendita,
  });
  if (esito.ok || !p.idEsterno) {
    await prisma.tappaSviluppo.create({
      data: { prodottoId: id, da: "approvato", a: "approvato", nota: esito.messaggio, origine: "api" },
    }).catch(() => undefined);
  } else {
    await prisma.tappaSviluppo.create({
      data: { prodottoId: id, da: "approvato", a: "approvato", nota: `⚠️ ${esito.messaggio}`, origine: "api" },
    }).catch(() => undefined);
  }

  for (const percorso of ["/prodotti", "/sviluppo", "/anagrafica", `/prodotti/${id}`]) revalidatePath(percorso);

  // ⭐⭐ **Approvato vuol dire che finisce sul negozio.** È la regola che il
  // cambio fase rapido applica già: senza `shopifyId`, «Approvato» porta al
  // modulo, che è il punto da cui la scheda nasce su Shopify (come bozza).
  //
  // Due strade per lo stesso gesto non possono portare in due posti diversi:
  // quindi anche da qui, se il prodotto non è ancora su un negozio, si arriva
  // al modulo — con l'approvazione **già registrata e già comunicata** di là, e
  // il messaggio che dice a che punto siamo. Chi è già sul negozio resta dov'è.
  const messaggio = `«${p.nome}» approvato. ${esito.messaggio}`;
  if (!p.shopifyId) {
    redirect(
      `/prodotti/${id}/modifica?fase=approvato&esito=` +
        encodeURIComponent(
          `${messaggio} Completa la scheda e salva per portarlo sul negozio: con la fase «Approvato» nasce come bozza.`,
        ),
    );
  }
  redirect(`/prodotti/${id}?esito=` + encodeURIComponent(messaggio));
}
