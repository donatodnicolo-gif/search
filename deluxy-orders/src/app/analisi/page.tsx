import Link from "next/link";
import { euro } from "@/lib/ordini";
import { brandConColore } from "@/lib/brand";
import { nomeCategoria } from "@/lib/categorie";
import { nomeUrgenza } from "@/lib/urgenza";
import { nomeCanale } from "@/lib/marketing";
import { nomeTipologia } from "@/lib/segmenti";
import { nomeTipoEvento } from "@/lib/eventi";
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
  perDimensione,
  dimensione,
  DIMENSIONI,
  serie,
  variazione,
} from "@/lib/analisi";

export const dynamic = "force-dynamic";

const QUANTI_NELLA_SERIE: Record<Granularita, number> = { settimana: 12, mese: 13, anno: 5 };

// Oltre questa soglia una tabella non si legge più: le città di consegna sono
// centinaia. Le righe tagliate restano nei totali della pagina, e la pagina lo
// dice invece di far sparire numeri in silenzio.
const MAX_RIGHE_DIMENSIONE = 25;

// Una riga senza dati non è un buco: è uno zero, e va confrontata come tale.
const ZERO_METRICHE = {
  ordini: 0,
  lordo: 0,
  pezzi: 0,
  clienti: 0,
  primi: 0,
  daRepeater: 0,
  annullatiOrdini: 0,
  annullatiLordo: 0,
  rimborsatiOrdini: 0,
  rimborsatiLordo: 0,
  parzialiOrdini: 0,
  parzialiLordo: 0,
};

// Le etichette arrivano dal database come chiavi («torte», «google-ads»,
// «urgenza»): qui tornano nella lingua di chi legge.
function etichettaDimensione(dimensione: string, valore: string): string {
  if (dimensione === "categoria") {
    return valore === "non-classificato" ? "Non classificato" : nomeCategoria(valore);
  }
  if (dimensione === "urgenza") {
    return valore === "senza-data" ? "Consegna non indicata" : nomeUrgenza(valore);
  }
  if (dimensione === "canale") {
    return valore === "sconosciuto" ? "Provenienza sconosciuta" : nomeCanale(valore);
  }
  if (dimensione === "tipologia") return nomeTipologia(valore);
  if (dimensione === "occasione") return nomeTipoEvento(valore);
  return valore;
}

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

  // Lungo quale asse spezzare i numeri: città, categoria, tipologia di cliente,
  // occasione, tipo di ordine, provenienza.
  const dim = dimensione(sp.dim);

  const [negozi, ora, prima, dimOra, dimPrima, storico] = await Promise.all([
    brandConColore(),
    metriche(inizio, fineOra, brand),
    metriche(inizioPrima, fineConfronto, brand),
    perDimensione(dim, inizio, fineOra, brand),
    perDimensione(dim, inizioPrima, fineConfronto, brand),
    serie(gran, QUANTI_NELLA_SERIE[gran], brand, adesso),
  ]);

  const k = kpi(ora);
  const kPrima = kpi(prima);

  // Le due letture si affiancano per etichetta. Una riga che c'era prima e ora
  // non c'è più **resta in tabella a zero**: sparire sarebbe la cosa peggiore —
  // «Firenze non c'è più» è esattamente la notizia che si sta cercando.
  const primaPerEtichetta = new Map(dimPrima.map((r) => [r.etichetta, r]));
  const etichette = [...new Set([...dimOra.map((r) => r.etichetta), ...dimPrima.map((r) => r.etichetta)])];
  const righeDimTutte = etichette
    .map((etichetta) => ({
      etichetta,
      ora: kpi(dimOra.find((r) => r.etichetta === etichetta) ?? ZERO_METRICHE),
      prima: kpi(primaPerEtichetta.get(etichetta) ?? ZERO_METRICHE),
    }))
    .sort((a, b) => b.ora.lordo - a.ora.lordo || b.prima.lordo - a.prima.lordo);
  const righeDim = righeDimTutte.slice(0, MAX_RIGHE_DIMENSIONE);
  const lordoDim = righeDimTutte.reduce((s, r) => s + r.ora.lordo, 0);

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

      {/* Gli stessi numeri, tagliati lungo una dimensione a scelta */}
      <div className="scheda">
        <div className="scheda-titolo">Da dove viene il risultato</div>
        <div className="scelta-vista" role="group" aria-label="Dimensione" style={{ flexWrap: "wrap" }}>
          {DIMENSIONI.map((d) => (
            <Link
              key={d.chiave}
              className={`vista-opz${dim.chiave === d.chiave ? " attiva" : ""}`}
              href={link({ dim: d.chiave })}
              title={d.spiega}
            >
              {d.nome}
            </Link>
          ))}
        </div>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          {dim.spiega} Ogni riga porta gli stessi KPI della pagina, con la variazione rispetto a{" "}
          <strong>{nomePeriodo(inizioPrima, gran)}</strong>.
        </p>

        <div className="tabella-wrap" style={{ marginTop: 12 }}>
          <table className="tabella-dimensione">
            <thead>
              <tr>
                <th>{dim.nome}</th>
                <th className="num">Venduto</th>
                <th className="num">Quota</th>
                <th className="num">Ordini</th>
                <th className="num">Scontrino</th>
                <th className="num">UPT</th>
                <th className="num">Prezzo medio</th>
                <th className="num">Pezzi</th>
                <th className="num">Clienti</th>
                <th className="num">Nuovi</th>
                <th className="num">Annullati</th>
                <th className="num">Rimborsi</th>
              </tr>
            </thead>
            <tbody>
              {righeDim.map((r) => (
                <tr key={r.etichetta}>
                  <td>{etichettaDimensione(dim.chiave, r.etichetta)}</td>
                  <td className="cella-num">
                    {euro(r.ora.lordo)}
                    <Delta ora={r.ora.lordo} prima={r.prima.lordo} />
                  </td>
                  <td className="cella-num">{lordoDim ? percento((r.ora.lordo / lordoDim) * 100) : "—"}</td>
                  <td className="cella-num">
                    {numero(r.ora.ordini)}
                    <Delta ora={r.ora.ordini} prima={r.prima.ordini} />
                  </td>
                  <td className="cella-num">
                    {euro(r.ora.scontrinoMedio)}
                    <Delta ora={r.ora.scontrinoMedio} prima={r.prima.scontrinoMedio} />
                  </td>
                  <td className="cella-num">
                    {numero(r.ora.upt, 2)}
                    <Delta ora={r.ora.upt} prima={r.prima.upt} />
                  </td>
                  <td className="cella-num">
                    {euro(r.ora.prezzoMedio)}
                    <Delta ora={r.ora.prezzoMedio} prima={r.prima.prezzoMedio} />
                  </td>
                  <td className="cella-num">
                    {numero(r.ora.pezzi)}
                    <Delta ora={r.ora.pezzi} prima={r.prima.pezzi} />
                  </td>
                  <td className="cella-num">
                    {numero(r.ora.clienti)}
                    <Delta ora={r.ora.clienti} prima={r.prima.clienti} />
                  </td>
                  <td className="cella-num">
                    {percento(r.ora.quotaPrimi, 0)}
                    <Delta ora={r.ora.quotaPrimi} prima={r.prima.quotaPrimi} />
                  </td>
                  <td className="cella-num">
                    {percento(r.ora.quotaAnnullati, 0)}
                    <Delta ora={r.ora.quotaAnnullati} prima={r.prima.quotaAnnullati} alContrario />
                  </td>
                  <td className="cella-num">
                    {percento(r.ora.quotaRimborsati, 0)}
                    <Delta ora={r.ora.quotaRimborsati} prima={r.prima.quotaRimborsati} alContrario />
                  </td>
                </tr>
              ))}
              {righeDim.length === 0 && (
                <tr>
                  <td colSpan={12} className="cella-muta">Nessun ordine in questo periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {righeDim.length === MAX_RIGHE_DIMENSIONE && (
          <p className="testo-guida" style={{ marginTop: 8 }}>
            Sono mostrate le <strong>{MAX_RIGHE_DIMENSIONE}</strong> righe che valgono di più; le
            altre esistono e stanno nei totali della pagina — semplicemente non entrano in una
            tabella leggibile.
          </p>
        )}
        {dim.nota && (
          <p className="testo-guida" style={{ marginTop: 8 }}>{dim.nota}</p>
        )}
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
