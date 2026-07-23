import { Sidebar } from "@/components/Sidebar";
import { aggiungiMemoria, consolidaMemoria } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  ETICHETTA_SEZIONE_MEMORIA,
  formattaData,
  SEZIONI_MEMORIA,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Memoria condivisa (00.3): lezioni apprese append-only. Le voci non si
// modificano mai — una nuova voce può superarne una vecchia citandola.
export default async function PaginaMemoria({
  searchParams,
}: {
  searchParams: Promise<{ sezione?: string; stato?: string }>;
}) {
  const p = await searchParams;
  const voci = await prisma.memoriaVoce.findMany({
    where: {
      ...(p.sezione ? { sezione: p.sezione } : {}),
      stato: p.stato ?? "attiva",
    },
    orderBy: { data: "desc" },
  });
  const tutte = await prisma.memoriaVoce.findMany({ select: { id: true, testo: true, data: true } });
  const perId = new Map(tutte.map((v) => [v.id, v]));

  return (
    <div className="layout">
      <Sidebar attiva="memoria" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Memoria condivisa</h1>
            <p className="page-sub">
              Le lezioni apprese, append-only come la 00.3 su Drive: una voce non si modifica mai —
              se è superata, se ne scrive una nuova che la corregge. Il consolidamento sposta in
              Storico o marca come regola integrata nei documenti.
            </p>
          </div>
        </div>

        <form className="filtri" method="get">
          <select name="sezione" defaultValue={p.sezione ?? ""}>
            <option value="">Tutte le sezioni</option>
            {SEZIONI_MEMORIA.map((s) => (
              <option key={s} value={s}>{ETICHETTA_SEZIONE_MEMORIA[s]}</option>
            ))}
          </select>
          <select name="stato" defaultValue={p.stato ?? "attiva"}>
            <option value="attiva">Voci attive</option>
            <option value="storico">Storico</option>
            <option value="consolidata">Consolidate nei documenti</option>
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        <section className="scheda">
          <div className="scheda-titolo">Aggiungi una lezione</div>
          <form className="modulo" action={aggiungiMemoria}>
            <div className="campo-modulo largo">
              <label>Voce (1-3 righe) <span className="obbligatorio">*</span></label>
              <textarea name="testo" required rows={2} placeholder="Cosa abbiamo imparato, in modo che una sessione futura non ripeta l'errore" />
            </div>
            <div className="campo-modulo">
              <label>Sezione</label>
              <select name="sezione" defaultValue="metodo">
                {SEZIONI_MEMORIA.map((s) => (
                  <option key={s} value={s}>{ETICHETTA_SEZIONE_MEMORIA[s]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Brand</label>
              <select name="brand" defaultValue="">
                <option value="">Tutti</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Supera la voce…</label>
              <select name="superaId" defaultValue="">
                <option value="">— (voce nuova)</option>
                {tutte.slice(0, 50).map((v) => (
                  <option key={v.id} value={v.id}>
                    [{formattaData(v.data)}] {v.testo.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Aggiungi alla memoria</button>
            </div>
          </form>
        </section>

        {voci.length === 0 ? (
          <div className="vuoto">Nessuna voce in questo filtro.</div>
        ) : (
          <section className="scheda">
            <ul className="storia">
              {voci.map((v) => (
                <li key={v.id}>
                  <span className="storia-data">{formattaData(v.data)}</span>
                  <span className="storia-testo">
                    <span className="tag-neutro" style={{ marginRight: 8 }}>
                      {ETICHETTA_SEZIONE_MEMORIA[v.sezione] ?? v.sezione}
                    </span>
                    {v.brand && (
                      <span className="tag-salute" style={{ color: COLORE_BRAND[v.brand] ?? "var(--text-tertiary)", marginRight: 8 }}>
                        <span className="dot" />
                        {ETICHETTA_BRAND[v.brand] ?? v.brand}
                      </span>
                    )}
                    {v.testo}
                    {v.superaId && perId.has(v.superaId) && (
                      <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                        supera la voce del {formattaData(perId.get(v.superaId)!.data)}: “{perId.get(v.superaId)!.testo.slice(0, 80)}…”
                      </span>
                    )}
                  </span>
                  {v.stato === "attiva" && (
                    <span className="storia-autore">
                      <form action={consolidaMemoria} style={{ display: "inline-flex", gap: 5 }}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="pill-opt" name="stato" value="consolidata" title="Diventata regola nei documenti canonici">Consolida</button>
                        <button className="pill-opt" name="stato" value="storico" title="Obsoleta: va in Storico">Archivia</button>
                      </form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
