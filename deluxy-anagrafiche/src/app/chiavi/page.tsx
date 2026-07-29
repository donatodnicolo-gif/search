import { GestioneChiavi, type ChiaveInElenco } from "@/components/GestioneChiavi";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const DATA = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATA_ORA = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Chi può chiamare le API del registro. Le chiavi si creavano solo da terminale
// (`npm run chiave`): qui si aggiungono, si tolgono e si cambia loro tipologia
// senza aprire un terminale — con lo stesso identico effetto sul database.
export default async function PaginaChiavi() {
  const record = await prisma.apiKey.findMany({ orderBy: [{ attiva: "desc" }, { nome: "asc" }] });

  const chiavi: ChiaveInElenco[] = record.map((c) => ({
    id: c.id,
    nome: c.nome,
    prefisso: c.prefisso,
    note: c.note,
    attiva: c.attiva,
    scrittura: c.scrittura,
    scritturaPartner: c.scritturaPartner,
    scritturaReferenti: c.scritturaReferenti,
    scritturaFeedback: c.scritturaFeedback,
    creata: DATA.format(c.creataIl),
    ultimoUso: c.ultimoUso ? DATA_ORA.format(c.ultimoUso) : null,
  }));

  return (
    <div className="layout">
      <Sidebar chiaviAttive />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Chiavi API</h1>
            <p className="page-sub">
              Le app che chiamano il registro si autenticano con una chiave nell&apos;header <code>x-api-key</code>. Ogni
              chiave legge; la tipologia decide che cosa può <strong>scrivere</strong>.
            </p>
          </div>
        </div>

        <GestioneChiavi chiavi={chiavi} />

        <div className="scheda" style={{ marginTop: 24 }}>
          <div className="scheda-titolo">Come si usa una chiave</div>
          <pre className="blocco-codice">
{`curl -H "x-api-key: dlxk_…" \\
  "https://deluxy-anagrafiche.vercel.app/api/v1/partners?q=boutique"`}
          </pre>
          <p className="testo-guida">
            Stesso risultato con <code>Authorization: Bearer …</code>. Dal terminale la chiave si crea anche con{" "}
            <code>npm run chiave -- &lt;nome-app&gt;</code>: è la stessa tabella, cambia solo la porta d&apos;ingresso.
            Le chiavi create da terminale non hanno il prefisso in elenco (non veniva salvato prima d&apos;ora):
            rigenerandole lo prendono.
          </p>
        </div>
      </main>
    </div>
  );
}
