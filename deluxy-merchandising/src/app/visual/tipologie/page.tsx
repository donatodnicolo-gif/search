import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { REGOLE, etichettaRegola } from "@/lib/ordinamento-vetrina";
import {
  creaTipologia,
  aggiornaTipologia,
  eliminaTipologia,
  assegnaCollezioniATipologia,
  applicaTipologiaAlleSueCollezioni,
} from "@/lib/azioni-tipologie";

export const dynamic = "force-dynamic";

// Le **tipologie di collezione**: etichette editoriali nostre (Bouquet, Torte,
// Occasioni…) con una regola d'ordine **standing**. Si imposta la regola una
// volta sulla tipologia e vale per tutte le collezioni assegnate; si riapplica
// da sola a ogni import. È il «regole per tipologia estese a più collezioni».
export default async function TipologiePage() {
  const [tipologie, pubblicate] = await Promise.all([
    prisma.tipologiaCollezione.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { collezioni: true } }, collezioni: { select: { id: true, titolo: true, negozio: true } } },
    }),
    prisma.collezioneShopify.findMany({
      where: { pubblicataShopify: true },
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      select: { id: true, titolo: true, negozio: true, tipologiaId: true },
    }),
  ]);

  const perNegozio = new Map<string, typeof pubblicate>();
  for (const c of pubblicate) {
    const arr = perNegozio.get(c.negozio) ?? [];
    arr.push(c);
    perNegozio.set(c.negozio, arr);
  }

  const SelettoreCollezioni = () =>
    pubblicate.length === 0 ? (
      <p className="page-sub" style={{ margin: 0 }}>
        Nessuna collezione pubblicata da assegnare: rifai l'import da <Link href="/collezioni">Collezioni</Link>.
      </p>
    ) : (
      <select multiple name="collezioni" size={6} style={{ width: "100%", font: "inherit", padding: 8, borderRadius: "var(--radius-m)", background: "var(--fill)", border: "1px solid transparent" }}>
        {[...perNegozio.entries()].map(([negozio, lista]) => (
          <optgroup key={negozio} label={negozio}>
            {lista.map((c) => (
              <option key={c.id} value={c.id}>{c.titolo}{c.tipologiaId ? " ·(già assegnata)" : ""}</option>
            ))}
          </optgroup>
        ))}
      </select>
    );

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 900 }}>
        <a className="ritorno" href="/visual">← Visual merchandising</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Tipologie di collezione</h1>
            <p className="page-sub">
              Etichette tue (Bouquet, Torte, Occasioni…) con una <b>regola d'ordine standing</b>: la imposti una volta
              e vale per tutte le collezioni che le assegni, riapplicandosi da sola a ogni import.
            </p>
          </div>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Nuova tipologia</div>
          <form action={creaTipologia} className="modulo" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="campo-modulo">
              <label>Nome <span className="obbligatorio">*</span></label>
              <input name="nome" required placeholder="Bouquet" />
            </div>
            <div className="campo-modulo">
              <label>Regola d'ordine standing</label>
              <select name="regola" defaultValue="best_seller">
                {REGOLE.map((r) => (<option key={r.chiave} value={r.chiave}>{r.nome}</option>))}
              </select>
            </div>
            <div className="campo-modulo" style={{ gridColumn: "1 / -1" }}>
              <label>Descrizione</label>
              <input name="descrizione" placeholder="A cosa serve questa tipologia" />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn">Crea tipologia</button>
            </div>
          </form>
        </div>

        {tipologie.length === 0 ? (
          <div className="vuoto-mini">Nessuna tipologia ancora. Creane una qui sopra.</div>
        ) : (
          tipologie.map((t) => (
            <div className="scheda" key={t.id}>
              <div className="scheda-titolo" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span>{t.nome}</span>
                <span className="page-sub" style={{ margin: 0 }}>
                  {etichettaRegola(t.regolaOrdinamento)} · {t._count.collezioni} collezioni
                </span>
              </div>

              <form action={aggiornaTipologia.bind(null, t.id)} className="modulo" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
                <div className="campo-modulo">
                  <label>Nome</label>
                  <input name="nome" defaultValue={t.nome} />
                </div>
                <div className="campo-modulo">
                  <label>Regola standing</label>
                  <select name="regola" defaultValue={t.regolaOrdinamento ?? "manuale"}>
                    {REGOLE.map((r) => (<option key={r.chiave} value={r.chiave}>{r.nome}</option>))}
                  </select>
                </div>
                <div className="campo-modulo" style={{ gridColumn: "1 / -1" }}>
                  <label>Descrizione</label>
                  <input name="descrizione" defaultValue={t.descrizione ?? ""} />
                </div>
                <div className="azioni-modulo" style={{ gridColumn: "1 / -1", gap: 8 }}>
                  <button type="submit" className="btn btn-secondario">Salva (e riapplica se cambia)</button>
                </div>
              </form>

              <div style={{ display: "grid", gap: 8 }}>
                <label className="page-sub" style={{ margin: 0 }}>Assegna collezioni (tieni premuto Ctrl/Cmd per sceglierne più d'una)</label>
                <form action={assegnaCollezioniATipologia} style={{ display: "grid", gap: 8 }}>
                  <input type="hidden" name="tipologiaId" value={t.id} />
                  <SelettoreCollezioni />
                  <div>
                    <button type="submit" className="btn" disabled={pubblicate.length === 0}>Assegna a «{t.nome}»</button>
                  </div>
                </form>
                {/* Form separati: annidarli dentro quello di assegnazione sarebbe HTML non valido. */}
                <div style={{ display: "flex", gap: 8 }}>
                  <form action={applicaTipologiaAlleSueCollezioni.bind(null, t.id)}>
                    <button type="submit" className="btn btn-secondario" disabled={t._count.collezioni === 0}>Riapplica ora</button>
                  </form>
                  <form action={eliminaTipologia.bind(null, t.id)}>
                    <button type="submit" className="btn btn-secondario">Elimina</button>
                  </form>
                </div>
              </div>

              {t.collezioni.length > 0 && (
                <p className="page-sub" style={{ marginTop: 10 }}>
                  Collezioni: {t.collezioni.map((c) => `${c.titolo} (${c.negozio})`).join(" · ")}
                </p>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
