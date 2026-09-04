import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { statoOrders } from "@/lib/orders";
import { configurazioneMail, statoMail } from "@/lib/mail";
import { statoCS } from "@/lib/nuovo-ordine";
import { chiaveApp } from "@/lib/chiavi-app";
import { statoPasswordTeam } from "@/lib/password-team";
import { sessioneCorrente } from "@/lib/sessione-server";
import CardPasswordTeam from "@/components/CardPasswordTeam";

export const dynamic = "force-dynamic";

// IMPOSTAZIONI — lo stato dei collegamenti, MISURATO (non dedotto dalla
// presenza delle chiavi): una chiamata vera a ciascuna app dice se il filo
// regge. Le chiavi vivono nella cassaforte del Hub o nelle env di Vercel: qui
// non si mostrano mai i valori.
export default async function Impostazioni({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const [orders, mail, mailConfig, cs, calKey, calUtente, hubToken, openaiKey, db, password, sessione] = await Promise.all([
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
  ]);
  // Dal Hub solo gli admin cambiano la password del team; con la password
  // di squadra chiunque è dentro la può cambiare (conosce quella attuale).
  const passwordSoloLettura = Boolean(sessione && sessione.via === "sso" && sessione.ruolo !== "admin");
  const passwordAdminHub = Boolean(sessione && sessione.via === "sso" && sessione.ruolo === "admin");
  const openaiOk = Boolean(openaiKey);

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
