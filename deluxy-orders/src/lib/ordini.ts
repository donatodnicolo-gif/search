import { Prisma } from "@prisma/client";
import { inizioGiornoItaliano, intervalloScorciatoia } from "./analisi";
import { chiaveCliente } from "./tipologia-cliente";
import { CANALI_PAGATI } from "./marketing";
import { prisma } from "./db";
import { daLontano, variantiCitta } from "./luoghi";
import { giorniDiAnticipo } from "./urgenza";
import { etichettaLavorazioneCs } from "./customer-service";
import { margineOrdine } from "./controllo";
import { saluteOrdine, saluteValida, whereSalute } from "./salute";

// Costruzione del filtro Prisma degli ordini, condivisa tra la UI (elenco) e le
// API di lettura, così i due percorsi filtrano allo stesso modo.
// Parametri accettati: q (ricerca a parole), brand, stato (chiave), categoria
// (di pagamento), app (destinazione), etichetta (nome), anno (anno civile
// italiano), da/a (date ISO).
// I campi in cui cerca una singola parola. Include l'ordine (anche senza "#"),
// il cliente (nome, email, telefono), il destinatario e l'indirizzo completo, i
// prodotti (titolo, variante, SKU), le note e i tag Shopify, e la
// classificazione Deluxy (fornitore, responsabile, note interne, etichette).
function campiRicerca(parola: string): Prisma.OrdineWhereInput[] {
  const c = { contains: parola, mode: "insensitive" as const };
  // "#1234" e "1234" devono trovare lo stesso ordine
  const senzaCancelletto = parola.replace(/^#/, "");
  return [
    { numero: c },
    { numero: { contains: senzaCancelletto, mode: "insensitive" } },
    { clienteNome: c },
    { clienteEmail: c },
    { clienteTelefono: c },
    { spedizioneNome: c },
    { indirizzo: c },
    { citta: c },
    { cap: c },
    { provincia: c },
    { paese: c },
    { brand: c },
    { fasciaConsegna: c },
    { noteShopify: c },
    { tagShopify: c },
    { gateway: c },
    // classificazione Deluxy
    { fornitore: c },
    { responsabile: c },
    { tipoConsegna: c },
    { tipoProdotto: c },
    { canale: c },
    { noteInterne: c },
    { etichette: { some: { nome: c } } },
    // prodotti dell'ordine
    {
      righe: {
        some: {
          OR: [{ titolo: c }, { variante: c }, { sku: c }],
        },
      },
    },
  ];
}

export function whereOrdini(p: URLSearchParams): Prisma.OrdineWhereInput {
  const where: Prisma.OrdineWhereInput = {};
  const and: Prisma.OrdineWhereInput[] = [];

  const q = p.get("q")?.trim();
  if (q) {
    // Ricerca a parole: ogni parola deve comparire in ALMENO uno dei campi
    // (AND fra le parole, OR fra i campi). Così "rossi milano" trova gli ordini
    // di Rossi a Milano, e l'ordine si trova sia come "#1234" sia come "1234".
    for (const parola of q.split(/\s+/).filter(Boolean)) {
      and.push({ OR: campiRicerca(parola) });
    }
  }

  const brand = p.get("brand")?.trim();
  if (brand) where.brand = brand;

  const stato = p.get("stato")?.trim();
  if (stato) where.stato = { chiave: stato };

  const categoria = p.get("categoria")?.trim();
  if (categoria) where.categoriaPagamento = categoria;

  const app = p.get("app")?.trim();
  if (app) where.assegnatoApp = app;

  const etichetta = p.get("etichetta")?.trim();
  if (etichetta) where.etichette = { some: { nome: etichetta } };

  // Stato lato Shopify. Gli annullati sono la distinzione che conta di più:
  // di norma NON si vogliono vedere insieme agli ordini validi.
  const shopify = p.get("shopify")?.trim();
  if (shopify === "annullati") where.annullatoIl = { not: null };
  else if (shopify === "validi") where.annullatoIl = null;
  else if (shopify === "da_evadere") {
    where.annullatoIl = null;
    where.fulfillmentStatus = { in: ["UNFULFILLED", "PARTIALLY_FULFILLED", "ON_HOLD", "SCHEDULED"] };
  } else if (shopify === "evasi") {
    where.fulfillmentStatus = "FULFILLED";
  } else if (shopify === "rimborsati") {
    where.financialStatus = { in: ["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"] };
  }

  // Stato del pagamento preciso (codice Shopify): PAID, PENDING, REFUNDED…
  const pagamento = p.get("pagamento")?.trim();
  if (pagamento) where.financialStatus = pagamento;

  // Ordini PROBLEMATICI (vedi motiviProblema): oggi sono i rimborsi parziali.
  //   aperti = da guardare · gestiti = già visti da qualcuno · tutti = entrambi
  const problema = p.get("problema")?.trim();
  if (problema === "aperti" || problema === "gestiti" || problema === "tutti") {
    where.financialStatus = { in: [...STATI_PROBLEMA] };
    if (problema !== "tutti") where.problemaGestito = problema === "gestiti";
  }

  // Rischio frode: "sospetti" = medio o alto, quelli da guardare a mano.
  const rischio = p.get("rischio")?.trim();
  if (rischio === "sospetti") where.rischioLivello = { in: ["MEDIUM", "HIGH"] };
  else if (rischio) where.rischioLivello = rischio;

  // SALUTE dell'ordine (conforme | a rischio | non pagato | cancellato |
  // nullo): la regola è scritta una volta sola in `salute.ts`, qui si applica.
  // ⚠️ Va in `AND` e NON su `where.annullatoIl`/`where.financialStatus`: quei
  // due campi li usano già i filtri `shopify`, `pagamento` e `problema` qui
  // sopra, e scriverli una seconda volta ne cancellerebbe uno in silenzio —
  // l'elenco mostrerebbe un risultato diverso da quello che dicono i filtri
  // accesi, che è il modo più veloce di perdere fiducia in una tabella.
  const salute = p.get("salute")?.trim();
  if (saluteValida(salute)) and.push(whereSalute(salute));

  // Da dove è arrivato l'ordine. `canale=sconosciuto` chiede proprio quelli su
  // cui Shopify non sa dire niente: sono una coda di lavoro per il marketing,
  // non un buco da nascondere.
  const canale = p.get("canale")?.trim();
  if (canale === "sconosciuto") where.canaleMarketing = "";
  else if (canale === "pagato") where.canaleMarketing = { in: CANALI_PAGATI };
  else if (canale) where.canaleMarketing = canale;

  // Dove arriva e da dove parte. Il confronto è insensibile a maiuscole e
  // spazi, perché le città arrivano da Shopify in ogni forma: «MILANO»,
  // «Milano» e « milano » sono lo stesso posto.
  // Il filtro cerca anche le altre grafie della stessa città («Milano» trova i
  // 171 ordini scritti «Milan»): senza, cliccando sul tag quegli ordini
  // sparirebbero senza che nessuno se ne accorga.
  // Cerca anche fra le città DEDOTTE dai tag o dal nome del prodotto:
  // altrimenti cliccando il tag «Roma» su un ordine riconciliato non
  // uscirebbe l'ordine stesso, che è il modo più veloce di perdere fiducia.
  const citta = p.get("citta")?.trim();
  if (citta) {
    and.push({
      OR: [
        ...variantiCitta(citta).map((v) => ({ citta: { equals: v, mode: "insensitive" as const } })),
        { cittaDedotta: { equals: citta, mode: "insensitive" as const } },
      ],
    });
  }

  const paese = p.get("paese")?.trim();
  if (paese) where.paese = { equals: paese, mode: "insensitive" };

  const cittaMittente = p.get("cittaMittente")?.trim();
  if (cittaMittente) {
    and.push({
      OR: variantiCitta(cittaMittente).map((v) => ({
        mittenteCitta: { equals: v, mode: "insensitive" as const },
      })),
    });
  }

  const paeseMittente = p.get("paeseMittente")?.trim();
  if (paeseMittente) where.mittentePaese = { equals: paeseMittente, mode: "insensitive" };

  // Ordini mandati da un paese diverso da quello di consegna: i regali spediti
  // da lontano, che al Customer Service arrivano con domande diverse. Il
  // confronto è fra due colonne della stessa riga (riferimento a campo).
  if (p.get("estero")?.trim() === "si") {
    and.push({
      paese: { not: null },
      mittentePaese: { not: null },
      NOT: { mittentePaese: { equals: prisma.ordine.fields.paese } },
    });
  }

  // Quanto tempo c'è fino alla consegna. `senza-data` è una risposta legittima:
  // sono gli ordini in cui la data non è stata indicata, e vanno potuti vedere.
  const urgenza = p.get("urgenza")?.trim();
  if (urgenza === "senza-data") where.urgenza = "";
  else if (urgenza) where.urgenza = urgenza;

  // Ordini ENTRATI NEL REGISTRO dopo un certo momento: è la domanda «che cosa è
  // arrivato mentre non guardavo». Diversa da `da`/`a`, che filtrano la data
  // dell'ordine su Shopify — un ordine di ieri sera importato stamattina è
  // nuovo per chi lavora, anche se per Shopify è di ieri.
  const nuoviDa = p.get("nuoviDa")?.trim();
  if (nuoviDa) {
    const quando = new Date(nuoviDa);
    if (!Number.isNaN(quando.getTime())) where.createdAt = { gte: quando };
  }

  // ANNO dell'ordine. È il taglio che si chiede più spesso («quanto abbiamo
  // fatto nel 2025») e con `da`/`a` erano due date da scrivere a mano.
  // ⚠️ L'anno è quello ITALIANO: `Ordine.data` è UTC, e tagliare sul 1° gennaio
  // di Greenwich metterebbe l'ultima ora del 31 dicembre nell'anno dopo. Il
  // confine lo dà `inizioGiornoItaliano`, la stessa regola dell'analisi.
  // Sta in `AND` e non in `where.data` per convivere con `da`/`a` invece di
  // sovrascriverli in silenzio.
  const anno = Number(p.get("anno")?.trim());
  if (Number.isInteger(anno) && anno >= 2000 && anno <= 2100) {
    const inizioAnno = inizioGiornoItaliano(`${anno}-01-01`);
    const inizioDopo = inizioGiornoItaliano(`${anno + 1}-01-01`);
    if (inizioAnno && inizioDopo) and.push({ data: { gte: inizioAnno, lt: inizioDopo } });
  }

  // Le SCORCIATOIE DI PERIODO (Libro UX&UI v1.9 §8-bis): un parametro solo
  // (`periodo=mese|scorso|trimestre|anno`) tradotto in un intervallo a confini
  // italiani. La data è quella dell'ORDINE su Shopify (`Ordine.data`), la
  // stessa dell'anno e di `da`/`a`: «mese in corso» = ordinato questo mese.
  // Sta in `AND` per convivere con gli altri tagli invece di sovrascriverli.
  const scorciatoia = intervalloScorciatoia(p.get("periodo")?.trim());
  if (scorciatoia) and.push({ data: scorciatoia });

  const da = p.get("da")?.trim();
  const a = p.get("a")?.trim();
  if (da || a) {
    const dataFiltro: Prisma.DateTimeFilter = {};
    if (da) dataFiltro.gte = new Date(da);
    if (a) dataFiltro.lte = new Date(`${a}T23:59:59`);
    where.data = dataFiltro;
  }

  // Filtro sulla data di CONSEGNA richiesta (consegnaDa / consegnaA), utile per
  // sapere cosa esce oggi o domani.
  const cDa = p.get("consegnaDa")?.trim();
  const cA = p.get("consegnaA")?.trim();
  if (cDa || cA) {
    const filtro: Prisma.DateTimeFilter = {};
    if (cDa) filtro.gte = new Date(`${cDa}T00:00:00Z`);
    if (cA) filtro.lte = new Date(`${cA}T23:59:59Z`);
    where.dataConsegna = filtro;
  }

  if (and.length) where.AND = and;
  return where;
}

// Ordine completo (con relazioni) da serializzare per le API.
export const INCLUDE_ORDINE = {
  stato: true,
  etichette: true,
  righe: true,
  negozio: { select: { brand: true, dominio: true } },
} as const;

type OrdineConRelazioni = Prisma.OrdineGetPayload<{ include: typeof INCLUDE_ORDINE }>;

// Serializza un ordine per le API pubbliche (forma stabile e documentata).
//
// `tipologie` è la mappa chiave-cliente → tipologia, risolta a monte in una sola
// query (vedi `tipologiePerOrdini`): serve perché la tipologia è una proprietà
// del cliente e non si può leggere dall'ordine. Se non viene passata, i campi
// `cliente.tipo`/`tipoDa` escono `null` — la forma della risposta non cambia.
//
// `ordinali` è la mappa id-ordine → quante volte quel cliente aveva già
// ordinato prima (vedi `repeater.ts`), anch'essa risolta in una query sola.
// Senza, `cliente.repeater` esce `null`: «non l'abbiamo calcolato», che è
// diverso da «è la prima volta».
export function serializzaOrdine(
  o: OrdineConRelazioni,
  tipologie?: Map<string, { tipologia: string; manuale: boolean }>,
  ordinali?: Map<string, { precedenti: number; numero: number; repeater: boolean }>,
) {
  const tipoCliente = tipologie?.get(chiaveCliente(o));
  const ordinale = ordinali?.get(o.id) ?? null;
  // Il margine si calcola UNA volta (è la regola §7.4, in `margineOrdine`): qui
  // si legge, non si rifà. Include il valore netto IVA, la % e la nota.
  const mrg = margineOrdine(o);
  return {
    id: o.id,
    brand: o.brand,
    orderId: o.orderId,
    numero: o.numero,
    data: o.data.toISOString(),
    totale: o.totale,
    valuta: o.valuta,
    // La SALUTE dell'ordine in una parola: conforme | a_rischio | non_pagato |
    // cancellato | nullo (regola in `salute.ts`). Sta in cima e non dentro
    // `shopify` perché non è un campo di Shopify: è la lettura che ne dà
    // Orders, ed è quella che le altre app devono usare invece di rifarsi i
    // conti su `financialStatus` e `annullatoIl` ognuna a modo suo.
    salute: saluteOrdine(o),
    shopify: {
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      annullato: Boolean(o.annullatoIl),
      annullatoIl: o.annullatoIl?.toISOString() ?? null,
      motivoAnnullamento: o.motivoAnnullamento,
      chiusoIl: o.chiusoIl?.toISOString() ?? null,
      rischio: {
        livello: o.rischioLivello,
        raccomandazione: o.rischioRaccomandazione,
        motivi: o.rischioMotivi ? o.rischioMotivi.split("\n").filter(Boolean) : [],
      },
      gateway: o.gateway,
      note: o.noteShopify,
      tags: o.tagShopify ? o.tagShopify.split(", ").filter(Boolean) : [],
    },
    cliente: {
      nome: o.clienteNome,
      email: o.clienteEmail,
      telefono: o.clienteTelefono,
      // Che tipo di cliente è: privato | azienda | horeca | eventi | rivenditore.
      // `tipoDa` dice se l'ha deciso un operatore ("manuale") o se è dedotto dal
      // nome dell'acquirente ("dedotta"): a valle serve, perché una deduzione si
      // può smentire, una scelta di un collega no.
      tipo: tipoCliente?.tipologia ?? null,
      tipoDa: tipoCliente ? (tipoCliente.manuale ? "manuale" : "dedotta") : null,
      // Aveva già comprato prima di QUESTO ordine? `ordiniPrima` conta solo gli
      // ordini validi precedenti, quindi un ordine vecchio resta «primo» anche
      // se oggi quel cliente ne ha venti. `null` = non calcolato o cliente non
      // riconoscibile (niente email, telefono né nome): non è «prima volta».
      repeater: ordinale ? ordinale.repeater : null,
      ordiniPrima: ordinale ? ordinale.precedenti : null,
      numeroOrdine: ordinale ? ordinale.numero : null,
    },
    // Da dove è arrivato l'ordine. `canale` è la lettura in italiano (vuoto =
    // non lo sappiamo, e allora non si inventa «diretto»); sotto restano i dati
    // grezzi su cui è stata fatta. È attribuzione al PRIMO contatto del percorso
    // che ha portato all'ordine, non all'ultimo clic.
    marketing: {
      canale: o.canaleMarketing || null,
      campagna: o.utmCampaign,
      utmSource: o.utmSource,
      utmMedium: o.utmMedium,
      primaVisita: o.visitaSorgente,
      canaleShopify: o.sorgente,
    },
    // consegna richiesta dal cliente (attributi Shopify)
    consegna: {
      data: o.dataConsegna ? o.dataConsegna.toISOString().slice(0, 10) : null,
      fascia: o.fasciaConsegna,
    },
    // IL RITORNO DEL GIRO (Standard §7.4): da che strada è stato evaso
    // ("" = non ancora noto | fornitore_diretto | piattaforma), quando e da chi
    // è stato CONSEGNATO davvero (cosa diversa dalla consegna richiesta qui
    // sopra), e il MARGINE — la formula vive solo in questa app: null = non
    // calcolabile, `parziale` = manca un ingrediente della consegna nostra.
    // `smistamento` è il GOVERNO: "manuale" = riservato al Customer Service,
    // e l'orders-sync della piattaforma lo salta.
    smistamento: o.smistamento || null,
    evasione: o.evasione || null,
    consegnata: o.consegnataIl
      ? { il: o.consegnataIl.toISOString(), da: o.consegnataDa || null }
      : null,
    margine: mrg,
    biglietto: o.biglietto,
    spedizione: {
      nome: o.spedizioneNome,
      indirizzo: o.indirizzo,
      citta: o.citta,
      cap: o.cap,
      provincia: o.provincia,
      paese: o.paese,
    },
    // La città che NON viene dall'indirizzo: ricavata dai tag dell'ordine o dal
    // nome del prodotto quando l'indirizzo non la dice (894 ordini al 03/08/2026
    // — 571 dai tag, 323 dal prodotto). Sta in un blocco suo e non dentro
    // `spedizione.citta`, che resta il dato vero: la deduzione non ci si scrive
    // mai sopra.
    //
    // ⚠️ Questo blocco esiste soprattutto per chi FILTRA: `?citta=` cerca in
    // tutt'e due i campi, quindi senza di lui tornavano ordini con
    // `spedizione.citta` vuota e niente che spiegasse perché fossero usciti — il
    // filtro sapeva una cosa che la risposta non diceva.
    //
    // `da` vale "tag" | "prodotto" e `prova` è il testo su cui è stata decisa:
    // una deduzione che chi la riceve non può controllare non è un dato, è
    // un'opinione. `null` quando l'indirizzo la città ce l'ha.
    cittaDedotta: o.cittaDedotta
      ? { citta: o.cittaDedotta, da: o.cittaDedottaDa, prova: o.cittaDedottaProva }
      : null,
    // Chi manda: nei regali non è la stessa persona né lo stesso posto di chi
    // riceve. `daLontano` è vero quando il paese di partenza e quello di arrivo
    // sono diversi — è la riga che spiega metà delle domande al Customer
    // Service. `null` dove il dato manca: non si deduce dal destinatario.
    mittente: {
      nome: o.mittenteNome,
      citta: o.mittenteCitta,
      provincia: o.mittenteProvincia,
      paese: o.mittentePaese,
      daLontano: daLontano(o),
    },
    // Quanto tempo c'è fra l'ordine e la consegna richiesta:
    // urgenza (≤24h) | pensiero (≤48h) | pianificato (≤7gg) | evento (≤30gg) |
    // lontano. `null` = consegna non indicata, che NON vuol dire «pianificato».
    // Si misura in giorni di calendario: la data di consegna è un giorno, non
    // un istante, e fingere le ore sarebbe precisione inventata.
    urgenza: o.urgenza || null,
    giorniAllaConsegna: giorniDiAnticipo(o.data, o.dataConsegna),
    righe: o.righe.map((r) => ({
      titolo: r.titolo,
      variante: r.variante,
      sku: r.sku,
      quantita: r.quantita,
      prezzo: r.prezzo,
      proprieta: r.proprieta ? r.proprieta.split("\n").filter(Boolean) : [],
      // Foto del prodotto (CDN Shopify). Serve a chi lavora l'ordine fuori da
      // qui: il Customer Service la mostra e la manda al fornitore per chiedere
      // «è fattibile questo?». `null` quando il prodotto non ha immagine — sulle
      // righe degli ultimi 60 giorni c'è nell'80% dei casi.
      immagine: r.immagine,
    })),
    // Classificazione Deluxy
    classificazione: {
      stato: o.stato ? { chiave: o.stato.chiave, nome: o.stato.nome, terminale: o.stato.terminale } : null,
      etichette: o.etichette.map((e) => e.nome),
      categoriaPagamento: o.categoriaPagamento,
      tipoConsegna: o.tipoConsegna,
      tipoProdotto: o.tipoProdotto,
      canale: o.canale,
      assegnatoApp: o.assegnatoApp,
      fornitore: o.fornitore,
      responsabile: o.responsabile,
      classificazioni: o.classificazioni ?? null,
      noteInterne: o.noteInterne,
      ultimaClassifica: o.ultimaClassifica?.toISOString() ?? null,
    },
    // Ordine problematico: oggi vuol dire rimborso parziale. `motivi` è in
    // chiaro perché chi legge da un'altra app deve poter dire all'operatore
    // *perché*, senza conoscere i codici di Shopify. `gestito` dice che qualcuno
    // l'ha già guardato: serve a non rilavorare due volte lo stesso caso.
    problema: {
      problematico: problematico(o),
      motivi: motiviProblema(o),
      gestito: o.problemaGestito,
      nota: o.problemaNota,
    },
    // I SOLDI dell'ordine: l'incasso del cliente e il costo del fornitore, con il
    // margine già fatto dove si può fare. `costo` è `null` quando non lo sappiamo
    // — e allora `margine` è `null` anche lui, non zero: uno zero verrebbe letto
    // come «nessun margine», che è un'altra cosa. `costoDa` dice chi l'ha
    // deciso: manuale | causale (agganciato per numero in causale) | finance.
    controllo: {
      gestioneIncasso: o.gestioneIncasso,
      statoIncasso: o.statoIncasso,
      incassatoIl: o.incassatoIl?.toISOString() ?? null,
      costo: o.costoFornitore,
      costoFornitore: o.costoFornitoreNome,
      costoIl: o.costoIl?.toISOString() ?? null,
      costoDa: o.costoDa,
      // ⚠️ Il margine si calcola con `margineOrdine()`, non a mano qui.
      //
      // Fino a ora questa riga faceva `totale − costoFornitore` e basta,
      // mentre la funzione — usata dall'altro serializzatore, dieci righe piu'
      // su — toglie anche il costo della consegna e riaggiunge la fee. Due
      // calcoli diversi nello stesso file: l'app diceva un numero e l'API
      // un altro, e quello dell'API era sempre piu' alto del vero.
      //
      // `parziale` dice che il numero c'e' ma manca un ingrediente della
      // consegna nostra, e `nota` dice quale: un margine incompleto che si
      // spaccia per completo e' peggio di un margine mancante.
      //
      // ⚠️ PER CHI LEGGE QUESTO CAMPO: `margine` PUO' ESSERE NEGATIVO. Un
      // ordine venduto sotto costo esiste, e il numero va mostrato com'e' —
      // non filtrato via, non portato a zero, non trattato come un errore.
      // `null` e' un'altra cosa ancora: vuol dire che non lo sappiamo.
      margine: mrg.valore,
      // ⚠️ DAL 25/08/2026 la base è il TOTALE PAGATO DAL CLIENTE (lordo):
      // `marginePct = margine netto ÷ totale`. Un ordine da 250 € con 150 € di
      // costo dà margine 81,97 € e marginePct 32,8 — non 40. Chi confronta con
      // la quota fornitore deve scorporare la soglia (margineAttesoPct).
      marginePct: mrg.pct,
      margineParziale: mrg.parziale,
      margineNota: mrg.nota,
      // Gli ingredienti che arrivano dalla piattaforma consegne: chi legge il
      // margine deve poter vedere di che cosa e' fatto.
      costoConsegna: o.costoConsegna,
      feeConsegna: o.feeConsegna,
      // L'economia della vendita calcolata dalla piattaforma consegne:
      // guadagno netto IVA, quota registrata, margine finale. Numeri SUOI,
      // dichiarati come tali — il nostro `margine` resta il conto di casa.
      primoMargine: o.primoMargine,
      feeVendita: o.feeVendita,
      margineFinale: o.margineFinale,
      // L'INCASSO. Il metodo arriva dalla piattaforma; la commissione dal
      // 26/08 e' NOSTRA: 'shopify' = fee reale dalle transazioni, 'tariffa' =
      // listino TariffaIncasso. Chi legge deve sapere quanto fidarsi, quindi
      // la firma esce insieme al numero.
      metodoIncasso: o.metodoIncasso,
      commissioneIncassi: o.commissioneIncassi,
      commissioneDa: o.commissioneDa || null,
      nota: o.controlloNota,
    },
    // Lo stato di LAVORAZIONE secondo il Customer Service (deluxy-messaging), che
    // è il decisore dell'evasione (§7.2): da_gestire | in_pagamento |
    // comunicazione | ricerca_fornitore | attesa_consegna | gestito. È una copia
    // di sola lettura — la fonte è il CS, che ce lo propone via PATCH — ed è cosa
    // diversa da `classificazione.stato`, che è la nostra pipeline. `null` quando
    // il CS non l'ha ancora comunicato.
    customerService: o.csGestione
      ? {
          gestione: o.csGestione,
          etichetta: etichettaLavorazioneCs(o.csGestione)?.nome ?? o.csGestione,
          da: o.csGestioneDa || null,
          il: o.csGestioneIl?.toISOString() ?? null,
        }
      : null,
    updatedAt: o.updatedAt.toISOString(),
  };
}

// ---------- Ordini problematici ----------
//
// Un ordine è **problematico** quando i soldi non tornano e serve un occhio
// umano. Oggi il caso è uno solo: il **rimborso parziale**.
//
// Perché proprio quello. Un ordine annullato si vede (è barrato), uno rimborsato
// del tutto è una vendita che non c'è più; il rimborso *parziale* invece resta
// in piedi e sembra un ordine normale — ma una parte del denaro è tornata al
// cliente, e **quanta non si sa**: Shopify tiene sul nostro registro il totale
// dell'ordine, non l'importo reso. Quindi ogni conto che lo tocca è sbagliato in
// eccesso, e dietro c'è quasi sempre una storia (un pezzo mancante, una
// consegna andata male, un accordo).
//
// Il motivo NON si salva nel database: si ricava sempre dallo stato Shopify, e
// così non può invecchiare (se Shopify cambia idea, cambia anche il marchio).
// Si salva solo che qualcuno l'ha guardato — `problemaGestito` + `problemaNota`.
export const STATI_PROBLEMA = ["PARTIALLY_REFUNDED"] as const;

export function motiviProblema(o: { financialStatus: string | null }): string[] {
  const motivi: string[] = [];
  if (o.financialStatus === "PARTIALLY_REFUNDED") {
    motivi.push("Rimborso parziale: parte del denaro è tornata al cliente e l'importo reso non è nel registro");
  }
  return motivi;
}

export function problematico(o: { financialStatus: string | null }): boolean {
  return motiviProblema(o).length > 0;
}

// Formattazione importo per la UI.
export function euro(n: number, valuta = "EUR"): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta }).format(n);
}

// ---------- Stati Shopify in italiano ----------
// I codici dell'API sono in inglese e maiuscoli: qui diventano leggibili.
const EVASIONE: Record<string, string> = {
  FULFILLED: "evaso",
  UNFULFILLED: "da evadere",
  PARTIALLY_FULFILLED: "evaso in parte",
  SCHEDULED: "programmato",
  ON_HOLD: "in attesa",
  IN_PROGRESS: "in lavorazione",
  OPEN: "aperto",
  PENDING_FULFILLMENT: "da evadere",
  RESTOCKED: "rimesso a magazzino",
};

const PAGAMENTO: Record<string, string> = {
  PAID: "pagato",
  PENDING: "in attesa",
  PARTIALLY_PAID: "pagato in parte",
  PARTIALLY_REFUNDED: "rimborsato in parte",
  REFUNDED: "rimborsato",
  VOIDED: "annullato",
  AUTHORIZED: "autorizzato",
  EXPIRED: "scaduto",
  UNPAID: "non pagato",
};

const MOTIVI: Record<string, string> = {
  CUSTOMER: "richiesta del cliente",
  DECLINED: "pagamento rifiutato",
  FRAUD: "sospetta frode",
  INVENTORY: "merce non disponibile",
  STAFF: "errore interno",
  OTHER: "altro",
};

export function evasioneLeggibile(s: string | null): string | null {
  if (!s) return null;
  return EVASIONE[s] ?? s.toLowerCase().replace(/_/g, " ");
}

export function pagamentoLeggibile(s: string | null): string | null {
  if (!s) return null;
  return PAGAMENTO[s] ?? s.toLowerCase().replace(/_/g, " ");
}

export function motivoLeggibile(s: string | null): string | null {
  if (!s) return null;
  return MOTIVI[s] ?? s.toLowerCase().replace(/_/g, " ");
}

const RISCHIO: Record<string, string> = {
  NONE: "nessun rischio",
  LOW: "rischio basso",
  MEDIUM: "rischio medio",
  HIGH: "rischio alto",
};

export function rischioLeggibile(s: string | null): string | null {
  if (!s) return null;
  return RISCHIO[s] ?? s.toLowerCase();
}

// Solo medio e alto meritano di essere segnalati: "basso" è la norma e
// riempirebbe l'elenco di avvisi che nessuno guarderebbe più.
export function rischioDaSegnalare(s: string | null): boolean {
  return s === "MEDIUM" || s === "HIGH";
}

export function coloreRischio(s: string | null): string | undefined {
  if (s === "HIGH") return "var(--red)";
  if (s === "MEDIUM") return "var(--orange)";
  return undefined;
}

// I codici usati nei menu dei filtri, con l'etichetta italiana.
export const STATI_PAGAMENTO = Object.entries(PAGAMENTO).map(([codice, nome]) => ({ codice, nome }));
export const STATI_EVASIONE = Object.entries(EVASIONE).map(([codice, nome]) => ({ codice, nome }));

// Colore dello stato di pagamento: rimborsi e annullamenti in evidenza.
export function colorePagamento(s: string | null): string | undefined {
  if (s === "PAID") return "var(--green)";
  if (s === "REFUNDED" || s === "VOIDED") return "var(--red)";
  if (s === "PARTIALLY_REFUNDED" || s === "PENDING" || s === "PARTIALLY_PAID") return "var(--orange)";
  return undefined;
}

// Il colore dell'evasione: evaso verde, da evadere neutro, parziale arancio.
export function coloreEvasione(s: string | null): string | undefined {
  if (s === "FULFILLED") return "var(--green)";
  if (s === "PARTIALLY_FULFILLED" || s === "ON_HOLD") return "var(--orange)";
  return undefined;
}

// Link all'ordine nell'admin di Shopify: "gid://shopify/Order/17943253975370"
// + "deluxygifts.myshopify.com" → admin.shopify.com/store/deluxygifts/orders/17943253975370
export function linkShopify(dominio: string | null | undefined, orderId: string): string | null {
  if (!dominio) return null;
  const negozio = dominio.replace(/\.myshopify\.com$/i, "").trim();
  const numerico = orderId.split("/").pop();
  if (!negozio || !numerico || !/^\d+$/.test(numerico)) return null;
  return `https://admin.shopify.com/store/${negozio}/orders/${numerico}`;
}

// La consegna richiesta, pronta da mostrare: "gio 30 lug · 16-20".
// Le date di consegna sono giorni di calendario salvati a mezzogiorno UTC:
// si formattano in UTC, altrimenti col fuso possono scivolare di un giorno.
export function consegnaBreve(data: Date | null, fascia: string | null): string | null {
  if (!data && !fascia) return null;
  if (!data) return fascia;
  const giorno = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(data);
  return fascia ? `${giorno} · ${fascia}` : giorno;
}

// Quanto manca alla consegna, per evidenziare l'urgenza: oggi, domani, passata.
export function urgenzaConsegna(data: Date | null): "passata" | "oggi" | "domani" | "futura" | null {
  if (!data) return null;
  const oggi = new Date();
  const g = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((g(data) - Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())) / 86400000);
  if (diff < 0) return "passata";
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  return "futura";
}

export function dataBreve(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "2-digit" }).format(d);
}
