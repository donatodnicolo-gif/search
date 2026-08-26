import type { MovimentoBanca, Ordine } from "@prisma/client";
import { prisma, SCHEMA } from "./db";

// CONTROLLO DEI SOLDI DI UN ORDINE — le due metà del margine.
//
// Un ordine, in banca, lascia due tracce diverse e in due momenti diversi:
//  1. l'INCASSO del cliente — un accredito, di importo ~ uguale al totale;
//  2. il COSTO del fornitore — un addebito al fioraio, che vale una frazione
//     (di norma ~60%) e quindi NON si riconosce dall'importo.
//
// Da qui tutto il resto: l'abbinamento **non** si fa per importo ma per NUMERO
// D'ORDINE nella causale, e i due lati si tengono separati sull'ordine. Se un
// dato non c'è, si scrive che non c'è: un margine calcolato su un costo
// inventato è peggio di un margine mancante.
//
// Questa logica arriva da deluxy-partner (`/ordini`), che l'ha maturata su dati
// veri per mesi; qui è stata portata dove stanno gli ordini. Le differenze
// volute rispetto a là sono due, e sono dichiarate:
//  · i movimenti sono uno SPECCHIO di sola lettura (Finance resta il padrone del
//    denaro): non si marca «registrata» niente di suo;
//  · un movimento non viene «consumato»: che sia usato lo dice l'ordine che lo
//    cita, perciò una reimportazione dell'estratto non può perdere il lavoro.

export const STATI_INCASSO: Record<string, { nome: string; colore: string; spiega: string }> = {
  da_riconciliare: {
    nome: "Da riconciliare",
    colore: "var(--orange)",
    spiega: "Il denaro dovrebbe essere arrivato in banca, ma nessuno ha ancora indicato quale movimento è",
  },
  riconciliato: {
    nome: "Riconciliato",
    colore: "var(--green)",
    spiega: "Abbinato a un movimento bancario (o segnato incassato a mano)",
  },
  incassato_gateway: {
    nome: "Incassato (carta)",
    colore: "var(--blue)",
    spiega: "Pagato con carta su Shopify: l'incasso è avvenuto sul gateway, il versamento arriva a blocchi",
  },
  ignorato: {
    nome: "Ignorato",
    colore: "var(--text-tertiary)",
    spiega: "Fuori dal conto per scelta: non entra nelle percentuali",
  },
};

// COME si incassa — cosa diversa dallo STATO. Gli ordini di deluxy.it sono
// ordini di un PARTNER e rientrano nel suo conto mensile: cercarne il bonifico
// in banca è tempo perso, e per questo lì la riconciliazione non si offre.
export const GESTIONI_INCASSO: Record<string, { nome: string; riconciliabile: boolean; spiega: string }> = {
  riconciliazione: { nome: "Incasso da riconciliare", riconciliabile: true, spiega: "Il denaro arriva in banca e si abbina a un movimento" },
  partner: { nome: "Ordine partner", riconciliabile: false, spiega: "Rientra nel conto mensile del partner: in banca non c'è niente da cercare" },
  pagamento_esterno: { nome: "Richiesta di pagamento esterna", riconciliabile: true, spiega: "Pagamento chiesto fuori da Shopify: il denaro arriva in banca" },
};

// Il brand i cui ordini nascono già «ordine partner» (come in Finance).
export const BRAND_ORDINI_PARTNER = "deluxy.it";

export function gestioneIniziale(brand: string): string {
  return brand === BRAND_ORDINI_PARTNER ? "partner" : "riconciliazione";
}

// Da dove parte l'incasso di un ordine appena arrivato. Una carta PAID è già
// incassata sul gateway: il versamento in banca arriva a blocchi, non ordine per
// ordine, quindi cercarne il movimento è tempo perso. Tutto il resto parte «da
// riconciliare», che è la verità: non lo sappiamo ancora.
export function statoIncassoIniziale(categoriaPagamento: string, financialStatus: string | null): string {
  return categoriaPagamento === "carta" && financialStatus === "PAID" ? "incassato_gateway" : "da_riconciliare";
}

// ---- La normalizzazione dell'archivio -------------------------------------
// Gli ordini importati PRIMA che esistesse il controllo sono tutti «da
// riconciliare» con gestione «riconciliazione»: dodicimila ordini in una coda
// che nessuno deve lavorare. Questa funzione li porta al punto di partenza
// giusto, e **solo dove nessuno ha ancora deciso niente** (nessun movimento
// abbinato, stato ancora quello di default). Due UPDATE, non dodicimila.
export async function normalizzaControllo(): Promise<{ gestioni: number; gateway: number; tariffe: number }> {
  const gestioni = await prisma.ordine.updateMany({
    where: {
      brand: BRAND_ORDINI_PARTNER,
      gestioneIncasso: "riconciliazione",
      movimentoIncassoId: null,
      statoIncasso: "da_riconciliare",
    },
    data: { gestioneIncasso: "partner" },
  });
  const gateway = await prisma.ordine.updateMany({
    where: {
      categoriaPagamento: "carta",
      financialStatus: "PAID",
      statoIncasso: "da_riconciliare",
      movimentoIncassoId: null,
    },
    data: { statoIncasso: "incassato_gateway" },
  });
  // ── LA COMMISSIONE D'INCASSO DA LISTINO, dove Shopify non sa la fee vera ──
  //
  // Due passate (prima il listino del NEGOZIO, poi quello generale), in SQL
  // perche' e' un conto su migliaia di righe e perche' cosi' la formula vive in
  // UN posto: margineOrdine legge il valore scritto, non lo rifa'.
  // ⚠️ Non si tocca cio' che e' firmato 'shopify' (fee reale) ne' 'tariffa' gia'
  // uguale; il match del gateway e' ESATTO, quindi i pagamenti misti
  // («shopify_payments, paypal») restano fuori e il margine li dichiara parziali.
  // Satispay e' gratis sotto i 10 €: il listino non sa dirlo, il CASE si'.
  const tariffaSql = (filtroBrand: string) => `
    UPDATE "${SCHEMA}"."Ordine" AS o
    SET "commissioneIncassi" = calc.v, "commissioneDa" = 'tariffa'
    FROM (
      SELECT o2.id AS oid,
             ROUND((CASE WHEN t.gateway = 'Satispay App' AND o2.totale < 10 THEN 0
                         ELSE t.percentuale / 100.0 * o2.totale + t.fissa END)::numeric, 2)::float8 AS v
      FROM "${SCHEMA}"."Ordine" o2
      JOIN "${SCHEMA}"."TariffaIncasso" t ON t.attiva AND t.gateway = o2.gateway AND ${filtroBrand}
      WHERE o2."commissioneDa" <> 'shopify'
    ) calc
    WHERE o.id = calc.oid
      AND (o."commissioneIncassi" IS DISTINCT FROM calc.v OR o."commissioneDa" <> 'tariffa')`;
  const tariffeBrand = await prisma.$executeRawUnsafe(tariffaSql(`t.brand = o2.brand`));
  const tariffeTutti = await prisma.$executeRawUnsafe(
    tariffaSql(`t.brand IS NULL AND NOT EXISTS (
      SELECT 1 FROM "${SCHEMA}"."TariffaIncasso" t2
      WHERE t2.attiva AND t2.gateway = o2.gateway AND t2.brand = o2.brand)`),
  );
  return { gestioni: gestioni.count, gateway: gateway.count, tariffe: tariffeBrand + tariffeTutti };
}

// Gli stati che valgono come «i soldi del cliente li abbiamo».
export const INCASSATI = ["riconciliato", "incassato_gateway"] as const;

// ---- La quota attesa del fornitore -----------------------------------------
// Deluxy paga al fornitore una quota del valore dell'ordine: di norma ~60%.
// Pagare SOTTO la quota è bene (margine alto), SOPRA è male. Si cambia in
// Impostazioni senza toccare il codice.
export const QUOTA_FORNITORE_DEFAULT = 60;
const CHIAVE_QUOTA = "controllo.quotaFornitore";

export async function quotaFornitore(): Promise<number> {
  const r = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE_QUOTA } });
  const v = Number(r?.valore);
  return Number.isFinite(v) && v > 0 && v < 100 ? v : QUOTA_FORNITORE_DEFAULT;
}

/**
 * La quota fornitore PER PROVINCIA (e categoria): Standard §7.4.
 *
 * Cascata: regola (provincia, categoria) → regola (provincia, qualunque) →
 * quota globale. La risposta dice DA DOVE viene il numero (`regola`), perché
 * «60 di default» e «55 deciso per Caserta» non meritano la stessa fiducia
 * quando qualcuno si chiede perché un costo non torna.
 *
 * ⚠️ Vale per i fornitori in chat: gli ordini smistati dalla piattaforma hanno
 * lo sconto cristallizzato sulla vendita là, e questo numero non c'entra.
 */
export async function quotaFornitorePer(
  provincia?: string | null,
  categoria?: string | null,
): Promise<{ quota: number; regola: "provincia+categoria" | "provincia" | "default" }> {
  const prov = provincia?.trim().toUpperCase() ?? "";
  const cat = categoria?.trim().toLowerCase() ?? "";
  if (prov) {
    const regole = await prisma.quotaRegola.findMany({
      where: { provincia: prov, categoria: { in: cat ? [cat, ""] : [""] } },
    });
    const precisa = cat ? regole.find((r) => r.categoria === cat) : undefined;
    if (precisa) return { quota: precisa.percento, regola: "provincia+categoria" };
    const generica = regole.find((r) => r.categoria === "");
    if (generica) return { quota: generica.percento, regola: "provincia" };
  }
  return { quota: await quotaFornitore(), regola: "default" };
}

/**
 * Il MARGINE di un ordine — la formula vive QUI e solo qui (Standard §7.4).
 *
 *   fornitore diretto:  totale − costoFornitore
 *   via piattaforma:    totale − costoFornitore − costoConsegna + feeConsegna
 *
 * `null` = non calcolabile (manca il costo del fornitore): mai zero, mai un
 * numero finto. `parziale` dice che manca un ingrediente della consegna
 * nostra: il numero c'è ma non è tutto.
 *
 * ⚠️ IL VALORE PUÒ ESSERE NEGATIVO, ed è giusto così. Un ordine venduto sotto
 * costo esiste: uno sconto spinto, un fornitore più caro del previsto, una
 * consegna costata più del margine. Non si azzera e non si nasconde — un
 * margine negativo è esattamente l'informazione per cui questo conto esiste.
 * Chi lo mostra deve dire «perdita» a lettere: un meno davanti a un numero, in
 * una tabella di numeri, si perde.
 *
 * ⚠️ Da non confondere con gli INGREDIENTI, che negativi non possono essere:
 * `costoFornitore`, `costoConsegna` e `feeConsegna` sono importi pagati, e il
 * PATCH li rifiuta sotto zero. È il RISULTATO che può andare in rosso, non le
 * cose che ci entrano.
 */
// L'aliquota IVA scorporata dal margine, in percentuale. È il MARGINE REALE:
// la differenza fra prezzo e costi è IVA-inclusa, e l'IVA non è profitto.
//
// ⚠️ Scelta dell'utente (24/08/2026): UNA sola aliquota, **22% su tutto** — anche
// fiori e torte, che in Italia sarebbero di norma al 10%. Gliel'ho segnalato
// (il margine reale su fiori/torte risulta più basso del vero) e ha scelto così
// consapevolmente. Se un giorno serve l'aliquota per categoria, il posto è QUI:
// margineOrdine è l'unico che scorpora, tutto il resto legge da lui.
export const ALIQUOTA_IVA = 22;

/**
 * La percentuale di margine che ci si ASPETTA pagando la quota di riferimento,
 * sulla stessa base delle percentuali mostrate (margine netto ÷ totale lordo).
 *
 * Con quota 60% non è 40%: è 40 ÷ 1,22 = 32,8%. Senza questo scorporo ogni
 * margine risulterebbe «sotto le attese» e sarebbe rosso a torto — la soglia va
 * portata sulla base del numero che deve giudicare, non viceversa.
 */
export function margineAttesoPct(quota: number): number {
  return (100 - quota) / (1 + ALIQUOTA_IVA / 100);
}

/**
 * Gateway che non costano nulla da incassare: contante alla consegna e
 * bonifico. Tutto il resto (carte, PayPal, wallet) una commissione ce l'ha —
 * e se il numero non c'e', il margine si dichiara parziale invece di fingere
 * che incassare sia gratis.
 */
const GATEWAY_SENZA_COMMISSIONE = /cash|contrassegno|cod|manual|bank|deposit/i;

export function margineOrdine(o: {
  totale: number;
  costoFornitore: number | null;
  costoConsegna: number | null;
  feeConsegna: number | null;
  evasione: string;
  consegnataDa: string;
  /** La commissione d'incasso (tariffa del gateway; zero per il contante).
   *  ⚠️ SI DETRAE SEMPRE dal margine (decisione utente 26/08/2026): nel numero
   *  della piattaforma e' gia' dentro, nel ripiego si sottrae qui. */
  commissioneIncassi: number | null;
  /** Il gateway Shopify: serve a distinguere «commissione zero perche'
   *  contante» da «commissione NON NOTA» quando il campo sopra e' vuoto. */
  gateway: string | null;
  /** Il margine gia' fatto dalla piattaforma consegne. Se c'e', VINCE.
   *  ⚠️ OBBLIGATORIO apposta: se fosse opzionale ogni chiamante che si scorda
   *  di passarlo compilerebbe lo stesso e ricadrebbe in silenzio sul conto del
   *  registro — cioe' il difetto che questa modifica serve a togliere. Cosi'
   *  invece e' il compilatore a trovare i punti da aggiornare. */
  margineFinale: number | null;
}): {
  valore: number | null;
  pct: number | null;
  /** Il ricavo NETTO dell'ordine (totale / 1,22). */
  imponibile: number;
  parziale: boolean;
  /** `piattaforma` = numero ricevuto gia' fatto; `registro` = calcolato qui. */
  fonte: "piattaforma" | "registro";
  nota: string;
} {
  const imponibile = Math.round((o.totale / (1 + ALIQUOTA_IVA / 100)) * 100) / 100;
  const percento = (v: number) => (o.totale > 0.005 ? Math.round((v / o.totale) * 1000) / 10 : null);

  // ⚠️⚠️ IL MARGINE DELL'ORDINE E' QUELLO CHE MANDA LA PIATTAFORMA CONSEGNE
  // (decisione dell'utente, 26/08/2026). Non e' un ingrediente: e' il SUO conto,
  // e comprende cose che qui non si sanno —
  //   primo margine = (pagato dal cliente - valore prodotti dato al partner) / 1,22
  //   + fee della vendita - costo del valet - commissione d'incasso
  // Il pezzo che qui manca e' il primo: il VALORE DATO AL PARTNER sta scritto
  // sulla consegna (`Delivery.productValue`), non nel registro. Rifacendo il
  // conto con `costoFornitore` uscivano numeri diversi e piu' alti — #12805:
  // 81,97 EUR qui contro 52,88 veri; #12802: 163,93 contro 69,49 — perche' al
  // posto del valore al partner c'era un campo spesso VUOTO: 410 ordini su
  // 14.411 hanno un costoFornitore, 10.053 hanno il margine della piattaforma.
  if (o.margineFinale != null) {
    return {
      valore: Math.round(o.margineFinale * 100) / 100,
      pct: percento(o.margineFinale),
      imponibile,
      parziale: false,
      fonte: "piattaforma",
      nota: "margine della piattaforma consegne (primo margine + fee - consegna - commissione d'incasso, gia' al netto IVA)",
    };
  }

  // RIPIEGO — solo per gli ordini che la piattaforma non conosce: qui il costo
  // del fornitore e' l'unica cosa che si ha, e il conto vale quello che vale.
  if (o.costoFornitore == null) {
    return { valore: null, pct: null, imponibile, parziale: false, fonte: "registro", nota: "manca il costo del fornitore" };
  }
  let lordo = o.totale - o.costoFornitore;
  let parziale = false;
  let nota = "totale - costo fornitore";
  const consegnaNostra = o.evasione === "piattaforma" && o.consegnataDa !== "fornitore";
  if (consegnaNostra) {
    if (o.costoConsegna != null) {
      lordo = lordo - o.costoConsegna + (o.feeConsegna ?? 0);
      nota = "totale - costo fornitore - costo consegna + fee";
    } else {
      parziale = true;
      nota = "senza il costo della consegna (la piattaforma non lo espone ancora)";
    }
  }
  let valore = Math.round((lordo / (1 + ALIQUOTA_IVA / 100)) * 100) / 100;
  // LA COMMISSIONE D'INCASSO SI DETRAE SEMPRE (come nel numero della
  // piattaforma, dove e' gia' dentro). Si sottrae DOPO lo scorporo: e' un costo
  // pieno, non un importo con dentro l'IVA da togliere — stessa scelta della
  // piattaforma (margine = guadagno netto − consegna − commissione).
  const commissione =
    o.commissioneIncassi ??
    (o.gateway && GATEWAY_SENZA_COMMISSIONE.test(o.gateway) ? 0 : null);
  if (commissione != null) {
    valore = Math.round((valore - commissione) * 100) / 100;
    if (commissione > 0) nota = `${nota} − commissione d'incasso`;
  } else {
    // Non si finge che incassare sia gratis: il margine esce, ma dichiarato
    // incompleto. Sparira' quando le tariffe d'incasso vivranno in Orders.
    parziale = true;
    nota = `${nota} · senza la commissione d'incasso`;
  }
  return {
    valore,
    pct: percento(valore),
    imponibile,
    parziale,
    fonte: "registro",
    nota: `${nota} · al netto IVA ${ALIQUOTA_IVA}% · conto del registro: la piattaforma non ha questo ordine`,
  };
}


export async function salvaQuotaFornitore(quota: number): Promise<void> {
  const v = Math.min(99, Math.max(1, Math.round(quota)));
  await prisma.impostazione.upsert({
    where: { chiave: CHIAVE_QUOTA },
    create: { chiave: CHIAVE_QUOTA, valore: String(v) },
    update: { valore: String(v) },
  });
}

export type ValutazioneQuota = {
  atteso: number; // quanto ci aspettiamo di pagare: totale × quota%
  pct: number; // quanto è stato pagato, in % del totale
  scostoPP: number; // punti percentuali di scarto dalla quota (>0 = sopra = male)
  stato: "buono" | "alto";
};

export function valutaQuota(totale: number, pagato: number, quota = QUOTA_FORNITORE_DEFAULT): ValutazioneQuota {
  const atteso = totale * (quota / 100);
  const pct = totale > 0.005 ? (pagato / totale) * 100 : 0;
  return { atteso, pct, scostoPP: pct - quota, stato: pct <= quota + 0.5 ? "buono" : "alto" };
}

// ---- Il numero d'ordine dentro la causale -----------------------------------

// «#1234» → «1234». Solo le cifre, perché in causale il cancelletto non c'è.
export function numeroOrdine(numero: string): string {
  return (numero.match(/\d+/g)?.join("") ?? "").trim();
}

// I numeri che compaiono in un testo come TOKEN ISOLATI — delimitati da spazi o
// punteggiatura, non attaccati a lettere o ad altre cifre. La forma stretta è
// obbligatoria: gli identificativi dei gateway contengono cifre a caso, e
// «2570» dentro «1045694124072570» non è il nostro ordine.
//
// È l'UNICO posto dove questa regola è scritta: chi deve fare un solo confronto
// usa `causaleContieneNumero`, chi deve incrociare migliaia di righe si costruisce
// l'indice da qui. Due implementazioni della stessa regola divergono sempre.
const NUMERI_ISOLATI = /(?<![\p{L}\d])\d+(?![\p{L}\d])/gu;

export function numeriIsolati(testo: string): Set<string> {
  return new Set((testo ?? "").match(NUMERI_ISOLATI) ?? []);
}

export function causaleContieneNumero(m: Pick<MovimentoBanca, "descrizione" | "controparte">, numero: string): boolean {
  if (!numero || numero.length < 2) return false;
  return numeriIsolati(`${m.descrizione} ${m.controparte ?? ""}`).has(numero);
}

// Criterio STRETTO per i pagamenti ai fornitori: la causale è il solo numero,
// senza parole. I bonifici ai fiorai hanno causale «2534»; gli addebiti di
// PayPal o di un fornitore terzo contengono un nome e vanno esclusi anche se
// una cifra coincide per caso.
export function causaleSenzaParole(descrizione: string | null): boolean {
  return !/\p{L}/u.test(descrizione ?? "");
}

export function causaleSoloNumero(m: Pick<MovimentoBanca, "descrizione">, numero: string): boolean {
  if (!numero || numero.length < 2) return false;
  if (!causaleSenzaParole(m.descrizione)) return false;
  return numeriIsolati(m.descrizione ?? "").has(numero);
}

const TOLLERANZA = 0.02;

// I movimenti compatibili con l'incasso di un ordine, dal più probabile. Due
// segnali: il numero in causale (forte) e l'importo uguale (±2 cent), rafforzato
// dal nome del cliente. I candidati per numero si mostrano anche se l'importo
// non torna: è proprio il caso da guardare a mano.
export function suggerisciIncassi(
  ordine: Pick<Ordine, "numero" | "totale" | "clienteNome">,
  movimenti: MovimentoBanca[],
  giaUsati: Set<string>,
): { movimento: MovimentoBanca; forte: boolean; perNumero: boolean; stessoImporto: boolean }[] {
  const parole = (ordine.clienteNome ?? "").toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  const numero = numeroOrdine(ordine.numero);
  return movimenti
    .filter((m) => m.importo > 0 && !giaUsati.has(m.id))
    .map((m) => {
      const perNumero = causaleContieneNumero(m, numero);
      const stessoImporto = Math.abs(m.importo - ordine.totale) <= TOLLERANZA;
      const testo = `${m.descrizione} ${m.controparte ?? ""}`.toLowerCase();
      const nomeCombacia = parole.length > 0 && parole.some((p) => testo.includes(p));
      return { movimento: m, perNumero, stessoImporto, forte: perNumero || (stessoImporto && nomeCombacia) };
    })
    .filter((c) => c.perNumero || c.stessoImporto)
    .sort((a, b) => Number(b.perNumero) - Number(a.perNumero) || Number(b.forte) - Number(a.forte));
}

// I movimenti già usati dal controllo: la verità sta sugli ORDINI, non sul
// movimento. Derivarla invece di salvarla costa una query e non può andare
// fuori sincrono — cosa che con un flag salvato succede sempre, prima o poi.
export async function movimentiUsati(): Promise<Set<string>> {
  const righe = await prisma.ordine.findMany({
    where: { OR: [{ movimentoIncassoId: { not: null } }, { costoMovimentoId: { not: null } }] },
    select: { movimentoIncassoId: true, costoMovimentoId: true },
  });
  const usati = new Set<string>();
  for (const r of righe) {
    if (r.movimentoIncassoId) usati.add(r.movimentoIncassoId);
    if (r.costoMovimentoId) usati.add(r.costoMovimentoId);
  }
  return usati;
}
