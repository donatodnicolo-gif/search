import Link from "next/link";
import { euro } from "@/lib/ordini";
import { brandConColore } from "@/lib/brand";
import { conteggiListe, totaliClienti } from "@/lib/clienti";
import { FAMIGLIE, LISTE, SOGLIE } from "@/lib/segmenti";
import { nomeCategoria } from "@/lib/categorie";
import { FiltriTaglio } from "@/components/FiltriTaglio";

export const dynamic = "force-dynamic";

// Il catalogo delle liste: a cosa serve ciascuna, quanti clienti contiene e
// quanto vale. I criteri sono scritti sulla card, non nascosti nel codice: una
// lista che nessuno sa spiegare non la usa nessuno.
//
// Ogni lista si legge anche **spaccata per brand**: sotto il numero grande c'è
// quanti clienti fa ogni negozio. Serve a rispondere alla domanda vera — «i VIP
// sono di Flowers o di deluxy.it?» — senza aprire tre pagine.
export default async function Liste({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const brandScelto = sp.brand?.trim() || undefined;
  const categoriaScelta = sp.categoria?.trim() || undefined;
  const taglio = { brand: brandScelto, categoria: categoriaScelta };

  const brand = await brandConColore();
  // Il totale (col taglio scelto) più uno split per ogni negozio. Le query sono
  // indipendenti: si lanciano insieme, altrimenti si sommano i secondi.
  const [conteggi, totale, ...perBrand] = await Promise.all([
    conteggiListe(taglio),
    totaliClienti(undefined, undefined, taglio),
    ...brand.map((b) => conteggiListe({ brand: b.nome, categoria: categoriaScelta })),
  ]);
  const split = brand.map((b, i) => ({ brand: b, conteggi: perBrand[i] }));

  function conFiltro(chiave: "brand" | "categoria", valore: string): string {
    const p = new URLSearchParams(sp);
    if (valore) p.set(chiave, valore);
    else p.delete(chiave);
    const qs = p.toString();
    return `/liste${qs ? `?${qs}` : ""}`;
  }

  function linkLista(chiave: string): string {
    const p = new URLSearchParams();
    if (brandScelto) p.set("brand", brandScelto);
    if (categoriaScelta) p.set("categoria", categoriaScelta);
    const qs = p.toString();
    return `/liste/${chiave}${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Liste</h1>
          <p className="page-sub">
            I clienti raggruppati come si usano davvero: per valore, per tipologia, per gusti, per
            ricorrenza, per canale di contatto. Ogni lista dice chi ci finisce dentro e cosa farci —
            e si può guardare per singolo brand o per categoria di prodotto.
          </p>
        </div>
        <Link className="btn btn-secondario" href="/clienti">
          Tutti i clienti
        </Link>
      </div>

      <FiltriTaglio
        brand={brand}
        brandScelto={brandScelto}
        categoriaScelta={categoriaScelta}
        href={conFiltro}
      />

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.clienti.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">
            {brandScelto || categoriaScelta ? "Clienti in questo taglio" : "Clienti classificati"}
          </div>
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
                <Link key={l.chiave} href={linkLista(l.chiave)} className="card-lista" style={{ ["--lista" as string]: l.colore }}>
                  <div className="lista-testa">
                    <span className="lista-dot" />
                    <span className="lista-nome">{l.nome}</span>
                  </div>
                  <div className="lista-numeri">
                    <span className="lista-clienti">{n.clienti.toLocaleString("it-IT")}</span>
                    <span className="lista-unita">clienti · {quota}%</span>
                  </div>
                  <div className="lista-valore">{euro(n.speso)} di storico</div>

                  {/* Lo split per brand: dove sta davvero questa lista */}
                  {!brandScelto && split.length > 1 && (
                    <div className="lista-split">
                      {split.map((s) => {
                        const v = s.conteggi.get(l.chiave)?.clienti ?? 0;
                        return (
                          <span key={s.brand.id} className="split-voce" title={`${s.brand.nome}: ${v} clienti`}>
                            <span className="split-dot" style={{ background: s.brand.colore }} />
                            {s.brand.nome} <strong>{v.toLocaleString("it-IT")}</strong>
                          </span>
                        );
                      })}
                    </div>
                  )}

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
            <strong>Brand e categoria non tagliano allo stesso modo, ed è voluto.</strong> Il brand
            taglia gli <em>ordini</em>: «i VIP di Flowers» sono quelli che su Flowers hanno speso da
            VIP, e lo stesso cliente può essere nuovo lì e VIP altrove. La categoria sceglie le{" "}
            <em>persone</em>: «chi compra {nomeCategoria("fiori").toLowerCase()}» resta con tutti i
            suoi numeri interi — se filtrasse gli ordini, «di quante categorie è amante» sarebbe
            sempre una sola.
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
