import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TemplateForm } from "@/components/TemplateForm";
import { eliminaTemplate, impostaPredefinito, salvaTemplate } from "@/lib/template-actions";

export const dynamic = "force-dynamic";

export default async function ModificaTemplate({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvato?: string; errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await prisma.templateDocumento.findUnique({
    where: { id },
    include: { _count: { select: { documenti: true } } },
  });
  if (!t) notFound();

  const salva = salvaTemplate.bind(null, id);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/template" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Tutti i template
          </Link>
          <h1 className="page-title">{t.nome}</h1>
          <p className="page-caption">
            {t.brand ? `${t.brand} · ` : ""}
            {t._count.documenti} document{t._count.documenti === 1 ? "o" : "i"} emess{t._count.documenti === 1 ? "o" : "i"} con
            questa intestazione
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {t.predefinito ? (
            <span className="badge green">
              <span className="dot" />
              Predefinito
            </span>
          ) : (
            <form action={impostaPredefinito.bind(null, id)}>
              <button className="btn secondary" type="submit">
                Rendi predefinito
              </button>
            </form>
          )}
        </div>
      </div>

      {sp.salvato && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />
            Template salvato
          </span>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge red">
            <span className="dot" />
            {sp.errore}
          </span>
        </div>
      )}

      <TemplateForm
        iniziale={{
          nome: t.nome,
          brand: t.brand ?? "",
          ragioneSociale: t.ragioneSociale,
          indirizzo: t.indirizzo ?? "",
          piva: t.piva ?? "",
          codiceFiscale: t.codiceFiscale ?? "",
          rea: t.rea ?? "",
          contatti: t.contatti ?? "",
          logoDataUrl: t.logoDataUrl ?? "",
          iban: t.iban ?? "",
          intestatarioConto: t.intestatarioConto ?? "",
          modalitaPagamento: t.modalitaPagamento ?? "",
          noteDefault: t.noteDefault ?? "",
          disclaimer: t.disclaimer ?? "",
          aliquotaIvaDefault: String(t.aliquotaIvaDefault).replace(".", ","),
          attivo: t.attivo,
        }}
        azione={salva}
        testoBottone="Salva le modifiche"
      />

      <div className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Elimina</h2>
        <p className="hint">
          {t._count.documenti > 0 ? (
            <>
              I <strong>{t._count.documenti}</strong> documenti già emessi con questa intestazione{" "}
              <strong>non vengono toccati</strong>: restano dov&apos;erano e tornano a mostrare
              l&apos;intestazione generale delle Impostazioni.
            </>
          ) : (
            <>Nessun documento è stato emesso con questa intestazione.</>
          )}
        </p>
        <form action={eliminaTemplate.bind(null, id)}>
          <button className="btn danger" type="submit">
            Elimina il template
          </button>
        </form>
      </div>
    </>
  );
}
