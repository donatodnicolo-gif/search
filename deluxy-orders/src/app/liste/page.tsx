import Link from "next/link";
import { euro } from "@/lib/ordini";
import { conteggiListe, totaliClienti } from "@/lib/clienti";
import { FAMIGLIE, LISTE, SOGLIE } from "@/lib/segmenti";

export const dynamic = "force-dynamic";

// Il catalogo delle liste: a cosa serve ciascuna, quanti clienti contiene e
// quanto vale. I criteri sono scritti sulla card, non nascosti nel codice: una
// lista che nessuno sa spiegare non la usa nessuno.
export default async function Liste() {
  const [conteggi, totale] = await Promise.all([conteggiListe(), totaliClienti()]);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Liste</h1>
          <p className="page-sub">
            I clienti raggruppati come si usano davvero: per valore, per tipologia, per ricorrenza,
            per canale di contatto. Ogni lista dice chi ci finisce dentro e cosa farci.
          </p>
        </div>
        <Link className="btn btn-secondario" href="/clienti">
          Tutti i clienti
        </Link>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.clienti.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Clienti classificati</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(totale.speso)}</div>
          <div className="kpi-etichetta">Valore complessivo</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{LISTE.length}</div>
          <div className="kpi-etichetta">Liste disponibili</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">
            {euro(totale.clienti ? totale.speso / totale.clienti : 0)}
          </div>
          <div className="kpi-etichetta">Valore medio per cliente</div>
        </div>
      </div>

      {FAMIGLIE.map((f) => (
        <section key={f.chiave} className="famiglia">
          <div className="famiglia-testa">
            <h2 className="famiglia-nome">{f.nome}</h2>
            <p className="famiglia-sotto">{f.sotto}</p>
          </div>
          <div className="griglia-liste">
            {LISTE.filter((l) => l.famiglia === f.chiave).map((l) => {
              const n = conteggi.get(l.chiave) ?? { clienti: 0, speso: 0 };
              const quota = totale.clienti ? Math.round((n.clienti / totale.clienti) * 100) : 0;
              return (
                <Link key={l.chiave} href={`/liste/${l.chiave}`} className="card-lista" style={{ ["--lista" as string]: l.colore }}>
                  <div className="lista-testa">
                    <span className="lista-dot" />
                    <span className="lista-nome">{l.nome}</span>
                  </div>
                  <div className="lista-numeri">
                    <span className="lista-clienti">{n.clienti.toLocaleString("it-IT")}</span>
                    <span className="lista-unita">clienti · {quota}%</span>
                  </div>
                  <div className="lista-valore">{euro(n.speso)} di storico</div>
                  <p className="lista-criterio">{l.criterio}</p>
                  <p className="lista-consiglio">{l.consiglio}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <div className="scheda">
        <div className="scheda-titolo">Come sono fatte queste liste</div>
        <div className="testo-guida">
          <p>
            Tutto si calcola dagli ordini, in tempo reale: non c&apos;è nessuna lista salvata che
            possa invecchiare. I numeri <strong>escludono gli ordini annullati</strong> (come le API):
            un annullato resta spesso «pagato» e conterebbe come fatturato.
            Chi ha <em>solo</em> ordini annullati non compare: non ha mai comprato.
          </p>
          <p>
            Le soglie: VIP da <code className="inline">{SOGLIE.vipSpesa} EUR</code> di spesa o{" "}
            <code className="inline">{SOGLIE.vipOrdini}</code> ordini · fedele da{" "}
            <code className="inline">{SOGLIE.fedeleOrdini}</code> ordini · attivo entro{" "}
            <code className="inline">{SOGLIE.giorniAttivo}</code> giorni · perso oltre{" "}
            <code className="inline">{SOGLIE.giorniDormiente}</code>. Sono tarate sui dati reali del
            registro (mediana di spesa 110 EUR, 90° percentile dell&apos;ordine medio 265 EUR) e si
            cambiano in un punto solo: <code className="inline">src/lib/segmenti.ts</code>.
          </p>
          <p>
            La <strong>tipologia</strong> si deduce dal nome di chi ordina, mai dal destinatario (nei
            fiori il destinatario è quasi sempre un&apos;altra persona) e solo con parole che non
            sono anche cognomi. Quando un operatore la imposta a mano, la mano vince e la deduzione
            non la tocca più.
          </p>
        </div>
      </div>
    </main>
  );
}
