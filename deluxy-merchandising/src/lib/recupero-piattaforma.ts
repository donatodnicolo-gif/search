// **Completare un prodotto del partner con quello che la piattaforma sa già.**
//
// Il cuore del tasto «⟲ Recupera dalla piattaforma» sta qui e non nell'azione,
// perché lo usano in due: il tasto sulla scheda e lo script
// `scripts/recupera-dalla-piattaforma.ts`, che lo applica in blocco. Una regola
// scritta due volte diverge: qui è scritta una volta sola.
//
// ⚠️⚠️ **Riempie i vuoti, non sovrascrive.** Chi guarda un prodotto in attesa lo
// sta già correggendo a mano: se il prezzo pubblico è stato messo qui, quello
// della piattaforma non deve cancellarlo. Si scrive solo dove non c'è niente.

import { prisma } from "./db";
import { leggiProdottoDallaPiattaforma } from "./piattaforma";
import { allineaVarianti } from "./varianti-piattaforma";

/** Quello che la lettura della piattaforma **non** contiene: va detto, non taciuto. */
export const FUORI_PORTATA =
  "descrizione, plus, note di specifica, giorni di preavviso e foto non stanno in quella lettura: per quelli serve la modifica sulla piattaforma (docs/CONTRATTO-APP-DELIVERY.md).";

export type EsitoRecupero =
  | { ok: false; messaggio: string }
  | { ok: true; riassunto: string; cambiato: boolean };

export async function recuperaUnProdotto(id: string): Promise<EsitoRecupero> {
  const p = await prisma.prodotto.findUnique({
    where: { id },
    select: {
      id: true, nome: true, codice: true, prezzoVendita: true, costoProduzione: true,
      prezzoPartner: true, tipologiaVendita: true, idEsterno: true,
      partnerPiattaformaId: true, partnerInsegna: true,
      varianti: { select: { id: true, nome: true, sku: true } },
    },
  });
  if (!p) return { ok: false, messaggio: "Prodotto non trovato." };

  const letto = await leggiProdottoDallaPiattaforma(p.codice, p.idEsterno);
  if (!letto.ok) return { ok: false, messaggio: letto.messaggio };
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
  if (dati.prezzoPartner && !dati.costoProduzione) fatto.push(`prezzo al partner ${dati.prezzoPartner} €`);

  const riassunto = fatto.length
    ? `Recuperato dalla piattaforma: ${fatto.join(", ")}.`
    : `Dalla piattaforma non è arrivato niente di nuovo: qui c'è già tutto quello che quella lettura contiene${d.varianti.length ? "" : ", e di là il prodotto non ha varianti"}.`;

  await prisma.tappaSviluppo
    .create({ data: { prodottoId: id, da: "—", a: "—", nota: `${riassunto} ${FUORI_PORTATA}`, origine: "api" } })
    .catch(() => undefined);

  return { ok: true, riassunto, cambiato: fatto.length > 0 };
}
