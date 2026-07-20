import Link from "next/link";
import { LettoreBonifico } from "@/components/LettoreBonifico";

export const dynamic = "force-dynamic";

export default function NuovoPagamentoDiretto() {
  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/pagamenti" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna ai pagamenti
          </Link>
          <h1 className="page-title">Nuovo pagamento diretto</h1>
          <p className="page-caption">
            Carica una foto dei dati bancari del fornitore: l&apos;AI li legge, tu verifichi e predisponi il bonifico.
          </p>
        </div>
      </div>

      <LettoreBonifico />
    </>
  );
}
