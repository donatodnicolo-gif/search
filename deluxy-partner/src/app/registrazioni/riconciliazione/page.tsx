import Link from "next/link";
import { ficStato } from "@/lib/fic";
import { scritturaAnagraficheAttiva } from "@/lib/anagrafiche";
import { costruisciRiconciliazione, campiProposti, type EsitoRiga } from "@/lib/riconciliazione-fic";
import { confermaRiconciliazione, ignoraRiconciliazione, riapriRiconciliazione } from "@/lib/riconciliazione-actions";

export const dynamic = "force-dynamic";

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
      <td>
        {r.stato === "confermata" ? (
          <span className="badge green"><span className="dot" />Inviato al registro</span>
        ) : r.esitoUltimoInvio && r.esitoUltimoInvio !== "ok" ? (
          <span className="badge red" title={r.esitoUltimoInvio}><span className="dot" />Invio fallito</span>
        ) : r.stato === "ignorata" ? (
          <span className="badge neutral"><span className="dot" />Ignorato</span>
        ) : (
          <span className="badge blue"><span className="dot" />Da confermare</span>
        )}
      </td>
      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
        {r.stato === "confermata" || r.stato === "ignorata" ? (
          <form action={riapriRiconciliazione.bind(null, r.ficNome)} style={{ display: "inline" }}>
            <button className="btn small secondary" type="submit">Riapri</button>
          </form>
        ) : (
          <span style={{ display: "inline-flex", gap: 6 }}>
            <form
              action={confermaRiconciliazione.bind(null, r.ficNome, r.partner!.id, anagraficaId, JSON.stringify(campi))}
              style={{ display: "inline" }}
            >
              <button
                className="btn small primary"
                type="submit"
                disabled={!scrittura || nCampi === 0}
                title={
                  !scrittura
                    ? "Configura la chiave di scrittura per aggiornare il registro"
                    : nCampi === 0
                      ? "Nessun dato fiscale da inviare"
                      : `Invia al registro: ${Object.keys(campi).join(", ")}`
                }
              >
                Conferma e aggiorna
              </button>
            </form>
            <form action={ignoraRiconciliazione.bind(null, r.ficNome, r.partner!.id)} style={{ display: "inline" }}>
              <button className="btn small secondary" type="submit">Ignora</button>
            </form>
          </span>
        )}
      </td>
    </tr>
  );
}

export default async function RiconciliazionePage() {
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

  const [{ conciliati, daCollegare, senzaMatch }, scrittura] = await Promise.all([
    costruisciRiconciliazione(),
    Promise.resolve(scritturaAnagraficheAttiva()),
  ]);
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
      </div>

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
          <h2 className="section-title">Partner non collegati al registro</h2>
          <div className="card" style={{ padding: 14, marginBottom: 8 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Questi clienti FIC sono abbinati a un partner Deluxy, ma il partner non ha ancora un
              <code> anagraficaId</code> (collegamento al registro): prima va collegato, poi si potrà aggiornare.
            </p>
          </div>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cliente FIC</th><th>Partner Deluxy</th><th>P.IVA da FIC</th></tr></thead>
                <tbody>
                  {daCollegare.map((r) => (
                    <tr key={r.ficNome}>
                      <td>{r.ficNome}</td>
                      <td><Link href={`/partner/${r.partner!.id}`} style={{ color: "var(--blue)" }}>{r.partner!.nome}</Link></td>
                      <td>{r.dati.piva ?? "—"}</td>
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
          Clienti di Fatture in Cloud che <strong>non corrispondono a nessun partner</strong> Deluxy: in genere
          maison e aziende a cui fatturi i servizi, non partner del registro. Verifica se qualcuno andrebbe invece
          creato come partner.
        </p>
      </div>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente FIC</th><th>P.IVA</th><th>Sede</th></tr></thead>
            <tbody>
              {senzaMatch.map((r) => (
                <tr key={r.ficNome}>
                  <td style={{ fontWeight: 500 }}>{r.ficNome}</td>
                  <td>{r.dati.piva ?? "—"}</td>
                  <td className="muted">{[r.dati.citta, r.dati.provincia].filter(Boolean).join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
