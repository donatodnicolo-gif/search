import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { suggerimentiGruppi } from "@/lib/gruppi";
import { PartnerForm } from "@/components/PartnerForm";
import { AnagraficaCard } from "@/components/AnagraficaCard";
import { risolviAnagrafica } from "@/lib/anagrafiche";
import { updatePartner } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ModificaPartner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();

  // Denominazione legale dal registro (fonte di verità): mostrata in sola lettura
  const anagrafica = await risolviAnagrafica(partner.nome, partner.anagraficaId);

  const action = updatePartner.bind(null, id);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/partner/${id}`} className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna alla scheda
          </Link>
          <h1 className="page-title">Modifica partner</h1>
          <p className="page-caption">{partner.nome}</p>
        </div>
        <div className="page-actions">
          <Link href={`/partner/${id}`} className="btn secondary">Annulla</Link>
        </div>
      </div>
      <PartnerForm
        gruppi={await suggerimentiGruppi()}
        partner={partner}
        action={action}
        submitLabel="Salva modifiche"
        anagrafica={anagrafica}
      />

      <div className="card" style={{ padding: 14, margin: "16px 0 4px", background: "var(--bg)" }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          I <strong>dati fiscali</strong> (P.IVA, CF, codice SDI, PEC, indirizzo di fatturazione) si modificano
          da qui, ma <strong>non vengono salvati qui</strong>: al salvataggio finiscono nel registro{" "}
          <strong>Anagrafiche</strong>, che resta la fonte unica — così li vedono anche le altre app e non esistono
          due versioni dello stesso dato. Il resto dei campi (fee, crediti/debiti, contatto per i solleciti) è la
          configurazione finanziaria locale di questo partner. Qui sotto il record del registro com'è adesso.
        </p>
      </div>
      <AnagraficaCard nomePartner={partner.nome} anagraficaId={partner.anagraficaId} partnerId={partner.id} />
    </>
  );
}
