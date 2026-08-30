import { redirect } from "next/navigation";

// L'app si apre su **Aggiornato** (deciso dall'utente il 30/08/2026): chi apre
// chiede come stanno andando le cose — vendite, margini, conto economico,
// maison, commerciale — su settimana, mese, mese scorso, trimestre, anno.
// «Da fare» (l'apertura precedente, revisione del 24/08) resta nel menu.
export default function Home() {
  redirect("/aggiornato");
}
