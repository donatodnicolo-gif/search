import { AiBozza } from "@/components/AiBozza";
import { aiConfigurata } from "@/lib/ai";

export const dynamic = "force-dynamic";

// «Chiedi all'AI»: si compila un brief e ne esce una bozza da rileggere. È la
// scorciatoia per chi ha in mente cosa dire ma non ha voglia di partire dal
// foglio bianco; il testo si può sempre scrivere a mano da /script/nuovo.
export default function ChiediAllAi() {
  return (
    <main className="main">
      <a className="ritorno" href="/">← Tutti i testi</a>
      <div className="page-head">
        <div>
          <h1 className="page-title">Chiedi all&apos;AI</h1>
          <p className="page-sub">
            Racconta cosa ti serve: ne esce una bozza con oggetto, testo e le variabili già al posto dei dati che
            cambiano da un invio all&apos;altro. La rileggi, la sistemi, e solo allora diventa un testo
            dell&apos;archivio.
          </p>
        </div>
        <a className="btn btn-secondario" href="/script/nuovo">Scrivilo a mano</a>
      </div>

      <AiBozza accesa={aiConfigurata()} />
    </main>
  );
}
