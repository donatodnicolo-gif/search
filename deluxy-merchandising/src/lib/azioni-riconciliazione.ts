"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";

// Unire e separare due schede dello stesso prodotto.
//
// Regole che valgono più del codice che segue:
//
// 1. **Non si cancella niente.** La scheda assorbita resta in anagrafica, con
//    scritto a chi è stata unita e quando. Sparisce solo dalle analisi, dove
//    contava due volte lo stesso prodotto.
// 2. **Si può tornare indietro.** Ogni riga di vendita spostata si porta dietro
//    da dove veniva (`prodottoOriginaleId`), quindi «separa» rimette esattamente
//    quelle righe. Un bottone che sposta dati veri senza poterli rimettere non è
//    un bottone, è un incidente.
// 3. **Si sposta solo il venduto.** Le collezioni Shopify e le varianti restano
//    dove sono: appartengono alla scheda del negozio da cui vengono, e spostarle
//    vorrebbe dire riscrivere quello che il negozio dice.

function aggiorna() {
  for (const p of ["/prodotti", "/anagrafica", "/classifiche", "/vendite", "/assortimento", "/fornitori", "/categorie", "/linee", "/fasce"])
    revalidatePath(p);
}

export async function unisciAzione(masterId: string, fd: FormData) {
  const assorbiti = fd.getAll("assorbito").filter((v): v is string => typeof v === "string" && v !== masterId);
  if (assorbiti.length === 0)
    redirect(`/prodotti/${masterId}/riconcilia?errore=` + encodeURIComponent("Non hai scelto nessuna scheda da unire."));

  const master = await prisma.prodotto.findUnique({ where: { id: masterId }, select: { id: true, nome: true } });
  if (!master) redirect("/prodotti");

  // Chi è già stato unito ad altri non si riunisce: prima si separa. Evita
  // catene («A unito a B unito a C») che nessuno saprebbe più sbrogliare.
  const gia = await prisma.prodotto.findMany({
    where: { id: { in: assorbiti }, unitoAId: { not: null } },
    select: { nome: true },
  });
  if (gia.length > 0)
    redirect(
      `/prodotti/${masterId}/riconcilia?errore=` +
        encodeURIComponent(`«${gia[0].nome}» è già unito a un'altra scheda: separalo prima.`),
    );

  // Il controllo qui sopra guarda gli assorbiti; questi due guardano gli altri
  // due versi della stessa catena, che erano rimasti scoperti:
  // - un assorbito che ha a sua volta **assorbito altri** (un master) passava il
  //   controllo perché il suo `unitoAId` è null — e l'updateMany più sotto
  //   avrebbe sovrascritto la provenienza delle righe dei suoi assorbiti,
  //   rendendo il loro «separa» un bottone che non rimette niente;
  // - il **masterId stesso** poteva essere una scheda già assorbita (quindi
  //   esclusa dalle analisi): il venduto sarebbe finito su una scheda che non
  //   si vede da nessuna parte.
  const assorbitiCheHannoAssorbito = await prisma.prodotto.findMany({
    where: { unitoAId: { in: assorbiti } },
    select: { unitoA: { select: { nome: true } } },
  });
  if (assorbitiCheHannoAssorbito.length > 0)
    redirect(
      `/prodotti/${masterId}/riconcilia?errore=` +
        encodeURIComponent(
          `«${assorbitiCheHannoAssorbito[0].unitoA?.nome}» ha già assorbito altre schede: separale prima, poi unisci.`,
        ),
    );
  const masterAssorbito = await prisma.prodotto.findFirst({
    where: { id: masterId, unitoAId: { not: null } },
    select: { id: true },
  });
  if (masterAssorbito)
    redirect(
      `/prodotti/${masterId}/riconcilia?errore=` +
        encodeURIComponent("Questa scheda è a sua volta unita a un'altra: separala prima di farle assorbire qualcosa."),
    );

  let righe = 0;
  for (const id of assorbiti) {
    // `prodottoOriginaleId` si scrive **solo dove è ancora null**: è la
    // provenienza della riga, e sovrascriverla renderebbe il «separa» di
    // qualcun altro un'operazione che non rimette niente. Coi guardrail qui
    // sopra non dovrebbe più succedere; il where è la cintura oltre alle
    // bretelle, perché qui si toccano dati storici veri.
    const spostate = await prisma.vendita.updateMany({
      where: { prodottoId: id, prodottoOriginaleId: null },
      data: { prodottoId: masterId, prodottoOriginaleId: id },
    });
    righe += spostate.count;
    await prisma.prodotto.update({
      where: { id },
      data: {
        unitoAId: masterId,
        unitoIl: new Date(),
        esclusoDaAnalisi: true,
        motivoEsclusione: `Stessa cosa di «${master.nome}»: venduto spostato su quella scheda.`,
      },
    });
  }

  aggiorna();
  redirect(
    `/prodotti/${masterId}?esito=` +
      encodeURIComponent(
        `${assorbiti.length} ${assorbiti.length === 1 ? "scheda unita" : "schede unite"} · ${righe} righe di vendita spostate qui.`,
      ),
  );
}

export async function separaAzione(id: string, _fd: FormData) {
  const p = await prisma.prodotto.findUnique({ where: { id }, select: { id: true, unitoAId: true } });
  if (!p?.unitoAId) redirect(`/prodotti/${id}`);

  // Tornano indietro **solo** le righe che erano state spostate da qui: quelle
  // che il prodotto principale aveva già sono e restano sue.
  const tornate = await prisma.vendita.updateMany({
    where: { prodottoOriginaleId: id },
    data: { prodottoId: id, prodottoOriginaleId: null },
  });
  await prisma.prodotto.update({
    where: { id },
    data: { unitoAId: null, unitoIl: null, esclusoDaAnalisi: false, motivoEsclusione: null },
  });

  aggiorna();
  redirect(`/prodotti/${id}?esito=` + encodeURIComponent(`Scheda separata · ${tornate.count} righe di vendita rimesse qui.`));
}
