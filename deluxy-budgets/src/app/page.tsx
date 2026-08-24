import { redirect } from "next/navigation";

// L'app si apre su **Da fare**: l'obiettivo numero uno è individuare i budget
// che i responsabili devono inserire e monitorare, e la prima cosa da vedere è
// cosa aspetta una mano (revisione del 24/08/2026).
export default function Home() {
  redirect("/da-fare");
}
