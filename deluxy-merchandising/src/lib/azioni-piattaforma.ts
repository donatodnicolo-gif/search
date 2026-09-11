"use server";

// **«Recupera dalla piattaforma».**
//
// Segnalazione dell'utente (11/09/2026, sul prodotto vero «Torta Damianino»):
// «mancano ancora le varianti e altre informazioni da recuperare da app
// delivery, verifica come mai».
//
// Il perché, misurato: la piattaforma **non le manda**. La sua spinta
// (`inviaOra`) mette nel corpo nove campi più quattro per il partner; varianti,
// `partnerId`, insegna, plus, note e foto non ci sono. Da qui non si possono
// inventare.
//
// Però **si possono andare a prendere**: il canale app della piattaforma ha già
// `GET /api/v1/app/prodotti`, che torna le varianti, il partner e il prezzo
// pubblico. Questo tasto fa quella lettura e completa la scheda.
//
// ⚠️⚠️ **Riempie i vuoti, non sovrascrive.** Chi guarda un prodotto in attesa lo
// sta già correggendo a mano: se il prezzo pubblico è stato messo qui, quello
// della piattaforma non deve cancellarlo. Si scrive solo dove non c'è niente —
// e quello che resta fuori si dice per nome, invece di far credere che sia
// arrivato tutto.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { leggiProdottoDallaPiattaforma } from "./piattaforma";
import { allineaVarianti } from "./varianti-piattaforma";

/** Quello che la lettura della piattaforma **non** contiene: va detto, non taciuto. */
const FUORI_PORTATA = "descrizione, plus, note di specifica, giorni di preavviso e foto non stanno in quella lettura: per quelli serve la modifica sulla piattaforma (docs/CONTRATTO-APP-DELIVERY.md).";

export async function recuperaDallaPiattaforma(id: string) {
  const p = await prisma.prodotto.findUnique({
    where: { id },
    select: {
      id: true, nome: true, codice: true, prezzoVendita: true, costoProduzione: true,
      prezzoPartner: true, tipologiaVendita: true, idEsterno: true,
      partnerPiattaformaId: true, partnerInsegna: true,
      varianti: { select: { id: true, nome: true, sku: true } },
    },
  });
  if (!p) redirect("/prodotti?errore=" + encodeURIComponent("Prodotto non trovato."));

  const letto = await leggiProdottoDallaPiattaforma(p.codice, p.idEsterno);
  if (!letto.ok) {
    redirect(`/prodotti/${id}?errore=` + encodeURIComponent(`Non ho potuto recuperare: ${letto.messaggio}`));
  }
  const d = letto.prodotto;

  // Solo i vuoti. `prezzoVendita` a 0 conta come vuoto: è proprio il motivo per
  // cui un prodotto del partner resta fermo in attesa.
  const dati: Record<string, unknown> = {};
  if (!p.partnerPiattaformaId && d.partnerId) dati.partnerPiattaformaId = d.partnerId;
  if (!p.partnerInsegna && d.partner) dati.partnerInsegna = d.partner;
  if (!p.prezzoVendita && d.prezzoPubblico) dati.prezzoVendita = d.prezzoPubblico;
  if (!p.costoProduzione && d.prezzo) dati.costoProduzione = d.prezzo;
  if (!p.prezzoPartner && d.prezzo) dati.prezzoPartner = d.prezzo;
  if (!p.idEsterno && d.id) dati.idEsterno = d.id;

  const base = (dati.prezzoVendita as number) ?? p.prezzoVendita;
  const costo = (dati.costoProduzione as number) ?? p.costoProduzione;
  const nuove = await allineaVarianti(
    p.id,
    p.varianti,
    d.varianti.map((v) => ({
      nome: v.nome,
      sku: (v.sku ?? "").trim() || null,
      prezzo: v.prezzoPubblico,
      prezzoPartner: v.prezzo,
      note: null,
      giacenza: 0,
    })),
    base,
    costo,
  );
  if (Object.keys(dati).length) await prisma.prodotto.update({ where: { id }, data: dati });

  const fatto: string[] = [];
  if (nuove) fatto.push(`${nuove} varianti aggiunte`);
  if (dati.prezzoVendita) fatto.push(`prezzo pubblico ${dati.prezzoVendita} €`);
  if (dati.partnerInsegna) fatto.push(`partner «${dati.partnerInsegna}»`);
  if (dati.partnerPiattaformaId) fatto.push("id del partner");
  if (dati.costoProduzione) fatto.push(`costo ${dati.costoProduzione} €`);

  const riassunto = fatto.length
    ? `Recuperato dalla piattaforma: ${fatto.join(", ")}.`
    : `Dalla piattaforma non è arrivato niente di nuovo: qui c'è già tutto quello che quella lettura contiene${d.varianti.length ? "" : ", e di là il prodotto non ha varianti"}.`;

  await prisma.tappaSviluppo
    .create({ data: { prodottoId: id, da: "—", a: "—", nota: `${riassunto} ${FUORI_PORTATA}`, origine: "api" } })
    .catch(() => undefined);

  for (const percorso of ["/prodotti", "/sviluppo", `/prodotti/${id}`]) revalidatePath(percorso);
  redirect(`/prodotti/${id}?esito=` + encodeURIComponent(riassunto));
}
