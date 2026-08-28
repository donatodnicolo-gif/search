import Link from "next/link";
import { notFound } from "next/navigation";
import { ANNO_CORRENTE } from "@/lib/calc";
import { SCHEMA } from "@/lib/bilancio-voci";
import { caricaBilancio } from "@/lib/bilancio";
import { dettaglioVoce } from "@/lib/bilancio-dettaglio";
import { caricaCategorie } from "@/lib/cfo";
import { DettaglioVoce } from "@/components/DettaglioVoce";
import { eur } from "@/lib/format";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";

// Le voci che hanno un dettaglio: quelle dello schema più `ESCLUSA`, che di
// legge non è una voce ma è dove finisce quello che si è deciso di tenere fuori
// dal conto economico — e chi controlla un bilancio ha bisogno di vedere anche
// cosa è stato tolto.
const APRIBILI = [...SCHEMA.filter((v) => v.tipo === "voce").map((v) => v.codice), "ESCLUSA"];

export default async function VoceBilancioPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ anno?: string }>;
}) {
  const { codice: grezzo } = await params;
  const codice = decodeURIComponent(grezzo).toUpperCase();
  if (!APRIBILI.includes(codice)) notFound();

  const sp = await searchParams;
  const ANNI = [ANNO_CORRENTE - 3, ANNO_CORRENTE - 2, ANNO_CORRENTE - 1, ANNO_CORRENTE];
  const anno = ANNI.includes(Number(sp.anno)) ? Number(sp.anno) : ANNO_CORRENTE - 1;

  const [d, categorie, bilancio] = await Promise.all([
    dettaglioVoce(anno, codice),
    caricaCategorie(),
    caricaBilancio(anno),
  ]);
  // Quanto è scritto in bilancio su questa voce: è il metro. La ricostruzione
  // dell'app non deve *coincidere* — sono due contabilità diverse — ma una
  // differenza grande è esattamente quello che si viene a cercare qui.
  const inBilancio = bilancio.find((v) => v.codice === codice)?.importo ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-caption" style={{ margin: 0 }}>
            {/* «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2) */}
            <TornaIndietro fallback={`/conto-economico?anno=${anno}`} label={`Conto economico ${anno}`} />
          </p>
          <h1 className="page-title">{codice === "ESCLUSA" ? "" : `${codice} · `}{d.nome}</h1>
          <p className="page-caption">
            {d.aiuto ??
              (codice === "ESCLUSA"
                ? "Le categorie tenute fuori dal conto economico: partite di giro, giroconti, imposte. Non sono costi, ma vanno guardate — è qui che una partita esclusa per sbaglio sparisce senza lasciare traccia."
                : "Cosa compone questa voce, e dove cambiarne la composizione.")}
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {ANNI.map((y) => (
              <Link key={y} href={`/conto-economico/${codice}?anno=${y}`} className={y === anno ? "on" : ""}>{y}</Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Ricostruito dall&apos;app — {anno}</div>
          <div className="kpi-value">{eur(d.totale)}</div>
          <div className="kpi-sub">
            {d.origine === "banca"
              ? `${d.categorie.length} categorie di banca`
              : d.origine === "ricavi"
                ? "fatturato Finance + quota ecommerce"
                : d.origine === "personale"
                  ? "anagrafica Dipendenti"
                  : "nessuna fonte nell'app"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Scritto in bilancio</div>
          <div className="kpi-value">{inBilancio === null ? "—" : eur(inBilancio)}</div>
          <div className="kpi-sub">{inBilancio === null ? "voce non ancora compilata" : `bilancio ${anno}`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Differenza</div>
          <div className={`kpi-value ${inBilancio === null ? "" : d.totale - inBilancio >= 0 ? "neg" : "pos"}`}>
            {inBilancio === null ? "—" : `${d.totale - inBilancio >= 0 ? "+" : ""}${eur(d.totale - inBilancio)}`}
          </div>
          <div className="kpi-sub">
            {inBilancio === null
              ? "serve il bilancio per confrontare"
              : "le due contabilità misurano cose diverse: una differenza non è un errore, una differenza senza spiegazione sì"}
          </div>
        </div>
      </div>

      <DettaglioVoce d={d} categorie={categorie.map((c) => ({ id: c.id, nome: c.nome }))} />

      <p className="page-caption" style={{ marginTop: 16 }}>
        Le stesse associazioni si vedono tutte insieme nel{" "}
        <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>, categoria per categoria. Qui si parte dal
        numero del bilancio e si scende: è il verso giusto quando una voce non torna col bilancio dell&apos;anno
        prima.
      </p>
    </>
  );
}
