import { prisma } from "@/lib/db";
import { createVendita } from "@/lib/actions";
import { ANNO_CORRENTE } from "@/lib/queries";
import { FeeVendita, type FeePartner } from "@/components/FeeVendita";

export const dynamic = "force-dynamic";

export default async function NuovaVendita({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string; incasso?: string }>;
}) {
  const sp = await searchParams;
  const [partners, tariffe] = await Promise.all([
    prisma.partner.findMany({ where: { attivo: true }, orderBy: { nome: "asc" } }),
    // le decorrenze servono per sapere la fee del MESE scelto, non solo quella base
    prisma.tariffaPartner.findMany({ select: { partnerId: true, dalAnno: true, dalMese: true, feePercent: true } }),
  ]);
  const feePartners: FeePartner[] = partners.map((p) => ({
    id: p.id,
    nome: p.nome,
    feeBase: p.feePercent ?? 0,
    tariffe: tariffe.filter((t) => t.partnerId === p.id),
  }));
  const meseCorrente = new Date().getMonth() + 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuova vendita come vendor</h1>
          <p className="page-caption">
            Vendita fatta da Deluxy per conto del partner. Commissione e dovuto sono calcolati
            automaticamente dalla fee del partner.
          </p>
        </div>
      </div>

      <form id="form-vendita" action={createVendita} className="card">
        <div className="form-grid">
          {/* Partner, mese, anno e fee stanno in un solo componente: la fee da
              applicare dipende da chi e da quando, e va mostrata mentre si
              compila, non scoperta dopo aver salvato. */}
          <FeeVendita
            partners={feePartners}
            partnerIniziale={sp.partnerId}
            incassoIniziale={sp.incasso}
            meseIniziale={meseCorrente}
            annoIniziale={ANNO_CORRENTE}
          />
          <div className="full">
            <label className="field-label">Descrizione</label>
            <input type="text" name="descrizione" placeholder="es. Ordine n. 1234 — bouquet peonie" />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Registra vendita</button>
        </div>
      </form>
    </>
  );
}
