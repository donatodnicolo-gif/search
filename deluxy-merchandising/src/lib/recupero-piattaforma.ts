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
import { orarioConsegnaDaOraMinima } from "./orario-consegna";
import { leggiPartnerDallaPiattaforma, leggiProdottoDallaPiattaforma } from "./piattaforma";
import { componiProvince, vociPerSigla } from "./province-negozio";
import { allineaVarianti } from "./varianti-piattaforma";

/**
 * **I campi del negozio che parlano del partner, riempiti da chi li sa.**
 *
 * Regole dell'utente (11/09/2026): «indirizzo del partner: questo dovrebbe
 * essere aperta automaticamente da app delivery» · «anche nations availability
 * li ha l'app delivery» · «uguale città».
 *
 * La piattaforma descrive il partner con **città e sigle di province**; i siti
 * scrivono le province per esteso (`ITALY-MILAN(MI)`) e la città come lista.
 * Il ponte fra le due lingue sta in `province-negozio.ts`, e le grafie si
 * imparano dalle schede vere invece di inventarle.
 *
 * ⚠️ Si scrive **solo dove il campo è vuoto**.
 */
async function campiDelPartner(
  metafield: Record<string, string>,
  partnerId: string | null,
): Promise<{ scritti: Record<string, string>; detto: string[] }> {
  const scritti: Record<string, string> = {};
  const detto: string[] = [];
  if (!partnerId) return { scritti, detto };
  const elenco = await leggiPartnerDallaPiattaforma();
  if (!elenco.ok) return { scritti, detto: [elenco.messaggio] };
  const suo = elenco.partner.find((x) => x.id === partnerId);
  if (!suo) return { scritti, detto: ["il partner di questo prodotto non è fra quelli attivi della piattaforma"] };

  // ⭐ 11/09/2026: **l'indirizzo vero se c'è, la città solo come ripiego** — e
  // si dice quale dei due si è usato. Il campo si chiama «Indirizzo del
  // partner»: scriverci il nome della città è un ripiego, non la risposta, e
  // chi legge la scheda deve sapere quale delle due sta guardando.
  const indirizzo = (suo.indirizzo ?? "").trim();
  if (!metafield["custom.partner_address"]) {
    if (indirizzo) scritti["custom.partner_address"] = indirizzo;
    else if (suo.citta) {
      scritti["custom.partner_address"] = suo.citta;
      detto.push("l'indirizzo del partner non è nella lettura della piattaforma: ho messo la città come ripiego");
    }
  }
  if (!metafield["custom.citta"] && suo.citta) scritti["custom.citta"] = JSON.stringify([suo.citta]);
  if (!metafield["custom.nations_availability"] && suo.province?.length) {
    const { valore, fuori } = componiProvince(suo.province, await vociPerSigla());
    if (valore) scritti["custom.nations_availability"] = valore;
    if (fuori.length) detto.push(`province che nessun sito scrive e che ho lasciato fuori: ${fuori.join(", ")}`);
  }
  return { scritti, detto };
}

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
      partnerPiattaformaId: true, partnerInsegna: true, metafieldShopify: true,
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
  // ⭐ 11/09/2026: i campi del negozio che parlano del partner (indirizzo,
  // città, province) e l'orario di consegna dedotto dall'ora minima.
  const mfAttuali =
    p.metafieldShopify && typeof p.metafieldShopify === "object" && !Array.isArray(p.metafieldShopify)
      ? ({ ...(p.metafieldShopify as Record<string, string>) } as Record<string, string>)
      : {};
  const daPartner = await campiDelPartner(mfAttuali, (dati.partnerPiattaformaId as string) ?? p.partnerPiattaformaId);
  const mfNuovi = { ...mfAttuali, ...daPartner.scritti };
  if (!mfNuovi["custom.orario_consegna"] && mfNuovi["custom.minimo_orario"]) {
    const dedotto = orarioConsegnaDaOraMinima(mfNuovi["custom.minimo_orario"]);
    if (dedotto) daPartner.scritti["custom.orario_consegna"] = mfNuovi["custom.orario_consegna"] = dedotto;
  }
  if (Object.keys(daPartner.scritti).length) dati.metafieldShopify = mfNuovi;

  if (Object.keys(dati).length) await prisma.prodotto.update({ where: { id }, data: dati });

  const fatto: string[] = [];
  if (nuove) fatto.push(`${nuove} varianti aggiunte`);
  if (dati.prezzoVendita) fatto.push(`prezzo pubblico ${dati.prezzoVendita} €`);
  if (dati.partnerInsegna) fatto.push(`partner «${dati.partnerInsegna}»`);
  if (dati.partnerPiattaformaId) fatto.push("id del partner");
  if (dati.costoProduzione) fatto.push(`costo ${dati.costoProduzione} €`);
  if (dati.prezzoPartner && !dati.costoProduzione) fatto.push(`prezzo al partner ${dati.prezzoPartner} €`);
  if (daPartner.scritti["custom.partner_address"]) fatto.push(`indirizzo «${daPartner.scritti["custom.partner_address"]}»`);
  if (daPartner.scritti["custom.citta"]) fatto.push("città");
  if (daPartner.scritti["custom.nations_availability"]) fatto.push("province in cui si vende");
  if (daPartner.scritti["custom.orario_consegna"]) fatto.push("orario di consegna dedotto dall'ora minima");

  const riassunto = fatto.length
    ? `Recuperato dalla piattaforma: ${fatto.join(", ")}.`
    : `Dalla piattaforma non è arrivato niente di nuovo: qui c'è già tutto quello che quella lettura contiene${d.varianti.length ? "" : ", e di là il prodotto non ha varianti"}.`;

  const note = [riassunto, ...daPartner.detto.map((x) => `⚠️ ${x}.`), FUORI_PORTATA].join(" ");
  await prisma.tappaSviluppo
    .create({ data: { prodottoId: id, da: "—", a: "—", nota: note, origine: "api" } })
    .catch(() => undefined);

  return { ok: true, riassunto, cambiato: fatto.length > 0 };
}
