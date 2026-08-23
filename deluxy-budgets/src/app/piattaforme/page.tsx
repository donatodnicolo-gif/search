import Link from "next/link";
import { advBudgetMese, advConsentitoMese, ANNO_CORRENTE, budgetAdvAnno, caricaAnno } from "@/lib/calc";
import { eur } from "@/lib/format";
import { canaleDiPiattaforma, fetchSpesaPerCanale } from "@/lib/marketing";
import { primoMeseAperto } from "@/lib/periodo";
import { prisma } from "@/lib/db";
import { PiattaformeEditor } from "@/components/PiattaformeEditor";

export const dynamic = "force-dynamic";

// Ripartizione **dell'azienda**: è quella predefinita, e vale per ogni brand che
// non ne ha una sua. La stringa vuota è il suo ambito anche a database.
const AZIENDA = "";

export default async function Piattaforme({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);

  const brand = dati.maisons.find((m) => m.id === sp.brand) ?? null;
  const ambito = brand ? brand.id : AZIENDA;

  // Il budget ADV per mese: è la base che si ripartisce tra le piattaforme.
  // Con un brand selezionato è **il suo**, non quello d'azienda — altrimenti le
  // percentuali di quel brand si applicherebbero ai soldi di tutti.
  const budgetMese: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (!brand) {
      budgetMese.push(advBudgetMese(dati, m));
      continue;
    }
    const x = brand.mesi.find((y) => y.month === m);
    budgetMese.push(x ? advConsentitoMese(x, budgetAdvAnno(brand, dati.year)) : 0);
  }

  // ---- I mesi gia passati non si ripartiscono: si sono gia ripartiti ----
  //
  // Su un mese chiuso la domanda «quanto do a Google» non esiste piu: i soldi
  // sono usciti, e Marketing sa **per quale canale**. Quindi li la riga non e
  // budget x percentuale ma la **spesa vera** di quel canale, e la percentuale
  // che si vede accanto e quella che ne e uscita.
  const aperto = primoMeseAperto(dati.year);
  const mesiChiusi = Array.from({ length: aperto - 1 }, (_, i) => i + 1).filter((m) => m <= 12);
  const spesa = mesiChiusi.length > 0
    ? await fetchSpesaPerCanale(dati.year, mesiChiusi)
    : { ok: false, perMaisonCanale: new Map<string, Map<string, (number | null)[]>>() };
  // Sul brand si guarda il suo; su «Azienda» si sommano tutti, altrimenti la
  // vista predefinita resterebbe l unica a mostrare budget dove le altre
  // mostrano speso.
  const perCanale = brand
    ? spesa.perMaisonCanale.get(brand.slug) ?? null
    : (() => {
        if (!spesa.ok) return null;
        const somma = new Map<string, (number | null)[]>();
        for (const canali of spesa.perMaisonCanale.values()) {
          for (const [canale, mesi] of canali) {
            const arr = somma.get(canale) ?? (Array(12).fill(null) as (number | null)[]);
            mesi.forEach((v, i) => {
              if (v === null) return;
              arr[i] = (arr[i] ?? 0) + v;
            });
            somma.set(canale, arr);
          }
        }
        return somma.size > 0 ? somma : null;
      })();
  const canaliNoti = perCanale ? [...perCanale.keys()] : [];

  // Un brand che non ha ancora una ripartizione sua **parte da quella
  // d'azienda**: è il punto di partenza giusto, e finché non si salva niente
  // resta scritto che sta ereditando.
  const piattaforme = dati.piattaforme.map((p) => {
    const suo = p.splitPerBrand[ambito];
    const canale = perCanale ? canaleDiPiattaforma(p.nome, canaliNoti) : null;
    return {
      id: p.id,
      nome: p.nome,
      colore: p.colore,
      split: ambito === AZIENDA ? p.split : suo ?? p.split,
      // Vero quando quel brand una ripartizione sua ce l ha davvero.
      propria: ambito === AZIENDA ? true : Boolean(suo),
      // La spesa vera per mese (12 caselle, null = non misurato). Il canale di
      // Marketing si riconosce dal nome: «Google» sta dentro «google_ads».
      speso: canale && perCanale ? perCanale.get(canale) ?? null : null,
      canale,
    };
  });
  const ereditata = piattaforme.every((p) => !p.propria);

  // **Quando** questa ripartizione è stata salvata l'ultima volta. `null` = mai
  // passata da questa pagina (righe piu vecchie del campo, o brand che eredita).
  const ultimoSalvataggio = (
    await prisma.piattaformaSplit.aggregate({
      where: { year: dati.year, ambito },
      _max: { aggiornatoIl: true },
    })
  )._max.aggiornatoIl;
  // ⚠️ Formattata su **Europe/Rome** e non sul fuso del server: su Vercel il
  // runtime e UTC, e un salvataggio delle 17:32 si leggerebbe «15:32».
  const quandoSalvata = ultimoSalvataggio
    ? ultimoSalvataggio.toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Piattaforme ADV</h1>
          <p className="page-caption">
            Ripartizione del budget pubblicitario {dati.year} tra le piattaforme
            {brand ? (
              <>
                {" "}
                per <strong>{brand.nome}</strong>
              </>
            ) : (
              <>
                {" "}
                <strong>di tutta l&apos;azienda</strong>
              </>
            )}
            . Imposti le % (diverse mese per mese) e gli importi si calcolano da soli sul budget ADV del
            mese.
          </p>
          {brand ? (
            <p className="page-caption" style={{ marginTop: 6 }}>
              {ereditata ? (
                <>
                  <strong>{brand.nome} non ha ancora una ripartizione sua</strong>: quelle che vedi sono le
                  percentuali dell&apos;azienda, applicate al budget ADV di questo brand (
                  {eur(budgetMese.reduce((s, v) => s + v, 0))} sull&apos;anno). Salvando, diventano sue e da
                  lì in poi non seguono più quelle d&apos;azienda.
                </>
              ) : (
                <>
                  Ripartizione <strong>propria di {brand.nome}</strong>, applicata al suo budget ADV (
                  {eur(budgetMese.reduce((s, v) => s + v, 0))} sull&apos;anno): non segue quella
                  d&apos;azienda.
                </>
              )}
            </p>
          ) : (
            <p className="page-caption" style={{ marginTop: 6 }}>
              È la ripartizione <strong>predefinita</strong>: vale per ogni brand che non ne ha una sua.
              Cambiandola qui cambia per tutti quelli che la ereditano, non per chi se l&apos;è già scritta.
            </p>
          )}
        </div>
        <div className="page-actions">
          <div className="seg">
            <Link href="/piattaforme" className={!brand ? "on" : ""} title="La ripartizione predefinita d'azienda.">
              Azienda
            </Link>
            {dati.maisons.map((m) => (
              <Link
                key={m.id}
                href={`/piattaforme?brand=${m.id}`}
                className={brand?.id === m.id ? "on" : ""}
                title={`Ripartizione del budget pubblicitario di ${m.nome}.`}
              >
                {m.nome}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* `key` sull'ambito: l'editor tiene le percentuali in uno stato
          inizializzato **una volta sola**, e cambiando brand React riuserebbe
          la stessa istanza — si vedrebbero le percentuali del brand di prima
          sopra i numeri di quello nuovo. Il cambio di chiave lo rimonta. */}
      <PiattaformeEditor
        key={ambito || "azienda"}
        year={dati.year}
        ambito={ambito}
        budgetMese={budgetMese}
        primoMeseAperto={aperto}
        quandoSalvata={quandoSalvata}
        piattaforme={piattaforme}
      />
    </>
  );
}
