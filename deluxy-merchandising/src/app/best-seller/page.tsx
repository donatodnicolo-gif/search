import Link from "next/link";
import { FreschezzaVenduto } from "@/components/FreschezzaVenduto";
import { Miniatura } from "@/components/Miniatura";
import { Sidebar } from "@/components/Sidebar";
import { brandCorrente } from "@/lib/brand";
import { euro, percentuale } from "@/lib/dominio";
import { dataIt } from "@/lib/fuso";
import { bestSellerPerSito, isPeriodo, PERIODI, type ChiavePeriodo } from "@/lib/vendite";

export const dynamic = "force-dynamic";

// **I più venduti di ogni sito, uno accanto all'altro.**
//
// Affiancati e non sommati, come il Cruscotto: i tre negozi vendono cose
// diverse a persone diverse, e in una classifica unica il best seller di
// cakedesign.me sparirebbe sotto i volumi di deluxy.it. La quota di ogni riga è
// sul venduto del suo sito, per la stessa ragione.
//
// Il periodo si sceglie con le pillole in alto e vive nell'indirizzo: la vista
// si condivide e si mette nei preferiti. Stessa cosa per «pezzi / valore»,
// perché non sono la stessa classifica — chi vende tanti pezzi da 30 € e chi
// vende un pezzo da 3.000 € sono due mestieri diversi, e l'app lo dice altrove.

export default async function BestSellerPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; vista?: string }>;
}) {
  const sp = await searchParams;
  const periodo: ChiavePeriodo = isPeriodo(sp.periodo) ? sp.periodo : "30g";
  const vista = sp.vista === "valore" ? "valore" : "pezzi";

  // L'ambito vale qui come in ogni pagina: in globale i siti sono affiancati,
  // dentro un brand si vede solo quello.
  const brand = await brandCorrente();
  const dati = await bestSellerPerSito({ periodo, vista, canale: brand, quanti: 10 });

  const link = (p: { periodo?: ChiavePeriodo; vista?: "pezzi" | "valore" }) => {
    const q = new URLSearchParams();
    q.set("periodo", p.periodo ?? periodo);
    q.set("vista", p.vista ?? vista);
    return `/best-seller?${q}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="best-seller" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">I più venduti{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              I primi dieci di ogni sito, {vista === "pezzi" ? "per pezzi venduti" : "per fatturato"}.{" "}
              {brand
                ? "Cambia ambito in alto a destra per vedere gli altri siti."
                : "Affiancati e non sommati: ogni negozio ha i suoi clienti, e la quota è sul venduto del suo sito."}{" "}
              Contano solo le vendite andate a buon fine.
            </p>
          </div>
          <Link className="btn btn-secondario" href="/classifiche">
            Classifica completa
          </Link>
        </div>

        <FreschezzaVenduto />

        <div className="filtri" style={{ alignItems: "center" }}>
          <div className="pill-scelta" role="group" aria-label="Periodo">
            {PERIODI.map((p) => (
              <a
                key={p.chiave}
                className={`pill-opt${p.chiave === periodo ? " attuale" : ""}`}
                href={link({ periodo: p.chiave })}
                aria-current={p.chiave === periodo ? "true" : undefined}
              >
                {p.nome}
              </a>
            ))}
          </div>
          <div className="pill-scelta" role="group" aria-label="Ordina per" style={{ marginLeft: "auto" }}>
            <a className={`pill-opt${vista === "pezzi" ? " attuale" : ""}`} href={link({ vista: "pezzi" })}>
              Per pezzi
            </a>
            <a className={`pill-opt${vista === "valore" ? " attuale" : ""}`} href={link({ vista: "valore" })}>
              Per valore
            </a>
          </div>
        </div>

        <p className="page-sub" style={{ marginTop: -4 }}>
          Periodo: <b>{dati.periodo.nome.toLowerCase()}</b>, dal {dataIt(dati.periodo.dal)} al{" "}
          {dataIt(dati.periodo.al)} · in tutto {dati.totale.pezzi} pezzi per {euro(dati.totale.ricavo)}.
        </p>

        {dati.siti.length === 0 ? (
          <div className="vuoto">
            Nessuna vendita a buon fine in questo periodo. Prova con una finestra più larga, oppure aggiorna il
            venduto da <Link href="/vendite">Andamento</Link>.
          </div>
        ) : (
          <div className="griglia-siti">
            {dati.siti.map((s) => (
              <section key={s.canale} className="scheda" style={{ marginBottom: 0 }}>
                <div className="riga-titolo">
                  <div>
                    <div className="scheda-titolo" style={{ margin: 0 }}>{s.canale}</div>
                    <div className="cella-sub">
                      {s.totale.pezzi} pezzi · {euro(s.totale.ricavo)} · {s.totale.articoli} articoli diversi
                    </div>
                  </div>
                </div>

                {s.voci.length === 0 ? (
                  <div className="vuoto-mini">Nessuna vendita in questo periodo.</div>
                ) : (
                  <ol className="classifica-foto">
                    {s.voci.map((v) => (
                      <li
                        key={v.chiave}
                        className={v.prodottoId ? "riga-cliccabile" : undefined}
                        // Il prezzo medio nel titolo del browser: è un dato che
                        // si cerca ogni tanto, e in riga avrebbe mandato a capo
                        // il sottotitolo gonfiando ogni riga della classifica.
                        title={`${v.nome} · ${euro(v.prezzoMedio)} di media a pezzo`}
                      >
                        <span className="posto">{v.posizione}</span>
                        <Miniatura url={v.immagine} lato={44} />
                        <span className="chi">
                          {v.prodottoId ? (
                            <Link href={`/prodotti/${v.prodottoId}`} className="cella-nome link-riga">
                              {v.nome}
                            </Link>
                          ) : (
                            <span className="cella-nome">{v.nome}</span>
                          )}
                          <span className="cella-sub">
                            {/* Quante volte è finito in un ordine: distingue 75 pezzi
                                a un cliente solo da 75 clienti diversi. */}
                            {v.ordini} {v.ordini === 1 ? "ordine" : "ordini"} · {v.dettaglio}
                          </span>
                        </span>
                        <span className="quanto">
                          <b>{vista === "pezzi" ? `${v.pezzi} pz` : euro(v.ricavo)}</b>
                          <span className="cella-sub">
                            {vista === "pezzi" ? euro(v.ricavo) : `${v.pezzi} pz`} · {percentuale(v.quota)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {/* Il taglio si dichiara: «i primi dieci» va detto rispetto a quanti sono. */}
                {s.fuoriClassifica > 0 && (
                  <p className="page-sub" style={{ marginTop: 12, marginBottom: 0 }}>
                    Altri {s.fuoriClassifica} articoli hanno venduto in questo periodo su questo sito.{" "}
                    <Link href={`/classifiche?giorni=90`}>Vedi la classifica completa</Link>.
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
