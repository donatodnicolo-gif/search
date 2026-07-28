import Link from "next/link";
import { CHIAVI_NOTE, origineChiavi } from "@/lib/chiavi";
import { cifraturaConfigurata, segretoInUso } from "@/lib/crypto";
import { ChiaviEditor } from "@/components/ChiaviEditor";

export const dynamic = "force-dynamic";

export default async function ChiaviPage() {
  const origini = await origineChiavi();
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
            Le chiavi con cui l&apos;app parla con i servizi esterni. Si incollano qui e finiscono nel database{" "}
            <strong>cifrate</strong> (AES-256-GCM): non tornano mai indietro per intero, si vede solo un pezzo
            per riconoscerle.
          </p>
        </div>
      </div>

      <ChiaviEditor righe={righe} cifraturaOk={cifraturaConfigurata()} segreto={segretoInUso()} />

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
