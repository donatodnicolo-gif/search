import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Cruscotto "Identità aziende": punto unico da cui si governa l'identità delle
// anagrafiche e la collocazione dei referenti. Raccoglie le tre viste che prima
// stavano sparse: allineamento con HubSpot, aggancio degli id delle app,
// smistamento dei contatti.
export default async function IdentitaAziende() {
  const [totale, riconciliateHs, daRisolvere, daRiconciliare, daClassificare] = await Promise.all([
    prisma.partner.count({ where: { attivo: true } }),
    prisma.partner.count({ where: { attivo: true, hubspotId: { not: null } } }),
    prisma.richiestaMatch.count({ where: { risolto: false, esito: { not: "agganciata" } } }),
    prisma.contatto.count({ where: { archiviato: false, partner: { attivo: true, categoria: "DA CLASSIFICARE" } } }),
    prisma.partner.count({ where: { attivo: true, categoria: "DA CLASSIFICARE" } }),
  ]);

  const Card = ({
    href,
    titolo,
    numero,
    etichetta,
    testo,
  }: {
    href: string;
    titolo: string;
    numero: number | string;
    etichetta: string;
    testo: string;
  }) => (
    <a href={href} className="scheda card-identita">
      <div className="scheda-titolo">{titolo}</div>
      <div className="card-identita-num">{numero}</div>
      <div className="card-identita-etic">{etichetta}</div>
      <p className="testo-guida" style={{ margin: "8px 0 0" }}>{testo}</p>
    </a>
  );

  return (
    <div className="layout">
      <Sidebar identitaAttiva />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Identità aziende</h1>
            <p className="page-sub">
              Governo dell&apos;identità: allinea le anagrafiche con HubSpot, aggancia gli id delle app,
              smista i referenti sotto l&apos;insegna giusta
            </p>
          </div>
        </div>

        <div className="griglia-identita">
          <Card
            href="/sync-hubspot"
            titolo="Sync HubSpot"
            numero={`${riconciliateHs}/${totale}`}
            etichetta="anagrafiche collegate a una company HubSpot"
            testo="Confronta il registro con le companies di HubSpot e collega (⇄) o importa quelle mancanti. Allinea aziende ↔ HubSpot."
          />
          <Card
            href="/match"
            titolo="Richieste di aggancio"
            numero={daRisolvere}
            etichetta="richieste delle app da risolvere"
            testo="Le altre app chiedono «questo negozio chi è?». Risolvi le ambigue creando il riferimento incrociato id ↔ anagrafica."
          />
          <Card
            href="/riconciliazione"
            titolo="Riconciliazione"
            numero={daRiconciliare}
            etichetta="referenti da riassegnare"
            testo={`Sposta i contatti finiti sotto anagrafiche «DA CLASSIFICARE» (${daClassificare}) all'insegna corretta. Smista persone ↔ aziende.`}
          />
        </div>
      </main>
    </div>
  );
}
