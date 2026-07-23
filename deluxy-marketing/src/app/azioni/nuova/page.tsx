import { Sidebar } from "@/components/Sidebar";
import { creaAzione } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  CANALI,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_PRIORITA,
  PRIORITA,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function NuovaAzione({
  searchParams,
}: {
  searchParams: Promise<{ analisi?: string; campagna?: string; brand?: string }>;
}) {
  const { analisi: analisiId, campagna: campagnaId, brand } = await searchParams;
  const [analisi, campagne] = await Promise.all([
    analisiId ? prisma.analisi.findUnique({ where: { id: analisiId } }) : null,
    prisma.campagna.findMany({ orderBy: { creataIl: "desc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="layout">
      <Sidebar attiva="azioni" />
      <main className="main">
        <a className="ritorno" href="/azioni">← Azioni</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Nuova azione</h1>
            {analisi && <p className="page-sub">Nasce dall&apos;analisi: {analisi.titolo}</p>}
          </div>
        </div>

        <section className="scheda">
          <form className="modulo" action={creaAzione}>
            {analisi && <input type="hidden" name="analisiId" value={analisi.id} />}
            <div className="campo-modulo largo">
              <label>Titolo <span className="obbligatorio">*</span></label>
              <input name="titolo" required placeholder="Es. Alzare il budget della campagna Brand Flowers del 20%" />
            </div>
            <div className="campo-modulo largo">
              <label>Descrizione</label>
              <textarea name="descrizione" rows={4} placeholder="Cosa va fatto, come, con quali paletti…" />
            </div>
            <div className="campo-modulo">
              <label>Brand</label>
              <select name="brand" defaultValue={brand ?? analisi?.brand ?? "cross"}>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Canale</label>
              <select name="canale" defaultValue={analisi?.canale ?? ""}>
                <option value="">—</option>
                {CANALI.map((c) => (
                  <option key={c} value={c}>{ETICHETTA_CANALE[c]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Priorità</label>
              <select name="priorita" defaultValue="media">
                {PRIORITA.map((p) => (
                  <option key={p} value={p}>{ETICHETTA_PRIORITA[p]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Owner</label>
              <select name="owner" defaultValue="ai">
                <option value="ai">AI (la esegue una sessione Claude)</option>
                <option value="utente">Utente</option>
              </select>
            </div>
            <div className="campo-modulo">
              <label>Scadenza</label>
              <input name="scadenza" type="date" />
            </div>
            <div className="campo-modulo">
              <label>Campagna collegata</label>
              <select name="campagnaId" defaultValue={campagnaId ?? ""}>
                <option value="">—</option>
                {campagne.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Piano su Drive (percorso relativo)</label>
              <input name="fileDrive" placeholder="Flowers/Digital Marketing Flowers/Piani/PIANO DA ESEGUIRE….md" />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <a className="btn btn-secondario" href="/azioni">Annulla</a>
              <button className="btn" type="submit">Crea azione</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
