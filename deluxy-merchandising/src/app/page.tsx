import Link from "next/link";
import { FreschezzaVenduto } from "@/components/FreschezzaVenduto";
import { GraficoAndamento, BarraQuota } from "@/components/Grafico";
import { Sidebar } from "@/components/Sidebar";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { etichettaCategoria, euro, percentuale } from "@/lib/dominio";
import { calcolaIpotesi, PARAMETRI_DEFAULT } from "@/lib/riordino";
import {
  analizzaAssortimento,
  analizzaVendite,
  classifiche,
  coloreDelta,
  delta,
  ETICHETTA_FINESTRA,
  FINESTRE,
  panoramicaBrand,
  type RigaAssortimento,
} from "@/lib/vendite";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

// Il cruscotto: la prima schermata risponde a "come sta andando", non a "che
// cosa c'è in archivio". In Globale mostra i brand affiancati — sommarli in un
// numero solo darebbe una media che non è di nessuno; dentro un brand mostra
// quel mondo lì, con le stesse voci.
export default async function CruscottoPage({
  searchParams,
}: {
  searchParams: Promise<{ giorni?: string }>;
}) {
  const sp = await searchParams;
  const giorni = FINESTRE.includes(Number(sp.giorni) as (typeof FINESTRE)[number])
    ? Number(sp.giorni)
    : 90;
  const brand = await brandCorrente();

  return (
    <div className="layout">
      <Sidebar attiva="cruscotto" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">{brand ? brand : "Cruscotto — tutti i brand"}</h1>
            <p className="page-sub">
              {brand
                ? `Come sta andando ${brand}: venduto, prodotti che tirano e cosa conviene riordinare. Cambia ambito in alto a destra per vedere un altro mondo o tornare al globale.`
                : "La vista d'insieme: ogni brand con i suoi numeri, affiancati e non sommati. Scegli un brand in alto a destra per entrarci dentro — tutte le pagine seguono l'ambito scelto."}
            </p>
          </div>
          <form method="get" className="riga-azione">
            <select name="giorni" defaultValue={String(giorni)} aria-label="Periodo">
              {FINESTRE.map((g) => (
                <option key={g} value={g}>
                  {ETICHETTA_FINESTRA[g]}
                </option>
              ))}
            </select>
            <button className="btn btn-secondario" type="submit">
              Aggiorna
            </button>
          </form>
        </div>

        <FreschezzaVenduto />

        {/* Il guscio (menu, titolo, periodo) esce subito; le analisi — che
            scandagliano il venduto — arrivano in streaming appena pronte.
            Prima la pagina restava bianca finche' non era pronta la piu' lenta. */}
        <Suspense fallback={<ScheletroCruscotto />}>
          <ContenutoCruscotto giorni={giorni} brand={brand} />
        </Suspense>
      </main>
    </div>
  );
}

/** Il posto delle cose mentre arrivano: stessa forma, cosi' non balla il layout. */
function ScheletroCruscotto() {
  return (
    <div className="kpi-riga" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div className="kpi" key={i}>
          <div className="kpi-valore" style={{ color: "var(--text-tertiary)" }}>…</div>
          <div className="kpi-etichetta">calcolo in corso</div>
        </div>
      ))}
    </div>
  );
}

async function ContenutoCruscotto({ giorni, brand }: { giorni: number; brand: string | null }) {
  const [analisi, cls, ipotesi, catalogo, panoramica, assortimento] = await Promise.all([
    analizzaVendite(giorni, { canale: brand }),
    classifiche({ giorni, canale: brand, limite: 5 }),
    calcolaIpotesi({ ...PARAMETRI_DEFAULT, canale: brand }),
    prisma.prodotto.count({ where: { ...filtroProdotti(brand), fase: { not: "archiviato" } } }),
    brand ? null : panoramicaBrand(giorni),
    analizzaAssortimento(giorni, brand),
  ]);

  return (
    <>
        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{euro(cls.totale.ricavo)}</div>
            <div className="kpi-etichetta">Venduto (vendite a buon fine)</div>
            <div className="kpi-delta" style={{ color: coloreDelta(analisi.delta.ricavo) }}>
              {delta(analisi.delta.ricavo)} sul periodo precedente
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{cls.totale.pezzi}</div>
            <div className="kpi-etichetta">Pezzi venduti</div>
            <div className="kpi-sotto">{cls.totale.articoli} articoli diversi</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{catalogo}</div>
            <div className="kpi-etichetta">{brand ? `Prodotti venduti su ${brand}` : "Prodotti a catalogo"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: ipotesi.inRottura ? "var(--red)" : undefined }}>
              {ipotesi.totali.articoli}
            </div>
            <div className="kpi-etichetta">Da riordinare</div>
            <div className="kpi-sotto">{ipotesi.inRottura} sotto il lead time</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: cls.escluso.ricavo > 0 ? "var(--orange)" : undefined }}>
              {euro(cls.escluso.ricavo)}
            </div>
            <div className="kpi-etichetta">Rimborsi e non incassati</div>
            <div className="kpi-sotto">fuori da classifiche e riordini</div>
          </div>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">
            Andamento — {ETICHETTA_FINESTRA[giorni].toLowerCase()}
            {brand ? ` · ${brand}` : " · tutti i brand"}
          </div>
          <GraficoAndamento serie={analisi.serie} passo={analisi.passo} altezza={190} />
        </div>

        {panoramica && panoramica.brand.length > 0 && (
          <>
            <div className="scheda-titolo" style={{ margin: "26px 0 12px" }}>
              I brand, uno per uno
            </div>
            <div className="griglia-brand">
              {panoramica.brand.map((b) => (
                <div className="scheda card-brand" key={b.brand}>
                  <div className="card-brand-testa">
                    <span className="card-brand-nome">{b.brand}</span>
                    <span style={{ color: coloreDelta(b.delta), fontWeight: 600, fontSize: 13 }}>
                      {delta(b.delta)}
                    </span>
                  </div>
                  <div className="card-brand-cifra">{euro(b.ricavo)}</div>
                  <div className="cella-sub">
                    {b.pezzi} pezzi · {b.articoli} articoli · prima {euro(b.ricavoPrec)}
                  </div>
                  <div style={{ margin: "12px 0 10px" }}>
                    <BarraQuota quota={b.quota} />
                  </div>
                  {b.top && (
                    <div className="card-brand-top">
                      <span className="cella-sub">Primo per valore</span>
                      <div>
                        {b.top.prodottoId ? (
                          <Link href={`/prodotti/${b.top.prodottoId}`} className="cella-nome">
                            {b.top.nome}
                          </Link>
                        ) : (
                          <span className="cella-nome">{b.top.nome}</span>
                        )}
                      </div>
                      <span className="cella-sub">
                        {b.top.pezzi} pz · {euro(b.top.ricavo)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="page-sub" style={{ marginTop: 12 }}>
              I numeri dei brand non si sommano in una media: {euro(panoramica.totale.ricavo)} è il totale del
              periodo, ma ogni negozio ha il suo passo. Per entrare in uno, scegli l&apos;ambito in alto a
              destra: da lì <b>tutte</b> le pagine mostrano solo quel brand.
            </p>
          </>
        )}

        {/* Le categorie che pesano di più. Finché quelle interne non sono
            assegnate, accanto si mostrano i tipi scritti sul negozio: sono
            l'unica lettura vera che abbiamo oggi, e dirlo è meglio che
            mostrare un blocco solo chiamato «Da classificare». */}
        <div className="due-colonne" style={{ marginTop: 18 }}>
          <BloccoCategorie
            titolo="Top categorie"
            righe={assortimento.categorie.filter((c) => c.ricavo > 0).slice(0, 6)}
            etichetta={(c) => etichettaCategoria(c.chiave)}
            vuoto="Nessuna vendita nel periodo."
            link="/assortimento"
          />
          <BloccoCategorie
            titolo="Top tipi dal negozio"
            righe={assortimento.tipi.filter((c) => c.ricavo > 0 && c.chiave !== "(senza tipo)").slice(0, 6)}
            etichetta={(c) => c.nome}
            vuoto="Nessun tipo letto da Shopify: lancia l'import delle collezioni."
            link="/anagrafica"
          />
        </div>

        <div className="due-colonne" style={{ marginTop: 18 }}>
          <div className="scheda">
            <div className="scheda-titolo">Primi 5 per valore</div>
            {cls.perValore.length === 0 ? (
              <div className="vuoto-mini">Nessuna vendita nel periodo.</div>
            ) : (
              <ol className="classifica">
                {cls.perValore.map((v, i) => (
                  <li key={v.chiave} className={v.prodottoId ? "riga-cliccabile" : undefined}>
                    <span className={`classifica-pos${i < 3 ? " podio" : ""}`}>{i + 1}</span>
                    <span className="classifica-nome">
                      {v.prodottoId ? (
                        <Link href={`/prodotti/${v.prodottoId}`} className="link-riga">
                          {v.nome}
                        </Link>
                      ) : (
                        v.nome
                      )}
                      <span className="cella-sub">{v.dettaglio}</span>
                    </span>
                    <span className="classifica-valore">
                      {euro(v.ricavo)}
                      <span className="cella-sub">{v.pezzi} pz · {percentuale(v.quotaRicavo)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="page-sub" style={{ marginTop: 12 }}>
              <Link href="/classifiche">Tutte le classifiche →</Link>
            </p>
          </div>

          <div className="scheda">
            <div className="scheda-titolo">Da riordinare per primi</div>
            {ipotesi.righe.filter((r) => r.quantitaSuggerita > 0).length === 0 ? (
              <div className="vuoto-mini">Niente da riordinare con i parametri di default.</div>
            ) : (
              <ul className="lista-secca">
                {ipotesi.righe
                  .filter((r) => r.quantitaSuggerita > 0)
                  .slice(0, 5)
                  .map((r) => (
                    <li key={r.prodottoId} className="riga-cliccabile">
                      <Link href={`/prodotti/${r.prodottoId}`} className="cella-nome link-riga">
                        {r.nome}
                      </Link>
                      <span className="lista-num">{r.quantitaSuggerita} pz</span>
                      <span className="lista-sub">
                        {r.ritmo.toFixed(2)} pz/g · giacenza {r.giacenza}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            <p className="page-sub" style={{ marginTop: 12 }}>
              <Link href="/riordini">Apri le ipotesi di ordinativo →</Link>
            </p>
          </div>
        </div>
    </>
  );
}


// Un blocco «top»: le voci che pesano di più, con quota e variazione. Stessa
// forma per le categorie nostre e per i tipi del negozio, così si confrontano
// a colpo d'occhio.
function BloccoCategorie({
  titolo,
  righe,
  etichetta,
  vuoto,
  link,
}: {
  titolo: string;
  righe: RigaAssortimento[];
  etichetta: (r: RigaAssortimento) => string;
  vuoto: string;
  link: string;
}) {
  return (
    <div className="scheda">
      <div className="scheda-titolo">{titolo}</div>
      {righe.length === 0 ? (
        <div className="vuoto-mini">{vuoto}</div>
      ) : (
        <table>
          <tbody>
            {righe.map((r) => (
              <tr key={r.chiave}>
                <td>
                  <span className="cella-nome">{etichetta(r)}</span>
                  <div className="cella-sub">
                    {r.pezzi} pz · {r.prodottiVenduti} prodotti
                  </div>
                </td>
                <td className="num">{euro(r.ricavo)}</td>
                <td className="num" style={{ color: coloreDelta(r.delta) }}>
                  {delta(r.delta)}
                </td>
                <td style={{ width: 110 }}>
                  <BarraQuota quota={r.quota} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="page-sub" style={{ marginTop: 12 }}>
        <Link href={link}>Apri il dettaglio →</Link>
      </p>
    </div>
  );
}
