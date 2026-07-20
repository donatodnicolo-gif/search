import { notFound } from "next/navigation";
import { GestioneGruppo } from "@/components/GestioneGruppo";
import type { RigaContatto } from "@/components/google-rubrica";
import { MenuInteressi } from "@/components/MenuInteressi";
import { SalvaRubricaAuto } from "@/components/SalvaRubricaAuto";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Sidebar } from "@/components/Sidebar";
import { impostaArchiviato, raggruppaSotto, staccaContatto } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { linkContattoHubspot } from "@/lib/hubspot-link";
import { datiFinanziariCondivisi } from "@/lib/insegna";
import { ETICHETTE_STATO, isStato } from "@/lib/stati";

export const dynamic = "force-dynamic";

function Campo({ etichetta, valore, largo }: { etichetta: string; valore?: string | null; largo?: boolean }) {
  if (!valore) return null;
  return (
    <div className={largo ? "campo campo-largo" : "campo"}>
      <dt>{etichetta}</dt>
      <dd>{valore}</dd>
    </div>
  );
}

export default async function Dettaglio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rubrica?: string }>;
}) {
  const { id } = await params;
  const { rubrica } = await searchParams;
  const p = await prisma.partner.findUnique({
    where: { id },
    include: {
      contatti: true,
      passaggi: { orderBy: { creatoIl: "desc" } },
      capogruppo: { select: { id: true, nome: true, citta: true } },
      sedi: {
        where: { attivo: true },
        select: { id: true, nome: true, citta: true, stato: true, categoria: true, contatti: { select: { id: true } } },
        orderBy: { nome: "asc" },
      },
    },
  });
  if (!p) notFound();

  // Fatturazione a livello di società: i dati finanziari sono condivisi da
  // tutte le sedi della stessa insegna (non del singolo record).
  const fin = await datiFinanziariCondivisi(p);
  const haSedi = p.sedi.length > 0 || Boolean(p.capogruppo);

  // Appena diventata cliente: i referenti vanno in rubrica Google in automatico
  const affiliatoReseller = p.interessi.includes("affiliazione") || p.interessi.includes("vendor");
  const righeRubrica: RigaContatto[] =
    rubrica === "1" && p.stato === "attivo"
      ? p.contatti.map((c) => ({
          id: c.id,
          nome: c.nome,
          ruolo: c.ruolo,
          telefono: c.telefono,
          email: c.email,
          fonte: c.fonte,
          hubspotId: c.hubspotId,
          nomeRubrica: c.nomeRubrica,
          partnerId: p.id,
          partnerNome: p.nome,
          categoria: p.categoria,
          citta: p.citta,
          stato: p.stato,
          statoLabel: isStato(p.stato) ? ETICHETTE_STATO[p.stato] : p.stato,
          provincia: p.provincia,
          indirizzo: p.indirizzo,
          ragioneSociale: p.ragioneSociale,
          affiliatoReseller,
        }))
      : [];

  const extra: Record<string, unknown> = p.datiExtra ? JSON.parse(p.datiExtra) : {};

  const ETICHETTE_FONTE: Record<string, string> = {
    excel: "dal tracker Excel",
    platform: "da app.deluxy.it",
    manuale: "via API",
    ui: "dal registro",
    hubspot: "da HubSpot",
  };
  const nomeStato = (s: string) =>
    s === "archiviata" ? "Archiviata" : isStato(s) ? ETICHETTE_STATO[s] : s;
  const dataOra = (d: Date) =>
    d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={p.categoria} />
      <main className="main">
      <a className="ritorno" href={`/?categoria=${encodeURIComponent(p.categoria)}`}>
        ← Tutte le anagrafiche {p.categoria.toLowerCase()}
      </a>

      <div className="page-head">
        <div>
          <h1 className="page-title">{p.nome}</h1>
          <p className="page-sub">
            {[p.categoria, p.citta, p.regione].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {p.attivo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="etichetta-interessi">Interessi</span>
              <MenuInteressi partnerId={p.id} interessi={p.interessi} />
            </div>
          )}
          {p.attivo ? (
            <SelettoreStato partnerId={p.id} statoAttuale={p.stato} />
          ) : (
            <span className="badge" style={{ color: "var(--text-tertiary)" }}>
              <span className="dot" />
              <span style={{ color: "var(--text)" }}>Archiviata</span>
            </span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <a className="btn btn-secondario" href={`/partner/${p.id}/modifica`} style={{ fontSize: 12.5, padding: "6px 14px" }}>
              ✎ Modifica
            </a>
            {/* Una sede non può avere sedi proprie: il gruppo è a un livello */}
            {p.attivo && !p.capogruppo && p.sedi.length === 0 && (
              <GestioneGruppo partnerId={p.id} nome={p.nome} />
            )}
            <form action={impostaArchiviato.bind(null, p.id, p.attivo)}>
              <button type="submit" className="btn btn-secondario" style={{ fontSize: 12.5, padding: "6px 14px" }}>
                {p.attivo ? "⌫ Archivia" : "↩ Ripristina"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {righeRubrica.length > 0 && <SalvaRubricaAuto contatti={righeRubrica} />}

      {p.capogruppo && (
        <section className="scheda" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Sede del gruppo{" "}
            <a href={`/partner/${p.capogruppo.id}`}>
              <strong>{p.capogruppo.nome}</strong>
            </a>
            {p.capogruppo.citta && <span className="cella-fonte"> · {p.capogruppo.citta}</span>}
          </p>
          <form action={raggruppaSotto.bind(null, p.id, null)}>
            <button type="submit" className="btn btn-secondario" style={{ fontSize: 12.5, padding: "6px 14px" }}>
              Togli dal gruppo
            </button>
          </form>
        </section>
      )}

      <section className="scheda">
        <h2 className="scheda-titolo">Anagrafica</h2>
        <dl className="griglia-campi">
          <Campo etichetta="Ragione sociale" valore={p.ragioneSociale} />
          <Campo etichetta="P. IVA" valore={fin.pIva} />
          <Campo etichetta="Codice fiscale" valore={fin.codiceFiscale} />
          <Campo etichetta="Indirizzo" valore={p.indirizzo} />
          <Campo etichetta="Città" valore={p.citta} />
          <Campo etichetta="Provincia" valore={p.provincia} />
          <Campo etichetta="Regione" valore={p.regione} />
          <Campo etichetta="Email" valore={p.email} />
          <Campo etichetta="Telefono" valore={p.telefono} />
          <Campo etichetta="Account commerciale" valore={p.account} />
          <Campo etichetta="Tipo prospect" valore={p.tipoProspect} />
          <Campo
            etichetta="Ultima visita"
            valore={p.ultimaVisita ? p.ultimaVisita.toLocaleDateString("it-IT") : null}
          />
          <Campo etichetta="Fonte" valore={p.fonte} />
          <Campo
            etichetta="Collegamento piattaforma"
            valore={p.platformId ? `app.deluxy.it · ${p.platformId}` : null}
          />
        </dl>
      </section>

      <section className="scheda">
        <h2 className="scheda-titolo">
          Dati finanziari{" "}
          <span className="scheda-sub">
            fatturazione e pagamenti{haSedi ? " · condivisi con le sedi dell'insegna" : ""}
          </span>
        </h2>
        {[p.ragioneSociale, fin.pIva, fin.codiceFiscale, fin.pec, fin.codiceSdi, fin.iban, fin.banca,
          fin.metodoPagamento, fin.condizioniPagamento, fin.noteAmministrative,
          fin.amministrazioneNome, fin.amministrazioneTelefono, fin.amministrazioneEmail,
        ].every((v) => !v) ? (
          <p className="testo-guida" style={{ margin: 0 }}>
            Nessun dato finanziario ancora inserito — compila con ✎ Modifica.
          </p>
        ) : (
          <dl className="griglia-campi">
            <Campo etichetta="Ragione sociale" valore={p.ragioneSociale} />
            <Campo etichetta="P. IVA" valore={fin.pIva} />
            <Campo etichetta="Codice fiscale" valore={fin.codiceFiscale} />
            <Campo etichetta="PEC" valore={fin.pec} />
            <Campo etichetta="Codice SDI" valore={fin.codiceSdi} />
            <Campo etichetta="IBAN" valore={fin.iban} largo />
            <Campo etichetta="Banca" valore={fin.banca} />
            <Campo etichetta="Metodo di pagamento" valore={fin.metodoPagamento} />
            <Campo etichetta="Condizioni di pagamento" valore={fin.condizioniPagamento} />
            <Campo etichetta="Contatto amministrativo" valore={fin.amministrazioneNome} />
            <Campo etichetta="Telefono amministrazione" valore={fin.amministrazioneTelefono} />
            <Campo etichetta="Email amministrazione" valore={fin.amministrazioneEmail} />
            <Campo etichetta="Note amministrative" valore={fin.noteAmministrative} largo />
          </dl>
        )}
      </section>

      {p.sedi.length > 0 && (
        <section className="scheda">
          <h2 className="scheda-titolo">
            Sedi del gruppo <span className="scheda-sub">{p.sedi.length} anagrafiche collegate</span>
          </h2>
          <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
            <table>
              <thead>
                <tr>
                  <th>Sede</th>
                  <th>Città</th>
                  <th>Stato</th>
                  <th>Referenti</th>
                  <th aria-label="Azioni"></th>
                </tr>
              </thead>
              <tbody>
                {p.sedi.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <a href={`/partner/${s.id}`}>
                        <div className="cella-nome">{s.nome}</div>
                        <div className="cella-sub">{s.categoria}</div>
                      </a>
                    </td>
                    <td className="cella-muta">{s.citta ?? "—"}</td>
                    <td className="cella-muta">{nomeStato(s.stato)}</td>
                    <td className="cella-muta">{s.contatti.length}</td>
                    <td>
                      <form action={raggruppaSotto.bind(null, s.id, null)}>
                        <button type="submit" className="btn-archivia" title="Togli questa sede dal gruppo">
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {p.contatti.length > 0 && (
        <section className="scheda">
          <h2 className="scheda-titolo">
            Contatti <span className="scheda-sub">{p.contatti.length} persone di riferimento</span>
          </h2>
          <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
            <table>
              <thead>
                <tr>
                  <th>Ruolo</th>
                  <th>Nome</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th>Fonte</th>
                  <th aria-label="Rimuovi"></th>
                </tr>
              </thead>
              <tbody>
                {p.contatti.map((c) => (
                  <tr key={c.id}>
                    <td className="cella-muta">{c.ruolo ?? "—"}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                        <a href={`/contatti/${c.id}`} title="Apri e modifica il contatto">
                          {c.nome ?? "—"}
                        </a>
                        {c.hubspotId && (
                          <a href={linkContattoHubspot(c.hubspotId)} target="_blank" rel="noreferrer" title="Apri il contatto in HubSpot">
                            ↗
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="cella-muta">
                      {c.telefono ? (
                        <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} title="Chiama">{c.telefono}</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="cella-muta">{c.email ?? "—"}</td>
                    <td className="cella-muta">{c.fonte === "hubspot" ? "HubSpot" : c.fonte ? c.fonte : "Excel"}</td>
                    <td>
                      <form action={staccaContatto.bind(null, c.id)}>
                        <button
                          type="submit"
                          className="btn-archivia"
                          title={`Rimuovi «${c.nome ?? "questo referente"}» da ${p.nome}`}
                        >
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(p.note || p.contattiRaw) && (
        <section className="scheda">
          <h2 className="scheda-titolo">Note</h2>
          <dl className="griglia-campi">
            <Campo etichetta="Note" valore={p.note} largo />
            <Campo etichetta="Contatti (testo originale)" valore={p.contattiRaw} largo />
          </dl>
        </section>
      )}

      {Object.keys(extra).length > 0 && (
        <section className="scheda">
          <h2 className="scheda-titolo">Dati del tracker</h2>
          <dl className="griglia-campi">
            {Object.entries(extra).map(([k, v]) => (
              <Campo key={k} etichetta={k} valore={String(v)} />
            ))}
          </dl>
        </section>
      )}

      <section className="scheda">
        <h2 className="scheda-titolo">Storia</h2>
        <ol className="storia">
          {p.passaggi.map((ev) => (
            <li key={ev.id}>
              <span className="storia-data">{dataOra(ev.creatoIl)}</span>
              <span>
                {nomeStato(ev.da)} <span className="storia-freccia">→</span> <strong>{nomeStato(ev.a)}</strong>
              </span>
              <span className="storia-origine">{ev.origine === "ui" ? "dal registro" : ev.origine}</span>
            </li>
          ))}
          <li>
            <span className="storia-data">{dataOra(p.creatoIl)}</span>
            <span><strong>Creata</strong></span>
            <span className="storia-origine">{ETICHETTE_FONTE[p.fonte] ?? p.fonte}</span>
          </li>
        </ol>
      </section>
      </main>
    </div>
  );
}
