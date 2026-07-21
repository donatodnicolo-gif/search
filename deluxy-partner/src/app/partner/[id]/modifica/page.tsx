import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
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
        partner={partner}
        action={action}
        submitLabel="Salva modifiche"
        ragioneSocialeRegistro={anagrafica?.ragioneSociale ?? null}
      />

      <div className="card" style={{ padding: 14, margin: "16px 0 4px", background: "var(--bg)" }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          I campi qui sopra sono la <strong>configurazione finanziaria locale</strong> di questo partner (fee,
          crediti/debiti, IBAN per i bonifici, contatto per solleciti). I <strong>dati anagrafici e fiscali</strong>{" "}
          (P.IVA, CF, SDI, PEC, indirizzo…) sono centralizzati nel registro <strong>Anagrafiche</strong> — qui sotto
          li vedi in sola lettura e si modificano lì, così non vengono duplicati fra le app.
        </p>
      </div>
      <AnagraficaCard nomePartner={partner.nome} anagraficaId={partner.anagraficaId} />
    </>
  );
}
