import { SelezionaTutte } from "@/components/SelezionaTutte";
import { Sidebar } from "@/components/Sidebar";
import { registraLandingDalCensimento } from "@/lib/azioni";
import { urlInUso } from "@/lib/censimento-landing";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, formattaEuro } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Il censimento delle landing a partire da DOVE MANDANO GLI ANNUNCI.
//
// `/landing` si riempiva solo a mano: 27 righe contro 329 URL su cui gli
// annunci mandavano traffico davvero. Qui si vede l'elenco di quelle che
// mancano, con chi ci manda e se sta girando adesso, e si registrano in blocco.
//
// ⚠️ Non è un import automatico, ed è una scelta: fra quelle 329 ci sono
// collezioni Shopify normali. Registrarle tutte riempirebbe `/landing` di
// rumore e la renderebbe inutile quanto lo era vuota — al contrario. Qui si
// guarda l'elenco ordinato per importanza e si sceglie.
export default async function CensimentoLanding({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; solo?: string; esito?: string }>;
}) {
  const p = await searchParams;
  const tutte = await urlInUso();

  const mancanti = tutte.filter((u) => !u.giaRegistrata);
  const filtrate = mancanti
    .filter((u) => (p.brand ? u.brand === p.brand : true))
    .filter((u) => (p.solo === "vive" ? u.campagneVive > 0 : true));

  const conVive = mancanti.filter((u) => u.campagneVive > 0).length;
  const gia = tutte.length - mancanti.length;

  return (
    <div className="layout">
      <Sidebar attiva="landing" brandAttivo={p.brand} />
      <main className="main" style={{ maxWidth: 1500 }}>
        <a className="ritorno" href="/landing">← Landing page</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Censimento dalle destinazioni</h1>
            <p className="page-sub">
              Le pagine su cui gli annunci mandano davvero, lette da Google, che non sono ancora
              nel registro delle landing. Per ognuna: chi ci manda, se quella campagna sta
              girando <b>adesso</b>, e quanto hanno speso gli annunci che ci puntano.
            </p>
          </div>
        </div>

        {p.esito && (
          <div className="conferma">
            {p.esito === "nessuna"
              ? "Non avevi spuntato niente: non ho registrato nulla."
              : `${p.esito} landing registrate. Le trovi in /landing, in stato «da verificare».`}
          </div>
        )}

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            <b>{tutte.length} URL in uso</b> · <b>{gia}</b> già registrate ·{" "}
            <b>{mancanti.length} da censire</b>, di cui <b>{conVive}</b> con almeno una campagna
            che eroga adesso. ⚠️ Lo <b>stato della campagna è quello di Google</b>, non il
            giudizio dell&apos;app: una campagna può risultare «in pausa» qui e stare ancora
            spendendo là. E la spesa è quella degli <b>annunci</b> che mandano a quella pagina
            negli ultimi 30 giorni — non comprende i sitelink, che portano una finestra loro di
            365 giorni: sommarle darebbe un numero senza significato.
          </span>
        </div>

        <div className="pill-scelta" style={{ marginBottom: 12 }}>
          <span className="cella-sub" style={{ marginRight: 4 }}>Marchio</span>
          <a className={`pill-opt${!p.brand ? " attuale" : ""}`} href={`/landing/censimento${p.solo ? `?solo=${p.solo}` : ""}`}>Tutti</a>
          {BRANDS.map((b) => (
            <a
              key={b}
              className={`pill-opt${p.brand === b ? " attuale" : ""}`}
              href={`/landing/censimento?brand=${b}${p.solo ? `&solo=${p.solo}` : ""}`}
            >
              {ETICHETTA_BRAND[b]}
            </a>
          ))}
          <span className="cella-sub" style={{ margin: "0 4px 0 12px" }}>Mostra</span>
          <a className={`pill-opt${p.solo !== "vive" ? " attuale" : ""}`} href={`/landing/censimento${p.brand ? `?brand=${p.brand}` : ""}`}>Tutte</a>
          <a className={`pill-opt${p.solo === "vive" ? " attuale" : ""}`} href={`/landing/censimento?solo=vive${p.brand ? `&brand=${p.brand}` : ""}`}>Solo con campagne vive</a>
        </div>

        {filtrate.length === 0 ? (
          <div className="vuoto">Nessuna URL da censire con questi filtri.</div>
        ) : (
          <form action={registraLandingDalCensimento} id="censimento">
            <div className="barra-multipla">
              {/* Il componente cerca `input[form="…"][name="scelte"]`: le
                  caselle portano l'attributo `form` anche stando dentro, o il
                  selettore non le trova. */}
              <SelezionaTutte formId="censimento" />
              <button className="btn small" type="submit">Registra le spuntate</button>
              <span className="cella-sub">
                Nascono in stato «da verificare»: che ci arrivi un annuncio dice che la pagina è
                in uso, non che sia quella giusta.
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Pagina</th>
                    <th>Marchio</th>
                    <th className="num">Annunci</th>
                    <th className="num">Sitelink</th>
                    <th className="num">Spesa annunci 30g</th>
                    <th>Campagne che ci mandano</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrate.map((u) => (
                    <tr key={u.url}>
                      <td>
                        <input type="checkbox" form="censimento" name="scelte" value={u.url} />
                        <input type="hidden" name={`brand:${u.url}`} value={u.brand} />
                        {u.lingua && <input type="hidden" name={`lingua:${u.url}`} value={u.lingua} />}
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <a
                          className="cella-nome"
                          href={u.urlIntera.startsWith("http") ? u.urlIntera : `https://${u.url}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {u.url}
                        </a>
                        {u.lingua && <div className="cella-sub">lingua {u.lingua}</div>}
                      </td>
                      <td>
                        <span className="tag-salute" style={{ color: COLORE_BRAND[u.brand] }}>
                          <span className="dot" />
                          {ETICHETTA_BRAND[u.brand] ?? u.brand}
                        </span>
                        {/* Un brand indovinato dal dominio non si presenta come
                            un fatto: chi lo legge deve poter distinguere. */}
                        {u.brandDedotto && <div className="cella-sub">dedotto dal dominio</div>}
                      </td>
                      <td className="num">{u.annunci || "—"}</td>
                      <td className="num">{u.sitelink || "—"}</td>
                      <td className="num">
                        {u.spesaAnnunci != null ? formattaEuro(u.spesaAnnunci) : "—"}
                      </td>
                      <td style={{ maxWidth: 420 }}>
                        {u.campagne.length === 0 ? (
                          <span className="cella-sub">nessuna campagna la nomina più</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {u.campagne.map((c) => (
                              <span
                                key={c.nome}
                                className="tag-salute"
                                style={{ color: c.viva ? "var(--green)" : "var(--text-tertiary)" }}
                                title={
                                  c.livelloAccount
                                    ? "Sitelink agganciato all'ACCOUNT, non a una campagna: vale per tutte le campagne di quell'account"
                                    : c.statoPiattaforma
                                      ? `Su Google: ${c.statoPiattaforma} · nell'app: ${c.stato}`
                                      : `Google non l'ha ancora detta · nell'app: ${c.stato}`
                                }
                              >
                                <span className="dot" />
                                {c.id ? (
                                  <a href={`/campagne/${c.id}`} style={{ color: "inherit" }}>{c.nome}</a>
                                ) : (
                                  c.nome
                                )}
                                {!c.viva && !c.livelloAccount && " · ferma"}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
