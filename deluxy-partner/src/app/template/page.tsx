// TEMPLATE DEI DOCUMENTI — l'elenco.
//
// Uno per brand: è l'intestazione con cui esce la pro-forma (logo, dati
// societari, coordinate di pagamento, testo di legge). Senza template il
// documento usa l'intestazione generale delle Impostazioni, come ha sempre
// fatto: qui non si rompe niente a chi non li usa.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CHIAVI, leggiImpostazioni } from "@/lib/impostazioni";
import { impostaPredefinito } from "@/lib/template-actions";

export const dynamic = "force-dynamic";

export default async function TemplateElenco({
  searchParams,
}: {
  searchParams: Promise<{ eliminato?: string }>;
}) {
  const sp = await searchParams;
  const [templates, imp] = await Promise.all([
    prisma.templateDocumento.findMany({
      orderBy: [{ predefinito: "desc" }, { nome: "asc" }],
      include: { _count: { select: { documenti: true } } },
    }),
    leggiImpostazioni(),
  ]);
  const generale = imp[CHIAVI.aziendaIntestazione] || "Deluxy";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Template dei documenti</h1>
          <p className="page-caption">
            L&apos;intestazione con cui escono pro-forma e preventivi: uno per brand, con logo e dati
            societari.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/template/nuovo" className="btn primary">
            Nuovo template
          </Link>
        </div>
      </div>

      {sp.eliminato && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />
            Template eliminato — i documenti già emessi restano, con l&apos;intestazione generale
          </span>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="card" style={{ padding: 22 }}>
          <p style={{ marginTop: 0 }}>
            Non c&apos;è ancora nessun template. Oggi i documenti escono con l&apos;intestazione generale
            <strong> «{generale}» </strong>
            scritta in <Link href="/impostazioni">Impostazioni</Link>, senza logo.
          </p>
          <p className="hint" style={{ marginBottom: 16 }}>
            Facendone uno per brand, ogni pro-forma esce con il logo e i dati societari giusti — e chi la
            riceve riconosce il mittente.
          </p>
          <Link href="/template/nuovo" className="btn primary">
            Fai il primo template
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="tabella">
            <thead>
              <tr>
                <th>Template</th>
                <th>Brand</th>
                <th>Chi emette</th>
                <th className="num">Documenti</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/template/${t.id}`} className="link-forte">
                      {t.nome}
                    </Link>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {t.predefinito && (
                        <span className="badge green">
                          <span className="dot" />
                          Predefinito
                        </span>
                      )}
                      {!t.attivo && (
                        <span className="badge grey">
                          <span className="dot" />
                          Non attivo
                        </span>
                      )}
                      {t.logoDataUrl && <span className="badge grey">con logo</span>}
                    </div>
                  </td>
                  <td>{t.brand ?? "—"}</td>
                  <td>
                    <div>{t.ragioneSociale}</div>
                    {t.piva && <div className="sub">P. IVA {t.piva}</div>}
                  </td>
                  <td className="num">{t._count.documenti}</td>
                  <td className="num">
                    {!t.predefinito && t.attivo && (
                      <form action={impostaPredefinito.bind(null, t.id)} style={{ display: "inline" }}>
                        <button
                          className="btn secondary small"
                          type="submit"
                          title="Sarà l'intestazione usata quando nessuno dice quale"
                        >
                          Rendi predefinito
                        </button>
                      </form>
                    )}
                    <Link href={`/template/${t.id}`} className="btn secondary small" style={{ marginLeft: 8 }}>
                      Apri
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Cosa deve avere una pro-forma</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          La pro-forma non ha vincoli formali — non è un documento fiscale — ma la prassi è compilarla
          come se fosse una fattura vera. Il template copre le parti che non cambiano da un documento
          all&apos;altro:
        </p>
        <ul className="hint" style={{ marginBottom: 0 }}>
          <li>
            <strong>la dicitura «fattura pro-forma»</strong> ben visibile e una numerazione indipendente da
            quella fiscale — le mette il documento (PF n/anno);
          </li>
          <li>
            <strong>chi emette</strong>: denominazione, indirizzo, partita IVA o codice fiscale, eventuale
            REA — e il logo, che non è obbligatorio ma è quello che fa riconoscere il mittente;
          </li>
          <li>
            <strong>chi riceve</strong>: ragione sociale, indirizzo, partita IVA o codice fiscale — vengono
            dall&apos;anagrafica del cliente;
          </li>
          <li>
            <strong>come si paga</strong>: modalità e IBAN;
          </li>
          <li>
            <strong>la formula di legge in calce</strong>, quella che dice che il documento non costituisce
            fattura: senza, il cliente potrebbe registrarla in contabilità.
          </li>
        </ul>
      </div>
    </>
  );
}
