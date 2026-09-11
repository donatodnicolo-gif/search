import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { statoOrders } from "@/lib/orders";
import { configurazioneMail, statoMail } from "@/lib/mail";
import { statoCS } from "@/lib/nuovo-ordine";
import { chiaveApp } from "@/lib/chiavi-app";
import { statoPasswordTeam } from "@/lib/password-team";
import { sessioneCorrente } from "@/lib/sessione-server";
import CardPasswordTeam from "@/components/CardPasswordTeam";
import { abilitaUtenteCrm, creaUtenteCrm, salvaImpostazioniClienti } from "@/lib/actions";
import { utentiHub } from "@/lib/hub-utenti";
import { dataIt } from "@/lib/etichette";
import { statoMerch } from "@/lib/merchandising";
import { COLORI_CLUSTER, descriviCluster, impostazioniClienti, MAX_CLUSTER } from "@/lib/cluster";

export const dynamic = "force-dynamic";

// IMPOSTAZIONI — lo stato dei collegamenti, MISURATO (non dedotto dalla
// presenza delle chiavi): una chiamata vera a ciascuna app dice se il filo
// regge. Le chiavi vivono nella cassaforte del Hub o nelle env di Vercel: qui
// non si mostrano mai i valori.
export default async function Impostazioni({
  searchParams,
}: {
  searchParams: Promise<{ password?: string; esito?: string; errore?: string }>;
}) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const [orders, mail, mailConfig, cs, calKey, calUtente, hubToken, openaiKey, db, password, sessione, imp, merch, utenti] = await Promise.all([
    statoOrders(),
    statoMail(),
    configurazioneMail(),
    statoCS(),
    chiaveApp("CALENDARIO_API_KEY"),
    chiaveApp("CALENDARIO_UTENTE"),
    chiaveApp("HUB_KEYS_TOKEN"),
    chiaveApp("OPENAI_API_KEY"),
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
    statoPasswordTeam().catch(() => null),
    sessioneCorrente(),
    impostazioniClienti(),
    statoMerch(),
    utentiHub(),
  ]);
  // Le righe del form dei cluster: quelle esistenti più due vuote, fino al tetto.
  const righeCluster = [...imp.cluster.map((k) => k as Partial<typeof k>), {}, {}].slice(0, MAX_CLUSTER);
  // Dal Hub solo gli admin cambiano la password del team; con la password
  // di squadra chiunque è dentro la può cambiare (conosce quella attuale).
  const passwordSoloLettura = Boolean(sessione && sessione.via === "sso" && sessione.ruolo !== "admin");
  const passwordAdminHub = Boolean(sessione && sessione.via === "sso" && sessione.ruolo === "admin");
  const openaiOk = Boolean(openaiKey);
  // Gli utenti: chi entra nel CRM (admin del Hub o app «crm» abilitata) e gli
  // altri del Hub, da abilitare con un click. Solo un admin del Hub (via SSO)
  // li tocca; con la password di team la porta è quella di squadra.
  const puoGestireUtenti = !sessione || sessione.via !== "sso" || sessione.ruolo === "admin";
  const dentroCrm = utenti.ok ? utenti.dati.filter((u) => u.abilitato) : [];
  const fuoriCrm = utenti.ok ? utenti.dati.filter((u) => !u.abilitato) : [];
  const RUOLI_NOME: Record<string, string> = { admin: "Amministratore", commerciale: "Commerciale", partner: "Partner" };

  const Stato = ({ ok, testoOk, testoNo }: { ok: boolean; testoOk: string; testoNo: string }) => (
    <span
      className="badge colorato"
      style={{ ["--badge-colore" as string]: ok ? "var(--green)" : "var(--orange)" }}
    >
      <span className="dot" />
      {ok ? testoOk : testoNo}
    </span>
  );

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">
            Lo stato dei collegamenti del CRM, misurato con una chiamata vera. Le chiavi si impostano nella cassaforte
            del Deluxy Hub (progetto «deluxy-crm») o nelle variabili del progetto Vercel — mai in pagina.
          </p>
        </div>
      </div>

      <div className="griglia due">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div className="card-titolo">Deluxy Orders</div>
            <Stato ok={orders.raggiungibile && orders.autenticato} testoOk="Collegato" testoNo={orders.raggiungibile ? "Chiave mancante o sbagliata" : "Non raggiungibile"} />
          </div>
          <div className="card-sub">La fonte di clienti, ordini, segmenti e ricorrenze.</div>
          <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
            Variabili: <code className="chip">ORDERS_URL</code> <code className="chip">ORDERS_API_KEY</code>
            <br />
            La chiave si emette da Orders: <code className="chip">npm run chiave -- deluxy-crm --scrittura</code> (la
            scrittura serve per salvare le ricorrenze aggiunte a mano nel registro).
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div className="card-titolo">AI Mail (invio)</div>
            <Stato ok={mail.raggiungibile && mail.autenticato} testoOk="Collegato" testoNo={!mail.raggiungibile ? "Non raggiungibile" : mailConfig.pronta ? "Token rifiutato" : `Manca ${mailConfig.manca.join(" e ")}`} />
          </div>
          <div className="card-sub">Le mail del CRM partono dalla casella aziendale, via AI Mail.</div>
          <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
            Variabili: <code className="chip">MAIL_URL</code> <code className="chip">MAIL_API_KEY</code>{" "}
            <code className="chip">MAIL_UTENTE</code>
            <br />
            Il token si genera da AI Mail → Impostazioni App → «Token API di AI Mail»; MAIL_UTENTE è l&apos;email con cui
            si entra in AI Mail (decide la casella mittente).
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div className="card-titolo">Customer Service (nuovo ordine)</div>
            <Stato ok={cs.raggiungibile && cs.autenticato} testoOk="Collegato" testoNo={cs.raggiungibile ? "Chiave mancante o sbagliata" : "Non raggiungibile"} />
          </div>
          <div className="card-sub">Da lì passano il nuovo ordine con link di pagamento e i WhatsApp dai numeri dei marchi.</div>
          <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
            Variabili: <code className="chip">MESSAGGI_URL</code> <code className="chip">MESSAGGI_API_KEY</code>
            <br />
            La chiave si emette dal Customer Service: <code className="chip">npm run chiave -- deluxy-crm --scrittura</code>.
            L&apos;API WhatsApp consegna solo nella finestra 24h di Meta; fuori, c&apos;è il canale assistito.
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div className="card-titolo">AI per le liste</div>
            <Stato ok={openaiOk} testoOk="Configurata" testoNo="Manca OPENAI_API_KEY" />
          </div>
          <div className="card-sub">Traduce il brief in criteri sui dati di Orders: non inventa clienti.</div>
          <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
            Variabili: <code className="chip">OPENAI_API_KEY</code> <code className="chip">OPENAI_MODEL</code> (default
            gpt-4o-mini, come le altre app).
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div className="card-titolo">Deluxy Calendario</div>
            <Stato ok={Boolean(calKey && calUtente)} testoOk="Configurato" testoNo="Facoltativo, non configurato" />
          </div>
          <div className="card-sub">Gli eventi CRM con una data si spingono anche in agenda.</div>
          <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
            Variabili: <code className="chip">CALENDARIO_URL</code> <code className="chip">CALENDARIO_API_KEY</code>{" "}
            <code className="chip">CALENDARIO_UTENTE</code>
            <br />
            Senza, gli eventi restano solo nel CRM (nessun errore: si annota e basta).
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div className="card-titolo">Base dati e cassaforte</div>
            <Stato ok={db} testoOk="Database ok" testoNo="Database non raggiungibile" />
          </div>
          <div className="card-sub">Schema «crm» sul Postgres condiviso; chiavi dalla cassaforte del Hub.</div>
          <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
            Cassaforte del Hub: {hubToken ? "token presente — le chiavi si leggono da lì (le env restano di riserva)." : (
              <>non configurata (<code className="chip">HUB_URL</code> + <code className="chip">HUB_KEYS_TOKEN</code>): si usano le env di Vercel.</>
            )}
            <br />
            Accesso app: <code className="chip">CRM_APP_PASSWORD</code> (porta di team, obbligatoria in produzione) ·{" "}
            <code className="chip">CRM_SESSION_SECRET</code> (firma sessione) · <code className="chip">HUB_SSO_SECRET</code>{" "}
            (ingresso dal Hub senza password).
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div className="card-titolo">Merchandising (prodotti e collezioni)</div>
            <Stato
              ok={merch.raggiungibile && merch.autenticato}
              testoOk="Collegato"
              testoNo={merch.raggiungibile ? "Chiave assente o non valida" : "Non raggiungibile"}
            />
          </div>
          <div className="card-sub">Da proporre nei messaggi ai clienti (Componi mail e WhatsApp).</div>
          <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
            Chiave a sola lettura, emessa da Merchandising → Impostazioni → chiavi API (nome «deluxy-crm»), in{" "}
            <code className="chip">MERCH_API_KEY</code> (+ <code className="chip">MERCH_URL</code> se non è quello
            standard). Senza, il compositore lo dice e il resto funziona.
          </p>
        </div>

        <div className="card tabella-card" id="utenti" style={{ gridColumn: "1 / -1" }}>
          <div style={{ padding: "20px 20px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div className="card-titolo">Utenti del CRM</div>
              <Stato ok={utenti.ok} testoOk="Collegato al Hub" testoNo="Hub non collegato" />
            </div>
            <div className="card-sub">
              Chi entra nel CRM e con quale nome. Gli utenti hanno UNA casa, il Deluxy Hub: da qui si creano e si
              abilitano passando dalla sua API, niente copie. Gli amministratori del Hub entrano sempre.
            </div>
            {!utenti.ok ? (
              <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
                {utenti.errore}
                <br />
                Serve un token di servizio del Hub con scope «crm»: Hub → Chiavi → «Token di servizio», poi{" "}
                <code className="chip">HUB_KEYS_TOKEN</code> nelle variabili del CRM (o in cassaforte).
              </p>
            ) : null}
            {sp.esito && sp.esito !== "ok" ? <div className="ok-card">{sp.esito}</div> : null}
          </div>

          {utenti.ok ? (
            <div className="tabella-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Utente</th>
                    <th>Ruolo</th>
                    <th>Stato</th>
                    <th>Ultimo accesso</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dentroCrm.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="cella-principale">{u.nome}</div>
                        <div className="cella-sotto">{u.email}</div>
                      </td>
                      <td>{RUOLI_NOME[u.ruolo] ?? u.ruolo}</td>
                      <td>
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: u.attivo ? "var(--green)" : "var(--red)" }}>
                          <span className="dot" />
                          {u.attivo ? "Attivo" : "Disattivato"}
                        </span>
                      </td>
                      <td className="secondario piccolo">{u.ultimoAccesso ? dataIt(u.ultimoAccesso, true) : "mai"}</td>
                      <td style={{ textAlign: "right" }}>
                        {u.ruolo === "admin" ? (
                          <span className="terziario piccolo">entra sempre</span>
                        ) : puoGestireUtenti ? (
                          <form action={abilitaUtenteCrm}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="abilitato" value="0" />
                            <button className="btn ghost mini" type="submit">Togli dal CRM</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {dentroCrm.length === 0 ? (
                    <tr><td colSpan={5} className="secondario piccolo">Nessun utente abilitato al CRM, per ora.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {utenti.ok && puoGestireUtenti ? (
            <div className="griglia due" style={{ padding: 20, borderTop: "1px solid var(--line)" }}>
              <div>
                <div className="card-titolo" style={{ fontSize: 14 }}>Nuovo utente</div>
                <div className="card-sub">Nasce nel Hub, già abilitato al CRM. La password gliela dai tu; la cambia lui dal Hub.</div>
                <form action={creaUtenteCrm}>
                  <div className="form-riga">
                    <div className="campo">
                      <label>Nome <span className="ob">*</span></label>
                      <input type="text" name="nome" required placeholder="Maria Rossi" />
                    </div>
                    <div className="campo">
                      <label>Email <span className="ob">*</span></label>
                      <input type="email" name="email" required placeholder="maria@deluxy.it" />
                    </div>
                  </div>
                  <div className="form-riga">
                    <div className="campo">
                      <label>Password iniziale <span className="ob">*</span> <span className="aiuto">(almeno 8 caratteri)</span></label>
                      <input type="password" name="password" required minLength={8} autoComplete="new-password" />
                    </div>
                    <div className="campo">
                      <label>Ruolo</label>
                      <select name="ruolo" defaultValue="commerciale">
                        <option value="commerciale">Commerciale</option>
                        <option value="partner">Partner</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-piede">
                    <button className="btn" type="submit">Crea l&apos;utente</button>
                  </div>
                </form>
              </div>
              <div>
                <div className="card-titolo" style={{ fontSize: 14 }}>Già nel Hub, fuori dal CRM</div>
                <div className="card-sub">Un click e entrano anche qui.</div>
                {fuoriCrm.length === 0 ? (
                  <p className="terziario piccolo">Tutti gli utenti del Hub entrano già nel CRM.</p>
                ) : (
                  <div className="timeline">
                    {fuoriCrm.map((u) => (
                      <div className="timeline-voce" key={u.id}>
                        <div className="timeline-corpo">
                          <div className="timeline-titolo">{u.nome}</div>
                          <div className="timeline-quando">{u.email} · {RUOLI_NOME[u.ruolo] ?? u.ruolo}{u.attivo ? "" : " · disattivato"}</div>
                        </div>
                        <form action={abilitaUtenteCrm} style={{ alignSelf: "center" }}>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="abilitato" value="1" />
                          <button className="btn ghost mini" type="submit">Abilita al CRM</button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : utenti.ok ? (
            <p className="secondario piccolo" style={{ padding: "0 20px 20px" }}>
              Per creare o abilitare utenti serve un amministratore del Hub.
            </p>
          ) : null}
        </div>

        <div className="card" id="clienti" style={{ gridColumn: "1 / -1" }}>
          <div className="card-titolo">Clienti del CRM: soglie e cluster</div>
          <div className="card-sub">
            Tutti i clienti di Orders entrano nel CRM, sempre. Qui si decide chi è <strong>in soglia</strong> (da
            coltivare) e i <strong>cluster</strong>: gruppi tuoi, in ordine di priorità — il primo che combacia vince;
            un cluster senza condizioni raccoglie tutti gli altri. Spesa annua e frequenza sono stime sugli anni di vita
            del cliente; il punteggio è quello dato a mano nella scheda (0-100).
          </div>
          {sp.esito === "ok" ? <div className="ok-card">Impostazioni salvate.</div> : null}
          {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}
          <form action={salvaImpostazioniClienti}>
            <div className="form-riga" style={{ maxWidth: 640 }}>
              <div className="campo">
                <label>Spesa totale minima (€)</label>
                <input type="number" name="spesaTotaleMin" min={0} step="1" defaultValue={imp.soglie.spesaTotaleMin || ""} placeholder="0 = nessuna" />
              </div>
              <div className="campo">
                <label>Spesa annua minima (€)</label>
                <input type="number" name="spesaAnnuaMin" min={0} step="1" defaultValue={imp.soglie.spesaAnnuaMin || ""} placeholder="0 = nessuna" />
              </div>
              <div className="campo">
                <label>Frequenza minima (ordini/anno)</label>
                <input type="number" name="ordiniAnnoMin" min={0} step="0.5" defaultValue={imp.soglie.ordiniAnnoMin || ""} placeholder="0 = nessuna" />
              </div>
            </div>

            <div className="card-titolo" style={{ fontSize: 14, marginTop: 6 }}>Cluster (in ordine di priorità)</div>
            <p className="terziario piccolo" style={{ marginBottom: 10 }}>
              Lascia vuota una condizione per non usarla. Le righe senza nome non contano.
            </p>
            {righeCluster.map((k, i) => (
              <div className="riga-cluster" key={i}>
                <div className="campo">
                  <label>Nome</label>
                  <input type="text" name={`k${i}_nome`} defaultValue={k.nome ?? ""} maxLength={40} placeholder={i === 0 ? "es. Top" : ""} />
                </div>
                <div className="campo">
                  <label>Colore</label>
                  <select name={`k${i}_colore`} defaultValue={k.colore ?? COLORI_CLUSTER[i % COLORI_CLUSTER.length].chiave}>
                    {COLORI_CLUSTER.map((c) => (
                      <option key={c.chiave} value={c.chiave}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Spesa tot. ≥ €</label>
                  <input type="number" name={`k${i}_spesaTotaleMin`} min={0} step="1" defaultValue={k.spesaTotaleMin ?? ""} />
                </div>
                <div className="campo">
                  <label>Spesa annua ≥ €</label>
                  <input type="number" name={`k${i}_spesaAnnuaMin`} min={0} step="1" defaultValue={k.spesaAnnuaMin ?? ""} />
                </div>
                <div className="campo">
                  <label>Ordini/anno ≥</label>
                  <input type="number" name={`k${i}_ordiniAnnoMin`} min={0} step="0.5" defaultValue={k.ordiniAnnoMin ?? ""} />
                </div>
                <div className="campo">
                  <label>Ordini ≥</label>
                  <input type="number" name={`k${i}_ordiniMin`} min={0} step="1" defaultValue={k.ordiniMin ?? ""} />
                </div>
                <div className="campo">
                  <label>Punteggio ≥</label>
                  <input type="number" name={`k${i}_punteggioMin`} min={0} max={100} step="1" defaultValue={k.punteggioMin ?? ""} />
                </div>
              </div>
            ))}
            <div className="form-piede" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span className="terziario piccolo">
                Oggi: {imp.cluster.map((k) => `${k.nome} (${descriviCluster(k)})`).join(" · ")}
              </span>
              <button className="btn" type="submit">Salva soglie e cluster</button>
            </div>
          </form>
        </div>

        {password ? (
          <CardPasswordTeam stato={password} esito={sp.password} soloLettura={passwordSoloLettura} adminHub={passwordAdminHub} />
        ) : (
          <div className="card">
            <div className="card-titolo">Password del team</div>
            <div className="card-sub">Tabella non ancora creata: lancia <code className="chip">npm run db:push</code> (schema crm).</div>
          </div>
        )}
      </div>
    </>
  );
}
