import Link from "next/link";
import { FormFiltri } from "@/components/FormFiltri";
import { BarraQuota } from "@/components/Grafico";
import { Sidebar } from "@/components/Sidebar";
import { brandCorrente } from "@/lib/brand";
import { euro, percentuale } from "@/lib/dominio";
import {
  classifiche,
  ETICHETTA_FINESTRA,
  ETICHETTA_PAGAMENTO,
  FINESTRE,
  type VoceClassifica,
} from "@/lib/vendite";

export const dynamic = "force-dynamic";

export default async function ClassifichePage({
  searchParams,
}: {
  searchParams: Promise<{ giorni?: string; vista?: string; tutte?: string }>;
}) {
  const sp = await searchParams;
  // Il brand è l'ambito dell'app (barra in alto), non un filtro di questa pagina.
  const brand = await brandCorrente();
  const giorni = FINESTRE.includes(Number(sp.giorni) as (typeof FINESTRE)[number])
    ? Number(sp.giorni)
    : 90;
  const vista = sp.vista === "varianti" ? "varianti" : "prodotti";
  const soloBuonFine = sp.tutte !== "1";

  const c = await classifiche({ giorni, canale: brand, vista, soloBuonFine, limite: 25 });
  const titoloBrand = c.canale ?? "tutti i brand";

  return (
    <div className="layout">
      <Sidebar attiva="classifiche" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Classifiche{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Che cosa vende di più, {titoloBrand}: gli stessi articoli messi in fila <b>per quantità</b> e{" "}
              <b>per valore</b>. Le due graduatorie raramente coincidono, ed è lì che si vedono le cose
              interessanti.
            </p>
          </div>
        </div>

        <FormFiltri>
          <select name="giorni" defaultValue={String(giorni)} aria-label="Periodo">
            {FINESTRE.map((g) => (
              <option key={g} value={g}>
                {ETICHETTA_FINESTRA[g]}
              </option>
            ))}
          </select>
          <select name="vista" defaultValue={vista} aria-label="Vista">
            <option value="prodotti">Per prodotto</option>
            <option value="varianti">Per variante (taglia/formato)</option>
          </select>
          <select name="tutte" defaultValue={soloBuonFine ? "" : "1"} aria-label="Vendite contate">
            <option value="">Solo vendite andate a buon fine</option>
            <option value="1">Tutto il venduto, rimborsi inclusi</option>
          </select>
        </FormFiltri>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{c.totale.pezzi}</div>
            <div className="kpi-etichetta">Pezzi venduti</div>
            <div className="kpi-sotto">{ETICHETTA_FINESTRA[giorni].toLowerCase()}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(c.totale.ricavo)}</div>
            <div className="kpi-etichetta">Valore</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{c.totale.articoli}</div>
            <div className="kpi-etichetta">{vista === "varianti" ? "Varianti vendute" : "Prodotti venduti"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: c.escluso.ricavo > 0 ? "var(--orange)" : undefined }}>
              {euro(c.escluso.ricavo)}
            </div>
            <div className="kpi-etichetta">
              {soloBuonFine ? "Escluso: non è vendita" : "Nel totale, ma non è vendita"}
            </div>
            <div className="kpi-sotto">{c.escluso.righe} righe</div>
          </div>
        </div>

        <div className="nota-info">
          <span className="nota-icona">◆</span>
          <span>
            {soloBuonFine ? (
              <>
                In classifica entrano <b>solo le vendite andate a buon fine</b>: ordini <b>pagati e non
                rimborsati</b>. Restano fuori{" "}
                {c.escluso.perStato.map((s, i) => (
                  <span key={s.stato}>
                    {i > 0 ? " · " : ""}
                    {ETICHETTA_PAGAMENTO[s.stato] ?? s.stato} {euro(s.ricavo)} ({s.righe} righe)
                  </span>
                ))}
                {c.escluso.perStato.length === 0 && "nessuna riga"}. Gli ordini <b>annullati</b> non arrivano
                nemmeno: il registro Orders non li espone. Degli ordini <b>rimborsati in parte</b> non si sa
                quale riga sia stata resa, quindi restano fuori tutti: meglio perdere una riga buona che
                premiare un prodotto che genera resi.{" "}
                <Link href={link(sp, "tutte", "1")}>Mostra tutto il venduto</Link>.
                <br />
                Se in classifica compare qualcosa che <b>prodotto non è</b> — righe di servizio dei negozi tipo
                supplementi di prezzo, che fanno migliaia di pezzi e pochi euro — mettilo in fase{" "}
                <b>Archiviato</b> dalla sua scheda: gli archiviati non entrano in classifica. Non vengono
                riconosciuti dal nome, perché sarebbe indovinare.
              </>
            ) : (
              <>
                Stai vedendo <b>tutto il venduto</b>, rimborsi e ordini non incassati inclusi ({euro(c.escluso.ricavo)}):
                la classifica non dice più che cosa ha davvero portato soldi.{" "}
                <Link href={link(sp, "tutte", null)}>Torna alle sole vendite a buon fine</Link>.
              </>
            )}
          </span>
        </div>

        {c.totale.righe === 0 ? (
          <div className="vuoto">
            Nessuna vendita a buon fine nel periodo scelto{c.canale ? ` per ${c.canale}` : ""}.
          </div>
        ) : (
          <>
            <div className="griglia-classifiche">
              <Tabellone
                titolo="Per quantità"
                sottotitolo="quanti pezzi escono dal magazzino"
                voci={c.perQuantita}
                mostraBrand={!c.canale}
                metrica="pezzi"
              />
              <Tabellone
                titolo="Per valore"
                sottotitolo="quanti soldi porta a casa"
                voci={c.perValore}
                mostraBrand={!c.canale}
                metrica="valore"
              />
            </div>

            <div className="scheda">
              <div className="scheda-titolo">Le due classifiche a confronto</div>
              <p className="page-sub" style={{ marginBottom: 14 }}>
                Chi sale molto passando dai pezzi al valore è un prodotto caro che vende poco ma pesa; chi
                scende è un prodotto di volume a basso scontrino. Sono due mestieri diversi.
              </p>
              <div className="tabella-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>{vista === "varianti" ? "Variante" : "Prodotto"}</th>
                      <th className="num">Pezzi</th>
                      <th className="num">Valore</th>
                      <th className="num">Prezzo medio</th>
                      <th>Quota sul valore</th>
                      <th className="num">Posizione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.perValore.map((v) => {
                      const salto = v.posQuantita - v.posValore;
                      return (
                        <tr key={v.chiave} className={v.prodottoId ? "riga-cliccabile" : undefined}>
                          <td className="num cella-muta">{v.posValore}</td>
                          <td>
                            {v.prodottoId ? (
                              <Link href={`/prodotti/${v.prodottoId}`} className="cella-nome link-riga">
                                {v.nome}
                              </Link>
                            ) : (
                              <span className="cella-nome">{v.nome}</span>
                            )}
                            <div className="cella-sub">
                              {v.dettaglio}
                              {!c.canale && v.canali.length > 0 ? ` · ${v.canali.join(", ")}` : ""}
                            </div>
                          </td>
                          <td className="num">{v.pezzi}</td>
                          <td className="num">{euro(v.ricavo)}</td>
                          <td className="num">{euro(v.prezzoMedio)}</td>
                          <td style={{ width: 130 }}>
                            <BarraQuota quota={v.quotaRicavo} />
                          </td>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>
                            <span className="cella-muta">{v.posQuantita}° a pezzi</span>{" "}
                            {salto !== 0 && (
                              <b style={{ color: salto > 0 ? "var(--green)" : "var(--orange)" }}>
                                {salto > 0 ? `+${salto}` : salto}
                              </b>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// Link che conserva i filtri correnti cambiando una sola chiave.
function link(sp: Record<string, string | undefined>, chiave: string, valore: string | null): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) q.set(k, v);
  if (valore == null) q.delete(chiave);
  else q.set(chiave, valore);
  const s = q.toString();
  return s ? `/classifiche?${s}` : "/classifiche";
}

function Tabellone({
  titolo,
  sottotitolo,
  voci,
  mostraBrand,
  metrica,
}: {
  titolo: string;
  sottotitolo: string;
  voci: VoceClassifica[];
  mostraBrand: boolean;
  metrica: "pezzi" | "valore";
}) {
  return (
    <div className="scheda">
      <div className="scheda-titolo">
        {titolo} — {sottotitolo}
      </div>
      <ol className="classifica">
        {voci.map((v, i) => (
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
              <span className="cella-sub">
                {v.dettaglio}
                {mostraBrand && v.canali.length > 0 ? ` · ${v.canali.join(", ")}` : ""}
              </span>
            </span>
            <span className="classifica-valore">
              {metrica === "pezzi" ? `${v.pezzi} pz` : euro(v.ricavo)}
              <span className="cella-sub">
                {metrica === "pezzi"
                  ? `${euro(v.ricavo)} · ${percentuale(v.quotaPezzi)} dei pezzi`
                  : `${v.pezzi} pz · ${percentuale(v.quotaRicavo)} del valore`}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {voci.length === 0 && <div className="vuoto-mini">Nessuna vendita nel periodo.</div>}
    </div>
  );
}
