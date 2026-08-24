# Handoff — Deluxy CRM

Stato al 2026-08-24 (sera). App **nuova**, costruita e pubblicata in giornata;
in serata aggiunto il **nuovo ordine con link di pagamento**.
Cartella: `deluxy-crm/`, porta **3190**, schema Postgres **`crm`**.

**LIVE**: https://deluxy-crm.vercel.app (progetto Vercel `deluxy/deluxy-crm`,
region fra1). Tessera nel Hub: id `crm`, ruoli admin+commerciale, `sso: true`.

## FATTO

- **Architettura conforme allo Standard §7**: nessuna tabella-copia dei
  clienti. Orders è la fonte (clienti, ordini, segmenti, riepiloghi AI,
  ricorrenze); il CRM tiene solo Attivita, Evento, Invito, TemplateMail,
  MailInviata, agganciati alla `chiaveCliente` di Orders (base64url di
  email → telefono → nome).
- **Due rotte nuove in Orders** (commit `a29eae78` su scout-ui, deployate):
  `GET /api/v1/clienti/{cliente}/ordini` (ordini esatti della scheda, non il
  contains di `?q=`) e `GET/POST /api/v1/eventi-clienti` (ricorrenze con
  prossimità e flag `delicato`; il POST scrive una ricorrenza manuale,
  upsert su chiave+destinatario+mese+giorno).
- **Pagine**: Oggi, Clienti, Scheda 360, Ricorrenze, Eventi (+nuovo,
  +dettaglio con inviti), Mail (registro, componi, template), Impostazioni
  (stato collegamenti misurato). Design system v1.0, sidebar traslucida,
  badge a pillola con dot, 4 stati per vista.
- **Auth**: password di team + SSO dal Hub (pattern Scripts; sessione HMAC
  WebCrypto nel cookie `dcrm_session`; fail-closed 503 in produzione senza
  password). NIENTE query su `hub."Utente"` (la violazione segnata
  dall'audit in Tasks/Calendario qui non c'è).
- **Mail via AI Mail** (`POST /api/v1/invia`, header `x-api-key` +
  `x-utente`): la copia resta negli «Inviati» della casella; il CRM registra
  in MailInviata e aggancia l'invito (stato → invitato) se era un invito.
- **Eventi → Calendario**: push best-effort (sistema `deluxy-crm`,
  idEsterno = id evento) alla creazione/modifica/cambio stato; chiave
  emessa (`deluxy-crm`, scrittura) e VERIFICATA (evento di collaudo creato e
  poi annullato su entrambi i lati).
- **Chiavi**: pattern cassaforte Hub → env (cache 5', timeout 4",
  never-fail, strip del BOM). Chiave Orders `deluxy-crm` (scrittura) emessa
  e in produzione. `HUB_SSO_SECRET` copiato dal Hub nelle env Vercel.
- **Collaudato in locale contro la produzione di Orders**: dashboard con
  dati veri (146 VIP), scheda di un cliente reale (riassunto AI + 26 ordini),
  attività registrata, evento creato→propagato→annullato, composizione invito
  con variabili risolte, blocco pulito dell'invio senza token.
- **Registrazioni**: porta 3190 nello Standard §2.1 (commit `def30ef5`),
  tessera+icona nel Hub (commit `dee97b59`, deployato), launch.json radice e
  locale.

- **Nuovo ordine con link di pagamento** (24/08 sera): dalla scheda cliente,
  «Crea ordine» → `/clienti/<codice>/nuovo-ordine`. Il form (client
  component) cerca nel catalogo del negozio (con foto), accetta righe a mano
  per i fuori listino, precompila cliente e indirizzo dall'ultimo ordine,
  sceglie la spedizione fra le voci VERE del negozio, e crea la bozza
  **passando dal Customer Service** (`POST /api/v1/nuovo-ordine`, chiave
  `MESSAGGI_API_KEY` con scrittura): è lui che ha le credenziali Shopify con
  lo scope giusto. Due strade come nel CS: link di pagamento (bozza resta
  bozza; se c'è l'email Shopify manda da sé l'invoice) o «ha già pagato»
  (nasce pagato). L'esito mostra il link con Copia + «Manda il link per
  mail» (componi precompilata via `?ordinelink=`); il link NON si salva da
  nessuna parte (regola dei link col segreto); nel diario resta l'attività
  `ordine`. Al CS sono state aggiunte 4 rotte `/api/v1/nuovo-ordine{,/negozi,
  /prodotti,/spedizioni}` + scope `scrittura` su ApiKey (commit `f69c7b32`,
  deployato **da copia pulita del commit** perché la working copy aveva la
  riconciliazione a metà di un'altra sessione). **Collaudato end-to-end in
  produzione**: bozza #D5627 creata dal form (riga a mano 1 €, cliente
  fittizio) con link vero, poi eliminata da Shopify e diario ripulito.
  Le rotte interne `/api/interno/*` (proxy catalogo/spedizioni) sono protette
  dalla sessione nel middleware: la chiave del CS non arriva mai al browser.

### Trappola già pagata

I **route params di Next 15 arrivano ancora percent-encoded**
(`monica%40…`): un `encodeURIComponent` diretto li doppia (`%2540`). La
scheda decodifica UNA volta all'ingresso (`decodeURIComponent(codiceRaw)`)
e ricodifica dove serve.

### Trappola già pagata (2): le chiavi delle liste sono al PLURALE

Le liste di Orders si chiamano `fedeli`, `nuovi`, `persi`, `ricorrenti`
(plurale); il **segmento del singolo cliente** è al singolare (`fedele`,
`nuovo`…). Sono due vocabolari diversi: confonderli lascia i contatori a «—».

## MANCA (prossimi passi)

1. **`MAIL_API_KEY`** — unico passo per accendere l'invio: da AI Mail →
   Impostazioni App → «Token API di AI Mail» (esiste già un token: rigenerarlo
   lo ruota per tutti i client), poi
   `npx vercel env add MAIL_API_KEY production --value <token> --force --yes`
   dalla cartella e rideploy. `MAIL_UTENTE` è già a deluxy.delivery@gmail.com.
2. **Primo giro vero dell'SSO** dal Hub (tessera CRM → si entra senza
   password): il segreto è lo stesso, ma il salto va visto una volta.
3. **POST ricorrenza dal vivo**: il form della scheda scrive in Orders; il GET
   è collaudato in produzione, il POST è da vedere col primo compleanno vero
   (esito visibile in pagina: ok/errore).
4. Tessera per i **commerciali**: gli admin vedono tutto; per gli altri va
   spuntata l'app nella loro scheda utente del Hub (`appAbilitate`).
5. Idee a seguire: lista `evento-in-arrivo` di Orders in dashboard; rispetto
   del consenso (`consenso-email`) accanto al bottone mail; promemoria
   automatici (cron) per le ricorrenze dei VIP; allegati negli inviti.

## Note

- L'evento «Collaudo CRM (da ignorare)» (15/09/2026) è rimasto negli archivi
  di CRM e Calendario **in stato annullato**, a testimonianza del collaudo:
  si può eliminare dal CRM quando si vuole.
- La password di team è nelle env Vercel (`CRM_APP_PASSWORD`); in locale
  l'app è aperta (nessun segreto nel `.env`).
- Le mail di prova NON sono state inviate a nessun cliente: l'invio resta
  spento finché manca il token (punto 1).
