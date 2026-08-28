# Collegare TikTok Ads a Deluxy Marketing

> Stato al **27/08/2026**: nell'app c'è **già tutto** — connettore
> (`src/lib/tiktok.ts`), motore di sincronizzazione (`src/lib/sync-tiktok.ts`),
> cron ogni due ore (`/api/cron/tiktok`), rotta manuale
> (`POST /api/v1/sync/tiktok`) e la sezione in Impostazioni.
> **Mancano solo due dati**: il *token* e almeno un *advertiser*. Misurato oggi
> sul database di produzione: 0 advertiser censiti, token assente, 0 consegne.
>
> Quindi non c'è codice da scrivere: c'è da incollare due cose e premere un
> bottone.

---

## In due righe

1. Ottieni da TikTok un **access token** e l'**ID dell'advertiser**.
2. Incollali in `/impostazioni` dell'app (token nella sezione «TikTok Ads»,
   advertiser fra gli «account pubblicitari» scegliendo **TikTok Ads**).
3. Premi «Aggiorna adesso» sul canale TikTok. Da lì in poi va da solo, ogni due
   ore.

---

## Passo 1 — L'ID dell'advertiser (2 minuti)

È il numero lungo dell'account pubblicitario, tipo `7123456789012345678`.

- **TikTok Ads Manager** → in alto, dove c'è il nome dell'account: l'ID è
  scritto lì sotto (oppure in **Impostazioni account**).
- Se gestite più account (uno per brand), servono **tutti gli ID che volete
  leggere**: si censiscono uno per uno, e ogni riga porta il suo brand.

⚠️ **Non è il numero del Business Center** e non è l'ID del profilo TikTok: è
l'*advertiser id*. Un ID sbagliato non dà errore di configurazione — dà zero
righe, che sembra «non abbiamo speso», ed è la cosa peggiore che possa
succedere. Se dopo la prima sincronizzazione le righe sono zero ma su Ads
Manager la spesa c'è, il primo sospetto è questo numero.

## Passo 2 — Il token (il passo lungo, ~20 minuti la prima volta)

TikTok, come Meta e a differenza di Google, **non ha script che girano dentro
l'account**: è l'app che va a prendere i dati, e per farlo serve un token della
**Business API**.

1. Vai su **TikTok for Business — Developers**
   (<https://business-api.tiktok.com/portal>) ed entra con l'account che
   amministra il Business Center.
2. **Crea un'app** (*My Apps → Create*). Servono nome, descrizione e un
   *redirect URL*: metti
   `https://deluxy-marketing.vercel.app/api/interno/tiktok/oauth`
   (oggi quell'indirizzo non esiste ancora nell'app — va bene lo stesso, serve
   solo a completare il giro del consenso a mano; vedi «Se un domani» in fondo).
3. Chiedi i permessi di **sola lettura sui report**: bastano
   *Ads Management (read)* e *Reporting*. **Non chiedere permessi di scrittura**:
   l'app non scrive su TikTok, e un token che può spendere è un token che un
   giorno spenderà per sbaglio.
4. Autorizza l'app sul tuo Business Center e completa il giro del consenso:
   alla fine ottieni un **access token** (una stringa lunga) e l'elenco degli
   advertiser autorizzati.

⚠️ **Il token è un segreto**: non incollarlo in una chat, non metterlo in un
file del repo, non mandarlo per email. Va solo nel campo di `/impostazioni` (o
nella cassaforte del Hub, vedi sotto).

## Passo 3 — Incollarli nell'app

1. Apri **`/impostazioni`** su <https://deluxy-marketing.vercel.app>.
2. Sezione **«TikTok Ads»** → incolla il token → salva.
   La riga sopra il campo diventa «token presente»; finché è «mancante», la
   sincronizzazione **non parte** e lo dice.
3. Più sotto, **«Account pubblicitari»** → aggiungi un account:
   - piattaforma: **TikTok Ads**
   - id: l'advertiser id del passo 1
   - nome: come lo chiami tu (es. «TikTok Gifts»)
   - brand: gifts / flowers / cake
   Ripeti per ogni advertiser.

## Passo 4 — La prima sincronizzazione, e come si legge

Premi **«Aggiorna adesso»** sul canale TikTok (oppure aspetta il cron: gira ogni
due ore al minuto 37).

Poi guarda **`/ricezione`** («Dati in arrivo»): deve comparire una consegna con
fonte `tiktok`, il numero di righe e l'esito. Se non compare nulla, il problema
è a monte — token o advertiser.

**Cosa aspettarsi di anomalo, e non è un guasto:**
- ⚠️ **Il ROAS può mancare.** I nomi delle metriche cambiano fra le versioni
  della Business API: il connettore chiede prima il gruppo completo
  (`conversion`, `complete_payment`, `complete_payment_roas`) e, se TikTok
  rifiuta, **riprova col nucleo** (`spend`, `impressions`, `clicks`) dicendo
  *quali* metriche ha tolto. Meglio spesa e clic veri senza ROAS che zero righe
  e un errore criptico. Se vedi «metriche rifiutate», è questo.
- ⚠️ **I ricavi possono essere derivati** (ROAS × spesa) invece che letti: l'app
  lo dichiara con `ricaviDerivati`. Un numero derivato non si mette accanto a
  uno letto senza dire che lo è.

---

## Cosa NON fa, oggi

Va detto prima, o si scopre quando serve:

- **Solo lettura.** L'app legge campagne e metriche; non mette in pausa, non
  cambia budget, non crea niente su TikTok. La coda operazioni non ha un motore
  TikTok (su Google esegue lo script dentro l'account, su Meta esegue l'app).
- **Nessun ad group / ad.** Arrivano le campagne con i loro numeri per giorno,
  non i gruppi né i singoli annunci.
- **Il token non si rinnova da solo.** Se TikTok lo fa scadere, la
  sincronizzazione comincia a fallire e lo si vede da `/ricezione`: si rifà il
  passo 2 e si reincolla.

## Se un domani

- **Il giro del consenso dentro l'app** (come quello di Drive): servirebbe una
  rotta `/api/interno/tiktok/oauth` con `state` in cookie — la lezione
  dell'OAuth di Drive del 27/08/2026 vale identica qui: senza `state` il
  callback accetta il codice di chiunque.
- **La scrittura** (pausa, budget): prima serve che TikTok abbia fatto qualche
  giro vero in lettura, come si è fatto per Meta. E i permessi di scrittura si
  chiedono **quel** giorno, non prima.

## Dove guardare quando qualcosa non torna

| Sintomo | Dove si legge | Di solito è |
| --- | --- | --- |
| Nessuna consegna TikTok | `/ricezione` | token assente o advertiser non censito |
| Consegne con 0 righe | `/ricezione` + Ads Manager | advertiser id sbagliato, o periodo senza spesa |
| Manca il ROAS | esito della sync (`metricheRifiutate`) | versione della Business API: è previsto |
| Il cron non parte | log della funzione su Vercel | `CRON_SECRET` assente → l'endpoint risponde **503 e resta chiuso**, di proposito |
