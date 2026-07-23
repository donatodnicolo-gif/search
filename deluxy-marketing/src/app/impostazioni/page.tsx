import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { attivaAccount, rimuoviAccount, salvaAccount, salvaCartellaDrive } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { driveDir } from "@/lib/drive";
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

export default async function PaginaImpostazioni() {
  const [cartella, documenti, account, ultimaSync] = await Promise.all([
    driveDir(),
    prisma.documentoDrive.count(),
    prisma.accountAdv.findMany({ orderBy: [{ piattaforma: "asc" }, { nome: "asc" }] }),
    prisma.documentoDrive.findFirst({
      orderBy: { sincronizzatoIl: "desc" },
      select: { sincronizzatoIl: true },
    }),
  ]);

  const piattaformeConAccount = PIATTAFORME_ACCOUNT.filter((pf) =>
    account.some((a) => a.piattaforma === pf.chiave)
  );

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

        <section className="scheda">
          <div className="scheda-titolo">Cartella da sincronizzare</div>
          <p className="cella-sub" style={{ marginBottom: 14 }}>
            Percorso della cartella ufficiale sul computer (Google Drive per Desktop). L&apos;app la
            legge soltanto: non scrive mai dentro il Drive.
          </p>
          <form className="modulo" action={salvaCartellaDrive}>
            <div className="campo-modulo largo">
              <label>Percorso della cartella</label>
              <input name="cartella" defaultValue={cartella} spellCheck={false} />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Salva cartella</button>
            </div>
          </form>
          <div className="cella-sub" style={{ marginTop: 10 }}>
            {documenti} documenti indicizzati
            {ultimaSync ? ` · ultima sincronizzazione ${formattaDataOra(ultimaSync.sincronizzatoIl)}` : ""}
            {" · "}
            <a href="/drive" style={{ color: "var(--blue)" }}>vai ai documenti</a>
          </div>
        </section>

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
