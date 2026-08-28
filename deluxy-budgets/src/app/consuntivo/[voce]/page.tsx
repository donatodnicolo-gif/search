import Link from "next/link";
import { notFound } from "next/navigation";
import { risolviPeriodo, etichettaMesi } from "@/lib/periodo";
import { dettaglioConsuntivo, VOCI_CONSUNTIVO } from "@/lib/consuntivo-dettaglio";
import { caricaCategorie } from "@/lib/cfo";
import { DettaglioVoce } from "@/components/DettaglioVoce";
import { eur } from "@/lib/format";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";

export default async function VoceConsuntivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ voce: string }>;
  searchParams: Promise<{ anno?: string; periodo?: string; stato?: string; mese?: string }>;
}) {
  const { voce: grezza } = await params;
  const voce = decodeURIComponent(grezza).toLowerCase();
  if (!VOCI_CONSUNTIVO.some((v) => v.key === voce)) notFound();

  const sp = await searchParams;
  // Lo stesso risolutore della pagina che si sta aprendo: se «YTD» significasse
  // due cose diverse nelle due schermate, il dettaglio non sommerebbe al totale
  // da cui si è arrivati — ed è il modo più veloce per non farsi credere. Vale
  // anche per `?mese=`: arrivando da una casella dello split mensile, qui si
  // vede **quel mese soltanto**.
  const { anno, periodo, mesiPeriodo, dal, al, unMese } = risolviPeriodo(sp);
  const etichetta = mesiPeriodo.length > 0 ? etichettaMesi(dal, al) : periodo.label;
  const stato = sp.stato ?? "tutte";

  const [d, categorie] = await Promise.all([
    dettaglioConsuntivo(anno, mesiPeriodo, voce, etichetta),
    caricaCategorie(),
  ]);

  const indietro = `/consuntivo?periodo=${periodo.key}&stato=${stato}&anno=${anno}`;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-caption" style={{ margin: 0 }}>
            {/* «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2): la history
                riporta a periodo, stato e scroll di prima; l'URL ricostruito
                resta come ripiego per chi arriva da un link diretto. */}
            <TornaIndietro fallback={indietro} label={`Consuntivo ${etichetta} ${anno}`} />
          </p>
          <h1 className="page-title">
            {d.nome}
            {unMese && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {etichetta} {anno}</span>}
          </h1>
          <p className="page-caption">
            Di cosa è fatta questa riga, e dove cambiarne la composizione. Gli importi sono quelli{" "}
            {unMese ? (
              <>
                del <strong>solo mese di {etichetta}</strong>, gli stessi della casella da cui sei arrivato:
                per vedere tutto il periodo togli il mese qui accanto.
              </>
            ) : (
              <>
                dei <strong>mesi del periodo</strong>, gli stessi che sommano al totale da cui sei arrivato.
              </>
            )}
          </p>
        </div>
        <div className="page-actions">
          {/* Il mese si toglie con un gesto solo. I periodi lo tolgono da sé:
              un mese di un trimestre non sta in un altro, e portarselo dietro
              vorrebbe dire mostrare un periodo con dentro il mese sbagliato. */}
          {unMese && (
            <div className="seg">
              <Link href={`/consuntivo/${voce}?periodo=${periodo.key}&stato=${stato}&anno=${anno}`}>
                {etichetta} ✕
              </Link>
            </div>
          )}
          <div className="seg">
            {["ytd", "s1", "s2", "anno"].map((k) => (
              <Link
                key={k}
                href={`/consuntivo/${voce}?periodo=${k}&stato=${stato}&anno=${anno}`}
                className={k === periodo.key && !unMese ? "on" : ""}
              >
                {k === "ytd" ? "YTD" : k === "s1" ? "1° sem" : k === "s2" ? "2° sem" : "Anno"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">{d.nome} — {etichetta} {anno}</div>
          <div className="kpi-value">{eur(d.totale)}</div>
          <div className="kpi-sub">
            {d.origine === "banca"
              ? `${d.categorie.length} categorie di banca`
              : d.origine === "ricavi"
                ? "fatturato Finance + quota ecommerce"
                : d.origine === "personale"
                  ? `${d.righe.length} persone a carico nel periodo`
                  : "nessuna fonte"}
          </div>
        </div>
        {d.origine === "banca" && (
          <div className="kpi">
            <div className="kpi-label">Di cui senza regola</div>
            <div className={`kpi-value ${d.categorie.some((c) => c.residuo > 0) ? "neg" : ""}`}>
              {eur(d.categorie.reduce((s, c) => s + c.residuo, 0))}
            </div>
            <div className="kpi-sub">raccolto dalla categoria predefinita, non classificato</div>
          </div>
        )}
        <div className="kpi">
          <div className="kpi-label">Mesi contati</div>
          <div className="kpi-value">{mesiPeriodo.length}</div>
          <div className="kpi-sub">{etichetta} {anno}</div>
        </div>
      </div>

      <DettaglioVoce
        d={d}
        categorie={categorie.map((c) => ({ id: c.id, nome: c.nome }))}
        dal={mesiPeriodo.length > 0 ? dal : 1}
        al={mesiPeriodo.length > 0 ? al : 12}
      />

      <p className="page-caption" style={{ marginTop: 16 }}>
        Le stesse categorie si vedono tutte insieme nel{" "}
        <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>, e nel{" "}
        <Link href="/conto-economico" style={{ color: "var(--blue)" }}>conto economico</Link> raggruppate per voce
        di bilancio. Qui si parte dalla riga del consuntivo: è il verso giusto quando un costo sembra troppo alto.
      </p>
    </>
  );
}
