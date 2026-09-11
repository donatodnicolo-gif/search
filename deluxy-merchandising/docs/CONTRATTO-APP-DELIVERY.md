# I prodotti dei partner: contratto fra app delivery e Merchandising

Scritto l'11/09/2026, leggendo **il codice della piattaforma consegne**
(`C:\Users\nicol\app\deluxy-platform-next`), non deducendolo:
`api/prisma/schema.prisma` (model `Product`, `ProductVariant`, `Partner`) e
`api/src/merchandising-sync/merchandising-sync.module.ts` (il punto da cui la
piattaforma ci manda i prodotti, funzione `inviaOra`).

## Il giro, in tre righe

1. Un **partner** carica il suo prodotto dal proprio account nella piattaforma
   consegne (`products.service.ts` → `create`, che chiama `merchandising.spingi()`).
2. Il prodotto arriva qui su `POST /api/v1/prodotti` e nasce in fase
   **«Attesa approvazione»**, fuori dalle analisi.
3. Qualcuno qui lo guarda, completa quello che manca e **approva**: la fase
   diventa «Approvato», il prodotto entra nell'assortimento e la decisione
   **torna alla piattaforma**.

## 1. Che cosa la piattaforma manda OGGI

`inviaOra()` manda **otto campi**, e sono questi:

| Manda | Valore | Da noi diventa |
|---|---|---|
| `codice` | `product.sku` | `codice` (la chiave: un secondo invio aggiorna, non duplica) |
| `nome` | `product.name` | `nome` |
| `descrizione` | `product.description` | `descrizione` |
| `categoria` | `product.category.name` | `categoria`, se il nome combacia con una nostra |
| `costoProduzione` | `product.price` | `costoProduzione` **e** `prezzoPartner` |
| `prezzoVendita` | `product.publicPrice` | `prezzoVendita` (**il prezzo pubblico**) |
| `immagine` | `product.imageUrl` | `immagine` |
| `origine` / `idEsterno` | `'platform'` / `product.id` | `origine` / `idEsterno` |

## 2. Che cosa accettiamo ADESSO (e la piattaforma ha già in casa)

La rotta accetta **sia i nomi della piattaforma sia i nostri**: chi chiama non
deve tradurre due volte. Tutti facoltativi tranne `sku`/`codice` e `name`/`nome`.

| Campo della piattaforma | Dove finisce qui | Nota |
|---|---|---|
| `shortDesc` | `plusProdotto` | ⭐ **è il «plus del prodotto»**, la riga in cima alla scheda del cliente (la colonna di là lo dichiara: «Plus del prodotto (max 80 char)») |
| `note` | `note` | le note di specifica: «20-25 fiori», «6/8 porzioni» |
| `variants[]` | `varianti[]` | `name`→nome, `sku`→sku, `publicPrice`→prezzo (diventa `deltaPrezzo`), `price`→`prezzoPartner`, `note`→note, `stock`→giacenza |
| `partnerId` | `partnerPiattaformaId` | il cuid della piattaforma |
| `partner.insegna` | `partnerInsegna` | si legge sulla scheda senza chiamare un'altra app |
| `partner.legacyId` o `partnerLegacyId` | `partnerIdShopify` | **solo se numerico**: è il metafield `custom.partner_id`, dichiarato `number_integer` su Shopify — un cuid là dentro farebbe rifiutare tutto il prodotto |
| `prepDays` | `ggDispMin` | giorni minimi di preavviso |
| `notPhysical` | `nonFisicoShopify` | |
| `alternateName` + `useAlternateName` | `nomePartner` + `nomePartnerAttivo` | il nome con cui il partner conosce il prodotto |
| `images` | `immagine` (la prima) | array o stringa JSON: si accettano tutt'e due |
| `tipologiaVendita` | `tipologiaVendita` | se non arriva: **`unico`** (regola dell'utente: il prodotto di un partner lo vende quel partner, col suo listino) |
| `type` (`UNICO`/`NON_UNICO`) | — | letto, ma la classificazione interna resta nostra |

**Riempiti da noi, senza che nessuno li mandi:**
- `seoTitolo` e `seoDescrizione`, con le stesse regole del modulo (nome + firma;
  le prime frasi della descrizione, o il plus). Senza materiale restano vuoti:
  una descrizione SEO inventata è quella che finisce su Google.
- `fase = attesa_approvazione`, `esclusoDaAnalisi = true` (finché non si approva).

## 2-bis. Che cosa si va a PRENDERE (11/09/2026)

Misurato sul prodotto vero **Torta Damianino** (`DXY-23284`, arrivato alle
13:16 dell'11/09): degli oltre venti campi della scheda ne sono arrivati
**11**. Niente varianti, niente foto, niente partner, niente descrizione,
prezzo pubblico 0. Non perché li rifiutiamo — li accettiamo tutti dal §2 — ma
perché `inviaOra` non li mette nel corpo.

Aspettare la modifica di là però non era l'unica strada: **il canale app della
piattaforma ha già una lettura che li contiene.**

```
GET /api/v1/app/prodotti?q=<sku>
header: x-api-key
torna: { prodotti: [{ id, nome, sku, prezzo, prezzoPubblico, tipo, tipologia,
                      varianti: [{ id, nome, sku, prezzo, prezzoPubblico }],
                      partnerId, partner }], generico }
```

Da qui il tasto **«⟲ Recupera dalla piattaforma»** (riquadro «Attesa
approvazione») completa il prodotto: varianti, `partnerId`, insegna, prezzo
pubblico, costo. **Riempie solo i vuoti**: quello che una persona ha già
corretto qui non si sovrascrive.

⚠️ Quella rotta è una **ricerca** (30 righe, filtro `active: true`): si tiene
solo la riga il cui `id` è l'`idEsterno` che ci è arrivato. Prendere la prima
riga vorrebbe dire copiare le varianti del prodotto di un altro partner.

⚠️ Restano fuori **anche così**: descrizione, `shortDesc` (il plus), note di
specifica, `prepDays`, foto. Quella lettura non li seleziona: per quelli serve
davvero il §3.1.

✅ **Collegato l'11/09/2026** (Impostazioni → Piattaforma consegne:
`PIATTAFORMA_URL` e `PIATTAFORMA_API_KEY` nella cassaforte). Provato sui
quattro prodotti in coda con `scripts/prova-lettura-piattaforma.ts` e applicato
con `scripts/recupera-dalla-piattaforma.ts`: sono arrivati insegna e id del
partner, il prezzo al partner e quattro varianti coi loro SKU.

⚠️ **Il prezzo pubblico non è arrivato, e non per colpa del passaggio**: di là
`publicPrice` è vuoto su tutti e quattro. È il campo che blocca l'approvazione,
e lo decide una persona — sulla piattaforma o qui.

## 2-ter. I CAMPI DEL NEGOZIO di un prodotto del partner (11/09/2026)

Regola dell'utente, dettata guardando i «Campi del negozio» del modulo:

> «prodotto unico dovrebbe uscire in automatico sì e non modificabile visto è
> di un partner da app delivery, minimo orario te lo dovrebbe dare sempre app
> delivery in base a orari partner, idem il partner id, prodotto è sempre non
> fisico, anche tutto il resto dei campi in foto dovrebbe darli l'app di
> delivery»

Sono sei campi, e **non hanno tutti la stessa casa**. Due li decidiamo qui
perché discendono da cosa il prodotto è; quattro li sa solo la piattaforma,
perché discendono dal partner.

| Campo del negozio | Chi lo sa | Stato all'11/09 |
|---|---|---|
| `custom.is_unique` | **noi** | ✅ fatto: «true» automatico e **non modificabile** sui prodotti che vengono dalla piattaforma |
| `custom.not_physical` | **noi** | ✅ fatto: «true» automatico e non modificabile (lo consegna la piattaforma, non passa dalla spedizione di Shopify) |
| `custom.partner_id` | **piattaforma** | ⏳ serve `partner.legacyId` (numerico): la spinta non lo manda e `GET /app/prodotti` torna il cuid, non il legacy |
| `custom.partner_address` | **piattaforma** | ⏳ da dove parte la consegna: è `Partner.city` (o l'indirizzo intero). `GET /app/partner` torna `citta`, ma non è legato al prodotto nella spinta |
| `custom.minimo_orario` | **piattaforma** | ✅ già arriva, ma per un'altra strada: `POST /api/v1/prodotti/disponibilita`, il cron dei prodotti unici ogni mezz'ora, che lo calcola dagli orari del partner e lo scrive sul negozio. ⚠️ Scrive **su Shopify**: un prodotto ancora in attesa non è sul negozio, quindi resta vuoto finché non si pubblica |
| `prodotto.consegna` (gg disp min) | **piattaforma** | idem: stessa rotta, stesso limite. Nella spinta c'è già `prepDays`, che accettiamo (§2) ma che `inviaOra` non manda |
| `custom.nations_availability` | **piattaforma** | ⏳ le province in cui si può comprare: di là sono `Partner.provinces` (sigle). Qui il formato è `ITALY-MILAN(MI) ITALY-ROMA(RM) …` — servirebbero le sigle, il nome lo mappiamo noi dai prodotti esistenti |

**Quello che serve dalla piattaforma, in una riga:** nel corpo di `inviaOra`
aggiungere `partner: { insegna, legacyId, city, provinces }` accanto ai campi
del §3.1. Con quello i quattro campi «piattaforma» si riempiono da soli alla
creazione, senza aspettare il cron e senza che il prodotto sia già pubblicato.

⚠️ **Perché non li indoviniamo noi.** L'indirizzo e le province si potrebbero
copiare dal partner più simile fra i prodotti già attivi: sono dati misurabili
(1.183 schede attive con `custom.partner_id`, i tre più frequenti sono 223,
128 e 242, ciascuno con il suo indirizzo sempre uguale). Ma indovinare da dove
parte una consegna e in quali province si vende è esattamente il genere di
errore che nessuno rilegge: se sbagliamo, il prodotto si vende dove non si può
consegnare. Meglio vuoto e visibile.

## 3. Che cosa manca DALLA PARTE DELLA PIATTAFORMA

Due cose, e nessuna delle due si può fare da questa cartella (regola 4 del
CLAUDE.md: una sola sessione per cartella).

### 3.1 Mandare i campi che ha già — `merchandising-sync.module.ts`, `inviaOra`

Il `body` del POST diventa:

```ts
body: JSON.stringify({
  codice: product.sku,
  nome: product.name,
  descrizione: product.description ?? null,
  categoria: product.category?.name ?? null,
  costoProduzione: product.price ?? 0,
  prezzoVendita: product.publicPrice ?? 0,
  immagine: product.imageUrl ?? null,
  origine: 'platform',
  idEsterno: product.id,
  // ⭐ da aggiungere: Merchandising li accetta già
  shortDesc: product.shortDesc ?? null,
  note: product.note ?? null,
  prepDays: product.prepDays ?? null,
  notPhysical: product.notPhysical ?? null,
  alternateName: product.alternateName ?? null,
  useAlternateName: product.useAlternateName ?? null,
  images: product.images ?? null,
  tipologiaVendita: product.tipologiaVendita ?? null,
  type: product.type ?? null,
  partnerId: product.partnerId ?? null,
  partner: product.partner ? { insegna: product.partner.insegna, legacyId: product.partner.legacyId } : null,
  variants: (product.variants ?? []).map((v) => ({
    name: v.name, sku: v.sku, price: v.price, publicPrice: v.publicPrice,
    note: v.note, stock: v.stock,
  })),
}),
```

⚠️ `spingi()` oggi riceve un oggetto con **pochi campi tipizzati**: perché
`variants` e `partner` arrivino, la `create` deve passare il prodotto con
`include: PRODUCT_INCLUDE` (lo fa già: `this.merchandising.spingi(creato as any)`)
e la firma di `spingi`/`inviaOra` va allargata.

### 3.2 Ricevere l'approvazione — una rotta nel canale app

Non esiste: il canale `/api/v1/app/...` ha `GET prodotti` ma nessuna scrittura
sui prodotti. Serve:

```
POST /api/v1/app/prodotti/:id/approvato
header: x-api-key (chiave con scrittura)
corpo:  { approvato: boolean, prezzoPubblico: number|null, sku: string|null, nome: string|null, da: "merchandising" }
fa:     Product.approved = approvato   (id = Product.id, quello che ci manda come `idEsterno`)
```

Finché non c'è, l'approvazione **vale comunque qui** e la scheda del prodotto
scrive nella cronaca «la piattaforma non conosce ancora questa richiesta:
approvato qui, non comunicato». Un giro che non si chiude si vede.

**In alternativa (o in più), la piattaforma può leggere.** `GET /api/v1/prodotti`
espone da oggi due campi calcolati:
- `approvato` — la fase è `approvato` o `in_vendita`: il PLM ha dato il via;
- `attesaApprovazione` — sta ancora in coda.

Così `Product.approved` si allinea anche solo leggendo, senza aspettare una
nostra scrittura. È la strada più solida: l'approvazione è una decisione del
PLM, e **il dato ha una casa sola** (Standard Deluxy §7).

## 4. Chi decide cosa

| Dato | Casa |
|---|---|
| L'offerta del partner (nome, prezzo, varianti, foto) | **Piattaforma consegne** |
| Approvazione, categoria, classificazione interna, SEO, collezioni | **Merchandising** |
| `Product.approved` di là | la **decisione** è nostra, la **colonna** è loro |

## 5. Configurazione qui

`Impostazioni → Piattaforma consegne (app delivery)`: indirizzo e chiave,
cifrati nella cassaforte (l'ambiente vince: `PIATTAFORMA_URL`).
