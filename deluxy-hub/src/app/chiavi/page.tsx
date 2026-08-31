import Link from "next/link";
import { catalogoApp } from "@/lib/apps";
import { decifra } from "@/lib/cifratura";
import { NOMI_CHIAVI, statoPosta } from "@/lib/posta";
import { aggiornaChiave, creaChiave, eliminaChiave, revocaToken, salvaPosta } from "@/lib/chiavi-actions";
import { prisma } from "@/lib/db";
import { richiediAdmin } from "@/lib/sessione-server";
import { ConfermaAzione } from "@/components/ConfermaAzione";
import { EmptyState } from "@/components/EmptyState";
import { TokenForm } from "./TokenForm";

// Cassaforte delle chiavi dei progetti, solo admin. I valori stanno sul database
// cifrati (AES-256-GCM); qui si vedono mascherati e si rivelano uno alla volta.

const MESSAGGI_OK: Record<string, string> = {
  creata: "Chiave salvata.",
  aggiornata: "Chiave aggiornata.",
  eliminata: "Chiave eliminata.",
  "token-creato": "Token creato. Se non l'hai copiato, revocalo e generane un altro.",
  "token-revocato": "Token revocato.",
  posta: "Posta del portale salvata.",
};

const MESSAGGI_ERRORE: Record<string, string> = {
  dati: "Dati non validi: servono progetto, nome e valore.",
  esiste: "Questo progetto ha già una chiave con questo nome: modificala dalla lista.",
  segreto:
    "HUB_CHIAVI_SECRET manca (o è troppo corto) nell'ambiente: senza, i valori non si possono cifrare.",
  token: "Token non valido: dai un nome e premi «Genera token» prima di salvare.",
  "token-esiste": "Questo token esiste già: generane un altro.",
  scope: "Scegli almeno un progetto: un token senza progetti leggerebbe i segreti di tutte le app.",
};

function dataIt(d: Date) {
  // Il server è in UTC: senza il fuso esplicito «aggiornata alle 09:08» era
  // l'ora di Greenwich, due ore indietro rispetto a chi guardava la pagina.
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default async function ChiaviPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string; mostra?: string }>;
}) {
  await richiediAdmin();
  const sp = await searchParams;

  const chiavi = await prisma.chiave.findMany({
    orderBy: [{ progetto: "asc" }, { nome: "asc" }],
  });
  const token = await prisma.tokenApi.findMany({ orderBy: [{ nome: "asc" }] });

  // Il valore si rivela una chiave alla volta (?mostra=id): si decifra solo
  // quella, le altre restano mascherate.
  let rivelata: { id: string; valore: string } | null = null;
  let erroreDecifra = false;
  if (sp.mostra) {
    const c = chiavi.find((x) => x.id === sp.mostra);
    if (c) {
      try {
        rivelata = { id: c.id, valore: decifra(c.valoreCifrato) };
      } catch {
        erroreDecifra = true; // HUB_CHIAVI_SECRET assente o cambiato dopo il salvataggio
      }
    }
  }

  // Suggerimenti per il campo "progetto": il portale stesso, le app del catalogo
  // e i progetti già usati. «hub» va messo a mano perché il Hub NON è un’app del
  // catalogo (il catalogo elenca le app che il portale linka), eppure è il
  // progetto dove il Hub tiene i PROPRI segreti — la posta, per cominciare.
  // Senza, chi cerca dove configurare l’email non trova la voce e conclude che
  // non si può fare.
  const progetti = [...new Set(["hub", ...catalogoApp().map((a) => a.id), ...chiavi.map((c) => c.progetto)])].sort();

  // Stato della posta del portale: quali dei cinque nomi mancano nel progetto
  // «hub». È l’unica configurazione che il Hub legge da qui per sé, e finché non
  // è completa il recupero password non manda niente.
  const nomiPosta = chiavi.filter((c) => c.progetto === "hub").map((c) => c.nome);
  const mancantiPosta = NOMI_CHIAVI.filter(
    (n) => !nomiPosta.includes(n) && n !== "SMTP_PORT" && n !== "SMTP_FROM",
  );
  const posta = await statoPosta();

  // I valori già salvati si ripresentano nel modulo — tranne la password, che
  // non torna MAI a schermo: un campo vuoto accanto a una configurazione che
  // esiste fa credere di non aver salvato, ed è il motivo per cui si finisce a
  // riscrivere tutto ogni volta. La password resta vuota apposta: lasciandola
  // così non viene toccata.
  const postaSalvata: Record<string, string> = {};
  for (const c of chiavi.filter((x) => x.progetto === "hub" && x.nome !== "SMTP_PASS")) {
    try {
      postaSalvata[c.nome] = decifra(c.valoreCifrato);
    } catch {
      // riga cifrata con un altro segreto: si tratta come assente
    }
  }

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Chiavi</h1>
        <p className="page-sub">
          I segreti di tutti i progetti in un posto solo, cifrati sul database. Solo gli
          amministratori arrivano qui.
        </p>
      </div>

      {sp.ok && MESSAGGI_OK[sp.ok] && <div className="avviso ok">{MESSAGGI_OK[sp.ok]}</div>}
      {sp.errore && MESSAGGI_ERRORE[sp.errore] && (
        <div className="avviso errore">{MESSAGGI_ERRORE[sp.errore]}</div>
      )}
      {erroreDecifra && (
        <div className="avviso errore">
          Impossibile decifrare: HUB_CHIAVI_SECRET manca o è cambiato dopo il salvataggio di
          questa chiave.
        </div>
      )}

      {/* La posta del portale si configura QUI e in nessun altro posto: senza
          questa spiegazione, il progetto «hub» è un nome che nessuno indovina. */}
      <div className="section-label">La posta del portale</div>
      <div className="card" style={{ marginBottom: 8 }}>
        {posta.pronta ? (
          <p style={{ margin: 0, fontSize: 14 }}>
            <span className="badge green">
              <span className="dot" />
              Pronta
            </span>{" "}
            Le email del portale partono da <strong>{posta.mittente}</strong> (configurazione presa{" "}
            {posta.origine === "ambiente" ? "dalle variabili d’ambiente" : "da questa cassaforte"}).
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 10px", fontSize: 14 }}>
              <span className="badge neutro">
                <span className="dot" />
                Non configurata
              </span>{" "}
              Finché manca, il <strong>recupero password</strong> non può mandare il link e il
              riepilogo presenze non si spedisce.
            </p>
            {/* Il modulo sta QUI, non «qui sotto»: la posta ha cinque chiavi con
                nomi esatti, e chiederle una per una nel modulo generico voleva
                dire indovinare progetto e nome cinque volte. Si compila una
                volta e le righe le scrive l’app, nel progetto «hub». */}
            <form
              action={salvaPosta}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, alignItems: "end" }}
            >
              <label className="campo" style={{ marginBottom: 0 }}>
                <span>Server di posta in uscita</span>
                <input name="host" defaultValue={postaSalvata.SMTP_HOST ?? ""} placeholder="authsmtp.tuodominio.it" autoComplete="off" spellCheck={false} />
              </label>
              <label className="campo" style={{ marginBottom: 0 }}>
                <span>Porta</span>
                <input name="porta" defaultValue={postaSalvata.SMTP_PORT ?? "465"} inputMode="numeric" />
              </label>
              <label className="campo" style={{ marginBottom: 0 }}>
                <span>Casella (nome utente)</span>
                <input name="utente" type="email" defaultValue={postaSalvata.SMTP_USER ?? ""} placeholder="noreply@tuodominio.it" autoComplete="off" />
              </label>
              <label className="campo" style={{ marginBottom: 0 }}>
                <span>
                  Password della casella
                  {chiavi.some((c) => c.progetto === "hub" && c.nome === "SMTP_PASS") && " (salvata: riscrivila solo per cambiarla)"}
                </span>
                <input name="password" type="password" autoComplete="new-password" />
              </label>
              <label className="campo" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
                <span>Mittente mostrato (vuoto = la casella qui sopra)</span>
                <input name="mittente" type="email" defaultValue={postaSalvata.SMTP_FROM ?? ""} placeholder="noreply@tuodominio.it" autoComplete="off" />
              </label>
              <button type="submit" className="btn primary" style={{ justifyContent: "center", padding: "10px 18px", gridColumn: "1 / -1" }}>
                Salva la posta
              </button>
            </form>
            <p className="nota" style={{ marginTop: 12, marginBottom: 0 }}>
              I valori finiscono cifrati nel progetto <code>hub</code>, con i nomi{" "}
              <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{" "}
              <code>SMTP_PASS</code>, <code>SMTP_FROM</code>. Lasciando un campo vuoto, quel
              valore resta com’era.
              {mancantiPosta.length > 0 && mancantiPosta.length < 3 && (
                <>
                  {" "}Mancano ancora:{" "}
                  {mancantiPosta.map((n, i) => (
                    <span key={n}>
                      {i > 0 && ", "}
                      <code>{n}</code>
                    </span>
                  ))}
                  .
                </>
              )}
            </p>
          </>
        )}
      </div>

      <div className="section-label">Nuova chiave</div>
      <div className="card">
        <form
          action={creaChiave}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "end" }}
        >
          <label className="campo req" style={{ marginBottom: 0 }}>
            <span>Progetto</span>
            <input name="progetto" required list="progetti" placeholder="deluxy-mail" />
            <datalist id="progetti">
              {progetti.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="campo req" style={{ marginBottom: 0 }}>
            <span>Nome</span>
            <input name="nome" required placeholder="OPENAI_API_KEY" style={{ fontFamily: "ui-monospace, monospace" }} />
          </label>
          <label className="campo req" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
            <span>Valore (salvato cifrato)</span>
            <input name="valore" required autoComplete="off" spellCheck={false} style={{ fontFamily: "ui-monospace, monospace" }} />
          </label>
          <label className="campo" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
            <span>Note (facoltative: a cosa serve, dove si rigenera)</span>
            <input name="note" placeholder="Console OpenAI → API keys" />
          </label>
          <button
            type="submit"
            className="btn primary"
            style={{ justifyContent: "center", padding: "10px 18px", gridColumn: "1 / -1" }}
          >
            Salva chiave
          </button>
        </form>
      </div>

      <div className="section-label">{chiavi.length} chiavi</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        {chiavi.length === 0 ? (
          <EmptyState
            titolo="Nessuna chiave salvata"
            frase="Qui vivono i segreti dei progetti, cifrati. Aggiungi la prima con il modulo qui sopra."
          />
        ) : (
          <div className="tabella-scroll">
            <table>
            <thead>
              <tr>
                <th>Progetto</th>
                <th>Nome</th>
                <th>Valore</th>
                <th>Aggiornata</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {chiavi.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="badge gold">
                      <span className="dot" />
                      {c.progetto}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{c.nome}</div>
                    {c.note && (
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3 }}>
                        {c.note}
                      </div>
                    )}
                  </td>
                  <td>
                    {rivelata?.id === c.id ? (
                      <div>
                        <code
                          style={{
                            fontSize: 12.5,
                            wordBreak: "break-all",
                            userSelect: "all",
                            display: "block",
                            maxWidth: 360,
                          }}
                        >
                          {rivelata.valore}
                        </code>
                        <Link href="/chiavi" style={{ fontSize: 12.5 }}>
                          Nascondi
                        </Link>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--text-secondary)" }}>
                          ••••{c.suffisso}
                        </span>
                        <Link href={`/chiavi?mostra=${c.id}`} style={{ fontSize: 12.5 }}>
                          Mostra
                        </Link>
                      </div>
                    )}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {dataIt(c.aggiornatoIl)}
                  </td>
                  <td>
                    <details>
                      <summary className="btn ghost" style={{ listStyle: "none", display: "inline-flex" }}>
                        Modifica
                      </summary>
                      <form
                        action={aggiornaChiave}
                        style={{ marginTop: 12, display: "grid", gap: 10, minWidth: 240 }}
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <label className="campo" style={{ marginBottom: 0 }}>
                          <span>Nuovo valore (vuoto = invariato)</span>
                          <input name="valore" autoComplete="off" spellCheck={false} style={{ fontFamily: "ui-monospace, monospace" }} />
                        </label>
                        <label className="campo" style={{ marginBottom: 0 }}>
                          <span>Note</span>
                          <input name="note" defaultValue={c.note} />
                        </label>
                        <button type="submit" className="btn primary" style={{ justifyContent: "center" }}>
                          Salva
                        </button>
                      </form>
                      <div style={{ marginTop: 8 }}>
                        <ConfermaAzione
                          action={eliminaChiave}
                          campiNascosti={{ id: c.id }}
                          verbo="Elimina chiave"
                          titolo={`Elimino «${c.progetto} · ${c.nome}»?`}
                          conseguenza="Le app che la leggono smettono di funzionare finché non ne salvi un'altra. Il valore cifrato è perduto."
                          larghezza
                        />
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="page-head" style={{ marginTop: 40 }}>
        <h1 className="page-title">Token di servizio</h1>
        <p className="page-sub">
          Le altre app leggono le proprie chiavi da{" "}
          <code>GET /api/chiavi?progetto=…</code> con uno di questi token
          (header <code>x-api-key</code> o <code>Authorization: Bearer</code>). Ogni
          token vede solo i progetti che gli assegni.
        </p>
      </div>

      <div className="section-label">Nuovo token</div>
      <div className="card">
        <TokenForm progetti={progetti} />
      </div>

      <div className="section-label">{token.length} token</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        {token.length === 0 ? (
          <EmptyState
            titolo="Nessun token di servizio"
            frase="I token fanno leggere le chiavi alle altre app. Generane uno qui sopra e mettilo nell'ambiente dell'app che deve leggere."
          />
        ) : (
          <div className="tabella-scroll">
            <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Progetti</th>
                <th>Ultimo uso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {token.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.nome}</td>
                  <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    {t.progetti.length === 0 ? (
                      <span className="badge gold">
                        <span className="dot" />
                        tutti i progetti
                      </span>
                    ) : (
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>
                        {t.progetti.join(" · ")}
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {t.ultimoUso ? dataIt(t.ultimoUso) : "mai"}
                  </td>
                  <td>
                    <ConfermaAzione
                      action={revocaToken}
                      campiNascosti={{ id: t.id }}
                      verbo="Revoca"
                      titolo={`Revoco il token «${t.nome}»?`}
                      conseguenza="L'app che lo usa perde subito l'accesso alle chiavi. Dovrai generarne uno nuovo e aggiornarla."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </main>
  );
}
