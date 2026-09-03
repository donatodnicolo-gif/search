import { notFound } from "next/navigation";
import { BriefGruppoAi } from "@/components/BriefGruppoAi";
import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { accodaNuovoGruppo } from "@/lib/azioni";
import { proponiBriefGruppo } from "@/lib/azioni-brief";
import { prisma } from "@/lib/db";
import { ETICHETTA_BRAND } from "@/lib/dominio";
import { nomeCampagna } from "@/lib/gruppi";

export const dynamic = "force-dynamic";
// ⚠️ Come su /campagne/lancia: la server action del brief chiama il modello, e
// senza maxDuration sulla PAGINA che la invoca morirebbe a metà in produzione.
export const maxDuration = 60;

// Un GRUPPO DI ANNUNCI NUOVO in una campagna che esiste già. Si prepara qui,
// si approva in Operazioni, lo crea lo script col builder vero
// (newAdGroupBuilder → keyword → RSA), riusando il tipo `completa_campagna`
// che è già idempotente: quello che c'è non si rifà.
export default async function NuovoGruppo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const campagna = await prisma.campagna.findUnique({
    where: { id },
    select: { id: true, nome: true, nomeVisibile: true, brand: true, canale: true, idEsterno: true },
  });
  if (!campagna) notFound();

  return (
    <div className="layout">
      <Sidebar attiva="campagne" brandAttivo={campagna.brand} />
      <main className="main" style={{ maxWidth: 1100 }}>
        <a className="ritorno" href={`/campagne/${campagna.id}`}>← {nomeCampagna(campagna)}</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Nuovo gruppo di annunci
              <span className="titolo-brand"> · {ETICHETTA_BRAND[campagna.brand] ?? campagna.brand}</span>
            </h1>
            <p className="page-sub">
              Dentro «{nomeCampagna(campagna)}». Si prepara qui, si approva in Operazioni, lo crea
              lo script coi costruttori veri — e ogni pezzo dice se è riuscito.
            </p>
          </div>
        </div>

        {sp.errore && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
            <span><b>Non accodato:</b> {sp.errore}</span>
          </div>
        )}

        {campagna.canale !== "google_ads" ? (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              I gruppi con keyword esistono su Google Ads: su Meta l&apos;equivalente è l&apos;ad
              set, che si costruisce in Ads Manager (o nasce col lancio Meta).
            </span>
          </div>
        ) : !campagna.idEsterno ? (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>Google non ha ancora confermato questa campagna.</b> Il gruppo del lancio arriva
              da solo col primo giro di anagrafica («Completa la campagna»): un secondo gruppo si
              accoda da qui quando la campagna ha il suo id.
            </span>
          </div>
        ) : (
          <>
            {/* Fuori dal <form>, come su /lancia: un form nel form non è HTML. */}
            <BriefGruppoAi campagnaId={campagna.id} azione={proponiBriefGruppo} />

            <form className="modulo-creazione" action={accodaNuovoGruppo}>
              <input type="hidden" name="campagnaId" value={campagna.id} />

              <section className="scheda">
                <div className="scheda-titolo">
                  <span className="titolo-icona"><Icona nome="campagne" /></span>
                  Il gruppo
                </div>
                <div className="modulo">
                  <div className="campo-modulo largo">
                    <label>Nome del gruppo <span className="obbligatorio">*</span></label>
                    <input name="gruppo" required placeholder="es. Torte Compleanno Bambini" />
                    <span className="campo-aiuto">
                      Un gruppo = un intento di ricerca. Il nome dev&apos;essere nuovo: un omonimo
                      viene rifiutato prima di entrare in coda.
                    </span>
                  </div>
                </div>
              </section>

              <section className="scheda">
                <div className="scheda-titolo">
                  <span className="titolo-icona"><Icona nome="analisi" /></span>
                  Su quali ricerche comparire
                </div>
                <div className="modulo">
                  <div className="campo-modulo largo">
                    <label>Keyword — una per riga, corrispondenza dopo la barra (generica se omessa)</label>
                    <textarea
                      name="keywords"
                      rows={6}
                      placeholder={"torta compleanno bambini milano | phrase\ntorte per feste bambini | exact\ntorta personalizzata bambino"}
                    />
                  </div>
                </div>
              </section>

              <section className="scheda">
                <div className="scheda-titolo">
                  <span className="titolo-icona"><Icona nome="copy" /></span>
                  L&apos;annuncio del gruppo
                </div>
                <div className="modulo">
                  <div className="campo-modulo largo">
                    <label>Titoli — uno per riga, max 30 caratteri (min 3, meglio 8-10)</label>
                    <textarea name="titoli" rows={6} placeholder={"Torte di Compleanno su Misura\nConsegna in Giornata a Milano"} />
                  </div>
                  <div className="campo-modulo largo">
                    <label>Descrizioni — una per riga, max 90 caratteri (min 2)</label>
                    <textarea name="descrizioni" rows={4} placeholder={"Torte artigianali decorate a mano, consegnate con cura. Ordina entro le 20."} />
                  </div>
                  <div className="campo-modulo largo">
                    <label>URL di destinazione</label>
                    <input name="finalUrl" type="url" placeholder="https://cakedesign.me/collections/compleanno" />
                    <span className="campo-aiuto">Obbligatoria se scrivi i titoli.</span>
                  </div>
                  <div className="campo-modulo largo">
                    <label>Perché questo gruppo</label>
                    <input name="motivo" placeholder="Il motivo resta nello storico (doc 10 §1)" />
                  </div>
                </div>
              </section>

              <div className="azioni-modulo" style={{ marginBottom: 18 }}>
                <a className="btn btn-secondario" href={`/campagne/${campagna.id}`}>Annulla</a>
                <button className="btn" type="submit">Metti in coda per l&apos;approvazione</button>
              </div>
            </form>

            <div className="nota-info">
              <span className="nota-icona">◈</span>
              <span>
                <b>Come arriva su Google.</b> L&apos;operazione è un «Completa la campagna» puntato
                su questa campagna: lo script crea il gruppo (<code>newAdGroupBuilder</code>), poi
                le keyword e l&apos;annuncio RSA dentro — ogni pezzo dichiara se è riuscito, e
                quello che esiste già non si rifà. Il copy passa dal lint 7.2/7.3 prima di entrare
                in coda; l&apos;approvazione resta in{" "}
                <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a>.
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
