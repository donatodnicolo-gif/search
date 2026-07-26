import { redirect } from "next/navigation";

// L'app si apre sul **Consuntivo**: la domanda quotidiana è «come sta andando
// davvero», non «cosa avevamo pianificato». Il budget resta a un clic, ma non è
// più la prima cosa che si vede.
//
// La dashboard non è sparita: vive in /dashboard ed è la prima voce della
// sidebar. Un redirect e non una pagina duplicata, così esiste un solo posto in
// cui quel conto economico è scritto.
export default function Home() {
  redirect("/consuntivo");
}
