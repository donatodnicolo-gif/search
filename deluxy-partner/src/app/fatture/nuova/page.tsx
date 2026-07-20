import { prisma } from "@/lib/db";
import { createFattura } from "@/lib/actions";
import { ANNO_CORRENTE } from "@/lib/queries";
import { MESI } from "@/lib/calc";

export const dynamic = "force-dynamic";

// Form di inserimento "Servizi a fatturazione".
// La tipologia è obbligatoria e riprende le aree del foglio "Piano Per Area".
export default async function NuovaFattura({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  const sp = await searchParams;
  const [partners, tipologie] = await Promise.all([
    prisma.partner.findMany({ where: { attivo: true }, orderBy: { nome: "asc" } }),
    prisma.tipologiaServizio.findMany({ orderBy: { ordine: "asc" } }),
  ]);
  const meseCorrente = new Date().getMonth() + 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuova fattura servizi</h1>
          <p className="page-caption">
            Servizio svolto da Deluxy per il partner, da fatturare a credito.
          </p>
        </div>
      </div>

      <form action={createFattura} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Partner <span className="req">*</span></label>
            <select name="partnerId" required defaultValue={sp.partnerId ?? ""}>
              <option value="" disabled>Seleziona partner…</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Tipologia (Piano per Area) <span className="req">*</span></label>
            <select name="tipologiaId" required defaultValue="">
              <option value="" disabled>Seleziona tipologia…</option>
              {tipologie.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Mese di competenza <span className="req">*</span></label>
            <select name="mese" required defaultValue={meseCorrente}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Anno <span className="req">*</span></label>
            <input type="number" name="anno" required defaultValue={ANNO_CORRENTE} step="1" />
          </div>
          <div>
            <label className="field-label">Imponibile € (netto IVA) <span className="req">*</span></label>
            <input type="number" name="imponibile" required step="0.01" min="0" placeholder="0,00" />
          </div>
          <div>
            <label className="field-label">Aliquota IVA %</label>
            <input type="number" name="aliquotaIva" step="1" min="0" defaultValue={22} />
          </div>
          <div>
            <label className="field-label">N° fattura (FattureInCloud)</label>
            <input type="text" name="numero" placeholder="es. 68/2026" />
          </div>
          <div>
            <label className="field-label">Data emissione</label>
            <input type="date" name="emissione" />
          </div>
          <div>
            <label className="field-label">Scadenza (vuota = automatica da GG pagamento)</label>
            <input type="date" name="scadenza" />
          </div>
          <div className="full">
            <label className="field-label">Descrizione</label>
            <input type="text" name="descrizione" placeholder="es. Consegne guanti bianchi settimana 12" />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Registra fattura</button>
        </div>
      </form>
    </>
  );
}
