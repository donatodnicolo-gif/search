import Link from "next/link";
import { prisma } from "@/lib/db";
import { ficStato } from "@/lib/fic";
import { scritturaAnagraficheAttiva } from "@/lib/anagrafiche";
import { costruisciRiconciliazione, campiProposti, type EsitoRiga } from "@/lib/riconciliazione-fic";
import { creaInAnagrafiche, aggiornaDatiEsterniRiconciliazione, riconciliaManuale, allineaAnagraficheTutti } from "@/lib/riconciliazione-actions";
import { DatiBancariRiga } from "@/components/DatiBancariRiga";
import { AzioniRiconciliazione } from "@/components/AzioniRiconciliazione";

export const dynamic = "force-dynamic";
// La prima costruzione (cache fredda) interroga FIC e Qonto: diamo margine ampio.
export const maxDuration = 60;

function RigaConciliata({ r, scrittura }: { r: EsitoRiga; scrittura: boolean }) {
  const campi = campiProposti(r.dati);
  const nCampi = Object.keys(campi).length;
  const anagraficaId = r.partner!.anagraficaId!;
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 500 }}>{r.ficNome}</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          ↔ <Link href={`/partner/${r.partner!.id}`} style={{ color: "var(--blue)" }}>{r.partner!.nome}</Link>
        </div>
      </td>
      <td style={{ fontSize: 12.5 }}>
        {r.dati.piva ? <div>P.IVA <strong>{r.dati.piva}</strong></div> : null}
        {r.dati.codiceFiscale && r.dati.codiceFiscale !== r.dati.piva ? <div>CF {r.dati.codiceFiscale}</div> : null}
        {r.dati.codiceSdi ? <div>SDI <strong>{r.dati.codiceSdi}</strong></div> : null}
        {r.dati.pec ? <div>PEC {r.dati.pec}</div> : null}
        {(r.dati.indirizzo || r.dati.citta) ? (
          <div style={{ color: "var(--text-secondary)" }}>
            {[r.dati.indirizzo, [r.dati.cap, r.dati.citta].filter(Boolean).join(" "), r.dati.provincia].filter(Boolean).join(", ")}
          </div>
        ) : null}
        {!nCampi && <span className="muted">nessun dato fiscale da FIC</span>}
      </td>
      <td style={{ fontSize: 12.5, minWidth: 220 }}>
        {/* IBAN e INTESTATARIO dai beneficiari dei bonifici Qonto, precompilati
            quando il nome del beneficiario corrisponde al partner. Il nome del
            beneficiario in banca È l'intestatario del conto: la banca rifiuta
            il bonifico se non combacia con l'IBAN, quindi va nel registro
            insieme all'IBAN e non dedotto dall'insegna. Modificabili prima di
            salvare. */}
        {/* Salvataggio in-place: questa pagina interroga FIC e Qonto, e
            ricaricarla a ogni riga salvata costava secondi per un dato che
            riguarda una riga sola. L'esito compare qui sotto. */}
        <DatiBancariRiga
          partnerId={r.partner!.id}
          anagraficaId={anagraficaId}
          ibanIniziale={r.partner!.iban ?? ""}
          ibanSuggerito={r.ibanSuggerito}
          intestatarioIniziale={r.partner!.intestatarioConto ?? ""}
          intestatarioSuggerito={r.intestatarioSuggerito}
          scrittura={scrittura}
        />
      </td>
      {/* Stato + azioni: confermare parla col registro e prende il suo tempo.
          Sta in un client component perché l'esito si veda mentre succede,
          senza ricostruire una pagina che interroga FIC e Qonto. */}
      <AzioniRiconciliazione
        ficNome={r.ficNome}
        partnerId={r.partner!.id}
        anagraficaId={anagraficaId}
        campiJson={JSON.stringify(campi)}
        statoIniziale={r.stato}
        esitoUltimoInvio={r.esitoUltimoInvio}
        scrittura={scrittura}
        nCampi={nCampi}
      />
    </tr>
  );
}

export default async function RiconciliazionePage({
  searchParams,
}: {
  searchParams: Promise<{ banca?: string; creato?: string; errore?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const stato = await ficStato();
  if (!stato.collegato) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">Riconciliazione clienti</h1>
            <p className="page-caption">Abbina i clienti di Fatture in Cloud ai partner e aggiorna il registro Anagrafiche.</p>
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <span className="badge orange"><span className="dot" />Fatture in Cloud non collegato</span>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 10 }}>
            Collega l&apos;account in <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Fatture in Cloud</Link>.
          </p>
        </div>
      </>
    );
  }

  const [ric, scrittura, partners] = await Promise.all([
    costruisciRiconciliazione(),
    Promise.resolve(scritturaAnagraficheAttiva()),
    prisma.partner.findMany({ where: { attivo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
  ]);
  // filtro di ricerca su nome cliente FIC, partner, P.IVA, città
  const matchQ = (r: EsitoRiga) =>
    !q ||
    r.ficNome.toLowerCase().includes(q) ||
    (r.partner?.nome.toLowerCase().includes(q) ?? false) ||
    (r.dati.piva?.toLowerCase().includes(q) ?? false) ||
    (r.dati.citta?.toLowerCase().includes(q) ?? false);
  const conciliati = ric.conciliati.filter(matchQ);
  const daCollegare = ric.daCollegare.filter(matchQ);
  const senzaMatch = ric.senzaMatch.filter(matchQ);
  const daConfermare = conciliati.filter((r) => r.stato === null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Riconciliazione clienti</h1>
          <p className="page-caption">
            Abbina i clienti di <strong>Fatture in Cloud</strong> ai partner Deluxy e porta i loro dati fiscali
            (P.IVA, CF, indirizzo) nel registro <strong>Anagrafiche</strong>, su tua conferma.
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 8 }}>
          <form action={allineaAnagraficheTutti}>
            <button className="btn secondary" type="submit" title="Ricopia in locale i dati del registro (ragione sociale, IBAN, email amministrazione) per tutti i partner collegati: e quello che l app usa per i bonifici e i solleciti.">
              Allinea dal registro
            </button>
          </form>
          <form action={aggiornaDatiEsterniRiconciliazione}>
            <button className="btn secondary" type="submit" title="Ricarica clienti FIC e beneficiari Qonto (dati in cache 10 min)">
              Aggiorna dati
            </button>
          </form>
        </div>
      </div>

      <form method="get" className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Cerca per cliente FIC, partner, P.IVA o città…"
          style={{ flex: 1 }}
        />
        <button className="btn secondary" type="submit">Cerca</button>
        {q && <Link href="/registrazioni/riconciliazione" className="btn secondary">Azzera</Link>}
      </form>

      {/* elenco partner per l'abbinamento manuale dei clienti solo-FIC */}
      <datalist id="partners-datalist">
        {partners.map((p) => <option key={p.nome} value={p.nome} />)}
      </datalist>

      {sp.banca && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          {/* salvato in locale ma non nel registro non è un successo pieno:
              deve vedersi, altrimenti si crede che il registro sia allineato */}
          <span className={`badge ${/MA il registro/.test(decodeURIComponent(sp.banca)) ? "orange" : "green"}`}>
            <span className="dot" />Dati bancari salvati — {decodeURIComponent(sp.banca)}
          </span>
        </div>
      )}
      {sp.creato && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />&laquo;{decodeURIComponent(sp.creato)}&raquo; creato nel registro Anagrafiche e collegato</span>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}

      {!scrittura && (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: "rgba(201,52,0,0.07)" }}>
          <span className="badge orange"><span className="dot" />Scrittura sul registro disattivata</span>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
            Puoi vedere la riconciliazione, ma per <strong>inviare</strong> i dati al registro serve la chiave di
            scrittura del sistema &laquo;deluxy-partner&raquo; nella variabile <code>ANAGRAFICHE_WRITE_KEY</code> su
            Vercel. Il registro applica un <em>merge per campo</em>: i dati curati dal team restano protetti, i campi
            fattuali (P.IVA, CF, indirizzo) si aggiornano solo se più freschi.
          </p>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Da confermare</div>
          <div className={`kpi-value ${daConfermare.length ? "neg" : "pos"}`}>{daConfermare.length}</div>
          <div className="kpi-sub">conciliati con un partner collegato al registro</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Partner non collegati</div>
          <div className="kpi-value">{daCollegare.length}</div>
          <div className="kpi-sub">abbinati a un partner senza anagraficaId</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Clienti senza conciliazione</div>
          <div className="kpi-value">{senzaMatch.length}</div>
          <div className="kpi-sub">clienti FIC non riconducibili a un partner</div>
        </div>
      </div>

      {/* ————— Conciliati (aggiornabili) ————— */}
      <h2 className="section-title">Conciliati — clienti FIC ↔ partner (registro)</h2>
      <div className="card tight">
        {conciliati.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna conciliazione</div>
            <div className="empty-text">Nessun cliente FIC risulta abbinato a un partner collegato al registro.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente FIC ↔ Partner</th>
                  <th>Dati fiscali da FIC</th>
                  <th>Dati bancari (IBAN)</th>
                  <th>Stato</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {conciliati.map((r) => <RigaConciliata key={r.ficNome} r={r} scrittura={scrittura} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ————— Abbinati ma partner non collegato al registro ————— */}
      {daCollegare.length > 0 && (
        <>
          <h2 className="section-title">Partner non nel registro — creabili</h2>
          <div className="card" style={{ padding: 14, marginBottom: 8 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Questi clienti FIC sono abbinati a un partner Deluxy che <strong>non è ancora nel registro</strong>
              Anagrafiche. Con &laquo;Crea in Anagrafiche&raquo; lo crei (o lo agganci se già presente per
              nome+città) con i dati di FIC, e resta collegato al partner.
            </p>
          </div>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cliente FIC</th><th>Partner Deluxy</th><th>P.IVA da FIC</th><th></th></tr></thead>
                <tbody>
                  {daCollegare.map((r) => (
                    <tr key={r.ficNome}>
                      <td>{r.ficNome}</td>
                      <td><Link href={`/partner/${r.partner!.id}`} style={{ color: "var(--blue)" }}>{r.partner!.nome}</Link></td>
                      <td>{r.dati.piva ?? "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <form action={creaInAnagrafiche.bind(null, r.partner!.id, JSON.stringify(campiProposti(r.dati)))} style={{ display: "inline" }}>
                          <button
                            className="btn small primary"
                            type="submit"
                            disabled={!scrittura}
                            title={scrittura ? "Crea questo partner nel registro Anagrafiche" : "Serve la chiave di scrittura"}
                          >
                            Crea in Anagrafiche
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ————— Senza conciliazione ————— */}
      <h2 className="section-title">Clienti FIC senza conciliazione ({senzaMatch.length})</h2>
      <div className="card" style={{ padding: 14, marginBottom: 8 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Clienti di Fatture in Cloud che <strong>non corrispondono automaticamente a nessun partner</strong> Deluxy.
          Se in realtà uno di questi <strong>è</strong> un partner del FINANCE (nome scritto diverso su FIC), abbinalo
          a mano nella colonna &laquo;Abbina a un partner&raquo;: i suoi dati fiscali finiscono nel registro e la riga
          passa ai conciliati.
        </p>
      </div>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente FIC</th><th>P.IVA</th><th>Sede</th><th>Abbina a un partner FINANCE</th></tr></thead>
            <tbody>
              {senzaMatch.map((r) => (
                <tr key={r.ficNome}>
                  <td style={{ fontWeight: 500 }}>{r.ficNome}</td>
                  <td>{r.dati.piva ?? "—"}</td>
                  <td className="muted">{[r.dati.citta, r.dati.provincia].filter(Boolean).join(" ") || "—"}</td>
                  <td style={{ minWidth: 240 }}>
                    <form action={riconciliaManuale.bind(null, r.ficNome)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="text"
                        name="partner"
                        list="partners-datalist"
                        placeholder="Scrivi il nome del partner…"
                        style={{ fontSize: 12.5, padding: "5px 8px", flex: 1 }}
                      />
                      <button
                        className="btn small primary"
                        type="submit"
                        disabled={!scrittura}
                        title={scrittura ? "Abbina al partner e porta i dati fiscali nel registro" : "Serve la chiave di scrittura"}
                      >
                        Riconcilia
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
