import Link from "next/link";
import { freschezzaVenduto } from "@/lib/orders";

// **A quando sono fermi i numeri del venduto.**
//
// Ogni pagina che classifica, ordina o propone lavora sul venduto in archivio, e
// finché l'import era un bottone quell'archivio poteva essere vecchio di
// settimane senza che si vedesse da nessuna parte. Una classifica sbagliata che
// si dichiara vecchia è un'informazione; la stessa classifica muta è un errore.
//
// Due forme, di proposito:
// - quando i numeri sono freschi, una **riga piccola e grigia** — la data c'è,
//   ma non ruba la scena a quello che si è venuti a leggere;
// - quando sono vecchi, un **avviso ambra** con da quanto e cosa fare.
//
// Un solo punto per pagina, sempre subito sotto la testata: chi impara dove
// guardare in una pagina lo sa in tutte.
//
// **Cosa si misura** (17/08/2026): da quando l'import passa ogni quarto d'ora,
// la domanda «i numeri sono vivi?» si risponde con **da quanto è passato il
// giro**, non con la data dell'ultima vendita. In una giornata fiacca l'ultima
// vendita può essere di ieri con l'import appena finito: dirlo «fermo» sarebbe
// un falso allarme, e un allarme che grida a vuoto smette di essere letto.

// Il fuso è **fissato a Roma**, non lasciato a quello del server. Il giorno di
// una vendita è salvato come mezzanotte del fuso in cui gira l'import: letto in
// UTC — cioè su Vercel — la stessa riga tornerebbe indietro di un giorno, e la
// data direbbe «fermi a ieri» mentre in locale dice «di oggi». Deluxy vende in
// Italia: il giorno di una vendita è il giorno italiano, ovunque giri il codice.
function quando(d: Date): string {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
}

// Quanto tempo, in parole — **senza** il «fa»: la stessa durata entra in due
// frasi diverse («aggiornato 12 minuti fa» e «non passa da 12 minuti») e
// incollarci dentro il «fa» ne sgrammatica una delle due.
//
// Sotto l'ora si contano i minuti, che è la scala su cui gira l'import; sopra si
// passa a ore e giorni, l'ordine di grandezza che a quel punto interessa
// davvero («187 minuti» va riletto due volte).
function durata(minuti: number): string {
  if (minuti < 60) return `${minuti} ${minuti === 1 ? "minuto" : "minuti"}`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? "ora" : "ore"}`;
  const giorni = Math.floor(ore / 24);
  return `${giorni} ${giorni === 1 ? "giorno" : "giorni"}`;
}

export async function FreschezzaVenduto() {
  const f = await freschezzaVenduto();
  if (!f.ultimoGiorno || f.giorni == null) return null;

  if (!f.vecchio && f.minutiDallUltimoGiro != null) {
    return (
      <p className="riga-freschezza">
        Venduto aggiornato{" "}
        <strong>
          {f.minutiDallUltimoGiro < 1 ? "adesso" : `${durata(f.minutiDallUltimoGiro)} fa`}
        </strong>
        , ultima vendita del {quando(f.ultimoGiorno)}
        {f.automatico ? " — si aggiorna da solo ogni quarto d'ora." : "."}
      </p>
    );
  }

  return (
    <div className="avviso avviso-attenzione">
      <strong>
        {f.minutiDallUltimoGiro == null
          ? "Il venduto non è mai stato aggiornato dal registro ordini"
          : `L'aggiornamento del venduto non passa da ${durata(f.minutiDallUltimoGiro)}`}
      </strong>{" "}
      — dovrebbe passare ogni quarto d&apos;ora. Classifiche, regole «più venduti» e ipotesi di
      ordinativo stanno decidendo sull&apos;ultima fotografia, ferma al {quando(f.ultimoGiorno)}.{" "}
      <Link href="/vendite">Aggiorna ora dal registro ordini</Link>.
    </div>
  );
}
