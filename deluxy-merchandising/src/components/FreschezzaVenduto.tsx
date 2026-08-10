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
// - quando sono vecchi, un **avviso ambra** con quanti giorni e cosa fare.
//
// Un solo punto per pagina, sempre subito sotto la testata: chi impara dove
// guardare in una pagina lo sa in tutte.

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

export async function FreschezzaVenduto() {
  const f = await freschezzaVenduto();
  if (!f.ultimoGiorno || f.giorni == null) return null;

  if (!f.vecchio) {
    return (
      <p className="riga-freschezza">
        Venduto aggiornato al <strong>{quando(f.ultimoGiorno)}</strong>
        {f.automatico ? " — si aggiorna da solo ogni notte." : "."}
      </p>
    );
  }

  return (
    <div className="avviso avviso-attenzione">
      <strong>I numeri del venduto sono fermi al {quando(f.ultimoGiorno)}</strong> — {f.giorni}{" "}
      {f.giorni === 1 ? "giorno" : "giorni"} fa. Classifiche, regole «più venduti» e ipotesi di
      ordinativo stanno decidendo su questa fotografia
      {f.ultimoImportRiuscito
        ? `; l'ultimo aggiornamento riuscito è del ${quando(f.ultimoImportRiuscito)}`
        : ""}
      .{" "}
      <Link href="/vendite">Aggiorna ora dal registro ordini</Link>.
    </div>
  );
}
