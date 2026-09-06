import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno, costoPersonaAnno, costoPersonaMese, nettoBusta, tfrDi, TIPI_PERSONA } from "@/lib/calc";
import { OrganicoEditor } from "@/components/OrganicoEditor";
import { AvvisoOrganico } from "@/components/AvvisoOrganico";
import { eur, MESI } from "@/lib/format";

export const dynamic = "force-dynamic";

const PERSONALE_URL = (process.env.PERSONALE_URL ?? "https://deluxy-personale.vercel.app").replace(/\/$/, "");

// Dal 06/09/2026 questa pagina NON è più un editor del roster: le persone —
// nome, squadra, contratto, RAL, contributi, da quando a quando — arrivano da
// Deluxy Personale, la casa dei dati HR, e qui si vede quanto costano mese
// per mese nell'anno di budget. L'unica cosa che si scrive è la
// pianificazione di Budgets: a quale maison attribuire il costo, e una nota.
export default async function Dipendenti() {
  const dati = await caricaAnno(ANNO_CORRENTE);
  const persone = dati.persone;
  const totaleAnno = persone.reduce((s, p) => s + costoPersonaAnno(p), 0);
  const perTipo = TIPI_PERSONA.map((t) => {
    const del = persone.filter((p) => p.tipo === t.key);
    return { ...t, persone: del, costo: del.reduce((s, p) => s + costoPersonaAnno(p), 0) };
  }).filter((t) => t.persone.length > 0);
  const teamDi = (id: string | null) => dati.team.find((t) => t.id === id) ?? null;
  const maisonDi = (id: string | null) => dati.maisons.find((m) => m.id === id)?.nome ?? null;

  // I mesi in forza, scritti corti: «Gen–Dic», «Set–Dic», «Gen–Lug»; se ci
  // sono buchi in mezzo si elencano.
  const mesiCorti = (mesi: number[]) => {
    if (mesi.length === 0) return "—";
    const contigui = mesi.every((m, i) => i === 0 || m === mesi[i - 1] + 1);
    if (contigui) return mesi.length === 1 ? MESI[mesi[0] - 1] : `${MESI[mesi[0] - 1]}–${MESI[mesi[mesi.length - 1] - 1]}`;
    return mesi.map((m) => MESI[m - 1]).join(" ");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dipendenti e collaboratori</h1>
          <p className="page-caption">
            L&apos;organico {dati.year} letto da <strong>Deluxy Personale</strong>: contratto, compenso e
            periodo in forza sono i suoi; qui si vede quanto costano nell&apos;anno di budget, mese per
            mese, e si sceglie a quale maison attribuire il costo. Confluisce nel P&amp;L.
          </p>
        </div>
        <div className="page-actions">
          <a className="btn secondary" href={`${PERSONALE_URL}/`} target="_blank" rel="noreferrer">
            Apri Personale ↗
          </a>
        </div>
      </div>

      <AvvisoOrganico organico={dati.organico} />

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Costo del personale {dati.year}</div>
          <div className="kpi-value">{eur(totaleAnno)}</div>
          <div className="kpi-sub">
            {persone.length} {persone.length === 1 ? "persona" : "persone"} in forza nell&apos;anno
            {dati.organico.stato === "ok" && !dati.organico.storia && " · compenso corrente su tutti i mesi"}
          </div>
        </div>
        {perTipo.map((t) => (
          <div className="kpi" key={t.key}>
            <div className="kpi-label">
              <span className={`badge ${t.badge}`}><span className="dot" />{t.label}</span>
            </div>
            <div className="kpi-value">{eur(t.costo)}</div>
            <div className="kpi-sub">{t.persone.length} in organico</div>
          </div>
        ))}
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Organico {dati.year} · da Personale</h2>
      </div>

      {persone.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">👤</div>
          <div className="empty-title">
            {dati.organico.stato === "ok" ? "Nessuna persona in forza nell'anno" : "Organico non disponibile"}
          </div>
          <div className="empty-text">
            {dati.organico.stato === "ok"
              ? "Le persone si aggiungono in Personale, con contratto e compenso: compaiono qui al giro dopo."
              : "Finché Personale non risponde, il costo del personale nel P&L vale zero — ed è un buco dichiarato, non un organico vuoto."}
          </div>
        </div>
      ) : (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contratto</th>
                  <th>Squadra</th>
                  <th className="num">RAL / compenso</th>
                  <th className="num">Tempo</th>
                  <th className="num">Oneri</th>
                  <th className="num">Netto mese</th>
                  <th>In forza {dati.year}</th>
                  <th className="num">Costo mese</th>
                  <th className="num">Costo anno</th>
                  <th>Attribuzione</th>
                </tr>
              </thead>
              <tbody>
                {persone.map((p) => {
                  const t = TIPI_PERSONA.find((x) => x.key === p.tipo);
                  const team = teamDi(p.teamId);
                  const netto = nettoBusta(p);
                  const tfr = tfrDi(p);
                  // Il costo di un mese «tipico»: il primo in forza con compenso.
                  const primo = p.mesi[0];
                  const costoMese = primo ? costoPersonaMese(p, primo) - (primo === p.mesi[p.mesi.length - 1] ? tfr : 0) : 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {p.nome}
                          {p.stato === "cessato" && (
                            <span className="badge neutral" style={{ marginLeft: 8 }} title={`Cessata in Personale${p.al ? ` il ${p.al}` : ""}`}>
                              <span className="dot" />cessata
                            </span>
                          )}
                        </div>
                        {p.ruolo && <div className="muted" style={{ fontSize: 12 }}>{p.ruolo}</div>}
                      </td>
                      <td>
                        <span className={`badge ${t?.badge ?? "neutral"}`}>
                          <span className="dot" />{p.contratto ?? t?.label ?? p.tipo}
                        </span>
                      </td>
                      <td>
                        {team ? (
                          <span className={`badge ${team.colore ?? "neutral"}`}><span className="dot" />{team.nome}</span>
                        ) : (
                          <span className="muted">senza squadra</span>
                        )}
                      </td>
                      <td className="num">{p.importo > 0 ? eur(p.importo) : <span className="muted">non dichiarato</span>}</td>
                      <td className="num muted">{p.tempoPct != null && p.tempoPct < 100 ? `${p.tempoPct}%` : "pieno"}</td>
                      <td className="num muted">{p.contributiPct > 0 ? `${p.contributiPct}%` : "—"}</td>
                      <td className="num muted">{netto ? eur(netto.nettoMese) : "—"}</td>
                      <td className="muted" title={`${p.dal ?? "?"} → ${p.al ?? "in corso"}`}>{mesiCorti(p.mesi)}</td>
                      <td className="num">{costoMese > 0 ? eur(costoMese) : "—"}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {eur(costoPersonaAnno(p))}
                        {tfr > 0 && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>di cui TFR {eur(tfr)}</div>}
                      </td>
                      <td>
                        <OrganicoEditor
                          year={dati.year}
                          personaleId={p.id}
                          nome={p.nome}
                          maisonId={p.maisonId}
                          maisonNome={maisonDi(p.maisonId)}
                          note={p.note}
                          maisons={dati.maisons.map((m) => ({ id: m.id, nome: m.nome }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="page-caption" style={{ marginTop: 12 }}>
        <strong>RAL / compenso</strong> è l&apos;importo effettivo dichiarato in Personale (il part-time è già
        applicato); <strong>oneri</strong> sono i contributi a carico dell&apos;azienda dichiarati là (un
        autonomo senza oneri costa il compenso); <strong>netto mese</strong> è la stima di Budgets sui soli
        dipendenti (IRPEF a scaglioni, detrazioni, addizionali). <strong>In forza</strong> va
        dall&apos;assunzione (o dalla prima decorrenza) alla cessazione: un contratto scaduto ma non cessato
        conta ancora. Per cambiare contratto, compenso, squadra o date si va in{" "}
        <a href={`${PERSONALE_URL}/`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Personale</a>;
        qui si sceglie solo l&apos;<strong>attribuzione</strong> del costo a una maison (vuota = costo di
        struttura) e una nota. Le squadre sono le funzioni di Personale: il loro ruolo economico si
        dichiara in <Link href="/team" style={{ color: "var(--blue)" }}>Team</Link>.
      </p>
    </>
  );
}
