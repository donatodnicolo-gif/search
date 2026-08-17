"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TIPI_PL, VOCI_CE } from "@/lib/cfo";
import { eur, MESI, pct } from "@/lib/format";

type Riga = {
  categoriaId: string | null;
  categoriaNome: string | null;
  descrizione: string | null;
  tipoPL: string | null;
  voceCE: string | null;
  voceCEImpostata: boolean;
  predefinita: boolean;
  colore: string | null;
  uscite: number;
  movimenti: number;
  perMese: number[];
  controparti: { controparte: string; uscite: number; perMese: number[] }[];
};
type CatOpt = { id: string; nome: string; tipoPL: string; colore: string | null };

const tipoLabel = (k: string | null) => TIPI_PL.find((t) => t.key === k)?.label ?? "—";
const tipoBadge = (k: string | null) => TIPI_PL.find((t) => t.key === k)?.badge ?? "neutral";

type Comp = { mese: number; importo: string; anno: number; meseDestinazione: number };

// Il pannello «anno di competenza» che si apre sotto la riga di una
// controparte. Sta **fuori** dal componente padre di proposito: definito
// dentro, React ne creerebbe un tipo nuovo a ogni render e lo rimonterebbe a
// ogni battuta — il campo perdeva il fuoco e il pannello spariva da sotto le
// mani appena si sceglieva un mese.
function RigaCompetenza({
  controparte, perMese, colonne, anno, comp, setComp, busy, onSposta, onAnnulla,
}: {
  controparte: string;
  perMese: number[];
  colonne: number;
  anno: number;
  comp: Comp;
  setComp: (f: (c: Comp) => Comp) => void;
  busy: boolean;
  onSposta: (controparte: string, perMese: number[]) => void;
  onAnnulla: () => void;
}) {
  const suggerito = perMese[comp.mese - 1] ?? 0;
  return (
    <tr>
      <td colSpan={colonne} style={{ background: "rgba(0,0,0,.03)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
            Uscita del mese
            <select value={comp.mese} onChange={(e) => setComp((c) => ({ ...c, mese: Number(e.target.value), importo: "" }))}>
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>{m} · {eur(perMese[i] ?? 0)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
            Importo
            <input
              value={comp.importo}
              placeholder={String(Math.round(suggerito * 100) / 100)}
              onChange={(e) => setComp((c) => ({ ...c, importo: e.target.value }))}
              style={{ width: 110, padding: "5px 7px" }}
            />
          </label>
          <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
            Competenza anno
            <select value={comp.anno} onChange={(e) => setComp((c) => ({ ...c, anno: Number(e.target.value) }))}>
              {[anno - 2, anno - 1, anno, anno + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
            e mese
            <select value={comp.meseDestinazione} onChange={(e) => setComp((c) => ({ ...c, meseDestinazione: Number(e.target.value) }))}>
              {MESI.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
            </select>
          </label>
          <button className="btn" disabled={busy} onClick={() => onSposta(controparte, perMese)}>
            {busy ? "Sposto…" : "Sposta"}
          </button>
          <button className="btn secondary" disabled={busy} onClick={onAnnulla}>Annulla</button>
          <span className="muted" style={{ fontSize: 12 }}>
            Vuoto = tutto il mese ({eur(suggerito)}). Il dato di Finance non cambia: cambia solo
            l&apos;esercizio in cui si legge.
          </span>
        </div>
      </td>
    </tr>
  );
}

export function CfoBoard({
  periodoLabel,
  anno,
  totali,
  righe,
  categorie,
}: {
  periodoLabel: string;
  anno: number;
  totali: { uscite: number; movimenti: number; perMese: number[] };
  righe: Riga[];
  categorie: CatOpt[];
}) {
  const router = useRouter();
  const [espansa, setEspansa] = useState<string | null>(null);
  // Il pannello si apre sotto la riga, ma su una riga alta il suo bordo può
  // cadere appena sotto il margine dello schermo — e mezzo passo fuori campo si
  // legge come «non è successo niente» esattamente come tre schermate. `nearest`
  // sposta la pagina solo se serve davvero.
  // ⚠️ Niente `behavior: "smooth"`: misurato qui dentro, lo scorrimento animato
  // **non parte affatto** (la pagina resta a 0 mentre con il comportamento
  // predefinito va a 907) — cioè il rimedio a «non succede niente» sarebbe stato
  // a sua volta un non-succede-niente.
  const pannello = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (espansa) pannello.current?.scrollIntoView({ block: "nearest" });
  }, [espansa]);
  const [nuova, setNuova] = useState<{ nome: string; tipoPL: string } | null>(null);
  const [assegna, setAssegna] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // Quale controparte ha aperto il pannello «anno di competenza», e con quali
  // valori. Uno solo per volta: è una decisione da prendere guardando una riga.
  const [compPer, setCompPer] = useState<string | null>(null);
  const [comp, setComp] = useState({ mese: 1, importo: "", anno: anno - 1, meseDestinazione: 12 });
  // Proposte AI per controparte (categoria + confidenza + motivo)
  const [proposte, setProposte] = useState<
    Record<string, { categoriaId: string | null; confidenza: string; motivo: string }>
  >({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const idPerNome = new Map(categorie.map((c) => [c.nome, c.id] as const));
  // Piano di categorie proposto dall'AI a partire dalle controparti reali.
  const [pianoAI, setPianoAI] = useState<
    { nome: string; tipoPL: string; motivo: string; controparti: string[] }[] | null
  >(null);
  const [pianoBusy, setPianoBusy] = useState(false);
  const [pianoMsg, setPianoMsg] = useState<string | null>(null);

  const nonCategorizzate = righe.find((r) => r.categoriaId === null);
  // Con centinaia di controparti la tabella diventa ingestibile: si mostrano le
  // più costose (dove sta quasi tutto l'importo) e si dice quante restano.
  const TETTO_DA_CATEGORIZZARE = 100;
  const daMostrare = nonCategorizzate?.controparti.slice(0, TETTO_DA_CATEGORIZZARE) ?? [];
  const restanti = (nonCategorizzate?.controparti.length ?? 0) - daMostrare.length;
  const importoRestante = (nonCategorizzate?.controparti.slice(TETTO_DA_CATEGORIZZARE) ?? []).reduce(
    (s, c) => s + c.uscite,
    0
  );
  const categorizzato = righe.filter((r) => r.categoriaId !== null).reduce((s, r) => s + r.uscite, 0);
  const coperturaPct = totali.uscite > 0 ? (categorizzato / totali.uscite) * 100 : 0;
  // Uscita per controparte (per mostrare i totali del piano proposto).
  const uscitePerContro = new Map<string, number>();
  for (const r of righe) for (const c of r.controparti) uscitePerContro.set(c.controparte, (uscitePerContro.get(c.controparte) ?? 0) + c.uscite);
  const totalePiano = (nomi: string[]) => nomi.reduce((s, n) => s + (uscitePerContro.get(n) ?? 0), 0);

  // L'AI studia le controparti non categorizzate e propone un piano di categorie.
  async function studiaCategorieAI() {
    setPianoBusy(true);
    setPianoMsg(null);
    const res = await fetch("/api/cfo/ai-categorie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        controparti: (nonCategorizzate?.controparti ?? []).slice(0, 150),
        esistenti: categorie.map((c) => ({ nome: c.nome, tipoPL: c.tipoPL })),
      }),
    });
    setPianoBusy(false);
    const body = await res.json().catch(() => null);
    if (!body?.ok) { setPianoMsg(body?.error ?? "Studio AI non riuscito."); return; }
    setPianoAI(body.categorie);
    setPianoMsg(`${body.categorie.length} categorie proposte. Controlla e crea.`);
  }

  // Crea in blocco tutte le categorie proposte (categorie + regole).
  async function creaPiano() {
    if (!pianoAI?.length) return;
    if (!confirm(`Creare ${pianoAI.length} categorie e categorizzare le controparti proposte?`)) return;
    setPianoBusy(true);
    const res = await fetch("/api/cfo/applica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categorie: pianoAI }),
    });
    setPianoBusy(false);
    if (res.ok) { setPianoAI(null); router.refresh(); }
    else setPianoMsg("Creazione non riuscita.");
  }

  // Modifica di una categoria già esistente: nome e — soprattutto — la voce di
  // P&L in cui confluisce. Senza questa, l'unico modo per spostare una categoria
  // da una voce all'altra era cancellarla e rifarla, perdendo tutte le regole
  // che le erano state insegnate.
  async function salvaCategoria(
    id: string,
    patch: { nome?: string; tipoPL?: string; voceCE?: string; predefinita?: boolean; descrizione?: string }
  ) {
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/cfo/categorie", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Modifica non riuscita.");
      return;
    }
    router.refresh();
  }

  // ---- Anno di competenza, deciso da qui ----
  // Sta nel CFO e non solo nella sua pagina perché è qui che si guardano le
  // uscite una per una: accorgersi che una fattura è dell'anno prima succede
  // mentre la si categorizza, non dopo, in un'altra schermata.
  async function spostaCompetenza(controparte: string, perMese: number[]) {
    const mese = comp.mese;
    const importoScritto = Number((comp.importo || "").replace(",", "."));
    const importo = Number.isFinite(importoScritto) && importoScritto > 0 ? importoScritto : (perMese[mese - 1] ?? 0);
    if (importo <= 0) {
      setErrore("In quel mese questa controparte non ha uscite: non c'è niente da spostare.");
      return;
    }
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/competenza", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "USCITA",
        voce: controparte,
        annoOrigine: anno,
        meseOrigine: mese,
        annoCompetenza: comp.anno,
        meseCompetenza: comp.meseDestinazione,
        importo,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Spostamento non riuscito.");
      return;
    }
    setCompPer(null);
    setComp((c) => ({ ...c, importo: "" }));
    router.refresh();
  }

  async function creaCategoria() {
    if (!nuova?.nome.trim()) {
      setErrore("Indica il nome della categoria.");
      return;
    }
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/cfo/categorie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuova),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Creazione non riuscita.");
      return;
    }
    setNuova(null);
    router.refresh();
  }

  // Crea una regola "la controparte X va nella categoria Y" (match esatto).
  async function assegnaControparte(controparte: string) {
    const categoriaId = assegna[controparte];
    if (!categoriaId) return;
    setBusy(true);
    const res = await fetch("/api/cfo/regole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match: controparte, esatto: true, categoriaId }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  // Chiede all'AI di ipotizzare la categoria per le controparti mostrate. Le
  // proposte pre-compilano le tendine (con confidenza e motivo): l'utente
  // conferma, non si applica niente in automatico.
  async function chiediProposteAI() {
    setAiBusy(true);
    setAiMsg(null);
    const res = await fetch("/api/cfo/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        controparti: daMostrare,
        categorie: categorie.map((c) => ({ nome: c.nome, tipoPL: c.tipoPL })),
      }),
    });
    setAiBusy(false);
    const body = await res.json().catch(() => null);
    if (!body?.ok) {
      setAiMsg(body?.error ?? "Proposte AI non riuscite.");
      return;
    }
    const nuoveProp: typeof proposte = {};
    const nuoveAssegna: Record<string, string> = { ...assegna };
    let conCategoria = 0;
    for (const p of body.proposte as { controparte: string; categoria: string | null; confidenza: string; motivo: string }[]) {
      const catId = p.categoria ? idPerNome.get(p.categoria) ?? null : null;
      nuoveProp[p.controparte] = { categoriaId: catId, confidenza: p.confidenza, motivo: p.motivo };
      if (catId) {
        nuoveAssegna[p.controparte] = catId; // preseleziona la tendina
        conCategoria++;
      }
    }
    setProposte(nuoveProp);
    setAssegna(nuoveAssegna);
    setAiMsg(`AI: ${conCategoria} proposte su ${daMostrare.length} controparti. Controlla e conferma.`);
  }

  // Conferma in blocco tutte le proposte ad alta confidenza (crea le regole).
  async function accettaAlte() {
    const daCreare = daMostrare
      .filter((c) => proposte[c.controparte]?.categoriaId && proposte[c.controparte]?.confidenza === "alta")
      .map((c) => ({ match: c.controparte, categoriaId: proposte[c.controparte].categoriaId! }));
    if (daCreare.length === 0) return;
    if (!confirm(`Confermare ${daCreare.length} riconciliazioni ad alta confidenza? Crea altrettante regole.`)) return;
    setBusy(true);
    for (const r of daCreare) {
      await fetch("/api/cfo/regole", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match: r.match, esatto: true, categoriaId: r.categoriaId }),
      });
    }
    setBusy(false);
    router.refresh();
  }

  async function eliminaCategoria(c: Riga) {
    if (!c.categoriaId) return;
    if (!confirm(`Eliminare la categoria "${c.categoriaNome}"? Le sue controparti tornano non categorizzate.`)) return;
    const res = await fetch(`/api/cfo/categorie?id=${encodeURIComponent(c.categoriaId)}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Uscite di banca — {periodoLabel}</div>
          <div className="kpi-value">{eur(totali.uscite)}</div>
          <div className="kpi-sub">{totali.movimenti} movimenti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Costi ricostruiti (categorizzati)</div>
          <div className="kpi-value">{eur(categorizzato)}</div>
          <div className="kpi-sub">{pct(coperturaPct)} delle uscite</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da categorizzare</div>
          <div className={`kpi-value ${nonCategorizzate ? "neg" : ""}`}>
            {eur(nonCategorizzate?.uscite ?? 0)}
          </div>
          <div className="kpi-sub">{nonCategorizzate?.controparti.length ?? 0} controparti</div>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Costi per categoria</h2>
        <div className="page-actions">
          {pianoMsg && <span className="muted" style={{ fontSize: 13 }}>{pianoMsg}</span>}
          <button className="btn secondary" onClick={studiaCategorieAI} disabled={pianoBusy || !nonCategorizzate}>
            {pianoBusy ? "L'AI sta studiando…" : "✦ Studia categorie con AI"}
          </button>
          <button className="btn secondary" onClick={() => { setErrore(null); setNuova({ nome: "", tipoPL: "STRUTTURA" }); }}>
            Aggiungi categoria
          </button>
        </div>
      </div>

      {pianoAI && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="page-head" style={{ marginBottom: 10 }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              Piano proposto dall&apos;AI — {pianoAI.length} categorie
            </h3>
            <div className="page-actions">
              <button className="btn secondary" onClick={() => setPianoAI(null)} disabled={pianoBusy}>Scarta</button>
              <button className="btn primary" onClick={creaPiano} disabled={pianoBusy}>
                {pianoBusy ? "Creazione…" : "Crea tutte le categorie"}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Voce P&amp;L</th>
                  <th className="num">Uscite</th>
                  <th className="num">Controparti</th>
                  <th>Esempi</th>
                </tr>
              </thead>
              <tbody>
                {pianoAI
                  .map((c) => ({ ...c, tot: totalePiano(c.controparti) }))
                  .sort((a, b) => b.tot - a.tot)
                  .map((c) => (
                    <tr key={c.nome}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.nome}</div>
                        {c.motivo && <div className="muted" style={{ fontSize: 11.5 }}>{c.motivo}</div>}
                      </td>
                      <td>
                        <span className={`badge ${tipoBadge(c.tipoPL)}`}><span className="dot" />{tipoLabel(c.tipoPL)}</span>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{eur(c.tot)}</td>
                      <td className="num muted">{c.controparti.length}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {c.controparti.slice(0, 3).join(", ")}{c.controparti.length > 3 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            L&apos;AI ha studiato le controparti reali e proposto queste categorie con la voce di P&amp;L.
            &quot;Crea tutte&quot; le crea e categorizza le controparti; potrai comunque modificarle. Le categorie
            con lo stesso nome di una esistente vengono riusate.
          </p>
        </div>
      )}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Voce P&amp;L</th>
                <th>Voce di bilancio</th>
                <th className="num">Uscite</th>
                <th className="num">Quota</th>
                <th className="num">Movimenti</th>
                <th className="num">Controparti</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {righe.filter((r) => r.categoriaId).map((r) => (
                <Fragment key={r.categoriaId}>
                <tr style={espansa === r.categoriaId ? { background: "var(--fill)" } : undefined}>
                  <td>
                    <span className={`badge ${r.colore ?? tipoBadge(r.tipoPL)}`} style={{ marginRight: 6 }}>
                      <span className="dot" />
                    </span>
                    <input
                      defaultValue={r.categoriaNome ?? ""}
                      disabled={busy}
                      style={{ width: 190, padding: "4px 6px", fontSize: 13 }}
                      onBlur={(e) => {
                        const nome = e.target.value.trim();
                        if (nome && nome !== r.categoriaNome) salvaCategoria(r.categoriaId!, { nome });
                        else e.target.value = r.categoriaNome ?? "";
                      }}
                    />
                    {/* Cosa ci va dentro: si scrive qui, e si legge ovunque la
                        categoria compaia. Senza, chi assegna una controparte
                        deve dedurlo dal nome — e due persone dedurranno cose
                        diverse. */}
                    <input
                      defaultValue={r.descrizione ?? ""}
                      disabled={busy}
                      placeholder="cosa ci va dentro, e cosa no"
                      style={{ width: 230, padding: "3px 6px", fontSize: 11.5, marginTop: 3, display: "block" }}
                      onBlur={(e) => {
                        const descrizione = e.target.value.trim();
                        if (descrizione !== (r.descrizione ?? "")) salvaCategoria(r.categoriaId!, { descrizione });
                      }}
                    />
                  </td>
                  <td>
                    {/* La voce di P&L si cambia da qui: è il modo per spostare una
                        categoria (es. i pagamenti ai partner) fuori dai costi,
                        senza cancellarla e perdere le sue regole. */}
                    <select
                      value={r.tipoPL ?? "STRUTTURA"}
                      disabled={busy}
                      onChange={(e) => salvaCategoria(r.categoriaId!, { tipoPL: e.target.value })}
                      style={{ padding: "4px 6px", fontSize: 13 }}
                      title={TIPI_PL.find((t) => t.key === (r.tipoPL ?? "STRUTTURA"))?.aiuto}
                    >
                      {TIPI_PL.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    <div className="muted" style={{ fontSize: 11, maxWidth: 230, marginTop: 3 }}>
                      {TIPI_PL.find((t) => t.key === (r.tipoPL ?? "STRUTTURA"))?.aiuto}
                    </div>
                  </td>
                  <td>
                    {/* Dove va la stessa categoria nel bilancio civilistico. Non
                        è un doppione della voce di P&L: in bilancio la
                        pubblicità sta dentro «servizi» e il compenso
                        dell'amministratore pure, mentre «personale» è solo
                        lavoro dipendente. */}
                    <select
                      value={r.voceCE ?? "B7"}
                      disabled={busy}
                      onChange={(e) => salvaCategoria(r.categoriaId!, { voceCE: e.target.value })}
                      style={{ padding: "4px 6px", fontSize: 13 }}
                      title={VOCI_CE.find((v) => v.key === (r.voceCE ?? "B7"))?.aiuto}
                    >
                      {VOCI_CE.map((v) => (
                        <option key={v.key} value={v.key}>{v.label}</option>
                      ))}
                    </select>
                    {!r.voceCEImpostata && (
                      <div className="muted" style={{ fontSize: 11 }}>dedotta, da confermare</div>
                    )}
                    {/* La predefinita raccoglie quello che nessuna regola prende.
                        Una sola: accendendone un'altra questa si spegne. */}
                    <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={r.predefinita}
                        disabled={busy}
                        onChange={(e) => salvaCategoria(r.categoriaId!, { predefinita: e.target.checked })}
                      />
                      raccoglie il residuo
                    </label>
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(r.uscite)}</td>
                  <td className="num muted">{pct((r.uscite / (totali.uscite || 1)) * 100, 0)}</td>
                  <td className="num muted">{r.movimenti}</td>
                  <td className="num">
                    <button
                      className="btn secondary small"
                      onClick={() => setEspansa(espansa === r.categoriaId ? null : r.categoriaId)}
                    >
                      {r.controparti.length} {espansa === r.categoriaId ? "▲" : "▼"}
                    </button>
                  </td>
                  <td>
                    <button className="btn secondary small" style={{ color: "var(--red)" }} onClick={() => eliminaCategoria(r)}>
                      Elimina
                    </button>
                  </td>
                </tr>
                {/* Le controparti si aprono **sotto la riga che le ha chiamate**.
                    Prima erano una scheda in fondo alla pagina: con diciotto
                    categorie, chi premeva la freccia su una riga in alto non
                    vedeva succedere niente — la risposta c'era, ma tre schermate
                    più giù. Una cosa che si apre lontano da dove l'hai chiesta
                    non si è aperta. */}
                {espansa === r.categoriaId && (
                  <tr ref={pannello}>
                    <td colSpan={8} style={{ background: "var(--fill)", paddingTop: 12, paddingBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                        {r.controparti.length} controparti in «{r.categoriaNome}» —{" "}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          clicca una controparte per decidere l&apos;anno di competenza di quell&apos;uscita
                        </span>
                      </div>
                      <div className="chips">
                        {r.controparti.map((c) => (
                          // Cliccabile: anche una controparte già categorizzata può avere
                          // un'uscita che è di competenza di un altro esercizio.
                          <button
                            className={`chip${compPer === c.controparte ? " on" : ""}`}
                            key={c.controparte}
                            onClick={() => setCompPer(compPer === c.controparte ? null : c.controparte)}
                            title="Decidi l'anno di competenza di questa uscita"
                          >
                            {c.controparte} · {eur(c.uscite)}
                          </button>
                        ))}
                      </div>
                      {(() => {
                        const c = r.controparti.find((x) => x.controparte === compPer);
                        if (!c) return null;
                        return (
                          <table style={{ marginTop: 10 }}>
                            <tbody>
                              <RigaCompetenza
                                controparte={c.controparte}
                                perMese={c.perMese}
                                colonne={1}
                                anno={anno}
                                comp={comp}
                                setComp={setComp}
                                busy={busy}
                                onSposta={spostaCompetenza}
                                onAnnulla={() => setCompPer(null)}
                              />
                            </tbody>
                          </table>
                        );
                      })()}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              <tr className="tot">
                <td>Totale categorizzato</td>
                <td />
                <td />
                <td className="num">{eur(categorizzato)}</td>
                <td className="num">{pct(coperturaPct, 0)}</td>
                <td className="num" />
                <td className="num" />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {nonCategorizzate && nonCategorizzate.controparti.length > 0 && (
        <>
          <div className="page-head" style={{ marginBottom: 12 }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              Da categorizzare — {eur(nonCategorizzate.uscite)}
            </h2>
            <div className="page-actions">
              {aiMsg && <span className="muted" style={{ fontSize: 13 }}>{aiMsg}</span>}
              <button className="btn secondary" onClick={chiediProposteAI} disabled={aiBusy}>
                {aiBusy ? "L'AI sta analizzando…" : "✦ Proponi con AI"}
              </button>
              {Object.values(proposte).some((p) => p.categoriaId && p.confidenza === "alta") && (
                <button className="btn primary" onClick={accettaAlte} disabled={busy}>
                  Accetta le alte confidenze
                </button>
              )}
            </div>
          </div>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Controparte</th>
                    <th className="num">Uscite</th>
                    <th>Proposta AI</th>
                    <th>Assegna a categoria</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {daMostrare.map((c) => {
                    const prop = proposte[c.controparte];
                    const badge =
                      prop?.confidenza === "alta" ? "green" : prop?.confidenza === "media" ? "gold" : "neutral";
                    return (
                      <Fragment key={c.controparte}>
                      <tr>
                        <td style={{ fontWeight: 500 }}>{c.controparte}</td>
                        <td className="num">{eur(c.uscite)}</td>
                        <td style={{ minWidth: 180 }}>
                          {prop ? (
                            prop.categoriaId ? (
                              <span className={`badge ${badge}`} title={prop.motivo}>
                                <span className="dot" />
                                {categorie.find((x) => x.id === prop.categoriaId)?.nome} · {prop.confidenza}
                              </span>
                            ) : (
                              <span className="muted" style={{ fontSize: 12.5 }} title={prop.motivo}>
                                incerta
                              </span>
                            )
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ minWidth: 220 }}>
                          <select
                            value={assegna[c.controparte] ?? ""}
                            onChange={(e) => setAssegna((p) => ({ ...p, [c.controparte]: e.target.value }))}
                          >
                            <option value="">Scegli…</option>
                            {categorie.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.nome}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            className="btn primary small"
                            disabled={!assegna[c.controparte] || busy}
                            onClick={() => assegnaControparte(c.controparte)}
                          >
                            Assegna
                          </button>
                          <button
                            className="btn secondary small"
                            style={{ marginLeft: 6 }}
                            onClick={() => setCompPer(compPer === c.controparte ? null : c.controparte)}
                          >
                            Competenza
                          </button>
                        </td>
                      </tr>
                      {compPer === c.controparte && (
                        <RigaCompetenza controparte={c.controparte} perMese={c.perMese} colonne={5} anno={anno} comp={comp} setComp={setComp} busy={busy} onSposta={spostaCompetenza} onAnnulla={() => setCompPer(null)} />
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            {restanti > 0 && (
              <>Mostrate le prime {TETTO_DA_CATEGORIZZARE} controparti per importo; restano{" "}
              <strong>{restanti}</strong> voci minori per {eur(importoRestante)}. </>
            )}
            <strong>Proponi con AI</strong> ipotizza la categoria di ogni controparte (con confidenza e motivo);
            resta a te confermare. Assegnare una controparte crea una regola permanente: la prossima volta sarà
            categorizzata da sola.
          </p>
        </>
      )}

      {nuova && (
        <div className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}>Nuova categoria di costo</h3>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome</label>
              <input type="text" value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })}
                placeholder="Es. Affitti, Software, Consulenze" />
            </div>
            <div>
              <label className="field-label">Confluisce nella voce di P&amp;L</label>
              <select value={nuova.tipoPL} onChange={(e) => setNuova({ ...nuova, tipoPL: e.target.value })}>
                {TIPI_PL.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-footer">
            {errore && <span style={{ color: "var(--red)", fontSize: 13 }}>{errore}</span>}
            <button className="btn secondary" onClick={() => setNuova(null)}>Annulla</button>
            <button className="btn primary" onClick={creaCategoria} disabled={busy}>
              {busy ? "Creazione…" : "Crea categoria"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
