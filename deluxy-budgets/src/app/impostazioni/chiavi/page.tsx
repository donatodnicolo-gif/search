import Link from "next/link";
import { CHIAVI_NOTE, origineChiavi } from "@/lib/chiavi";
import { cifraturaConfigurata, segretoInUso } from "@/lib/crypto";
import { ChiaviEditor } from "@/components/ChiaviEditor";
import { ChiaviEmesseEditor } from "@/components/ChiaviEmesseEditor";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ChiaviPage() {
  const origini = await origineChiavi();
  // Le chiavi **emesse** da questa app. Si legge qui e non via fetch: la pagina
  // è già dietro la sessione, e un giro in più sulla rete per un dato che sta
  // nel database di fianco non serve a nessuno.
  const emesse = await prisma.chiaveEmessa.findMany({
    orderBy: [{ revocata: "asc" }, { creata: "desc" }],
  });
  const righe = CHIAVI_NOTE.map((c) => {
    const o = origini.find((x) => x.nome === c.nome);
    return { ...c, origine: o?.origine ?? "assente", anteprima: o?.anteprima ?? null };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Chiavi</h1>
          <p className="page-caption">
            ⚠️ In questa pagina ci sono <strong>due elenchi che vanno in direzioni opposte</strong>, ed è
            facile scambiarli: sopra le chiavi con cui <strong>Budgets chiama gli altri</strong>, sotto quelle
            con cui <strong>gli altri chiamano Budgets</strong>.
          </p>
        </div>
      </div>

      <h2 className="section-title">Chiavi con cui questa app chiama gli altri</h2>
      <p className="page-caption" style={{ marginTop: 0 }}>
        Si incollano qui e finiscono nel database <strong>cifrate</strong> (AES-256-GCM): non tornano mai
        indietro per intero, si vede solo un pezzo per riconoscerle.
      </p>
      <ChiaviEditor righe={righe} cifraturaOk={cifraturaConfigurata()} segreto={segretoInUso()} />

      <ChiaviEmesseEditor
        chiavi={emesse.map((c) => ({
          id: c.id,
          nome: c.nome,
          prefisso: c.prefisso,
          scope: c.scope,
          creata: c.creata.toISOString(),
          ultimoUso: c.ultimoUso?.toISOString() ?? null,
          revocata: c.revocata?.toISOString() ?? null,
          note: c.note,
        }))}
      />

      <p className="page-caption" style={{ marginTop: 14 }}>
        Una chiave può arrivare da tre posti e vale <strong>la prima che si trova</strong>: la{" "}
        <strong>variabile d&apos;ambiente</strong> dell&apos;app (è quella che si cambia in emergenza senza
        entrare qui), poi quella <strong>impostata qui</strong>, infine la{" "}
        <strong>cassaforte del Hub</strong>, che è la fonte condivisa fra le app. Se una chiave risulta
        «variabile d&apos;ambiente», scriverla qui non cambia niente finché quella variabile esiste: il badge
        dice sempre chi sta vincendo.
      </p>
      <p className="page-caption">
        Torna a <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Scenari, premi e costi</Link>.
      </p>
    </>
  );
}
