"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, pct } from "@/lib/format";

// Il margine di una linea come numero: vuoto o illeggibile = 0.
const leggiPct = (t: string | undefined): number => {
  const n = Number(String(t ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
};
const pctErrata = (t: string | undefined): boolean => {
  const v = String(t ?? "").trim();
  if (v === "") return false;
  const n = Number(v.replace(",", "."));
  return !Number.isFinite(n) || n < 0 || n > 100;
};

type Riga = {
  id: string;
  slug: string;
  nome: string;
  marginePct: number;
  note: string | null;
  // Quello che entra nel conto economico: sul D2C e la sola quota Deluxy.
  ricavi: number;
  // Il prezzo pieno pagato dal cliente, da cui quella quota si ricava.
  venduto: number;
  vociFinance: string[];
};

// Le **linee commerciali**: hanno un margine loro, scritto in percentuale,
// perche non fatturano per forza come una delle tipologie. Il margine sta
// **qui** e non nella pagina Commerciale (richiesta dell utente, 23/08/2026:
// «dovrebbe pero essere tutto sotto margini»): tutti i margini dell azienda si
// leggono e si cambiano in un posto solo, altrimenti chi cerca «il margine»
// deve sapere in anticipo di che tipo di ricavo si tratta.
export type RigaLinea = {
  id: string;
  nome: string;
  // `null` = non ancora deciso, e vale zero nel P&L.
  marginePct: number | null;
  // Il budget dell anno di quella linea.
  budget: number;
};

export function MarginiEditor({
  tipologie,
  linee,
}: {
  tipologie: Riga[];
  linee: RigaLinea[];
}) {
  const router = useRouter();
  const [margini, setMargini] = useState<Record<string, number>>(() =>
    Object.fromEntries(tipologie.map((t) => [t.id, t.marginePct]))
  );
  // Mappatura verso le tipologie di Finance, come testo "A, B, C" per riga.
  const [voci, setVoci] = useState<Record<string, string>>(() =>
    Object.fromEntries(tipologie.map((t) => [t.id, t.vociFinance.join(", ")]))
  );
  // Il margine delle linee, come **testo**: mentre si scrive «22,» il campo
  // dev'essere incompleto senza che il valore salti a zero.
  const [marginiLinee, setMarginiLinee] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      linee.map((l) => [l.id, l.marginePct === null ? "" : String(l.marginePct).replace(".", ",")])
    )
  );
  const [salvoLinee, setSalvoLinee] = useState(false);
  const [nuovo, setNuovo] = useState<{ nome: string; marginePct: number } | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const totali = useMemo(() => {
    const ricavi = tipologie.reduce((s, t) => s + t.ricavi, 0);
    const venduto = tipologie.reduce((s, t) => s + t.venduto, 0);
    const margine = tipologie.reduce(
      (s, t) => s + (t.ricavi * (margini[t.id] ?? t.marginePct)) / 100,
      0
    );
    // ⚠️ Le linee commerciali entrano nei totali di questa pagina, perche
    // entrano nel conto economico: un «costo del venduto» qui che non fosse
    // quello del P&L sarebbe la quarta versione dello stesso numero.
    const ricaviLinee = linee.reduce((s, l) => s + l.budget, 0);
    const margineLinee = linee.reduce((s, l) => s + (l.budget * leggiPct(marginiLinee[l.id])) / 100, 0);
    const tot = ricavi + ricaviLinee;
    const marg = margine + margineLinee;
    return {
      ricavi: tot,
      venduto: venduto + ricaviLinee,
      margine: marg,
      cogs: tot - marg,
      mediaPct: tot > 0 ? (marg / tot) * 100 : 0,
      ricaviLinee,
      margineLinee,
    };
  }, [tipologie, margini, linee, marginiLinee]);

  async function salva() {
    setSalvo(true);
    setEsito(null);
    const res = await fetch("/api/margini", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipologie: tipologie.map((t) => ({
          id: t.id,
          marginePct: margini[t.id] ?? t.marginePct,
          vociFinance: voci[t.id] ?? "",
        })),
      }),
    });
    setSalvo(false);
    setEsito(res.ok ? "Margini salvati." : "Salvataggio non riuscito, riprovare.");
    if (res.ok) router.refresh();
  }

  const marginiErrati = linee.filter((l) => pctErrata(marginiLinee[l.id])).length;

  // I margini delle linee vivono su un'altra tabella, quindi su un'altra rotta:
  // `PATCH /api/commerciale`. Si manda **solo** il margine — non le voci di
  // Finance — perché quelle si scrivono nella pagina Commerciale e rimandarle
  // da qui, prese da uno schermo che non le mostra, vorrebbe dire riscriverle
  // con quello che c'era quando la pagina è stata aperta.
  async function salvaLinee() {
    setSalvoLinee(true);
    setEsito(null);
    const res = await fetch("/api/commerciale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappature: linee.map((l) => ({ lineaId: l.id, marginePct: marginiLinee[l.id] ?? "" })),
      }),
    });
    const body = await res.json().catch(() => null);
    setSalvoLinee(false);
    if (!res.ok) {
      setEsito(body?.error ?? "Margini delle linee non salvati, riprovare.");
      return;
    }
    setEsito("Margini delle linee salvati.");
    router.refresh();
  }

  async function creaTipologia() {
    if (!nuovo) return;
    if (!nuovo.nome.trim()) {
      setErrore("Indicare il nome della tipologia.");
      return;
    }
    setSalvo(true);
    setErrore(null);
    const res = await fetch("/api/margini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuovo),
    });
    setSalvo(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setErrore(body?.error ?? "Creazione non riuscita, riprovare.");
      return;
    }
    setNuovo(null);
    router.refresh();
  }

  async function elimina(t: Riga) {
    if (!confirm(`Eliminare la tipologia "${t.nome}"?`)) return;
    const res = await fetch(`/api/margini?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Eliminazione non riuscita.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Margine lordo complessivo</div>
          <div className="kpi-value">{eur(totali.margine)}</div>
          <div className="kpi-sub">{pct(totali.mediaPct)} dei ricavi (media ponderata sul mix)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Costo del venduto</div>
          <div className="kpi-value">{eur(totali.cogs)}</div>
          <div className="kpi-sub">
            su {eur(totali.ricavi)} di ricavi a budget
            {Math.abs(totali.venduto - totali.ricavi) > 1 && ` (da ${eur(totali.venduto)} di venduto)`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tipologie di servizio</div>
          <div className="kpi-value">{tipologie.length}</div>
          <div className="kpi-sub">
            {tipologie.filter((t) => t.ricavi > 0).length} con ricavi a budget
          </div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Margine per tipologia</h2>
        <button
          className="btn secondary"
          onClick={() => {
            setErrore(null);
            setNuovo({ nome: "", marginePct: 35 });
          }}
        >
          Aggiungi tipologia
        </button>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipologia</th>
                <th className="num">Venduto a budget</th>
                <th className="num">Ricavi nel P&amp;L</th>
                <th className="num">% sul totale</th>
                <th className="num">Margine %</th>
                <th className="num">Margine €</th>
                <th className="num">Costo del venduto</th>
                <th>Voci in Finance (consuntivo)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tipologie.map((t) => {
                const m = margini[t.id] ?? t.marginePct;
                const margineEur = (t.ricavi * m) / 100;
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.nome}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{t.slug}</div>
                      {/* La nota della tipologia si legge **qui**, accanto al
                          margine che spiega: tenuta solo a database sarebbe una
                          spiegazione che non raggiunge chi sta per cambiare il
                          numero. */}
                      {t.note && (
                        <div
                          className="muted"
                          style={{ fontSize: 11.5, marginTop: 4, maxWidth: 320, lineHeight: 1.4 }}
                        >
                          {t.note}
                        </div>
                      )}
                    </td>
                    <td className="num muted">{t.venduto > 0 ? eur(t.venduto) : "—"}</td>
                    {/* Sul D2C i due numeri **non coincidono**: nel bilancio
                        entra solo la quota che resta a Deluxy, il resto gira ai
                        partner ed e una partita di giro. Il costo del venduto si
                        calcola su questo, non sul venduto. */}
                    <td className="num">
                      {t.ricavi > 0 ? eur(t.ricavi) : <span className="muted">—</span>}
                      {t.venduto > 0 && Math.abs(t.venduto - t.ricavi) > 1 && (
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                          quota {pct((t.ricavi / t.venduto) * 100, 0)} del venduto
                        </div>
                      )}
                    </td>
                    <td className="num muted">
                      {totali.ricavi > 0 ? pct((t.ricavi / totali.ricavi) * 100, 0) : "—"}
                    </td>
                    <td className="num" style={{ width: 130 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={m}
                        onChange={(e) =>
                          setMargini((prev) => ({
                            ...prev,
                            [t.id]: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          }))
                        }
                      />
                    </td>
                    <td className="num">{eur(margineEur)}</td>
                    <td className="num muted">{eur(t.ricavi - margineEur)}</td>
                    <td style={{ minWidth: 220 }}>
                      <input
                        type="text"
                        value={voci[t.id] ?? ""}
                        onChange={(e) => setVoci((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        placeholder="es. Consegne, Food Supplier"
                        style={{ fontSize: 13 }}
                      />
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="btn secondary small"
                        style={{ color: "var(--red)" }}
                        onClick={() => elimina(t)}
                        title={t.ricavi > 0 ? "Ha ricavi a budget: vanno azzerati prima" : undefined}
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale</td>
                <td className="num muted">{eur(totali.venduto)}</td>
                <td className="num">{eur(totali.ricavi)}</td>
                <td className="num">100%</td>
                <td className="num">{pct(totali.mediaPct)}</td>
                <td className="num">{eur(totali.margine)}</td>
                <td className="num">{eur(totali.cogs)}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {nuovo && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>Nuova tipologia di servizio</h2>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome</label>
              <input
                type="text"
                value={nuovo.nome}
                onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
                placeholder="Es. Affiliazioni, Logistica, Regalistica"
              />
            </div>
            <div>
              <label className="field-label">Margine (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={nuovo.marginePct}
                onChange={(e) => setNuovo({ ...nuovo, marginePct: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <button className="btn secondary" onClick={() => setNuovo(null)}>Annulla</button>
            <button className="btn primary" onClick={creaTipologia} disabled={salvo}>
              {salvo ? "Creazione…" : "Crea tipologia"}
            </button>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Una tipologia nuova nasce senza ricavi: entra nel P&amp;L quando le si attribuisce budget.
            Il margine si può impostare subito.
          </p>
        </div>
      )}

      <p className="page-caption" style={{ marginTop: 14 }}>
        <strong>Voci in Finance</strong>: i nomi delle tipologie dell&apos;app Finance che confluiscono in
        questa voce di budget, separati da virgola (es. il B2B raccoglie <em>Consegne, Food Supplier,
        Magazzino…</em>). Servono al <a href="/consuntivo" style={{ color: "var(--blue)" }}>Consuntivo</a> per
        confrontare budget e fatturato reale. Lasciando il campo vuoto, il confronto avviene per nome identico.
      </p>

      <div className="form-footer">
        {esito && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{esito}</span>}
        <button className="btn primary" onClick={salva} disabled={salvo}>
          {salvo ? "Salvataggio…" : "Salva margini e mappature"}
        </button>
      </div>

      {/* ---- Le linee commerciali ----
          Stanno **qui** e non nella pagina Commerciale: tutti i margini
          dell'azienda si leggono e si cambiano in un posto solo, altrimenti chi
          cerca «il margine» deve sapere in anticipo di che tipo di ricavo si
          tratta. */}
      <h2 className="section-title" style={{ marginTop: 28 }}>Margine delle linee commerciali</h2>
      <p className="page-caption" style={{ marginTop: 0 }}>
        Il budget del{" "}
        <a href="/commerciale" style={{ color: "var(--blue)" }}>team commerciale</a> è una{" "}
        <strong>seconda fonte di ricavo</strong>, accanto a quella delle maison: le maison le muove la
        pubblicità online, queste il lavoro del team. Non fatturano per forza come una delle tipologie qui
        sopra, quindi ognuna ha il <strong>suo</strong> margine.
        {linee.some((l) => l.marginePct === null) && (
          <>
            {" "}
            <strong style={{ color: "var(--orange)" }}>
              {linee.filter((l) => l.marginePct === null).length} senza margine
            </strong>
            : entrano a <strong>zero</strong>, cioè il ricavo si conta e il costo del venduto se lo mangia
            tutto. È il motivo per cui il costo del venduto del P&amp;L sembra enorme — non è una misura,
            è un margine che nessuno ha ancora scritto.
          </>
        )}
      </p>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linea</th>
                <th className="num">Budget anno</th>
                <th className="num">Margine %</th>
                <th className="num">Margine €</th>
                <th className="num">Costo del venduto</th>
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => {
                const scritto = marginiLinee[l.id] ?? "";
                const errata = pctErrata(scritto);
                const m = leggiPct(scritto);
                const margineEur = (l.budget * m) / 100;
                return (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500 }}>{l.nome}</td>
                    <td className="num muted">{eur(l.budget)}</td>
                    <td className="num" style={{ width: 130 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={scritto}
                          placeholder="—"
                          className={errata ? "errata" : undefined}
                          style={{ width: 76, textAlign: "right" }}
                          onChange={(e) =>
                            setMarginiLinee((p) => ({ ...p, [l.id]: e.target.value }))
                          }
                        />
                        <span className="muted">%</span>
                      </div>
                    </td>
                    <td className="num">{scritto.trim() === "" ? <span className="muted">—</span> : eur(margineEur)}</td>
                    <td className="num muted">{eur(l.budget - margineEur)}</td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale linee</td>
                <td className="num">{eur(totali.ricaviLinee)}</td>
                <td className="num muted">
                  {totali.ricaviLinee > 0 ? pct((totali.margineLinee / totali.ricaviLinee) * 100) : "—"}
                </td>
                <td className="num">{eur(totali.margineLinee)}</td>
                <td className="num">{eur(totali.ricaviLinee - totali.margineLinee)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="form-footer">
        {marginiErrati > 0 ? (
          <span style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
            {marginiErrati === 1 ? "Un margine non è" : `${marginiErrati} margini non sono`} un numero fra 0
            e 100.
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>
            Lasciare vuoto vuol dire <strong>non deciso</strong>, e vale zero: è diverso da scriverci 0, che
            sarebbe una scelta.
          </span>
        )}
        <button
          className="btn primary"
          onClick={salvaLinee}
          disabled={salvoLinee || marginiErrati > 0}
        >
          {salvoLinee ? "Salvataggio…" : "Salva margini delle linee"}
        </button>
      </div>
    </>
  );
}
