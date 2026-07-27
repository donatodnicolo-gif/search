import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { attivaAccount, rimuoviAccount, salvaAccount, salvaApiKeyDrive, salvaCartellaDrive, salvaImpostazioniAi, salvaIstruzioniAi, salvaServiceAccountDrive, salvaImpersonazioneDrive, salvaOauthDrive, provaScritturaDrive, salvaTokenTikTok } from "@/lib/azioni";
import { tokenTikTok } from "@/lib/tiktok";
import { FORNITORI, istruzioniOperative, statoAi } from "@/lib/ai";
import { emailImpersonata, oauthConfigurato, statoScritturaDrive } from "@/lib/drive-scrittura";
import { ChiaviApi } from "@/components/ChiaviApi";
import { prisma } from "@/lib/db";
import { CHIAVE_APIKEY, driveDir, idCartellaDrive } from "@/lib/drive";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  formattaDataOra,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

const PIATTAFORME_ACCOUNT: { chiave: string; nome: string; icona: string; esempio: string }[] = [
  { chiave: "google_ads", nome: "Google Ads", icona: "google", esempio: "825-518-1560" },
  { chiave: "meta_ads", nome: "Meta Ads", icona: "metaads", esempio: "act_1040175814157216" },
  { chiave: "tiktok", nome: "TikTok Ads", icona: "tiktok", esempio: "7123456789012345678" },
  { chiave: "ga4", nome: "Google Analytics 4", icona: "metriche", esempio: "properties/123456789" },
  { chiave: "shopify", nome: "Shopify", icona: "regalo", esempio: "deluxygifts.myshopify.com" },
  { chiave: "klaviyo", nome: "Klaviyo", icona: "copy", esempio: "Account Klaviyo Gifts" },
  { chiave: "altro", nome: "Altro", icona: "pagina", esempio: "" },
];

const CONFERME: Record<string, string> = {
  cartella: "Cartella salvata: la prossima sincronizzazione leggerà da qui.",
  account: "Account salvato.",
  apikey: "Chiave API salvata: ora la sincronizzazione può leggere Google Drive online.",
  ai: "Impostazioni AI salvate: la prossima lettura userà questo fornitore.",
  tiktok: "Token TikTok salvato: ora la sincronizzazione può leggere l’advertiser.",
  istruzioni: "Istruzioni operative salvate: valgono da subito per ogni chiamata all’AI.",
  "istruzioni-uguali": "Nessuna modifica: il testo è identico a quello già depositato.",
  "istruzioni-vuote": "Istruzioni rimosse: da adesso l’AI lavora senza protocollo.",
  "drive-scrittura": "Credenziale salvata. Ora condividi la cartella con l’email qui sotto e premi «Prova a scrivere».",
  "drive-scrittura-tolta": "Credenziale rimossa: l’app torna a leggere soltanto.",
  "drive-invariato": "Niente da salvare: la casella era vuota.",
  "drive-json-rotto": "Quel testo non è un JSON valido: incolla il file della chiave per intero.",
  "drive-json-incompleto": "JSON valido ma senza client_email o private_key: non è il file della chiave dell’account di servizio.",
  "drive-prova-ok": "Scrittura riuscita: il file di prova è nel ponte, dentro OUT - dall’app.",
  "drive-prova-no": "Scrittura NON riuscita.",
  "drive-impersona": "Salvato: da adesso l’app scrive per conto di quella persona.",
  "drive-impersona-tolta": "Tolto: l’app torna a scrivere come account di servizio (e Drive lo rifiuterà, se la cartella non è in un Drive condiviso).",
  "drive-impersona-invalida": "Quella non sembra un’email: serve un indirizzo del dominio, es. nome@deluxy.it.",
  "drive-oauth-salvato": "Credenziali dell’app OAuth salvate: ora premi «Collega Drive».",
  "drive-oauth-manca": "Prima servono ID client e segreto dell’app OAuth.",
  "drive-oauth-ok": "Drive collegato. Prova a scrivere nel ponte.",
  "drive-oauth-no": "Collegamento non riuscito.",
  "drive-oauth-negato": "Consenso non dato: il collegamento non è stato creato.",
  "drive-scollegato": "Drive scollegato: l’app non può più scrivere.",
};

export default async function PaginaImpostazioni({
  searchParams,
}: {
  searchParams: Promise<{ salvato?: string; perche?: string }>;
}) {
  const { salvato, perche } = await searchParams;
  const [cartella, documenti, account, ultimaSync, impApiKey, ai, chiaviApi, tokenTt, istruzioni, drive, perConto, oauth] = await Promise.all([
    driveDir(),
    prisma.documentoDrive.count(),
    prisma.accountAdv.findMany({ orderBy: [{ piattaforma: "asc" }, { nome: "asc" }] }),
    prisma.documentoDrive.findFirst({
      orderBy: { sincronizzatoIl: "desc" },
      select: { sincronizzatoIl: true },
    }),
    prisma.impostazione.findUnique({ where: { chiave: CHIAVE_APIKEY } }).catch(() => null),
    statoAi(),
    prisma.apiKey.findMany({ orderBy: [{ attiva: "desc" }, { creataIl: "desc" }] }).catch(() => []),
    tokenTikTok(),
    istruzioniOperative(),
    statoScritturaDrive(),
    emailImpersonata(),
    oauthConfigurato(),
  ]);

  const piattaformeConAccount = PIATTAFORME_ACCOUNT.filter((pf) =>
    account.some((a) => a.piattaforma === pf.chiave)
  );
  const idDrive = idCartellaDrive(cartella);
  const online = Boolean(idDrive);
  const haApiKey = Boolean(impApiKey?.valore);

  return (
    <div className="layout">
      <Sidebar attiva="impostazioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Impostazioni</h1>
            <p className="page-sub">
              Da dove l&apos;app legge i documenti e su quali account pubblicitari lavora. Gli
              account servono anche alle sessioni Claude, che devono sapere dove eseguire le
              modifiche.
            </p>
          </div>
        </div>

        {salvato && CONFERME[salvato] && (
          <div className="conferma">
            <span className="segno">✓</span>
            {CONFERME[salvato]}
            {perche && <div className="cella-sub" style={{ marginTop: 6, whiteSpace: "normal" }}>{perche}</div>}
          </div>
        )}

        <ChiaviApi
          chiavi={chiaviApi.map((c) => ({
            id: c.id,
            nome: c.nome,
            scrittura: c.scrittura,
            attiva: c.attiva,
            creataIl: c.creataIl.toISOString(),
            ultimoUso: c.ultimoUso?.toISOString() ?? null,
          }))}
        />

        <section className="scheda">
          <div className="scheda-titolo">Scrittura su Drive — il ponte</div>
          <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
            L&apos;app <b>legge</b> già la cartella Drive (653 documenti indicizzati) con una chiave
            API. Per <b>scrivere</b> nel ponte <code>ads/App Azioni/OUT - dall&apos;app</code> quella
            chiave non basta, e non è un limite dell&apos;app: una chiave API identifica
            l&apos;applicazione, non una persona, e Drive risponde{" "}
            <i>«API keys are not supported by this API»</i>. Serve un <b>account di servizio</b> —
            un utente Google non umano — e la cartella condivisa con la sua email come <b>Editor</b>.
          </p>

          <div className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
            {!drive.configurato ? (
              <span style={{ color: "var(--orange)" }}>
                Credenziale non impostata: l&apos;app oggi legge soltanto e non può depositare log,
                risultati o segnalazioni.
              </span>
            ) : drive.cartellaOut ? (
              <>
                <span style={{ color: "var(--green)" }}>Ponte aperto</span> — l&apos;app scrive come{" "}
                <code>{drive.email}</code> ({drive.via === "utente" ? "collegamento utente" : "account di servizio"}){" "}
                dentro <code>OUT - dall&apos;app</code>.
              </>
            ) : (
              <span style={{ color: "var(--red)" }}>
                Credenziale presente ma il ponte non si apre: {drive.errore}
              </span>
            )}
          </div>

          {drive.email && (
            <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
              <b>Condividi la cartella «ADV DELUXY SRL» con questa email, come Editor:</b>
              <br />
              <code style={{ userSelect: "all" }}>{drive.email}</code>
              <br />
              Senza quella condivisione l&apos;account di servizio esiste ma non vede niente: è un
              utente nuovo, e su Drive un utente nuovo non ha accesso a nulla finché non glielo dai.
            </p>
          )}

          <form className="modulo" action={salvaServiceAccountDrive}>
            <div className="campo-modulo largo">
              <label>File JSON della chiave dell&apos;account di servizio</label>
              <textarea
                name="json"
                rows={5}
                spellCheck={false}
                placeholder={drive.configurato ? "già impostato — lascia vuoto per non cambiarlo" : '{ "type": "service_account", "client_email": "...", "private_key": "-----BEGIN PRIVATE KEY-----..." }'}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              />
              {drive.configurato && (
                <label className="cella-sub" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <input type="checkbox" name="svuota" value="1" /> cancella la credenziale salvata
                </label>
              )}
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Salva la credenziale</button>
            </div>
          </form>

          <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 18, paddingTop: 18 }}>
            <div className="cella-nome" style={{ marginBottom: 6 }}>
              Collegare Drive come utente {oauth.refresh && <span style={{ color: "var(--green)" }}>· collegato{oauth.email ? ` come ${oauth.email}` : ""}</span>}
            </div>
            <p className="cella-sub" style={{ marginBottom: 12, whiteSpace: "normal" }}>
              È la strada da usare quando la cartella appartiene a un <b>account Gmail normale</b>:
              lì l&apos;account di servizio non può possedere file, l&apos;impersonazione non esiste
              (non c&apos;è nessun amministratore che possa autorizzarla) e i Drive condivisi
              nemmeno. Una persona dà il consenso una volta sola e l&apos;app scrive <b>come lei</b>.
            </p>
            <p className="cella-sub" style={{ marginBottom: 12, whiteSpace: "normal" }}>
              Nella Console Google → <i>Credenziali</i> → <b>Crea credenziali → ID client OAuth</b> →
              tipo <b>Applicazione web</b>. Fra gli URI di reindirizzamento autorizzati incolla
              esattamente questo:
              <br />
              <code style={{ userSelect: "all" }}>https://deluxy-marketing.vercel.app/api/interno/drive/oauth</code>
            </p>

            <form className="modulo" action={salvaOauthDrive}>
              <div className="campo-modulo">
                <label>ID client {oauth.id && <span style={{ color: "var(--green)", fontWeight: 400 }}>· presente</span>}</label>
                <input name="client_id" defaultValue={oauth.id ?? ""} spellCheck={false} placeholder="....apps.googleusercontent.com" />
              </div>
              <div className="campo-modulo">
                <label>Segreto client {oauth.segreto && <span style={{ color: "var(--green)", fontWeight: 400 }}>· presente</span>}</label>
                <input name="client_secret" type="password" autoComplete="off" spellCheck={false} placeholder={oauth.segreto ? "già impostato — lascia vuoto per non cambiarlo" : "GOCSPX-..."} />
              </div>
              <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                <button className="btn fantasma" type="submit">Salva credenziali OAuth</button>
              </div>
            </form>

            {oauth.id && oauth.segreto && (
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <a className="btn" href="/api/interno/drive/oauth">
                  {oauth.refresh ? "Ricollega Drive" : "Collega Drive"}
                </a>
                {oauth.refresh && (
                  <form action={salvaOauthDrive}>
                    <input type="hidden" name="scollega" value="1" />
                    <button className="btn fantasma" type="submit">Scollega</button>
                  </form>
                )}
              </div>
            )}
          </div>

          {drive.configurato && (
            <>
              <form className="modulo" action={salvaImpersonazioneDrive} style={{ marginTop: 4 }}>
                <div className="campo-modulo largo">
                  <label>
                    Agisci per conto di (email della persona che possiede i file)
                    {perConto && <span style={{ color: "var(--green)", fontWeight: 400 }}> · adesso: {perConto}</span>}
                  </label>
                  <input name="email" defaultValue={perConto ?? ""} placeholder="nome@deluxy.it" spellCheck={false} />
                  <div className="cella-sub" style={{ marginTop: 6, whiteSpace: "normal" }}>
                    Un account di servizio <b>non ha spazio su Drive</b>: non può possedere file, e
                    Google risponde <i>«Service Accounts do not have storage quota»</i> anche con i
                    permessi giusti. Scrivendo <b>per conto di</b> una persona, il file nasce nel suo
                    Drive e usa il suo spazio. Va autorizzato una volta sola nella Console di
                    amministrazione (Sicurezza → Controlli API → <b>Delega a livello di dominio</b>),
                    abbinando l&apos;ID client dell&apos;account di servizio all&apos;ambito{" "}
                    <code>https://www.googleapis.com/auth/drive</code>.
                  </div>
                </div>
                <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                  <button className="btn fantasma" type="submit">Salva</button>
                </div>
              </form>

              <form action={provaScritturaDrive} style={{ marginTop: 10 }}>
                <button className="btn fantasma" type="submit">Prova a scrivere nel ponte</button>
              </form>
            </>
          )}

          <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
            Tre regole del protocollo sono scritte nel codice, non lasciate alla buona volontà:
            l&apos;app scrive <b>solo</b> dentro <code>OUT - dall&apos;app</code>, <b>solo</b> file
            .md, e <b>solo file nuovi</b> — se il nome esiste già si ferma invece di sovrascrivere.
            Append-only applicato davvero vuol dire che un secondo invio con lo stesso nome deve
            fallire, non sostituire il primo.
          </p>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">Istruzioni operative dell&apos;AI</div>
          <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
            Il blocco che dice all&apos;AI <b>chi è, cosa può fare e cosa no</b>: ruolo, account,
            protocollo PONTE con la cartella Drive, regole di esecuzione, modelli dei file in
            uscita. Vale per <b>ogni</b> chiamata all&apos;AI e viene <b>prima</b> delle istruzioni
            della singola pagina: se le due cose si contraddicono, vince questo.
          </p>

          <div className="cella-sub" style={{ marginBottom: 14 }}>
            {istruzioni ? (
              <>
                Depositate: <b>{istruzioni.length.toLocaleString("it-IT")}</b> caratteri ·{" "}
                <span style={{ color: "var(--green)" }}>attive su tutte le chiamate</span>
              </>
            ) : (
              <span style={{ color: "var(--orange)" }}>
                Nessun blocco depositato: l&apos;AI lavora solo con le istruzioni della singola
                pagina, senza protocollo, senza vincoli di esecuzione e senza sapere degli account.
              </span>
            )}
          </div>

          <form className="modulo" action={salvaIstruzioniAi}>
            <div className="campo-modulo largo">
              <label>Blocco istruzioni (lo modifica solo il custode)</label>
              <textarea
                name="istruzioni"
                defaultValue={istruzioni ?? ""}
                rows={18}
                spellCheck={false}
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, lineHeight: 1.5 }}
              />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Deposita le istruzioni</button>
            </div>
          </form>

          <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
            Questo testo si rilegge <b>intero</b>, a differenza delle chiavi: non è un segreto, è un
            documento di lavoro, e chi deve modificarlo deve poterlo rileggere. Ogni salvataggio
            lascia una voce nello <a href="/storico">Storico</a> con la data e di quanto è cambiato:
            lo storico ufficiale resta 00.2/00.3, ma quando l&apos;AI si comporta in modo strano la
            prima domanda è «quando sono cambiate le istruzioni».
            <br />
            <b>Attenzione:</b> l&apos;AI dell&apos;app oggi <b>legge e propone</b> — non esegue nulla
            da sola e non ha accesso a Google Drive. Le parti del protocollo che parlano di scrivere
            file in <code>OUT - dall&apos;app</code> valgono per le sessioni Claude, non per questa
            app: qui restano come contesto, non come capacità.
          </p>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">TikTok Ads</div>
          <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
            TikTok, come Meta e a differenza di Google, non ha script che girano dentro
            l&apos;account: è l&apos;app che va a prendere i dati, e per farlo le serve un token.
            Si ottiene da un&apos;app <b>TikTok for Business</b> con accesso all&apos;advertiser
            (permesso di lettura dei report). L&apos;ID dell&apos;advertiser va invece censito qui
            sotto, fra gli account pubblicitari, scegliendo <b>TikTok Ads</b>.
          </p>

          <div className="cella-sub" style={{ marginBottom: 14 }}>
            Token:{" "}
            {tokenTt ? (
              <span style={{ color: "var(--green)" }}>presente</span>
            ) : (
              <span style={{ color: "var(--red)" }}>mancante — la sincronizzazione TikTok non parte</span>
            )}
            {" · "}Advertiser censiti:{" "}
            <b>{account.filter((a) => a.piattaforma === "tiktok").length}</b>
          </div>

          <form className="modulo" action={salvaTokenTikTok}>
            <div className="campo-modulo largo">
              <label>Access token</label>
              <input
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={tokenTt ? "già impostato — lascia vuoto per non cambiarlo" : "incolla qui il token"}
              />
              {tokenTt && (
                <label className="cella-sub" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <input type="checkbox" name="svuota" value="1" /> cancella il token salvato
                </label>
              )}
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Salva</button>
            </div>
          </form>

          <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
            Il token sta nel database, non in una variabile d&apos;ambiente come quello di Meta:
            un token si cambia quando scade, e cambiarlo non deve richiedere un deploy. Non si
            rilegge da nessuna pagina — qui si vede solo se c&apos;è.
            <br />
            Due cose da sapere sui numeri che arrivano: TikTok dà il <b>ritorno</b>, non
            l&apos;importo incassato, quindi i ricavi sono calcolati come ROAS × spesa; e se
            TikTok rifiuta una metrica, la sincronizzazione salva lo stesso spesa e clic e
            dichiara quale metrica manca, invece di non salvare niente.
          </p>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">Intelligenza artificiale</div>
          <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
            Quale AI scrive la <b>Lettura AI</b> e le analisi: <b>Claude</b> o <b>OpenAI</b>, a
            scelta. L&apos;AI riceve solo numeri già calcolati dall&apos;app — non li ricalcola — e
            non esegue niente: quello che propone passa comunque dalla coda approvata.
          </p>

          <div className="cella-sub" style={{ marginBottom: 14 }}>
            Adesso è attivo: <b>{ai.nome}</b> · modello <code>{ai.modello}</code> ·{" "}
            {ai.configurata ? (
              <span style={{ color: "var(--green)" }}>
                chiave presente{ai.origine === "ambiente" ? " (da variabile d'ambiente)" : ""}
              </span>
            ) : (
              <span style={{ color: "var(--red)" }}>chiave mancante: le pagine AI non funzionano</span>
            )}
          </div>

          <form className="modulo" action={salvaImpostazioniAi}>
            <div className="campo-modulo largo">
              <label>Quale AI usare</label>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 4 }}>
                {FORNITORI.map((f) => (
                  <label key={f.chiave} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500 }}>
                    <input type="radio" name="fornitore" value={f.chiave} defaultChecked={ai.fornitore === f.chiave} />
                    {f.nome}
                  </label>
                ))}
              </div>
            </div>

            {FORNITORI.map((f) => {
              const presente = ai.chiaviPresenti[f.chiave];
              return (
                <div key={f.chiave} className="campo-modulo largo" style={{ borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
                  <label>
                    {f.nome} — chiave API{" "}
                    {presente === "impostazioni" && <span style={{ color: "var(--green)", fontWeight: 400 }}>· salvata qui</span>}
                    {presente === "ambiente" && <span style={{ color: "var(--gold-strong)", fontWeight: 400 }}>· presa dalla variabile {f.variabile}</span>}
                    {!presente && <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· non impostata</span>}
                  </label>
                  <input
                    name={`chiave:${f.chiave}`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={presente ? "già impostata — lascia vuoto per non cambiarla" : "incolla qui la chiave"}
                  />
                  <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <span className="cella-sub">Modello</span>
                    <input
                      name={`modello:${f.chiave}`}
                      defaultValue={ai.fornitore === f.chiave ? ai.modello : ""}
                      placeholder={f.modelloDifetto}
                      spellCheck={false}
                      style={{ maxWidth: 260 }}
                    />
                    {presente === "impostazioni" && (
                      <label className="cella-sub" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" name={`svuota:${f.chiave}`} value="1" /> cancella la chiave salvata
                      </label>
                    )}
                  </div>
                  <div className="cella-sub" style={{ marginTop: 6, whiteSpace: "normal" }}>
                    {f.nota} La chiave si crea su{" "}
                    <a href={f.dove} target="_blank" rel="noreferrer">{new URL(f.dove).host}</a>.
                  </div>
                </div>
              );
            })}

            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Salva</button>
            </div>
          </form>

          <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
            Le chiavi salvate <b>non si rileggono più</b> da nessuna pagina: qui si vede solo se ci
            sono. Una casella lasciata vuota lascia in pace la chiave già salvata — per toglierla
            davvero c&apos;è la spunta. Se una chiave arriva da una variabile d&apos;ambiente,
            quella salvata qui ha comunque la precedenza, così si cambia senza rifare un deploy.
          </p>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">Cartella da sincronizzare</div>
          <p className="cella-sub" style={{ marginBottom: 14 }}>
            Puoi indicare una <b>cartella locale</b> (Google Drive per Desktop, es. <code>G:\Il mio Drive\ADV DELUXY SRL</code>)
            oppure incollare il <b>link della cartella Google Drive</b>: nel secondo caso la
            sincronizzazione legge online e funziona da qualsiasi dispositivo. L&apos;app legge
            soltanto, non scrive mai dentro il Drive.
          </p>
          <form className="modulo" action={salvaCartellaDrive}>
            <div className="campo-modulo largo">
              <label>Cartella locale o link Google Drive</label>
              <input name="cartella" defaultValue={cartella} spellCheck={false} />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Salva cartella</button>
            </div>
          </form>
          <div className="cella-sub" style={{ marginTop: 10 }}>
            Modalità attuale:{" "}
            <b style={{ color: online ? "var(--blue)" : "var(--green)" }}>
              {online ? "Google Drive online (via API)" : "Cartella locale sul computer"}
            </b>
            {" · "}
            {documenti} documenti indicizzati
            {ultimaSync ? ` · ultima sincronizzazione ${formattaDataOra(ultimaSync.sincronizzatoIl)}` : ""}
            {" · "}
            <a href="/drive" style={{ color: "var(--blue)" }}>vai ai documenti</a>
          </div>
        </section>

        {online && (
          <section className="scheda">
            <div className="scheda-titolo">Chiave API Google Drive</div>
            <div className="nota-info" style={{ marginBottom: 14 }}>
              <span className="nota-icona">◈</span>
              <span>
                Per leggere la cartella online servono due cose, una volta sola: (1) la cartella su
                Drive dev&apos;essere condivisa <b>“Chiunque abbia il link → Visualizzatore”</b>; (2) una
                chiave API di Google (Google Cloud → API e servizi → Credenziali → Chiave API, con
                l&apos;API “Google Drive” abilitata). La chiave è di sola lettura sui file pubblici e
                resta salvata qui. {haApiKey ? "✓ Una chiave è già impostata." : "Nessuna chiave impostata: la sincronizzazione online non parte finché non la aggiungi."}
              </span>
            </div>
            <form className="modulo" action={salvaApiKeyDrive}>
              <div className="campo-modulo largo">
                <label>Chiave API</label>
                <input
                  name="apikey"
                  type="password"
                  placeholder={haApiKey ? "•••••••••• (già impostata, lascia vuoto per non cambiarla)" : "AIza…"}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                <button className="btn" type="submit">Salva chiave</button>
              </div>
            </form>
          </section>
        )}

        <section className="scheda">
          <div className="scheda-titolo">Account collegati ({account.length})</div>
          {account.length === 0 ? (
            <div className="vuoto-mini">
              Nessun account: aggiungine uno qui sotto (l&apos;id è quello che si legge nella
              piattaforma).
            </div>
          ) : (
            piattaformeConAccount.map((pf) => (
              <div key={pf.chiave} style={{ marginBottom: 16 }}>
                <div className="canale-divisore">
                  <Icona nome={pf.icona} />
                  {pf.nome}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Id sulla piattaforma</th>
                        <th>Brand</th>
                        <th>Stato</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {account
                        .filter((a) => a.piattaforma === pf.chiave)
                        .map((a) => (
                          <tr key={a.id}>
                            <td>
                              <div className="cella-nome">{a.nome}</div>
                              {a.note && <div className="cella-sub">{a.note}</div>}
                            </td>
                            <td style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12.5 }}>
                              {a.idEsterno}
                            </td>
                            <td>
                              <span className="tag-salute" style={{ color: COLORE_BRAND[a.brand] ?? "var(--text-tertiary)" }}>
                                <span className="dot" />
                                {ETICHETTA_BRAND[a.brand] ?? a.brand}
                              </span>
                            </td>
                            <td>
                              <form action={attivaAccount}>
                                <input type="hidden" name="id" value={a.id} />
                                <button
                                  className="pill-opt"
                                  type="submit"
                                  style={{ color: a.attivo ? "var(--green)" : "var(--text-tertiary)" }}
                                  title={a.attivo ? "Disattiva" : "Riattiva"}
                                >
                                  <span className="dot" />
                                  <span style={{ color: "var(--text)" }}>{a.attivo ? "Attivo" : "Disattivo"}</span>
                                </button>
                              </form>
                            </td>
                            <td className="num">
                              <form action={rimuoviAccount}>
                                <input type="hidden" name="id" value={a.id} />
                                <button className="icon-btn" type="submit" title="Rimuovi account" aria-label="Rimuovi account">
                                  ✕
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 16, marginTop: 8 }}>
            <div className="scheda-titolo">Aggiungi o aggiorna un account</div>
            <p className="cella-sub" style={{ marginBottom: 14 }}>
              Piattaforma e id insieme sono la chiave: rimandando lo stesso id si aggiorna
              l&apos;account invece di crearne un altro.
            </p>
            <form className="modulo" action={salvaAccount}>
              <div className="campo-modulo">
                <label>Piattaforma</label>
                <select name="piattaforma" defaultValue="google_ads">
                  {PIATTAFORME_ACCOUNT.map((pf) => (
                    <option key={pf.chiave} value={pf.chiave}>{pf.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo">
                <label>Nome <span className="obbligatorio">*</span></label>
                <input name="nome" required placeholder="Es. Deluxyflowers Search" />
              </div>
              <div className="campo-modulo">
                <label>Id sulla piattaforma <span className="obbligatorio">*</span></label>
                <input name="idEsterno" required placeholder="Es. 825-518-1560 · act_1040175814157216" />
              </div>
              <div className="campo-modulo">
                <label>Brand</label>
                <select name="brand" defaultValue="cross">
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo largo">
                <label>Note</label>
                <input name="note" placeholder="Es. account operativo, il vecchio è sospeso" />
              </div>
              <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                <button className="btn" type="submit">Salva account</button>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
