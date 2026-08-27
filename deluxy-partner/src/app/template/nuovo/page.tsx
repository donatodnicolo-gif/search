import Link from "next/link";
import { CAMPI_VUOTI, TemplateForm } from "@/components/TemplateForm";
import { creaTemplate } from "@/lib/template-actions";

export const dynamic = "force-dynamic";

export default async function NuovoTemplate({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/template" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Tutti i template
          </Link>
          <h1 className="page-title">Nuovo template</h1>
          <p className="page-caption">
            L&apos;intestazione con cui usciranno pro-forma e preventivi di questo brand.
          </p>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge red">
            <span className="dot" />
            {sp.errore}
          </span>
        </div>
      )}

      <TemplateForm iniziale={CAMPI_VUOTI} azione={creaTemplate} testoBottone="Crea il template" />
    </>
  );
}
