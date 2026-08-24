import { redirect } from "next/navigation";

// La dashboard è confluita nel conto economico (revisione del 24/08/2026):
// erano due pagine che rispondevano alla stessa domanda, ed è già successo che
// dessero due numeri diversi con la stessa etichetta. Il redirect tiene vivi i
// segnalibri.
export default function Dashboard() {
  redirect("/pl");
}
