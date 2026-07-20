import Link from "next/link";
import { prisma } from "@/lib/db";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { nomeMese, ivato } from "@/lib/calc";
import { segnaFatturaPagata } from "@/lib/actions";
import { ThSort, ordina } from "@/components/ThSort";

export const dynamic = "force-dynamic";

// Scadenzario: tutto ciò che è in sospeso. Ricerca per partner/numero e
// colonne ordinabili; l'ordine di default di ogni tabella è il nome partner.
export default async function Scadenzario({
  searchParams,
}: {
  searchParams: Promise<{
    sollecito?: string;
    q?: string;
    sort?: string; dir?: string; // fatture da incassare
    sortB?: string; dirB?: string; // bonifici
    sortC?: string; dirC?: string; // commissioni
  }>;
}) {
  const sp = await searchParams;
  const anno = ANNO_CORRENTE;
  const oggi = new Date();
  const q = (sp.q ?? "").trim().toLowerCase();
  const cerca = (...campi: (string | null | undefined)[]) =>
    !q || campi.some((c) => (c ?? "").toLowerCase().includes(q));

  // Letture indipendenti in parallelo (una sola andata e ritorno verso il DB)
  const [aperteRaw, tutti] = await Promise.all([
    prisma.fatturaServizio.findMany({
      where: { anno, pagata: false, imponibile: { gt: 0 } },
      include: { partner: true, tipologia: true },
      orderBy: [{ scadenza: "asc" }],
    }),
    riepilogoTutti(anno),
  ]);
  const aperte = aperteRaw.filter((f) =>
    cerca(f.partner.nome, f.partner.ragioneSociale, f.numero, f.tipologia.nome, f.descrizione)
  );
  const scadute = aperte.filter((f) => f.scadenza && f.scadenza < oggi);

  type F = (typeof aperte)[number];
  const campiF: Record<string, (f: F) => string | number | Date | null> = {
    partner: (f) => f.partner.nome,
    mese: (f) => f.mese,
    numero: (f) => f.numero,
    tipologia: (f) => f.tipologia.nome,
    scadenza: (f) => f.scadenza,
    importo: (f) => ivato(f),
  };
  // default: nome partner (A→Z); scegliendo una colonna vale quella
  const fatture = ordina(aperte, campiF[sp.sort ?? ""] ?? campiF.partner, sp.sort ? sp.dir : "asc");

  const bonificiTutti = tutti
    .flatMap((t) =>
      t.mesi
        .filter((m) => m.riepilogo.daBonificare >= 0.01)
        .map((m) => ({ partner: t.partner, mese: m.mese, r: m.riepilogo }))
    )
    .filter((x) => cerca(x.partner.nome, x.partner.ragioneSociale, x.partner.iban));

  type B = (typeof bonificiTutti)[number];
  const campiB: Record<string, (b: B) => string | number | null> = {
    partner: (b) => b.partner.nome,
    mese: (b) => b.mese,
    residuo: (b) => b.r.daBonificare,
    iban: (b) => b.partner.iban,
  };
  const bonificiPendenti = ordina(
    bonificiTutti,
    campiB[sp.sortB ?? ""] ?? campiB.partner,
    sp.sortB ? sp.dirB : "asc"
  );

  const commTutte = tutti
    .flatMap((t) =>
      t.mesi
        .filter((m) => m.riepilogo.vendite > 0 && !m.saldo?.commFattEmessa)
        .map((m) => ({ partner: t.partner, mese: m.mese, r: m.riepilogo }))
    )
    .filter((x) => cerca(x.partner.nome, x.partner.ragioneSociale));

  type C = (typeof commTutte)[number];
  const campiC: Record<string, (c: C) => string | number | null> = {
    partner: (c) => c.partner.nome,
    mese: (c) => c.mese,
    vendite: (c) => c.r.vendite,
    commissioni: (c) => c.r.commissioni,
  };
  const commDaEmettere = ordina(
    commTutte,
    campiC[sp.sortC ?? ""] ?? campiC.partner,
    sp.sortC ? sp.dirC : "asc"
  );

  const trovati = fatture.length + bonificiPendenti.length + commDaEmettere.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Scadenzario</h1>
          <p className="page-caption">
            Fatture da incassare, bonifici da inviare e fatture commissioni da emettere.
          </p>
          {sp.sollecito === "ok" && (
            <span className="badge green" style={{ marginTop: 8 }}>
              <span className="dot" />Sollecito registrato
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Cerca partner, n° fattura, tipologia…"
            style={{ minWidth: 280, flex: "1 1 280px" }}
            aria-label="Cerca nello scadenzario"
          />
          <button className="btn secondary small" type="submit">Cerca</button>
          {q && (
            <>
              <Link className="btn secondary small" href="/scadenzario">Azzera</Link>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {trovati} risultati per &laquo;{sp.q}&raquo;
              </span>
            </>
          )}
        </form>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Fatture scadute</div>
          <div className={`kpi-value ${scadute.length ? "neg" : "pos"}`}>{scadute.length}</div>
          <div className="kpi-sub">{euro(scadute.reduce((a, f) => a + ivato(f), 0))} IVA inclusa</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bonifici partner pendenti</div>
          <div className={`kpi-value ${bonificiPendenti.length ? "neg" : "pos"}`}>{bonificiPendenti.length}</div>
          <div className="kpi-sub">{euro(bonificiPendenti.reduce((a, x) => a + x.r.daBonificare, 0))}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Fatture commissioni da emettere</div>
          <div className={`kpi-value ${commDaEmettere.length ? "neg" : "pos"}`}>{commDaEmettere.length}</div>
          <div className="kpi-sub">{euro(commDaEmettere.reduce((a, x) => a + x.r.commissioni, 0))} di commissioni</div>
        </div>
      </div>

      <h2 className="section-title">Fatture servizi da incassare</h2>
      <div className="card tight">
        {fatture.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">{q ? "Nessun risultato" : "Tutto incassato"}</div>
            <div className="empty-text">
              {q ? "Nessuna fattura aperta corrisponde alla ricerca." : "Non ci sono fatture servizi aperte."}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="Partner" campo="partner" sp={sp} path="/scadenzario" defaultAttivo />
                  <ThSort label="Mese" campo="mese" sp={sp} path="/scadenzario" />
                  <ThSort label="N°" campo="numero" sp={sp} path="/scadenzario" />
                  <ThSort label="Tipologia" campo="tipologia" sp={sp} path="/scadenzario" />
                  <ThSort label="Scadenza" campo="scadenza" sp={sp} path="/scadenzario" />
                  <ThSort label="IVA incl." campo="importo" sp={sp} path="/scadenzario" num />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fatture.map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/partner/${f.partnerId}`} style={{ fontWeight: 500 }}>{f.partner.nome}</Link></td>
                    <td>{nomeMese(f.mese)}</td>
                    <td>
                      <Link href={`/fatture/${f.id}`} style={{ color: "var(--blue)" }} title="Apri il record della fattura">
                        {f.numero ?? "s.n."}
                      </Link>
                    </td>
                    <td>{f.tipologia.nome}</td>
                    <td>
                      {f.scadenza && f.scadenza < oggi ? (
                        <span className="badge red"><span className="dot" />{dataIt(f.scadenza)}</span>
                      ) : (
                        <span className="badge blue"><span className="dot" />{dataIt(f.scadenza)}</span>
                      )}
                    </td>
                    <td className="num">{euro(ivato(f))}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <form action={segnaFatturaPagata.bind(null, f.id, true, undefined)} style={{ display: "inline" }}>
                          <button className="btn small secondary" type="submit">Segna saldata</button>
                        </form>
                        <Link
                          className="btn small primary"
                          href={`/solleciti/${f.id}`}
                          title="Prepara e invia una mail di sollecito al partner"
                        >
                          Invia sollecito
                        </Link>
                        {f.sollecitoInviatoIl && (
                          <span className="badge blue" title="Data ultimo sollecito inviato">
                            <span className="dot" />Sollecitata {dataIt(f.sollecitoInviatoIl)}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Bonifici da inviare ai partner</h2>
      <div className="card tight">
        {bonificiPendenti.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">{q ? "Nessun risultato" : "Nessun bonifico pendente"}</div>
            <div className="empty-text">
              {q ? "Nessun bonifico pendente corrisponde alla ricerca." : "Tutti i dovuti ai partner risultano saldati."}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="Partner" campo="partner" sp={sp} path="/scadenzario" chiave="B" defaultAttivo />
                  <ThSort label="Mese" campo="mese" sp={sp} path="/scadenzario" chiave="B" />
                  <ThSort label="Residuo da bonificare" campo="residuo" sp={sp} path="/scadenzario" chiave="B" num />
                  <ThSort label="IBAN" campo="iban" sp={sp} path="/scadenzario" chiave="B" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bonificiPendenti.map((x) => (
                  <tr key={x.partner.id + x.mese}>
                    <td><Link href={`/partner/${x.partner.id}`} style={{ fontWeight: 500 }}>{x.partner.nome}</Link></td>
                    <td>{nomeMese(x.mese)}</td>
                    <td className="num neg">{euro(x.r.daBonificare)}</td>
                    <td className="muted">{x.partner.iban ?? "IBAN mancante"}</td>
                    <td>
                      <Link className="btn small secondary" href={`/partner/${x.partner.id}`}>
                        Registra bonifico
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Fatture commissioni da emettere</h2>
      <div className="card tight">
        {commDaEmettere.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">{q ? "Nessun risultato" : "Nessuna fattura commissioni in sospeso"}</div>
            <div className="empty-text">
              {q
                ? "Nessuna commissione da emettere corrisponde alla ricerca."
                : "Tutte le vendite del periodo hanno la fattura commissioni emessa."}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="Partner" campo="partner" sp={sp} path="/scadenzario" chiave="C" defaultAttivo />
                  <ThSort label="Mese" campo="mese" sp={sp} path="/scadenzario" chiave="C" />
                  <ThSort label="Vendite" campo="vendite" sp={sp} path="/scadenzario" chiave="C" num />
                  <ThSort label="Commissioni da fatturare" campo="commissioni" sp={sp} path="/scadenzario" chiave="C" num />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {commDaEmettere.map((x) => (
                  <tr key={x.partner.id + x.mese}>
                    <td><Link href={`/partner/${x.partner.id}`} style={{ fontWeight: 500 }}>{x.partner.nome}</Link></td>
                    <td>{nomeMese(x.mese)}</td>
                    <td className="num">{euro(x.r.vendite)}</td>
                    <td className="num">{euro(x.r.commissioni)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <Link
                          className="btn small primary"
                          href={`/fic/emetti?partnerId=${x.partner.id}&anno=${anno}&mese=${x.mese}`}
                          title="Crea la fattura commissioni su Fatture in Cloud (non inviata)"
                        >
                          Emetti su FIC
                        </Link>
                        <Link className="btn small secondary" href={`/saldi?anno=${anno}&mese=${x.mese}&q=${encodeURIComponent(x.partner.nome.slice(0, 12))}`}>
                          Gestisci
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
