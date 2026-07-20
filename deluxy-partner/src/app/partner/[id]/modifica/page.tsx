import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PartnerForm } from "@/components/PartnerForm";
import { updatePartner } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ModificaPartner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();

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
      <PartnerForm partner={partner} action={action} submitLabel="Salva modifiche" />
    </>
  );
}
