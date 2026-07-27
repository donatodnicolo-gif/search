import Link from "next/link";
import { euro } from "@/lib/ordini";
import { brandConColore } from "@/lib/brand";
import { nomeCategoria } from "@/lib/categorie";
import {
  GRANULARITA,
  type Granularita,
  finePeriodo,
  giorniTrascorsi,
  inizioPeriodo,
  chiaveGiorno,
  kpi,
  metriche,
  nomePeriodo,
  perCategoria,
  serie,
  variazione,
} from "@/lib/analisi";

export const dynamic = "force-dynamic";

const QUANTI_NELLA_SERIE: Record<Granularita, number> = { settimana: 12, mese: 13, anno: 5 };

function numero(n: number, decimali = 0): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

function percento(n: number, decimali = 1): string {
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali })}%`;
}

// La variazione accanto a ogni numero. Il verso «buono» non è sempre l'alto:
// per rimborsi e annullamenti crescere è una cattiva notizia, e il colore deve
// dirlo, altrimenti si legge un aumento dei resi come un successo.
function Delta({ ora, prima, alContrario = false }: { ora: number; prima: number; alContrario?: boolean }) {
  const v = variazione(ora, prima);
  if (v === null) {
    return <span className="delta delta-nuovo" title="Prima era zero: una variazione percentuale non direbbe niente">nuovo</span>;
  }
  const fermo = Math.abs(v) < 0.05;
  const bene = alContrario ? v < 0 : v > 0;
  return (
    <span className={`delta${fermo ? " delta-fermo" : bene ? " delta-su" : " delta-giu"}`}>
      {fermo ? "=" : v > 0 ? "▲" : "▼"} {percento(Math.abs(v))}
    </span>
  );
}

export default async function Analisi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const gran = (GRANULARITA.find((g) => g.chiave === sp.gran)?.chiave ?? "mese") as Granularita;
  const brand = sp.brand?.trim() || null;
  const confrontoCon = sp.confronto === "anno" ? "anno" : "precedente";

  const adesso = new Date();
  // Di quale periodo si parla: quello in corso, o uno indietro con `salto`.
  const salto = -Math.max(0, Number(sp.salto ?? "0") || 0);
  const inizio = inizioPeriodo(adesso, gran, salto);
  const fine = finePeriodo(inizio, gran);
  const inCorso = fine > adesso;

  // Il periodo con cui confrontare: quello prima, oppure lo stesso dell'anno
  // scorso (per un mese sono 12 mesi indietro, per una settimana 52).
  const passiIndietro = confrontoCon === "anno" ? (gran === "settimana" ? -52 : gran === "mese" ? -12 : -1) : -1;
  const inizioPrima = inizioPeriodo(inizio, gran, passiIndietro);
  const finePrima = finePeriodo(inizioPrima, gran);

  // A PARITÀ DI GIORNI: se il periodo è in corso, il confronto si ferma allo
  // stesso giorno. Senza, ogni mese sembra un disastro fino al 28.
  const giorni = inCorso ? giorniTrascorsi(inizio, adesso) : null;
  const fineOra = inCorso ? adesso : fine;
  const fineConfronto = giorni
    ? new Date(Math.min(inizioPrima.getTime() + giorni * 86_400_000, finePrima.getTime()))
    : finePrima;

  const [negozi, ora, prima, catOra, catPrima, storico] = await Promise.all([
    brandConColore(),
    metriche(inizio, fineOra, brand),
    metriche(inizioPrima, fineConfronto, brand),
    perCategoria(inizio, fineOra, brand),
    perCategoria(inizioPrima, fineConfronto, brand),
    serie(gran, QUANTI_NELLA_SERIE[gran], brand, adesso),
  ]);

  const k = kpi(ora);
  const kPrima = kpi(prima);
  const catPrimaMappa = new Map(catPrima.map((c) => [c.categoria, c]));
  const lordoCategorie = catOra.reduce((s, c) => s + c.lordo, 0);

  function link(extra: Record<string, string>): string {
    const q = new URLSearchParams(sp);
    for (const [chiave, valore] of Object.entries(extra)) {
      if (valore) q.set(chiave, valore);
      else q.delete(chiave);
    }
    const s = q.toString();
    return `/analisi${s ? `?${s}` : ""}`;
  }

  const schede: {
    etichetta: string;
    valore: string;
    ora: number;
    prima: number;
    alContrario?: boolean;
    spiega: string;
  }[] = [
    {
      etichetta: "Venduto",
      valore: euro(k.lordo),
      ora: k.lordo,
      prima: kPrima.lordo,
      spiega: "Totale Shopify degli ordini validi: IVA e spedizione incluse.",
    },
    {
      etichetta: "Ordini",
      valore: numero(k.ordini),
      ora: k.ordini,
      prima: kPrima.ordini,
      spiega: "Ordini validi: annullati e rimborsati per intero esclusi.",
    },
    {
      etichetta: "Scontrino medio",
      valore: euro(k.scontrinoMedio),
      ora: k.scontrinoMedio,
      prima: kPrima.scontrinoMedio,
      spiega: "Venduto diviso ordini. È anche «l'ordine medio»: qui sono lo stesso numero.",
    },
    {
      etichetta: "Pezzi per ordine (UPT)",
      valore: numero(k.upt, 2),
      ora: k.upt,
      prima: kPrima.upt,
      spiega: "Quanti articoli entrano in un ordine. Scontrino medio = UPT × prezzo medio.",
    },
    {
      etichetta: "Prezzo medio a pezzo",
      valore: euro(k.prezzoMedio),
      ora: k.prezzoMedio,
      prima: kPrima.prezzoMedio,
      spiega: "Venduto diviso pezzi. Dice se stiamo vendendo le stesse cose a meno.",
    },
    {
      etichetta: "Pezzi venduti",
      valore: numero(k.pezzi),
      ora: k.pezzi,
      prima: kPrima.pezzi,
      spiega: "Somma delle quantità nelle righe d'ordine.",
    },
    {
      etichetta: "Clienti",
      valore: numero(k.clienti),
      ora: k.clienti,
      prima: kPrima.clienti,
      spiega: "Persone diverse che hanno ordinato (email → telefono → nome).",
    },
    {
      etichetta: "Ordini da clienti nuovi",
      valore: percento(k.quotaPrimi),
      ora: k.quotaPrimi,
      prima: kPrima.quotaPrimi,
      spiega: "Quota di ordini fatti da chi non aveva mai comprato prima.",
    },
    {
      etichetta: "Annullati",
      valore: percento(k.quotaAnnullati),
      ora: k.quotaAnnullati,
      prima: kPrima.quotaAnnullati,
      alContrario: true,
      spiega: "Quota di ordini annullati sul totale di quelli emessi.",
    },
    {
      etichetta: "Rimborsati",
      valore: percento(k.quotaRimborsati),
      ora: k.quotaRimborsati,
      prima: kPrima.quotaRimborsati,
      alContrario: true,
      spiega: "Quota di venduto tornata indietro per intero (rimborsi e storni).",
    },
  ];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Analisi</h1>
          <p className="page-sub">
            Come stanno andando le vendite, sempre accanto a un altro periodo: un numero da solo non
            dice se è tanto o poco.
          </p>
        </div>
      </div>

      {/* Che periodo si guarda, e contro cosa */}
      <div className="scheda">
        <div className="filtri-analisi">
          <div className="scelta-vista" role="group" aria-label="Granularità">
            {GRANULARITA.map((g) => (
              <Link
                key={g.chiave}
                className={`vista-opz${gran === g.chiave ? " attiva" : ""}`}
                href={link({ gran: g.chiave, salto: "" })}
              >
                {g.nome}
              </Link>
            ))}
          </div>

          <div className="scelta-vista" role="group" aria-label="Confronto">
            <Link
              className={`vista-opz${confrontoCon === "precedente" ? " attiva" : ""}`}
              href={link({ confronto: "" })}
            >
              vs periodo precedente
            </Link>
            <Link
              className={`vista-opz${confrontoCon === "anno" ? " attiva" : ""}`}
              href={link({ confronto: "anno" })}
            >
              vs anno scorso
            </Link>
          </div>

          <div className="navigazione-periodo">
            <Link className="btn btn-secondario small" href={link({ salto: String(-salto + 1) })}>
              ←
            </Link>
            <strong>{nomePeriodo(inizio, gran)}</strong>
            {salto < 0 && (
              <Link className="btn btn-secondario small" href={link({ salto: String(-salto - 1) })}>
                →
              </Link>
            )}
          </div>

          <span className="scelta-vista" role="group" aria-label="Negozio">
            <Link className={`vista-opz${!brand ? " attiva" : ""}`} href={link({ brand: "" })}>
              Tutti
            </Link>
            {negozi.map((n) => (
              <Link
                key={n.nome}
                className={`vista-opz${brand === n.nome ? " attiva" : ""}`}
                href={link({ brand: n.nome })}
              >
                {n.nome}
              </Link>
            ))}
          </span>
        </div>

        <p className="testo-guida" style={{ marginTop: 10 }}>
          Confronto con <strong>{nomePeriodo(inizioPrima, gran)}</strong>.{" "}
          {inCorso ? (
            <>
              Il periodo è <strong>in corso</strong> ({giorni} {giorni === 1 ? "giorno" : "giorni"}):
              il confronto si ferma <strong>allo stesso giorno</strong> del periodo con cui si
              confronta. Altrimenti staremmo paragonando {giorni}{" "}
              {giorni === 1 ? "giorno" : "giorni"} a{" "}
              {gran === "settimana" ? "una settimana intera" : gran === "mese" ? "un mese intero" : "un anno intero"}.
            </>
          ) : (
            "Periodo concluso: il confronto è fra due periodi interi."
          )}
        </p>
      </div>

      {/* I numeri, ognuno con la sua variazione */}
      <div className="griglia-kpi">
        {schede.map((s) => (
          <div className="kpi kpi-analisi" key={s.etichetta} title={s.spiega}>
            <div className="kpi-etichetta">{s.etichetta}</div>
            <div className="kpi-valore">{s.valore}</div>
            <Delta ora={s.ora} prima={s.prima} alContrario={s.alContrario} />
          </div>
        ))}
      </div>

      {/* Quello che è uscito dal conto: non sparisce, si conta a parte */}
      <div className="scheda">
        <div className="scheda-titolo">Cosa è rimasto fuori dal venduto</div>
        <div className="griglia-campi">
          <div className="campo">
            <dt>Annullati</dt>
            <dd>
              {numero(k.annullatiOrdini)} ordini · {euro(k.annullatiLordo)}
            </dd>
          </div>
          <div className="campo">
            <dt>Rimborsati o stornati</dt>
            <dd>
              {numero(k.rimborsatiOrdini)} ordini · {euro(k.rimborsatiLordo)}
            </dd>
          </div>
          <div className="campo campo-largo">
            <dt>Rimborsi parziali (contati per intero nel venduto)</dt>
            <dd>
              {numero(k.parzialiOrdini)} ordini · {euro(k.parzialiLordo)} ·{" "}
              {percento(k.quotaParziali)} del venduto
            </dd>
          </div>
        </div>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          Un ordine <strong>annullato resta spesso «pagato»</strong>: contarlo gonfierebbe un incasso
          mai avvenuto, quindi sta fuori. Del <strong>rimborso parziale</strong> il registro non sa
          quanto è tornato indietro — Shopify tiene solo il totale dell&apos;ordine — perciò
          quell&apos;ordine è contato <strong>per intero</strong> e lo si dichiara qui invece di
          stimare una cifra a caso.
        </p>
      </div>

      {/* Le categorie di prodotto */}
      <div className="scheda">
        <div className="scheda-titolo">Per categoria di prodotto</div>
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">Venduto</th>
                <th className="num">Quota</th>
                <th className="num">Variazione</th>
                <th className="num">Ordini</th>
                <th className="num">Pezzi</th>
                <th className="num">Scontrino medio</th>
              </tr>
            </thead>
            <tbody>
              {catOra.map((c) => {
                const p = catPrimaMappa.get(c.categoria);
                return (
                  <tr key={c.categoria}>
                    <td>{c.categoria === "non-classificato" ? "Non classificato" : nomeCategoria(c.categoria)}</td>
                    <td className="cella-num">{euro(c.lordo)}</td>
                    <td className="cella-num">
                      {lordoCategorie ? percento((c.lordo / lordoCategorie) * 100) : "—"}
                    </td>
                    <td className="cella-num">
                      <Delta ora={c.lordo} prima={p?.lordo ?? 0} />
                    </td>
                    <td className="cella-num">{numero(c.ordini)}</td>
                    <td className="cella-num">{numero(c.pezzi)}</td>
                    <td className="cella-num">{c.ordini ? euro(c.lordo / c.ordini) : "—"}</td>
                  </tr>
                );
              })}
              {catOra.length === 0 && (
                <tr>
                  <td colSpan={7} className="cella-muta">
                    Nessun ordine in questo periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          Le categorie stanno sull&apos;<strong>ordine</strong>, non sulla singola riga: un ordine con
          fiori e una torta è contato in <strong>tutte e due</strong> le righe, e la somma supera il
          totale. Spezzare l&apos;importo «a metà» sarebbe un numero inventato. La{" "}
          <em>quota</em> è calcolata sulla somma delle righe, non sul venduto.
        </p>
      </div>

      {/* La serie storica: è qui che si confrontano settimane, mesi e anni */}
      <div className="scheda">
        <div className="scheda-titolo">
          Ultimi {QUANTI_NELLA_SERIE[gran]} {gran === "anno" ? "anni" : gran === "mese" ? "mesi" : "settimane"}
        </div>
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th className="num">Venduto</th>
                <th className="num">Ordini</th>
                <th className="num">Scontrino</th>
                <th className="num">UPT</th>
                <th className="num">Prezzo medio</th>
                <th className="num">Clienti</th>
                <th className="num">Nuovi</th>
                <th className="num">Annullati</th>
                <th className="num">Rimborsi</th>
              </tr>
            </thead>
            <tbody>
              {[...storico].reverse().map((p) => {
                const kp = kpi(p);
                const suo = new Date(`${p.periodo}T12:00:00`);
                const corrente = p.periodo === chiaveGiorno(inizio);
                return (
                  <tr key={p.periodo} className={corrente ? "riga-corrente" : ""}>
                    <td>{nomePeriodo(suo, gran)}</td>
                    <td className="cella-num">{euro(kp.lordo)}</td>
                    <td className="cella-num">{numero(kp.ordini)}</td>
                    <td className="cella-num">{euro(kp.scontrinoMedio)}</td>
                    <td className="cella-num">{numero(kp.upt, 2)}</td>
                    <td className="cella-num">{euro(kp.prezzoMedio)}</td>
                    <td className="cella-num">{numero(kp.clienti)}</td>
                    <td className="cella-num">{percento(kp.quotaPrimi, 0)}</td>
                    <td className="cella-num">{percento(kp.quotaAnnullati, 0)}</td>
                    <td className="cella-num">{percento(kp.quotaRimborsati, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          L&apos;ultima riga è il periodo <strong>in corso</strong> quando lo è: va letta sapendo che
          non è ancora finita.
        </p>
      </div>
    </main>
  );
}
