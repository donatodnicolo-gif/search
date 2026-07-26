import { chiamataAdmin } from "./shopify";

// Data e fascia oraria di consegna su bozze e ordini Shopify.
//
// Perché serve: sul sito i due dati sono attributi del carrello
// (`Data_Consegna` = ISO, `Fascia_Oraria_Consegna` = "10-12") e arrivano
// sull'ordine da soli. Ma una bozza creata a mano in admin non ha nessun campo
// dove scriverli — Shopify non espone gli attributi personalizzati nella
// schermata della bozza — e gli ordini nati così arrivano qui senza consegna
// (caso reale: ordine #12646, nato dalla bozza #D5510, con la sola data).
// Gli attributi di una bozza passano all'ordine quando la bozza viene
// completata, quindi scriverli qui basta a far arrivare il dato in fondo alla
// catena: registro ordini, app fornitori, smistamento.

export const CHIAVE_DATA = "Data_Consegna";
export const CHIAVE_FASCIA = "Fascia_Oraria_Consegna";

// Le stesse fasce che il sito propone al cliente: due ore per le consegne in
// giornata, un'ora per i giorni successivi. Il formato "HH-HH" con lo zero
// davanti è quello che il resto della catena si aspetta: non cambiarlo.
export const FASCE_DUE_ORE = ["08-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-22"];
export const FASCE_UN_ORA = [
  "07-08", "08-09", "09-10", "10-11", "11-12", "12-13", "13-14",
  "14-15", "15-16", "16-17", "17-18", "18-19", "19-20", "20-21", "21-22",
];

export type Attributo = { key: string; value: string };

export type DocumentoConsegna = {
  tipo: "bozza" | "ordine";
  id: string;
  numero: string;
  cliente: string | null;
  stato: string | null;
  attributi: Attributo[];
  dataConsegna: string | null;
  fascia: string | null;
  /** Avviso da mostrare prima di scrivere (es. ordine già evaso). */
  avviso: string | null;
};

const RICERCA = `
query Ricerca($qBozze: String!, $qOrdini: String!) {
  draftOrders(first: 5, query: $qBozze) {
    nodes { id name status customer { displayName } customAttributes { key value } }
  }
  orders(first: 5, query: $qOrdini) {
    nodes { id name displayFulfillmentStatus customer { displayName } customAttributes { key value } }
  }
}`;

const AGGIORNA_BOZZA = `
mutation AggiornaBozza($id: ID!, $attributi: [AttributeInput!]!) {
  draftOrderUpdate(id: $id, input: { customAttributes: $attributi }) {
    draftOrder { id name customAttributes { key value } }
    userErrors { field message }
  }
}`;

const AGGIORNA_ORDINE = `
mutation AggiornaOrdine($id: ID!, $attributi: [AttributeInput!]!) {
  orderUpdate(input: { id: $id, customAttributes: $attributi }) {
    order { id name customAttributes { key value } }
    userErrors { field message }
  }
}`;

type NodoBozza = {
  id: string;
  name: string;
  status: string | null;
  customer: { displayName: string | null } | null;
  customAttributes: Attributo[] | null;
};

type NodoOrdine = {
  id: string;
  name: string;
  displayFulfillmentStatus: string | null;
  customer: { displayName: string | null } | null;
  customAttributes: Attributo[] | null;
};

/** "#D5510", "d5510", "12646" → "D5510" / "12646". */
export function normalizzaNumero(input: string): string {
  return input.trim().replace(/^#/, "").toUpperCase();
}

function valore(attributi: Attributo[] | null, chiave: string): string | null {
  const t = (attributi ?? []).find((a) => a.key === chiave)?.value?.trim();
  return t ? t : null;
}

// Cerca il numero fra le bozze e fra gli ordini. Si interroga sempre entrambi:
// chi lavora non sa (e non deve sapere) se "#D5510" sia già diventato ordine.
export async function cercaDocumento(
  dominio: string,
  token: string,
  numeroGrezzo: string,
): Promise<DocumentoConsegna | null> {
  const numero = normalizzaNumero(numeroGrezzo);
  if (!numero) return null;

  const data = await chiamataAdmin(dominio, token, RICERCA, {
    qBozze: `name:${numero}`,
    qOrdini: `name:${numero}`,
  });

  // Shopify cerca "per prefisso": chiedendo 1264 tornano anche 12640 e 12646.
  // Teniamo solo la corrispondenza esatta sul nome, senza cancelletto.
  const uguale = (nome: string) => nome.replace(/^#/, "").toUpperCase() === numero;

  const bozza: NodoBozza | undefined = (data?.draftOrders?.nodes ?? []).find((n: NodoBozza) => uguale(n.name));
  if (bozza) {
    const completata = (bozza.status ?? "").toUpperCase() === "COMPLETED";
    return {
      tipo: "bozza",
      id: bozza.id,
      numero: bozza.name,
      cliente: bozza.customer?.displayName ?? null,
      stato: bozza.status ?? null,
      attributi: bozza.customAttributes ?? [],
      dataConsegna: valore(bozza.customAttributes, CHIAVE_DATA),
      fascia: valore(bozza.customAttributes, CHIAVE_FASCIA),
      avviso: completata
        ? "Questa bozza è già stata completata: modificarla non cambia più l'ordine che ne è nato. Cerca il numero dell'ordine."
        : null,
    };
  }

  const ordine: NodoOrdine | undefined = (data?.orders?.nodes ?? []).find((n: NodoOrdine) => uguale(n.name));
  if (ordine) {
    const evaso = (ordine.displayFulfillmentStatus ?? "").toUpperCase() === "FULFILLED";
    return {
      tipo: "ordine",
      id: ordine.id,
      numero: ordine.name,
      cliente: ordine.customer?.displayName ?? null,
      stato: ordine.displayFulfillmentStatus ?? null,
      attributi: ordine.customAttributes ?? [],
      dataConsegna: valore(ordine.customAttributes, CHIAVE_DATA),
      fascia: valore(ordine.customAttributes, CHIAVE_FASCIA),
      avviso: evaso
        ? "Ordine già evaso: se la consegna è davvero cambiata, avvisa anche il fornitore — cambiare l'attributo qui non lo richiama indietro."
        : null,
    };
  }

  return null;
}

// Le due mutazioni sostituiscono l'INTERO elenco di attributi, quindi si parte
// da quelli esistenti e si toccano solo le due chiavi della consegna: gli altri
// attributi (quelli scritti dal tema o da altre app) devono restare.
function attributiUniti(esistenti: Attributo[], data: string | null, fascia: string | null): Attributo[] {
  const out = esistenti
    .filter((a) => a.key !== CHIAVE_DATA && a.key !== CHIAVE_FASCIA)
    .map((a) => ({ key: a.key, value: a.value ?? "" }));
  if (data) out.push({ key: CHIAVE_DATA, value: data });
  if (fascia) out.push({ key: CHIAVE_FASCIA, value: fascia });
  return out;
}

export function dataValida(t: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

export function fasciaValida(t: string): boolean {
  return FASCE_DUE_ORE.includes(t) || FASCE_UN_ORA.includes(t);
}

// Scrive data e fascia. Un campo lasciato vuoto viene rimosso dagli attributi:
// meglio nessun dato che un dato vecchio, che a valle sembrerebbe confermato.
export async function scriviConsegna(
  dominio: string,
  token: string,
  doc: DocumentoConsegna,
  data: string | null,
  fascia: string | null,
): Promise<{ attributi: Attributo[] }> {
  const attributi = attributiUniti(doc.attributi, data, fascia);
  const query = doc.tipo === "bozza" ? AGGIORNA_BOZZA : AGGIORNA_ORDINE;

  let risposta;
  try {
    risposta = await chiamataAdmin(dominio, token, query, { id: doc.id, attributi });
  } catch (e) {
    const msg = (e as Error).message;
    // Il token dell'app nasce in sola lettura: senza gli scope di scrittura
    // Shopify risponde "Access denied" e il messaggio grezzo non aiuta.
    if (/access denied|not approved|write_/i.test(msg)) {
      throw new Error(
        `Shopify ha rifiutato la scrittura: al token del negozio mancano i permessi ` +
          `(${doc.tipo === "bozza" ? "write_draft_orders" : "write_orders"}). ` +
          `Aggiungili all'app nella Dev Dashboard di Shopify e risincronizza il token.`,
      );
    }
    throw e;
  }

  const payload = doc.tipo === "bozza" ? risposta?.draftOrderUpdate : risposta?.orderUpdate;
  const errori: { message: string }[] = payload?.userErrors ?? [];
  if (errori.length > 0) throw new Error(errori.map((e) => e.message).join("; "));

  const aggiornati: Attributo[] =
    (doc.tipo === "bozza" ? payload?.draftOrder?.customAttributes : payload?.order?.customAttributes) ?? [];
  return { attributi: aggiornati };
}
